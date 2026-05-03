use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ── ReactFlow Types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/pipeline.ts")]
pub struct NodeData {
    pub label: String,
    #[serde(rename = "nodeType")]
    pub node_type: String,
    pub config: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/pipeline.ts")]
pub struct Node {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub data: NodeData,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/pipeline.ts")]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(rename = "sourceHandle")]
    pub source_handle: Option<String>,
    #[serde(rename = "targetHandle")]
    pub target_handle: Option<String>,
}

// ── Pipeline Config ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/pipeline.ts")]
pub struct PipelineConfig {
    pub cmd: Vec<String>,
    pub env_setup_steps: Vec<String>,
    pub port: Option<u16>,
    pub volumes: Vec<crate::container::VolumeMount>,
    pub use_gpu: bool,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Base64 encode a string (matching frontend btoa behavior)
fn b64_encode(s: &str) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, s.as_bytes())
}

/// Parse node config JSON
fn parse_config(config: &str) -> serde_json::Value {
    serde_json::from_str(config).unwrap_or_default()
}

/// Get params from config (handles both {params: {...}} and direct params)
fn get_params(config: &serde_json::Value) -> &serde_json::Value {
    config.get("params").unwrap_or(config)
}

// ── Pipeline Builder ──────────────────────────────────────────────────────────

