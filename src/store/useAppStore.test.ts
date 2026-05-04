import { describe, it, expect } from "vitest";
import { useAppStore } from "./useAppStore";
import { GpuStatus } from "../types";

// Mock slices for isolated testing
describe("useAppStore", () => {
  it("should create store with all slices", () => {
    const store = useAppStore;
    expect(store).toBeDefined();
    expect(typeof store.getState).toBe("function");
  });

  it("should initialize with default graph state", () => {
    const state = useAppStore.getState();

    expect(state.nodes).toEqual([]);
    expect(state.edges).toEqual([]);
    expect(state.selectedNodeId).toBeNull();
  });

  it("should update nodes with setNodes", () => {
    const { setNodes, nodes } = useAppStore.getState();


    expect(nodes).toEqual([]);

    const mockNodes = [
      {
        id: "1",
        type: "custom",
        position: { x: 0, y: 0 },
        data: { label: "Test", nodeType: "ScriptNode", config: "{}" },
      },
    ] as any;

    setNodes(mockNodes);
    expect(useAppStore.getState().nodes).toEqual(mockNodes);
  });

  it("should update edges with setEdges", () => {
    const { setEdges } = useAppStore.getState();

    const mockEdges = [{ id: "e1-2", source: "1", target: "2" }] as any;
    setEdges(mockEdges);

    expect(useAppStore.getState().edges).toEqual(mockEdges);
  });

  it("should update selectedNodeId", () => {
    const { setSelectedNodeId } = useAppStore.getState();

    setSelectedNodeId("node-1");
    expect(useAppStore.getState().selectedNodeId).toBe("node-1");

    setSelectedNodeId(null);
    expect(useAppStore.getState().selectedNodeId).toBeNull();
  });

  it("should update node config with updateNodeConfig", () => {
    const mockNodes = [
      {
        id: "1",
        type: "custom",
        position: { x: 0, y: 0 },
        data: { label: "Test", nodeType: "ScriptNode", config: "{}" },
      },
    ] as any;

    useAppStore.getState().setNodes(mockNodes);
    useAppStore.getState().updateNodeConfig("1", '{"key":"value"}');

    const updatedNode = useAppStore.getState().nodes[0];
    expect(updatedNode.data.config).toBe('{"key":"value"}');
  });

  it("should initialize with default runtime state", () => {
    const state = useAppStore.getState();

    expect(state.runtimeKind).toBeNull();
    expect(state.gpuStatus).toBe(GpuStatus.Unavailable);
    expect(state.activeContainerId).toBeNull();
  });

  it("should initialize with default UI state", () => {
    const state = useAppStore.getState();

    expect(state.appMode).toBe("BUILD");
    expect(state.isDeploying).toBe(false);
    expect(state.hasGuiNode).toBe(false);
  });
});
