// Global type definitions for Nyctus-core
// Import generated types from Rust structs
import { RuntimeKind, RuntimeStatus, GpuStatus } from "./generated/preflight";
export { RuntimeKind, RuntimeStatus, GpuStatus };
export type { NycManifest, LoadedProject, SavePayload } from "./generated/nyc";
export type { VolumeMount, PortRule, DeployConfig, LogPayload } from "./generated/container";
export type { Node, Edge, NodeData, PipelineConfig } from "./generated/pipeline";

export type AppMode = "BUILD" | "EXECUTE";

export type RuntimeInfo = {
    status: RuntimeStatus;
    runtime: RuntimeKind | null;
};

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