pub fn build_pipeline_config(
    nodes: &[Node],
    edges: &[Edge],
    selected_script: Option<&str>,
) -> Result<PipelineConfig, String> {
    let mut env_setup_steps: Vec<String> = vec!["mkdir -p /out /data".to_string()];
    let mut volumes = vec![];
    let use_gpu = false;
    let mut port = None;

    // Find GUI node
    let gui_node = nodes.iter().find(|n| n.data.node_type == "GuiNode");
    let gui_port = gui_node.and_then(|n| {
        let cfg = parse_config(&n.data.config);
        let params = get_params(&cfg);
        params.get("port").and_then(|v| v.as_u64()).map(|v| v as u16)
    });

    // Collect script nodes
    let script_nodes: Vec<&Node> = nodes.iter().filter(|n| n.data.node_type == "ScriptNode").collect();

    // Collect parent environment group IDs
    let parent_ids: Vec<String> = script_nodes
        .iter()
        .filter_map(|n| n.data.parent_id.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Build env setup steps
    if parent_ids.is_empty() && !script_nodes.is_empty() {
        // No env groups - use default nyctus-demo
        env_setup_steps.push("micromamba env remove -n nyctus-demo -y 2>&1 || true".to_string());
        env_setup_steps.push("micromamba create -n nyctus-demo python=3.11 pip -y -c conda-forge".to_string());
    }

    for parent_id in &parent_ids {
        if let Some(group) = nodes.iter().find(|n| n.id == *parent_id) {
            let cfg = parse_config(&group.data.config);
            let params = get_params(&cfg);

            let env_type = params.get("envType")
                .and_then(|v| v.as_str())
                .unwrap_or("micromamba");
            let env_name = params.get("envName")
                .and_then(|v| v.as_str())
                .unwrap_or("nyctus-demo");

            if env_type == "bun" {
                env_setup_steps.push("curl -fsSL https://bun.sh/install | bash".to_string());
                env_setup_steps.push("export PATH=\"$HOME/.bun/bin:$PATH\"".to_string());
                if let Some(deps) = params.get("dependencies").and_then(|v| v.as_array()) {
                    let dep_list: Vec<&str> = deps.iter().filter_map(|d| d.as_str()).collect();
                    if !dep_list.is_empty() {
                        env_setup_steps.push(format!(
                            "mkdir -p /tmp/bun_{} && cd /tmp/bun_{} && bun add {}",
                            env_name, env_name, dep_list.join(" ")
                        ));
                    }
                }
            } else {
                let deps: Vec<&str> = params.get("dependencies")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|d| d.as_str()).collect())
                    .unwrap_or_else(|| vec!["python=3.11"]);
                let deps_with_pip: Vec<&str> = deps.iter().copied().chain(std::iter::once("pip")).collect();
                let deps_with_pip_str = deps_with_pip.join(" ");

                env_setup_steps.push(format!(
                    "micromamba env remove -n {} -y 2>&1 || true",
                    env_name
                ));
                env_setup_steps.push(format!(
                    "micromamba create -n {} {} -y -c conda-forge",
                    env_name, deps_with_pip_str
                ));

                if let Some(pip_deps) = params.get("pip_deps").and_then(|v| v.as_array()) {
                    let pip_list: Vec<&str> = pip_deps.iter().filter_map(|d| d.as_str()).collect();
                    if !pip_list.is_empty() {
                        env_setup_steps.push(format!(
                            "micromamba run -n {} python -m pip install {}",
                            env_name, pip_list.join(" ")
                        ));
                    }
                }
            }
        }
    }

    // Build execution steps
    let mut steps: Vec<String> = vec!["mkdir -p /out /data".to_string()];

    if let Some(script_id) = selected_script {
        // Run single script
        if let Some(node) = nodes.iter().find(|n| n.id == script_id) {
            build_script_steps(&mut steps, node, nodes, edges, &mut volumes);
            steps.extend(env_setup_steps.clone());
            add_script_execution(&mut steps, node, nodes);
        }
    } else {
        // Run all data nodes first
        let data_nodes: Vec<&Node> = nodes.iter().filter(|n| n.data.node_type == "DataNode").collect();
        for data_node in data_nodes {
            build_data_steps(&mut steps, data_node);
        }
        steps.extend(env_setup_steps.clone());

        // Run all script nodes
        for script_node in script_nodes.iter() {
            build_script_steps(&mut steps, script_node, nodes, edges, &mut volumes);
            add_script_execution(&mut steps, script_node, nodes);
        }

        // Handle GUI node
        if let Some(gui_node) = gui_node {
            let cfg = parse_config(&gui_node.data.config);
            let params = get_params(&cfg);
            let framework = params.get("framework")
                .and_then(|v| v.as_str())
                .unwrap_or("http.server");
            let gui_port_val = gui_port.unwrap_or(8080);
            port = Some(gui_port_val);

            let env_name = gui_node.data.parent_id
                .as_ref()
                .and_then(|pid| nodes.iter().find(|n| n.id == *pid))
                .map(|p| {
                    let cfg = parse_config(&p.data.config);
                    let params = get_params(&cfg);
                    params.get("envName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("nyctus-demo")
                        .to_string()
                })
                .unwrap_or_else(|| "nyctus-demo".to_string());

            match framework {
                "http.server" => {
                    let serve_dir = params.get("serve_dir")
                        .and_then(|v| v.as_str())
                        .unwrap_or("/out");
                    steps.push(format!(
                        "cd {} && micromamba run -n {} python3 -m http.server {}",
                        serve_dir, env_name, gui_port_val
                    ));
                }
                "streamlit" => {
                    if let Some(entrypoint) = params.get("entrypoint_script").and_then(|v| v.as_str()) {
                        let escaped = b64_encode(entrypoint);
                        steps.push(format!("echo '{}' | base64 -d > /tmp/dashboard.py", escaped));
                        steps.push(format!(
                            "micromamba run -n {} streamlit run /tmp/dashboard.py --server.port {} --server.headless true",
                            env_name, gui_port_val
                        ));
                    }
                }
                _ => {
                    if let Some(entrypoint) = params.get("entrypoint_script").and_then(|v| v.as_str()) {
                        let escaped = b64_encode(entrypoint);
                        steps.push(format!("echo '{}' | base64 -d > /tmp/gui.py", escaped));
                        steps.push(format!("micromamba run -n {} python3 /tmp/gui.py", env_name));
                    }
                }
            }
        }
    }

    let cmd = vec!["/bin/bash".to_string(), "-c".to_string(), steps.join(" && ")];

    Ok(PipelineConfig {
        cmd,
        env_setup_steps,
        port,
        volumes,
        use_gpu,
    })
}

