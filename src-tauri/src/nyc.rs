use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tracing::{error, info};
use ts_rs::TS;

const NYCTUS_CACHE_DIR: &str = ".nyctus";

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/nyc.ts")]
pub struct NycManifest {
    pub name: String,
    pub version: String,
    pub created_at: String,
    pub nyctus_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/nyc.ts")]
pub struct SavePayload {
    pub project_name: String,
    /// Serialized ReactFlow state: { nodes, edges }
    pub graph_json: String,
    /// Serialized environment spec (YAML as string)
    pub environment_yaml: String,
    /// Map of filename → content for user scripts in /src/
    pub src_files: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export_to = "../src/types/generated/nyc.ts")]
pub struct LoadedProject {
    pub manifest: NycManifest,
    pub graph_json: String,
    pub environment_yaml: String,
    pub cache_dir: String,
}

// ── Save (.nyc) ──────────────────────────────────────────────────────────────

/// Serialize project state into a .nyc ZIP archive at `dest_path`.
pub fn save_nyc(payload: SavePayload, dest_path: &str) -> Result<(), String> {
    let dest = Path::new(dest_path);
    let file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);

    // manifest.json
    let manifest = NycManifest {
        name: payload.project_name.clone(),
        version: "1".to_string(),
        created_at: chrono_now(),
        nyctus_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options).map_err(|e| e.to_string())?;
    zip.write_all(manifest_json.as_bytes()).map_err(|e| e.to_string())?;

    // graph.json
    zip.start_file("graph.json", options).map_err(|e| e.to_string())?;
    zip.write_all(payload.graph_json.as_bytes()).map_err(|e| e.to_string())?;

    // environment.yaml
    zip.start_file("environment.yaml", options).map_err(|e| e.to_string())?;
    zip.write_all(payload.environment_yaml.as_bytes()).map_err(|e| e.to_string())?;

    // src/ user scripts
    for (filename, content) in &payload.src_files {
        let entry = format!("src/{}", filename);
        zip.start_file(&entry, options).map_err(|e| e.to_string())?;
        zip.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| {
        error!("Error finishing zip: {}", e);
        e.to_string()
    })?;
    
    info!(%dest_path, "Successfully saved .nyc file");
    Ok(())
}

// ── Load (.nyc) ──────────────────────────────────────────────────────────────

