import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RuntimeInfo, DeployConfig, LogPayload, SavePayload, LoadedProject, GpuStatus } from "../types";

const IS_TAURI = isTauri();

// ── Runtime ───────────────────────────────────────────────────────────────────

export async function checkRuntime(): Promise<RuntimeInfo> {
    if (!IS_TAURI) return { status: "running", runtime: "Podman" };
    return invoke<RuntimeInfo>("check_runtime");
}

export async function checkGpuAvailable(runtimeKind: string): Promise<GpuStatus> {
    if (!IS_TAURI) return "Unavailable";
    return invoke<GpuStatus>("check_gpu_available", { runtimeKind });
}

export async function initRuntime(runtimeKind: string): Promise<void> {
    if (!IS_TAURI) return;
    return invoke("init_runtime", { runtimeKind });
}

export async function pullBaseImage(): Promise<void> {
    if (!IS_TAURI) return;
    return invoke("pull_base_image");
}


// ── Container ─────────────────────────────────────────────────────────────────

export async function deployEnvironment(config: DeployConfig): Promise<string> {
    if (!IS_TAURI) return "mock-container-id";
    return invoke<string>("deploy_environment", { config });
}

export async function killEnvironment(): Promise<void> {
    if (!IS_TAURI) return;
    return invoke("kill_environment");
}

// ── .nyc file system ──────────────────────────────────────────────────────────

export async function saveNyc(payload: SavePayload, destPath: string): Promise<void> {
    if (!IS_TAURI) return;
    return invoke("save_nyc", { payload, destPath });
}

export async function loadNyc(srcPath: string): Promise<LoadedProject> {
    if (!IS_TAURI) throw new Error("Not in Tauri");
    return invoke<LoadedProject>("load_nyc", { srcPath });
}

// ── OS External Editor ────────────────────────────────────────────────────────

export async function openInOsEditor(filename: string, content: string): Promise<string> {
    if (!IS_TAURI) {
        console.log("Mock open OS editor:", filename);
        return "mock/path/to/file.py";
    }
    return invoke<string>("open_in_os_editor", { filename, content });
}

export async function readOsFile(path: string): Promise<string> {
    if (!IS_TAURI) return "mock content from OS";
    return invoke<string>("read_os_file", { path });
}

// ── Event listeners ───────────────────────────────────────────────────────────

export function onContainerLog(cb: (payload: LogPayload) => void) {
    return listen<LogPayload>("container-log", (e) => cb(e.payload));
}

export function onPullProgress(cb: (msg: string) => void) {
    return listen<string>("pull-progress", (e) => cb(e.payload));
}

export function onContainerStarted(cb: (id: string) => void) {
    return listen<string>("container-started", (e) => cb(e.payload));
}

export function onContainerKilled(cb: (id: string) => void) {
    return listen<string>("container-killed", (e) => cb(e.payload));
}
