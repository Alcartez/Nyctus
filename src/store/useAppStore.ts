import { create } from "zustand";
import { type Node, type Edge } from "@xyflow/react";
import type {
    AppMode,
    RuntimeKind,
    GpuStatus,
    NycNodeData,
    DeployConfig,
} from "../types";

// ── Graph slice ───────────────────────────────────────────────────────────────

interface GraphSlice {
    nodes: Node<NycNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    setNodes: (nodes: Node<NycNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    setSelectedNodeId: (id: string | null) => void;
    updateNodeConfig: (id: string, config: string) => void;
}

// ── Runtime slice ─────────────────────────────────────────────────────────────

interface RuntimeSlice {
    runtimeKind: RuntimeKind | null;
    gpuStatus: GpuStatus;
    activeContainerId: string | null;
    setRuntimeKind: (kind: RuntimeKind | null) => void;
    setGpuStatus: (s: GpuStatus) => void;
    setActiveContainerId: (id: string | null) => void;
}

// ── Project slice ─────────────────────────────────────────────────────────────

interface ProjectSlice {
    projectName: string;
    projectPath: string | null;
    cacheDir: string | null;
    environmentYaml: string;
    setProjectName: (name: string) => void;
    setProjectPath: (path: string | null) => void;
    setCacheDir: (dir: string | null) => void;
    setEnvironmentYaml: (yaml: string) => void;
}

// ── UI slice ──────────────────────────────────────────────────────────────────

interface UiSlice {
    appMode: AppMode;
    isDeploying: boolean;
    hasGuiNode: boolean;
    setAppMode: (mode: AppMode) => void;
    setIsDeploying: (v: boolean) => void;
    setHasGuiNode: (v: boolean) => void;
}

// ── Deploy config slice ───────────────────────────────────────────────────────

interface DeploySlice {
    deployConfig: DeployConfig;
    setDeployConfig: (cfg: Partial<DeployConfig>) => void;
}

// ── Combined store ────────────────────────────────────────────────────────────

type AppStore = GraphSlice & RuntimeSlice & ProjectSlice & UiSlice & DeploySlice;

export const useAppStore = create<AppStore>((set) => ({
    // Graph
    nodes: [],
    edges: [],
    selectedNodeId: null,
    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    updateNodeConfig: (id, config) =>
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, config } } : n
            ),
        })),

    // Runtime
    runtimeKind: null,
    gpuStatus: "Unavailable",
    activeContainerId: null,
    setRuntimeKind: (kind) => set({ runtimeKind: kind }),
    setGpuStatus: (gpuStatus) => set({ gpuStatus }),
    setActiveContainerId: (id) => set({ activeContainerId: id }),

    // Project
    projectName: "untitled",
    projectPath: null,
    cacheDir: null,
    environmentYaml: "",
    setProjectName: (projectName) => set({ projectName }),
    setProjectPath: (projectPath) => set({ projectPath }),
    setCacheDir: (cacheDir) => set({ cacheDir }),
    setEnvironmentYaml: (environmentYaml) => set({ environmentYaml }),

    // UI
    appMode: "BUILD",
    isDeploying: false,
    hasGuiNode: false,
    setAppMode: (appMode) => set({ appMode }),
    setIsDeploying: (isDeploying) => set({ isDeploying }),
    setHasGuiNode: (hasGuiNode) => set({ hasGuiNode }),

    // Deploy config defaults
    deployConfig: {
        volumes: [],
        port_bindings: [{ host_port: 8080, container_port: 8080 }],
        use_gpu: false,
    },
    setDeployConfig: (cfg) =>
        set((state) => ({
            deployConfig: { ...state.deployConfig, ...cfg },
        })),
}));
