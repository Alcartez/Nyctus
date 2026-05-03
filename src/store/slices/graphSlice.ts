import { type Node, type Edge } from "@xyflow/react";
import type { NycNodeData } from "../types";

export interface GraphSlice {
    nodes: Node<NycNodeData>[];
    edges: Edge[];
    selectedNodeId: string | null;
    setNodes: (nodes: Node<NycNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    setSelectedNodeId: (id: string | null) => void;
    updateNodeConfig: (id: string, config: string) => void;
}

export const createGraphSlice = (set: any) => ({
    nodes: [] as Node<NycNodeData>[],
    edges: [] as Edge[],
    selectedNodeId: null as string | null,
    setNodes: (nodes: Node<NycNodeData>[]) => set({ nodes }),
    setEdges: (edges: Edge[]) => set({ edges }),
    setSelectedNodeId: (id: string | null) => set({ selectedNodeId: id }),
    updateNodeConfig: (id: string, config: string) =>
        set((state: any) => ({
            nodes: state.nodes.map((n: Node<NycNodeData>) =>
                n.id === id ? { ...n, data: { ...n.data, config } } : n
            ),
        })),
});
