import { useAppStore } from "./useAppStore";
import { createGraphSlice } from "./slices/graphSlice";
import { createRuntimeSlice } from "./slices/runtimeSlice";
import { createProjectSlice } from "./slices/projectSlice";
import { createUiSlice } from "./slices/uiSlice";
import { createDeploySlice } from "./slices/deploySlice";
import { create } from "zustand";

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

    expect(state.runtimeStatus).toBe("checking");
    expect(state.currentRuntime).toBeNull();
    expect(state.isRuntimeReady).toBe(false);
  });

  it("should initialize with default UI state", () => {
    const state = useAppStore.getState();

    expect(state.mode).toBe("BUILD");
    expect(state.isDirty).toBe(false);
    expect(state.showMinimap).toBe(true);
  });
});
