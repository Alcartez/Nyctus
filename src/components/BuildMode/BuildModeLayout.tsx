import React, { useCallback, useRef } from "react";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    useNodesState,
    useEdgesState,
    type Connection,
    type Node,
    BackgroundVariant,
    useReactFlow,
    ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useAppStore } from "../../store/useAppStore";
import type { NycNodeData, NycNodeType, EnvGroupData } from "../../types";
import NycNode from "./NycNode";
import EnvGroupNode from "./EnvGroupNode";
import Toolbox, { TOOLBOX_ITEMS, type EnvGroupPreset } from "./Toolbox";
import NodeInspector from "./NodeInspector";
import { SCHEMA_MAP } from "../../lib/schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES: Record<string, React.ComponentType<any>> = { NycNode, EnvGroupNode };

let nodeCounter = 0;

/** Returns the group node whose bounds contain the given position, if any. */
function findParentGroup(
    groups: Node[],
    pos: { x: number; y: number }
): Node | undefined {
    return groups.find((g) => {
        // Use actively measured width/height if available, otherwise style as fallback
        const w = (g.measured?.width ?? (g.style?.width as number)) ?? 320;
        const h = (g.measured?.height ?? (g.style?.height as number)) ?? 200;
        return (
            pos.x >= g.position.x &&
            pos.x <= g.position.x + w &&
            pos.y >= g.position.y &&
            pos.y <= g.position.y + h
        );
    });
}