/// Unpack a .nyc file into ~/.nyctus/cache/<project-name>/.
/// Returns the loaded project data and the cache directory path.
pub fn load_nyc(src_path: &str) -> Result<LoadedProject, String> {
    info!(%src_path, "Loading .nyc file");
    
    let mut file = fs::File::open(src_path).map_err(|e| format!("Error opening file for load: {}", e))?;
    let mut payload_bytes = Vec::new();
    file.read_to_end(&mut payload_bytes).map_err(|e| format!("Error reading file: {}", e))?;

    let cursor = std::io::Cursor::new(payload_bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("Error parsing archive: {}", e))?;

    // Read manifest first to get project name
    let manifest: NycManifest = {
        let mut entry = zip.by_name("manifest.json").map_err(|e| {
            error!("Error finding manifest.json in zip: {}", e);
            e.to_string()
        })?;
        let mut buf = String::new();
        entry.read_to_string(&mut buf).map_err(|e| {
            error!("Error reading manifest.json: {}", e);
            e.to_string()
        })?;
        serde_json::from_str(&buf).map_err(|e| {
            error!("Error deserializing manifest.json: {}", e);
            e.to_string()
        })?
    };

    info!(name = %manifest.name, version = %manifest.nyctus_version, "Detected project");

    let cache_dir = nyctus_cache_path(&manifest.name);
    fs::create_dir_all(&cache_dir).map_err(|e| {
        error!("Error creating cache dir: {}", e);
        e.to_string()
    })?;

    // Extract all files
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| {
            error!("Error reading zip entry {}: {}", i, e);
            e.to_string()
        })?;
        let out_path = cache_dir.join(entry.name());

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| {
                error!("Error creating dir {}: {}", out_path.display(), e);
                e.to_string()
            })?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    error!("Error creating parent dir for file {}: {}", out_path.display(), e);
                    e.to_string()
                })?;
            }
            let mut out_file = fs::File::create(&out_path).map_err(|e| {
                error!("Error creating extracted file {}: {}", out_path.display(), e);
                e.to_string()
            })?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| {
                error!("Error writing extracted file {}: {}", out_path.display(), e);
                e.to_string()
            })?;
        }
    }

    // Read graph.json and environment.yaml from extracted files
    let mut graph_json = fs::read_to_string(cache_dir.join("graph.json"))
        .unwrap_or_else(|_| "{\"nodes\":[],\"edges\":[]}".to_string());
    
    // --- Hydration Step --- 
    // Find all dehydrated script pointers (e.g. "file://nyctus_src/script.py")
    // and replace them with the actual escaped file contents.
    let src_dir = cache_dir.join("src");
    if src_dir.exists() {
        if let Ok(entries) = fs::read_dir(&src_dir) {
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        let filename = entry.file_name().to_string_lossy().to_string();
                        let target_pointer = format!("\"file://nyctus_src/{}\"", filename);
                        
                        // Only attempt to read and replace if the pointer actually exists in the JSON graph
                        if graph_json.contains(&target_pointer) {
                            if let Ok(raw_content) = fs::read_to_string(entry.path()) {
                                // We must escape the raw code so it doesn't break the JSON structure when injected
                                let escaped_content = serde_json::to_string(&raw_content).unwrap_or_else(|_| "\"\"".to_string());
                                graph_json = graph_json.replace(&target_pointer, &escaped_content);
                            }
                        }
                    }
                }
            }
        }
    }

    let environment_yaml = fs::read_to_string(cache_dir.join("environment.yaml"))
        .unwrap_or_default();

    Ok(LoadedProject {
        manifest,
        graph_json,
        environment_yaml,
        cache_dir: cache_dir.to_string_lossy().to_string(),
    })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn nyctus_cache_path(project_name: &str) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(NYCTUS_CACHE_DIR).join("cache").join(project_name)
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}", secs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    #[test]
    fn test_nyc_manifest_creation() {
        let manifest = NycManifest {
            name: "test-project".to_string(),
            version: "1".to_string(),
            created_at: "1234567890".to_string(),
            nyctus_version: "0.1.0".to_string(),
        };

        assert_eq!(manifest.name, "test-project");
        assert_eq!(manifest.version, "1");
    }

    #[test]
    fn test_save_payload_serialization() {
        let mut src_files = HashMap::new();
        src_files.insert("main.py".to_string(), "print('hello')".to_string());

        let payload = SavePayload {
            project_name: "test".to_string(),
            graph_json: r#"{"nodes":[],"edges":[]}"#.to_string(),
            environment_yaml: "dependencies:\n  - python=3.11".to_string(),
            src_files,
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("test"));
        assert!(json.contains("main.py"));
    }

    #[test]
    fn test_loaded_project_deserialization() {
        let json = r#"{
            "manifest": {
                "name": "test-project",
                "version": "1",
                "created_at": "123",
                "nyctus_version": "0.1.0"
            },
            "graph_json": "{\"nodes\":[],\"edges\":[]}",
            "environment_yaml": "",
            "cache_dir": "/tmp/test"
        }"#;

        let loaded: LoadedProject = serde_json::from_str(json).unwrap();
        assert_eq!(loaded.manifest.name, "test-project");
        assert_eq!(loaded.cache_dir, "/tmp/test");
    }

    #[test]
    fn test_nyctus_cache_path() {
        let path = nyctus_cache_path("my-project");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains(".nyctus"));
        assert!(path_str.contains("cache"));
        assert!(path_str.contains("my-project"));
    }

    #[test]
    fn test_chrono_now_returns_string() {
        let now = chrono_now();
        assert!(!now.is_empty());
        // Should be a valid number
        assert!(now.parse::<u64>().is_ok());
    }

    #[test]
    fn test_save_and_load_nyc() -> Result<(), String> {
        let temp_dir = TempDir::new().map_err(|e| e.to_string())?;
        let nyc_path = temp_dir.path().join("test.nyc");

        // Create a save payload
        let mut src_files = HashMap::new();
        src_files.insert("script.py".to_string(), "print('hello world')".to_string());

        let payload = SavePayload {
            project_name: "test-project".to_string(),
            graph_json: r#"{"nodes":[{"id":"1","type":"ScriptNode"}],"edges":[]}"#.to_string(),
            environment_yaml: "dependencies:\n  - python=3.11".to_string(),
            src_files,
        };

        // Save
        save_nyc(payload, nyc_path.to_str().unwrap())?;

        // Verify file exists
        assert!(nyc_path.exists());

        // Load
        let loaded = load_nyc(nyc_path.to_str().unwrap())?;
        assert_eq!(loaded.manifest.name, "test-project");
        assert!(loaded.graph_json.contains("ScriptNode"));
        assert!(loaded.environment_yaml.contains("python=3.11"));

        Ok(())
    }
}
