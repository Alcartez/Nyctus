// Global type definitions for Nyctus-core

export type AppMode = "BUILD" | "EXECUTE";

export type RuntimeKind = "Podman" | "Docker";
export type RuntimeStatus = "running" | "stopped" | "not_installed";

export interface RuntimeInfo {
    status: RuntimeStatus;
    runtime: RuntimeKind | null;
}

export type GpuStatus = "Available" | "Unavailable" | "ToolkitMissing";

// ── .nyc types ────────────────────────────────────────────────────────────────

export interface NycManifest {
    name: string;
    version: string;
    created_at: string;
    nyctus_version: string;
}

export interface LoadedProject {
    manifest: NycManifest;
    graph_json: string;
    environment_yaml: string;
    cache_dir: string;
}

export interface SavePayload {
    project_name: string;
    graph_json: string;
    environment_yaml: string;
    src_files: Record<string, string>;
}

// ── Node types ────────────────────────────────────────────────────────────────

export type NycNodeType =
    | "GenericNode"
    | "ScriptNode"
    | "ServiceNode"
    | "DataNode"
    | "GuiNode"
    | "EnvGroupNode";

export interface NycNodeData extends Record<string, unknown> {
    label: string;
    nodeType: NycNodeType;
    config: string; // JSON config string shown in Monaco
    icon?: string;
    schema?: Record<string, any>;
    uiSchema?: Record<string, any>;
}

export type EnvType = "micromamba" | "conda" | "docker" | "bun";

export interface EnvGroupData extends Record<string, unknown> {
    label: string;
    envType: EnvType;
    /** Docker image (when envType === 'docker') */
    image?: string;
    /** Conda/micromamba environment name */
    envName?: string;
    /** Conda/micromamba package list e.g. ["python=3.11", "r-base=4.1"] */
    dependencies: string[];
    /** Packages to install via pip after conda env is created */
    pip_deps?: string[];
    config: string; // shown in Monaco
}

// ── Container types ───────────────────────────────────────────────────────────

export interface VolumeMount {
    host_path: string;
    container_path: string;
    read_only: boolean;
}

export interface PortRule {
    host_port: number;
    container_port: number;
}

export interface DeployConfig {
    image?: string;
    volumes: VolumeMount[];
    port_bindings: PortRule[];
    memory_limit_mb?: number;
    use_gpu: boolean;
    cmd?: string[];
}

export interface LogPayload {
    line: string;
    stream_type: "stdout" | "stderr";
}
