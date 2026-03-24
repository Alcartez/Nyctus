use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuntimeKind {
    Podman,
    Docker,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuntimeStatus {
    Running(RuntimeKind),
    StoppedButInstalled(RuntimeKind),
    NotInstalled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[allow(dead_code)]
pub enum GpuStatus {
    Available,
    Unavailable,
    ToolkitMissing,
}

/// Probe for a container runtime socket. Returns the first found runtime.
/// On Windows: tries named pipes. On Unix: tries socket files.
pub async fn check_runtime_available() -> RuntimeStatus {
    #[cfg(target_os = "windows")]
    {
        use tokio::net::windows::named_pipe::ClientOptions;

        // 1. Try Podman named pipe
        let podman_pipe = r"\\.\pipe\podman";
        if ClientOptions::new().open(podman_pipe).is_ok() {
            return RuntimeStatus::Running(RuntimeKind::Podman);
        }

        // 2. Try Docker named pipe
        let docker_pipe = r"\\.\pipe\docker_engine";
        if ClientOptions::new().open(docker_pipe).is_ok() {
            return RuntimeStatus::Running(RuntimeKind::Docker);
        }

        // Check if installed but stopped (executables present)
        let podman_exe = std::path::Path::new(r"C:\Program Files\RedHat\Podman\podman.exe");
        if podman_exe.exists() {
            return RuntimeStatus::StoppedButInstalled(RuntimeKind::Podman);
        }

        let docker_exe = std::path::Path::new(
            r"C:\Program Files\Docker\Docker\resources\bin\docker.exe",
        );
        if docker_exe.exists() {
            return RuntimeStatus::StoppedButInstalled(RuntimeKind::Docker);
        }

        RuntimeStatus::NotInstalled
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tokio::net::UnixStream;

        // 1. Try Podman user socket
        let xdg_runtime = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| {
            format!("/run/user/{}", unsafe { libc::getuid() })
        });
        let podman_sock = format!("{}/podman/podman.sock", xdg_runtime);
        if UnixStream::connect(&podman_sock).await.is_ok() {
            return RuntimeStatus::Running(RuntimeKind::Podman);
        }

        // 2. Try Docker socket
        let docker_sock = "/var/run/docker.sock";
        if UnixStream::connect(docker_sock).await.is_ok() {
            return RuntimeStatus::Running(RuntimeKind::Docker);
        }

        // Check binaries
        if which::which("podman").is_ok() {
            return RuntimeStatus::StoppedButInstalled(RuntimeKind::Podman);
        }
        if which::which("docker").is_ok() {
            return RuntimeStatus::StoppedButInstalled(RuntimeKind::Docker);
        }

        RuntimeStatus::NotInstalled
    }
}

/// Returns the bollard socket URI for the detected runtime.
pub fn runtime_socket_uri(kind: &RuntimeKind) -> String {
    #[cfg(target_os = "windows")]
    match kind {
        RuntimeKind::Podman => r"npipe:////./pipe/podman".to_string(),
        RuntimeKind::Docker => r"npipe:////./pipe/docker_engine".to_string(),
    }

    #[cfg(not(target_os = "windows"))]
    {
        let xdg = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/run/user/1000".to_string());
        match kind {
            RuntimeKind::Podman => format!("unix:///{}/podman/podman.sock", xdg),
            RuntimeKind::Docker => "unix:///var/run/docker.sock".to_string(),
        }
    }
}
