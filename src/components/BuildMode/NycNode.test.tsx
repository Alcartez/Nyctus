import { render, screen, fireEvent } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import NycNode from "./NycNode";
import { useAppStore } from "../../store/useAppStore";
import type { NodeProps } from "@xyflow/react";
import type { NycNodeData, NycNodeType } from "../../types";

// Mock zustand store
vi.mock("../../store/useAppStore");

// Mock @xyflow/react
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...(actual as any),
    useReactFlow: () => ({
      deleteElements: vi.fn(),
      setNodes: vi.fn(),
    }),
  };
});

const mockUseAppStore = vi.mocked(useAppStore);

function renderNycNode(data: Partial<NycNodeData>, nodeType: NycNodeType = "ScriptNode", parentId?: string) {
  const nodeData: NycNodeData = {
    label: "Test Node",
    nodeType,
    config: "{}",
    ...data,
  };

  const props: NodeProps = {
    id: "test-node-1",
    type: "custom",
    position: { x: 0, y: 0 },
    data: nodeData as any,
    selected: false,
    dragging: false,
    zIndex: 1,
    selectable: true,
    deletable: true,
    draggable: true,
    connectable: true,
    parentId: parentId as any,
    width: 200,
    height: 100,
    initialized: true,
    isConnectable: true,
  };

  return render(
    <ReactFlowProvider>
      <NycNode {...props} />
    </ReactFlowProvider>
  );
}

describe("NycNode", () => {
  beforeEach(() => {
    mockUseAppStore.mockReturnValue({
      nodes: [],
    } as any);
  });

  it("renders node with label", () => {
    renderNycNode({ label: "My Script" });
    expect(screen.getByText("My Script")).toBeInTheDocument();
  });

  it("renders correct icon for ScriptNode", () => {
    const { container } = renderNycNode({}, "ScriptNode");
    expect(container.querySelector(".nyc-node__icon")).toHaveTextContent("⌨");
  });

  it("renders correct icon for ServiceNode", () => {
    const { container } = renderNycNode({}, "ServiceNode");
    expect(container.querySelector(".nyc-node__icon")).toHaveTextContent("⚙");
  });

  it("renders correct icon for DataNode", () => {
    const { container } = renderNycNode({}, "DataNode");
    expect(container.querySelector(".nyc-node__icon")).toHaveTextContent("◈");
  });

  it("renders node type label", () => {
    renderNycNode({}, "GuiNode");
    expect(screen.getByText("GuiNode")).toBeInTheDocument();
  });

  it("shows description when provided in config", () => {
    renderNycNode({
      config: JSON.stringify({ description: "This is a test script" }),
    });
    expect(screen.getByText("This is a test script")).toBeInTheDocument();
  });

  it("shows delete button", () => {
    renderNycNode({});
    expect(screen.getByTitle("Delete node")).toBeInTheDocument();
  });

  it("calls deleteElements when delete button is clicked", () => {
    const deleteElements = vi.fn();
    vi.mocked(require("@xyflow/react").useReactFlow).mockReturnValue({
      deleteElements,
      setNodes: vi.fn(),
    });

    renderNycNode({});
    const deleteBtn = screen.getByTitle("Delete node");
    fireEvent.click(deleteBtn);

    expect(deleteElements).toHaveBeenCalledWith({ nodes: [{ id: "test-node-1" }] });
  });

  it("shows environment name when node has parent", () => {
    mockUseAppStore.mockReturnValue({
      nodes: [
        {
          id: "parent-1",
          data: { envName: "my-env", config: '{"params":{"envName":"my-env"}}' },
        },
      ],
    } as any);

    renderNycNode({}, "ScriptNode", "parent-1");
    expect(screen.getByText(/env: my-env/)).toBeInTheDocument();
  });

  it("shows 'unassigned' for DataNode without parent", () => {
    renderNycNode({}, "DataNode");
    expect(screen.getByText(/env: unassigned/)).toBeInTheDocument();
  });
});
