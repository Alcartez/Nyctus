mod container;
mod nyc;
mod preflight;
mod pipeline;
// Proprietary modules removed

use bollard::Docker;
use preflight::{check_runtime_available, runtime_socket_uri, RuntimeStatus};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;
use tracing_subscriber::fmt;

// ── App State ────────────────────────────────────────────────────────────────

pub struct AppState {
    pub docker: Arc<Mutex<Option<Docker>>>,
    pub active_container_id: Arc<Mutex<Option<String>>>,
}

// ── Commands: Preflight ──────────────────────────────────────────────────────

#[tauri::command]
async fn check_runtime() -> Result<serde_json::Value, String> {
    let status = check_runtime_available().await;
    let json = match &status {
        RuntimeStatus::Running(kind) => serde_json::json!({
            "status": "running",
            "runtime": format!("{:?}", kind),
        }),
        RuntimeStatus::StoppedButInstalled(kind) => serde_json::json!({
            "status": "stopped",
            "runtime": format!("{:?}", kind),
        }),
        RuntimeStatus::NotInstalled => serde_json::json!({
            "status": "not_installed",
            "runtime": null,
        }),
    };
    Ok(json)
}

/// Called after preflight confirms runtime is running — initializes bollard client.
#[tauri::command]
async fn init_runtime(
    runtime_kind: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let kind = if runtime_kind == "Podman" {
        preflight::RuntimeKind::Podman
    } else {
        preflight::RuntimeKind::Docker
    };

    let socket_uri = runtime_socket_uri(&kind);

    // Set DOCKER_HOST so bollard picks up the correct socket
    std::env::set_var("DOCKER_HOST", &socket_uri);

    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;

    // Ping to confirm connection
    docker.ping().await.map_err(|e| e.to_string())?;

    let mut guard = state.docker.lock().await;
    *guard = Some(docker);
    Ok(())
}

// ── Commands: Container ──────────────────────────────────────────────────────

#[tauri::command]
async fn pull_base_image(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.docker.lock().await;
    let docker = guard.as_ref().ok_or("Runtime not initialised")?;
    container::pull_base_image(docker, &app).await
}

#[tauri::command]
async fn deploy_environment(
    config: container::DeployConfig,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let guard = state.docker.lock().await;
    let docker = guard.as_ref().ok_or("Runtime not initialised")?;
    let container_id = container::deploy_environment(docker, config, &app).await?;

    // persist active container id
    let mut cid = state.active_container_id.lock().await;
    *cid = Some(container_id.clone());

    // spawn log streaming task (non-blocking)
    let docker_clone = docker.clone();
    let app_clone = app.clone();
    let cid_clone = container_id.clone();
    tokio::spawn(async move {
        container::stream_logs(&docker_clone, &cid_clone, app_clone).await;
    });

    Ok(container_id)
}

#[tauri::command]
async fn kill_environment(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.docker.lock().await;
    let docker = guard.as_ref().ok_or("Runtime not initialised")?;

    let mut cid_guard = state.active_container_id.lock().await;
    let container_id = cid_guard.as_deref().ok_or("No active container")?.to_string();

    container::kill_environment(docker, &container_id, &app).await?;
    *cid_guard = None;
    Ok(())
}

// ── Commands: OS External Editor ─────────────────────────────────────────────

#[tauri::command]
async fn check_gpu_available(runtime_kind: String) -> Result<String, String> {
    // We can test GPU availability by trying to run nvidia-smi quietly in a disposable container.
    // If docker/podman can allocate `--gpus all`, we assume GPU is available.
    // Since we don't want to pull a large image just for checking, we'll first check if the host has nvidia-smi
    let host_check = std::process::Command::new("nvidia-smi")
        .output();
        
    if let Ok(output) = host_check {
        if output.status.success() {
            // Also check if docker supports the flag
            let runtime = if runtime_kind == "Podman" { "podman" } else { "docker" };
            let test_cmd = std::process::Command::new(runtime)
                .args(["run", "--rm", "--gpus", "all", "hello-world"])
                .output();
                
            if let Ok(out) = test_cmd {
                if out.status.success() {
                    return Ok("Available".to_string());
                } else {
                    let stderr = String::from_utf8_lossy(&out.stderr).to_lowercase();
                    if stderr.contains("could not select device driver") || stderr.contains("nvidia") {
                        return Ok("ToolkitMissing".to_string());
                    }
                }
            }
        }
    }
    
    Ok("Unavailable".to_string())
}

// ── Commands: .nyc File System ───────────────────────────────────────────────

#[tauri::command]
fn save_nyc(payload: nyc::SavePayload, dest_path: String) -> Result<(), String> {
    nyc::save_nyc(payload, &dest_path)
}

#[tauri::command]
fn load_nyc(src_path: String) -> Result<nyc::LoadedProject, String> {
    nyc::load_nyc(&src_path)
}

// ── Commands: Pipeline ─────────────────────────────────────────────────────

#[tauri::command]
fn build_pipeline_config(
    nodes: Vec<pipeline::Node>,
    edges: Vec<pipeline::Edge>,
    selected_script: Option<String>,
) -> Result<pipeline::PipelineConfig, String> {
    pipeline::build_pipeline_config(&nodes, &edges, selected_script.as_deref())
}

// ── Commands: OS External Editor ─────────────────────────────────────────────

#[tauri::command]
fn open_in_os_editor(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
    let mut tmp_dir = std::env::temp_dir();
    tmp_dir.push("nyctus_scripts");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    let file_path = tmp_dir.join(&filename);
    std::fs::write(&file_path, content).map_err(|e| e.to_string())?;

    let path_str = file_path.to_string_lossy().to_string();
    
    // Tell the OS to open it with the default registered program via Tauri to avoid Windows AppLocker blocking it
    use tauri_plugin_opener::OpenerExt;
    if let Err(e) = app.opener().open_path(&path_str, None::<&str>) {
        return Err(format!("Failed to open in OS editor: {}", e));
    }
    
    Ok(path_str)
}

#[tauri::command]
fn read_os_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber for logging
    fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            docker: Arc::new(Mutex::new(None)),
            active_container_id: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            check_runtime,
            init_runtime,
            pull_base_image,
            deploy_environment,
            kill_environment,
            check_gpu_available,
            save_nyc,
            load_nyc,
            open_in_os_editor,
            read_os_file,
            build_pipeline_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running nyctus-core");
}
