use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const NYCTUS_CACHE_DIR: &str = ".nyctus";

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NycManifest {
    pub name: String,
    pub version: String,
    pub created_at: String,
    pub nyctus_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavePayload {
    pub project_name: String,
    /// Serialized ReactFlow state: { nodes, edges }
    pub graph_json: String,
    /// Serialized environment spec (YAML as string)
    pub environment_yaml: String,
    /// Map of filename → content for user scripts in /src/
    pub src_files: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
        println!("Error finishing zip: {}", e);
        e.to_string()
    })?;
    
    println!("Successfully saved .nyc to {}", dest_path);
    Ok(())
}

// ── Load (.nyc) ──────────────────────────────────────────────────────────────

/// Unpack a .nyc file into ~/.nyctus/cache/<project-name>/.
/// Returns the loaded project data and the cache directory path.
pub fn load_nyc(src_path: &str) -> Result<LoadedProject, String> {
    println!("Loading file from {}", src_path);
    
    let mut file = fs::File::open(src_path).map_err(|e| format!("Error opening file for load: {}", e))?;
    let mut payload_bytes = Vec::new();
    file.read_to_end(&mut payload_bytes).map_err(|e| format!("Error reading file: {}", e))?;

    let cursor = std::io::Cursor::new(payload_bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| format!("Error parsing archive: {}", e))?;

    // Read manifest first to get project name
    let manifest: NycManifest = {
        let mut entry = zip.by_name("manifest.json").map_err(|e| {
            println!("Error finding manifest.json in zip: {}", e);
            e.to_string()
        })?;
        let mut buf = String::new();
        entry.read_to_string(&mut buf).map_err(|e| {
            println!("Error reading manifest.json: {}", e);
            e.to_string()
        })?;
        serde_json::from_str(&buf).map_err(|e| {
            println!("Error deserializing manifest.json: {}", e);
            e.to_string()
        })?
    };

    println!("Detected project: {} v{}", manifest.name, manifest.nyctus_version);

    let cache_dir = nyctus_cache_path(&manifest.name);
    fs::create_dir_all(&cache_dir).map_err(|e| {
        println!("Error creating cache dir: {}", e);
        e.to_string()
    })?;

    // Extract all files
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| {
            println!("Error reading zip entry {}: {}", i, e);
            e.to_string()
        })?;
        let out_path = cache_dir.join(entry.name());

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| {
                println!("Error creating dir {}: {}", out_path.display(), e);
                e.to_string()
            })?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    println!("Error creating parent dir for file {}: {}", out_path.display(), e);
                    e.to_string()
                })?;
            }
            let mut out_file = fs::File::create(&out_path).map_err(|e| {
                println!("Error creating extracted file {}: {}", out_path.display(), e);
                e.to_string()
            })?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| {
                println!("Error writing extracted file {}: {}", out_path.display(), e);
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
