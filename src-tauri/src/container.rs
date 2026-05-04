use bollard::container::{
    Config, CreateContainerOptions, LogsOptions, RemoveContainerOptions, StartContainerOptions,
    StopContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::models::{HostConfig, PortBinding};
use bollard::Docker;
use futures_util::stream::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

const BASE_IMAGE: &str = "docker.io/alcartez/nyctus-os:latest";

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/container.ts")]
pub struct VolumeMount {
    pub host_path: String,
    pub container_path: String,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/container.ts")]
pub struct PortRule {
    pub host_port: u16,
    pub container_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export_to = "../src/types/generated/container.ts")]
pub struct EnvTreeNode {
    pub env_type: String,
    pub env_name: Option<String>,
    pub image: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub pip_deps: Option<Vec<String>>,
    pub children: Option<Vec<EnvTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/container.ts")]
pub struct DeployConfig {
    /// Container image. Defaults to "debian:latest".
    pub image: Option<String>,
    pub volumes: Vec<VolumeMount>,
    pub port_bindings: Vec<PortRule>,
    /// RAM cap in MB. None = unlimited.
    pub memory_limit_mb: Option<u64>,
    /// Request GPU passthrough (requires NVIDIA toolkit on host).
    pub use_gpu: bool,
    /// Optional entrypoint command override.
    pub cmd: Option<Vec<String>>,
    /// Environment tree layout
    pub env_tree: Option<EnvTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/container.ts")]
pub struct LogPayload {
    pub line: String,
    pub stream_type: String, // "stdout" | "stderr"
}

// ── Image ────────────────────────────────────────────────────────────────────

/// Pull the base image (debian:latest), emitting progress events.
pub async fn pull_base_image(docker: &Docker, app: &AppHandle) -> Result<(), String> {
    let mut stream = docker.create_image(
        Some(CreateImageOptions::<String> {
            from_image: BASE_IMAGE.to_string(),
            ..Default::default()
        }),
        None,
        None,
    );

    while let Some(event) = stream.next().await {
        match event {
            Ok(info) => {
                let msg = format!(
                    "{} {}",
                    info.status.unwrap_or_default(),
                    info.progress.unwrap_or_default()
                );
                let _ = app.emit("pull-progress", msg);
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

// ── Deploy ───────────────────────────────────────────────────────────────────

/// Create and start a container from DeployConfig. Returns the container ID.
pub async fn deploy_environment(
    docker: &Docker,
    config: DeployConfig,
    app: &AppHandle,
) -> Result<String, String> {
    #[allow(unused_mut)]
    let mut image = config.image.unwrap_or_else(|| BASE_IMAGE.to_string());

    // Volume binds: "host_path:container_path[:ro]"
    let binds: Vec<String> = config
        .volumes
        .iter()
        .map(|v| {
            if v.read_only {
                format!("{}:{}:ro", v.host_path, v.container_path)
            } else {
                format!("{}:{}", v.host_path, v.container_path)
            }
        })
        .collect();

    // Port bindings: container_port -> host_port
    let mut port_map: HashMap<String, Option<Vec<PortBinding>>> = HashMap::new();
    for rule in &config.port_bindings {
        let key = format!("{}/tcp", rule.container_port);
        port_map.insert(
            key,
            Some(vec![PortBinding {
                host_ip: Some("0.0.0.0".to_string()),
                host_port: Some(rule.host_port.to_string()),
            }]),
        );
    }

    // Exposed ports for container config
    let exposed: HashMap<String, HashMap<(), ()>> = config
        .port_bindings
        .iter()
        .map(|r| {
            (
                format!("{}/tcp", r.container_port),
                HashMap::<(), ()>::new(),
            )
        })
        .collect();

    let memory = config.memory_limit_mb.map(|mb| (mb * 1024 * 1024) as i64);

    let device_requests = if config.use_gpu {
        Some(vec![bollard::models::DeviceRequest {
            driver: Some("nvidia".to_string()),
            count: Some(-1),
            capabilities: Some(vec![vec!["gpu".to_string()]]),
            ..Default::default()
        }])
    } else {
        None
    };

    #[cfg(unix)]
    let user = unsafe { format!("{}:{}", libc::getuid(), libc::getgid()) };
    #[cfg(not(unix))]
    let user = "root".to_string(); // Docker Desktop on Windows/Mac handles permissions automatically

    let host_config = HostConfig {
        binds: if binds.is_empty() { None } else { Some(binds) },
        port_bindings: if port_map.is_empty() {
            None
        } else {
            Some(port_map)
        },
        memory,
        device_requests,
        ..Default::default()
    };

    let container_config = Config {
        image: Some(image.clone()),
        user: Some(user),
        cmd: config.cmd,

        exposed_ports: if exposed.is_empty() {
            None
        } else {
            Some(exposed)
        },
        host_config: Some(host_config),
        ..Default::default()
    };

    let container = docker
        .create_container(
            Some(CreateContainerOptions {
                name: format!("nyctus-{}", uuid_short()),
                platform: None,
            }),
            container_config,
        )
        .await
        .map_err(|e| e.to_string())?;

    docker
        .start_container(&container.id, None::<StartContainerOptions<String>>)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("container-started", &container.id);
    Ok(container.id)
}

// ── Log streaming ────────────────────────────────────────────────────────────

/// Stream stdout/stderr from a running container to the frontend via Tauri events.
pub async fn stream_logs(docker: &Docker, container_id: &str, app: AppHandle) {
    let opts = LogsOptions::<String> {
        follow: true,
        stdout: true,
        stderr: true,
        tail: "all".to_string(),
        ..Default::default()
    };

    let mut stream = docker.logs(container_id, Some(opts));

    while let Some(msg) = stream.next().await {
        match msg {
            Ok(output) => {
                use bollard::container::LogOutput;
                let (line, kind) = match output {
                    LogOutput::StdOut { message } => {
                        (String::from_utf8_lossy(&message).to_string(), "stdout")
                    }
                    LogOutput::StdErr { message } => {
                        (String::from_utf8_lossy(&message).to_string(), "stderr")
                    }
                    LogOutput::Console { message } => {
                        (String::from_utf8_lossy(&message).to_string(), "stdout")
                    }
                    _ => continue,
                };
                let _ = app.emit(
                    "container-log",
                    LogPayload {
                        line,
                        stream_type: kind.to_string(),
                    },
                );
            }
            Err(_) => break,
        }
    }
}

// ── Kill ─────────────────────────────────────────────────────────────────────

/// Stop and remove a container, then emit reset event.
pub async fn kill_environment(
    docker: &Docker,
    container_id: &str,
    app: &AppHandle,
) -> Result<(), String> {
    docker
        .stop_container(container_id, Some(StopContainerOptions { t: 10 }))
        .await
        .map_err(|e| e.to_string())?;

    docker
        .remove_container(
            container_id,
            Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }),
        )
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("container-killed", container_id);
    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn uuid_short() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    format!("{:08x}", t)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_volume_mount_creation() {
        let vol = VolumeMount {
            host_path: "/host/path".to_string(),
            container_path: "/container/path".to_string(),
            read_only: true,
        };

        assert_eq!(vol.host_path, "/host/path");
        assert_eq!(vol.container_path, "/container/path");
        assert!(vol.read_only);
    }

    #[test]
    fn test_volume_mount_serialization() {
        let vol = VolumeMount {
            host_path: "/home/user/data".to_string(),
            container_path: "/data".to_string(),
            read_only: false,
        };

        let json = serde_json::to_string(&vol).unwrap();
        let deserialized: VolumeMount = serde_json::from_str(&json).unwrap();

        assert_eq!(vol.host_path, deserialized.host_path);
        assert_eq!(vol.container_path, deserialized.container_path);
        assert_eq!(vol.read_only, deserialized.read_only);
    }

    #[test]
    fn test_port_rule_creation() {
        let port = PortRule {
            host_port: 8080,
            container_port: 80,
        };

        assert_eq!(port.host_port, 8080);
        assert_eq!(port.container_port, 80);
    }

    #[test]
    fn test_port_rule_serialization() {
        let port = PortRule {
            host_port: 3000,
            container_port: 3000,
        };

        let json = serde_json::to_string(&port).unwrap();
        let deserialized: PortRule = serde_json::from_str(&json).unwrap();

        assert_eq!(port.host_port, deserialized.host_port);
        assert_eq!(port.container_port, deserialized.container_port);
    }

    #[test]
    fn test_deploy_config_defaults() {
        let config = DeployConfig {
            image: None,
            volumes: vec![],
            port_bindings: vec![],
            memory_limit_mb: None,
            use_gpu: false,
            cmd: None,
            env_tree: None,
        };

        assert!(config.image.is_none());
        assert!(config.volumes.is_empty());
        assert!(!config.use_gpu);
    }

    #[test]
    fn test_deploy_config_with_gpu() {
        let config = DeployConfig {
            image: Some("nvidia/cuda:11.0".to_string()),
            volumes: vec![],
            port_bindings: vec![],
            memory_limit_mb: Some(4096),
            use_gpu: true,
            cmd: Some(vec!["python".to_string(), "train.py".to_string()]),
            env_tree: None,
        };

        assert!(config.use_gpu);
        assert_eq!(config.memory_limit_mb, Some(4096));
        assert_eq!(config.cmd.unwrap()[1], "train.py");
    }

    #[test]
    fn test_deploy_config_serialization() {
        let config = DeployConfig {
            image: Some("debian:latest".to_string()),
            volumes: vec![VolumeMount {
                host_path: "/host".to_string(),
                container_path: "/container".to_string(),
                read_only: false,
            }],
            port_bindings: vec![PortRule {
                host_port: 8080,
                container_port: 80,
            }],
            memory_limit_mb: Some(1024),
            use_gpu: false,
            cmd: None,
            env_tree: None,
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: DeployConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(config.image, deserialized.image);
        assert_eq!(config.volumes.len(), deserialized.volumes.len());
        assert_eq!(config.port_bindings.len(), deserialized.port_bindings.len());
    }

    #[test]
    fn test_env_tree_node_creation() {
        let node = EnvTreeNode {
            env_type: "micromamba".to_string(),
            env_name: Some("my-env".to_string()),
            image: None,
            dependencies: Some(vec!["python=3.11".to_string()]),
            pip_deps: Some(vec!["numpy".to_string()]),
            children: None,
        };

        assert_eq!(node.env_type, "micromamba");
        assert_eq!(node.env_name.unwrap(), "my-env");
        assert!(node.dependencies.is_some());
    }

    #[test]
    fn test_log_payload_creation() {
        let payload = LogPayload {
            line: "Container started".to_string(),
            stream_type: "stdout".to_string(),
        };

        assert_eq!(payload.line, "Container started");
        assert_eq!(payload.stream_type, "stdout");
    }

    #[test]
    fn test_uuid_short_returns_hex() {
        let uuid = super::uuid_short();
        assert!(!uuid.is_empty());
        // Should be valid hex
        assert!(uuid.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