function BuildModeLayoutInner() {
    const {
        nodes, edges, selectedNodeId,
        setNodes, setEdges, setSelectedNodeId,
    } = useAppStore();

    const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes as Node<NycNodeData>[]);
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { screenToFlowPosition } = useReactFlow();

    // ── Sync Zustand to ReactFlow (e.g., on Load) ────────────────────────────
    React.useEffect(() => {
        // Only override rfNodes if the arrays are different lengths (like on Load/Delete)
        // This prevents ReactFlow from stuttering when it updates coordinates locally
        if (nodes.length !== rfNodes.length) {
            setRfNodes(nodes as Node<NycNodeData>[]);
        }
    }, [nodes, setRfNodes, rfNodes.length]);

    React.useEffect(() => {
        if (edges.length !== rfEdges.length) {
            setRfEdges(edges);
        }
    }, [edges, setRfEdges, rfEdges.length]);

    const syncNodes = useCallback((n: Node[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRfNodes(n as any); setNodes(n as any);
    }, [setRfNodes, setNodes]);

    const onConnect = useCallback(
        (params: Connection) => setRfEdges((eds) => { const next = addEdge(params, eds); setEdges(next); return next; }),
        [setRfEdges, setEdges]
    );

    const onEdgesDelete = useCallback(
        (deletedEdges: typeof rfEdges) => {
            setRfEdges((eds) => {
                const next = eds.filter(e => !deletedEdges.find(d => d.id === e.id));
                setEdges(next);
                return next;
            });
        },
        [setRfEdges, setEdges]
    );

    const onNodesDelete = useCallback(
        (deletedNodes: Node[]) => {
            setRfNodes((nds) => {
                const next = nds.filter((n) => !deletedNodes.find((d) => d.id === n.id));
                // Sync to global store
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setNodes(next as any);
                return next;
            });
            // If the deleted node is currently selected, clear selection
            const isSelectedDeleted = deletedNodes.find((d) => d.id === selectedNodeId);
            if (isSelectedDeleted) {
                setSelectedNodeId(null);
            }
        },
        [setRfNodes, setNodes, selectedNodeId, setSelectedNodeId]
    );

    // ── Drag-into-group: auto-parent nodes when dropped inside an EnvGroup ──────
    const onNodeDragStop = useCallback((_e: React.MouseEvent, node: Node) => {
        // EnvGroups cannot be placed inside other EnvGroups
        if (node.type === "EnvGroupNode") {
            document.querySelectorAll(".env-group--drag-target").forEach(el => el.classList.remove("env-group--drag-target"));
            return;
        }

        const groups = rfNodes.filter((n) => n.type === "EnvGroupNode" && n.id !== node.id);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyNode = node as any;
        const absX = anyNode.measured?.positionAbsolute?.x ?? anyNode.positionAbsolute?.x ?? node.position.x;
        const absY = anyNode.measured?.positionAbsolute?.y ?? anyNode.positionAbsolute?.y ?? node.position.y;
        
        const center = { x: absX + 80, y: absY + 20 };
        const parentGroup = findParentGroup(groups, center);

        // Clear hover states
        document.querySelectorAll(".env-group--drag-target").forEach(el => el.classList.remove("env-group--drag-target"));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (setRfNodes as any)((nds: Node[]) => {
            const updated = nds.map((n) => {
                if (n.id !== node.id) return n;

                const currentParentId = n.parentId;
                const newParentId = parentGroup ? parentGroup.id : undefined;

                if (currentParentId === newParentId) {
                    return n;
                }

                if (newParentId && parentGroup) {
                    return {
                        ...n,
                        parentId: newParentId,
                        extent: "parent" as const,
                        zIndex: 1,
                        position: {
                            x: absX - parentGroup.position.x,
                            y: absY - parentGroup.position.y,
                        },
                    };
                } else {
                    return {
                        ...n,
                        parentId: undefined,
                        extent: undefined,
                        zIndex: 0,
                        position: {
                            x: absX,
                            y: absY,
                        },
                    };
                }
            });
            setNodes(updated as any);
            return updated;
        });
    }, [rfNodes, setRfNodes, setNodes]);

    // ── Global Drag Stop (Sync coordinates to Zustand) ───────────────────────
    // Whenever *any* node stops dragging (whether it's an EnvGroup moving its children, 
    // or a single node just changing position), flush the final ReactFlow coordinate state 
    // into the global Zustand store so Save works properly.
    const onNodeDragStopGlobal = useCallback(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setNodes(rfNodes as any);
    }, [rfNodes, setNodes]);

    // ── Drag highlight: glow when hovering over an EnvGroup ──────────────────────
    const onNodeDrag = useCallback((_e: React.MouseEvent, node: Node) => {
        if (node.type === "EnvGroupNode") return;

        const groups = rfNodes.filter((n) => n.type === "EnvGroupNode" && n.id !== node.id);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyNode = node as any;
        const absX = anyNode.measured?.positionAbsolute?.x ?? anyNode.positionAbsolute?.x ?? node.position.x;
        const absY = anyNode.measured?.positionAbsolute?.y ?? anyNode.positionAbsolute?.y ?? node.position.y;
        
        const center = { x: absX + 80, y: absY + 20 };
        const parentGroup = findParentGroup(groups, center);

        // Clear all previous hover states directly via DOM to avoid React re-renders while dragging
        document.querySelectorAll(".env-group--drag-target").forEach(el => {
            if (el.parentElement?.getAttribute("data-id") !== parentGroup?.id) {
                el.classList.remove("env-group--drag-target");
            }
        });

        if (parentGroup) {
            const el = document.querySelector(`.react-flow__node[data-id="${parentGroup.id}"] .env-group`);
            if (el && !el.classList.contains("env-group--drag-target")) {
                el.classList.add("env-group--drag-target");
            }
        }
    }, [rfNodes]);

    // ── Drop from toolbox ────────────────────────────────────────────────────────
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();

        // Regular node drop
        const nodeType = e.dataTransfer.getData("application/nyctus-node") as NycNodeType;
        if (nodeType) {
            const meta = TOOLBOX_ITEMS.find((i) => i.type === nodeType)!;
            nodeCounter++;
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

            // Auto-parent if dropped over a group
            const groups = rfNodes.filter((n) => n.type === "EnvGroupNode");
            const parentGroup = findParentGroup(groups, pos);

            const newNode: Node<NycNodeData> = {
                id: `node-${nodeCounter}`,
                type: "NycNode",
                parentId: parentGroup?.id,
                extent: parentGroup ? "parent" : undefined,
                position: parentGroup
                    ? { x: pos.x - parentGroup.position.x - 80, y: pos.y - parentGroup.position.y - 40 }
                    : { x: pos.x - 80, y: pos.y - 40 },
                zIndex: parentGroup ? 1 : 0,
                data: {
                    label: `${meta.label} ${nodeCounter}`,
                    nodeType,
                    icon: meta.icon,
                    config: JSON.stringify({ type: nodeType, label: `${meta.label} ${nodeCounter}`, params: {} }, null, 2),
                },
            };
            syncNodes([...rfNodes, newNode]);
            return;
        }

        // EnvGroup drop
        const rawPreset = e.dataTransfer.getData("application/nyctus-env-group");
        if (rawPreset) {
            addEnvGroupAtPos(JSON.parse(rawPreset) as EnvGroupPreset, e.clientX, e.clientY);
        }
    }, [rfNodes, syncNodes, screenToFlowPosition]);

    const addEnvGroupAtPos = useCallback((preset: EnvGroupPreset, clientX = 300, clientY = 200) => {
        nodeCounter++;
        const pos = screenToFlowPosition({ x: clientX, y: clientY });
        const width = 400;
        const height = 260;
        const newGroup: Node<EnvGroupData> = {
            id: `env-${nodeCounter}`,
            type: "EnvGroupNode",
            position: { x: pos.x - 160, y: pos.y - 100 },
            width,
            height,
            style: { width, height },
            data: {
                ...preset.data,
                label: `${preset.data.label} ${nodeCounter}`,
            },
            zIndex: -1,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        syncNodes([...rfNodes, newGroup as any]);
    }, [rfNodes, syncNodes, screenToFlowPosition]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node<NycNodeData>) => {
        setSelectedNodeId(node.id);
    }, [setSelectedNodeId]);

    const selectedNode = rfNodes.find((n) => n.id === selectedNodeId);

    return (
        <div className="build-mode" style={{ flex: 1, minWidth: 0 }}>
            <Group orientation="horizontal" style={{ height: "100%" }}>

                {/* ── Left: Toolbox ── */}
                <Panel defaultSize="18%" minSize="180px" maxSize="28%">
                    <Toolbox
                        onAddNode={(type) => {
                            const meta = TOOLBOX_ITEMS.find((i) => i.type === type)!;
                            nodeCounter++;
                            const schema = SCHEMA_MAP[type];
                            const newNode: Node<NycNodeData> = {
                                id: `node-${nodeCounter}`,
                                type: "NycNode",
                                position: { x: 120 + (nodeCounter % 5) * 40, y: 80 + (nodeCounter % 5) * 40 },
                                data: {
                                    label: `${meta.label} ${nodeCounter}`,
                                    nodeType: type,
                                    icon: meta.icon,
                                    schema,
                                    config: JSON.stringify({ type, label: `${meta.label} ${nodeCounter}`, params: {} }, null, 2),
                                },
                            };
                            syncNodes([...rfNodes, newNode]);
                        }}
                        onAddEnvGroup={(preset) => addEnvGroupAtPos(preset, 400, 250)}
                    />
                </Panel>

                <Separator style={{ width: 1, background: "var(--border-subtle)", cursor: "col-resize" }} />

                {/* ── Center: Canvas with Monaco ── */}
                <Panel minSize="40%">
                    <Group orientation="vertical" style={{ height: "100%" }}>
                        <Panel defaultSize="70%" minSize="40%">
                            <div
                                className="canvas-wrap"
                                style={{ height: "100%" }}
                                ref={reactFlowWrapper}
                                onDrop={onDrop}
                                onDragOver={(e) => e.preventDefault()}
                            >
                                <ReactFlow
                                    nodes={rfNodes}
                                    edges={rfEdges}
                                    nodeTypes={NODE_TYPES}
                                    onNodesChange={onNodesChange}
                                    onNodesDelete={onNodesDelete}
                                    onEdgesChange={onEdgesChange}
                                    onEdgesDelete={onEdgesDelete}
                                    onConnect={onConnect}
                                    onNodeClick={onNodeClick}
                                    onNodeDrag={onNodeDrag}
                                    onNodeDragStop={(e, node) => {
                                        onNodeDragStop(e, node);
                                        onNodeDragStopGlobal();
                                    }}
                                    onPaneClick={() => setSelectedNodeId(null)}
                                    fitView
                                    style={{ background: "var(--bg-base)" }}
                                >
                                    <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border-subtle)" />
                                    <Controls style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }} />
                                    <MiniMap
                                        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                                        nodeColor={(n) => n.type === "EnvGroupNode" ? "rgba(99,102,241,0.3)" : "var(--brand)"}
                                    />
                                </ReactFlow>
                            </div>
                        </Panel>

                        <Separator style={{ height: 1, background: "var(--border-subtle)", cursor: "row-resize" }} />

                        <Panel defaultSize="30%" minSize="20%">
                            <NodeInspector setRfNodes={setRfNodes} />
                        </Panel>
                    </Group>
                </Panel>

                <Separator style={{ width: 1, background: "var(--border-subtle)", cursor: "col-resize" }} />

                {/* ── Right: Properties ── */}
                <Panel defaultSize="22%" minSize="180px" maxSize="32%">
                    <div className="sidebar sidebar--right" style={{ height: "100%" }}>
                        <div className="sidebar__header">Properties</div>
                        <div className="sidebar__body">
                            {selectedNode ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    <div>
                                        <div className="text-muted text-sm">Node ID</div>
                                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--text-code)", marginTop: 2 }}>
                                            {selectedNode.id}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted text-sm">Type</div>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <div style={{ fontSize: 12, marginTop: 2 }}>{(selectedNode.data as any).nodeType ?? (selectedNode.data as any).envType ?? selectedNode.type}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted text-sm">Label</div>
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        <div style={{ fontSize: 12, marginTop: 2 }}>{(selectedNode.data as any).label}</div>
                                    </div>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {(selectedNode.data as any).parentId && (
                                        <div>
                                            <div className="text-muted text-sm">Environment</div>
                                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                            <div style={{ fontSize: 12, marginTop: 2, color: "var(--accent-cyan)" }}>{(selectedNode as any).parentId}</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                    Select a node or environment on the canvas to inspect its properties.
                                </div>
                            )}
                        </div>
                    </div>
                </Panel>
            </Group>
        </div>
    );
}

// Wrap in ReactFlowProvider so useReactFlow() works inside
export default function BuildModeLayout() {
    return (
        <ReactFlowProvider>
            <BuildModeLayoutInner />
        </ReactFlowProvider>
    );
}