/// Build steps for a data node (write content to mount path)
fn build_data_steps(steps: &mut Vec<String>, node: &Node) {
    let cfg = parse_config(&node.data.config);
    let params = get_params(&cfg);
    if let (Some(content), Some(mount_path)) = (
        params.get("content").and_then(|v| v.as_str()),
        params.get("mount_path").and_then(|v| v.as_str()),
    ) {
        let dir = mount_path.rsplit_once('/')
            .map(|(d, _)| d.to_string())
            .unwrap_or_else(|| "/data".to_string());
        let escaped = b64_encode(content);
        steps.push(format!("mkdir -p {} && echo '{}' | base64 -d > {}", dir, escaped, mount_path));
    }
}

/// Build steps for a script node
fn build_script_steps<'a>(
    steps: &mut Vec<String>,
    node: &'a Node,
    nodes: &[Node],
    edges: &[Edge],
    _volumes: &mut Vec<crate::container::VolumeMount>,
) {
    // Find upstream data nodes
    let upstream_ids: Vec<String> = edges
        .iter()
        .filter(|e| e.target == node.id)
        .map(|e| e.source.clone())
        .collect();

    for src_id in upstream_ids {
        if let Some(src_node) = nodes.iter().find(|n| n.id == src_id) {
            if src_node.data.node_type == "DataNode" {
                build_data_steps(steps, src_node);
            }
        }
    }
}

/// Add script execution step
fn add_script_execution(steps: &mut Vec<String>, node: &Node, nodes: &[Node]) {
    let cfg = parse_config(&node.data.config);
    let params = get_params(&cfg);
    if params.get("script").is_none() {
        return;
    }

    let env_name = node.data.parent_id
        .as_ref()
        .and_then(|pid| nodes.iter().find(|n| n.id == *pid))
        .map(|p| {
            let cfg = parse_config(&p.data.config);
            let params = get_params(&cfg);
            params.get("envName")
                .and_then(|v| v.as_str())
                .unwrap_or("nyctus-demo")
                .to_string()
        })
        .unwrap_or_else(|| "nyctus-demo".to_string());

    let env_type = node.data.parent_id
        .as_ref()
        .and_then(|pid| nodes.iter().find(|n| n.id == *pid))
        .map(|p| {
            let cfg = parse_config(&p.data.config);
            let params = get_params(&cfg);
            params.get("envType")
                .and_then(|v| v.as_str())
                .unwrap_or("micromamba")
                .to_string()
        })
        .unwrap_or_else(|| "micromamba".to_string());

    let lang = params.get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("python");

    let script = params.get("script").and_then(|v| v.as_str()).unwrap_or("");
    let escaped = b64_encode(script);

    let ext = match lang {
        "r" => "R",
        "javascript" => "js",
        "typescript" => "ts",
        "bash" => "sh",
        _ => "py",
    };

    steps.push(format!("echo '{}' | base64 -d > /tmp/nyctus_script.{}", escaped, ext));

    match env_type.as_str() {
        "bun" => {
            steps.push("export PATH=\"$HOME/.bun/bin:$PATH\"".to_string());
            steps.push(format!("cd /tmp/bun_{} && bun run /tmp/nyctus_script.{}", env_name, ext));
        }
        "r" => {
            steps.push(format!("micromamba run -n {} Rscript /tmp/nyctus_script.{}", env_name, ext));
        }
        "bash" => {
            steps.push(format!("bash /tmp/nyctus_script.{}", ext));
        }
        _ => {
            steps.push(format!("micromamba run -n {} python3 -u /tmp/nyctus_script.{}", env_name, ext));
        }
    }
}
