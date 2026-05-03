import { Handle, Position, useReactFlow, type NodeProps, type Node } from "@xyflow/react";
import type { NycNodeData, NycNodeType, EnvGroupData } from "../../types";
import { useAppStore } from "../../store/useAppStore";
import { useToast } from "../../lib/useToast";

const TYPE_META: Record<NycNodeType, { icon: string; color: string }> = {
    GenericNode: { icon: "⬡", color: "var(--node-generic)" },
    ScriptNode: { icon: "⌨", color: "var(--node-script)" },
    ServiceNode: { icon: "⚙", color: "var(--node-service)" },
    DataNode: { icon: "◈", color: "var(--node-data)" },
    GuiNode: { icon: "◎", color: "var(--node-gui)" },
    EnvGroupNode: { icon: "□", color: "var(--border-default)" },
};

export default function NycNode({ id, data, selected, parentId }: NodeProps) {
    const nodeData = data as NycNodeData;
    const meta = TYPE_META[nodeData.nodeType] ?? TYPE_META.GenericNode;
    const { deleteElements, setNodes } = useReactFlow();
    const nodes = useAppStore((state) => state.nodes as Node<any>[]);
    const { showToast } = useToast();

    const parentNode = parentId ? nodes.find((n) => n.id === parentId) as Node<EnvGroupData> | undefined : undefined;

    let parentEnvName = (nodeData.nodeType !== 'DataNode' ? "unassigned" : null) as string | null;
    if (parentNode) {
        try {
            const pCfg = JSON.parse(parentNode.data.config || "{}");
            const pParams = pCfg.params ?? pCfg;
            parentEnvName = pParams.envName || parentNode.data.envName || "nyctus-env";
        } catch {
            parentEnvName = parentNode.data.envName || "nyctus-env";
        }
    }

    let description = "";
    try {
        const cfg = JSON.parse(nodeData.config || "{}");
        description = cfg.params?.description || cfg.description || "";
    } catch (e) {
        showToast(`Failed to parse node config: ${e}`, "error");
    }

    const handleUnassign = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!parentId) return;
        setNodes((nds) => {
            const thisNode = nds.find(n => n.id === id);
            const pNode = nds.find(n => n.id === parentId);
            if (!thisNode || !pNode) return nds;
            return nds.map(n => {
                if (n.id === id) {
                    return {
                        ...n,
                        parentId: undefined,
                        extent: undefined,
                        zIndex: 0,
                        position: {
                            x: n.position.x + pNode.position.x,
                            y: n.position.y + pNode.position.y
                        }
                    };
                }
                return n;
            });
        });
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        deleteElements({ nodes: [{ id }] });
    };

    return (
        <div className={`nyc-node ${selected ? "nyc-node--selected" : ""}`}>
            {/* Input handle */}
            <Handle
                type="target"
                position={Position.Left}
                style={{ background: meta.color, width: 8, height: 8, border: "2px solid var(--bg-elevated)" }}
            />

            <div className="nyc-node__header">
                <div className="nyc-node__icon" style={{ background: meta.color + "22", color: meta.color }}>
                    {(nodeData.icon as string) || meta.icon}
                </div>
                <span className="nyc-node__label">{nodeData.label}</span>
                {/* Delete button — visible on hover/select */}
                <button
                    className="nyc-node__delete"
                    onClick={handleDelete}
                    title="Delete node"
                >✕</button>
            </div>

            <div className="nyc-node__body" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ color: "var(--text-secondary)", fontSize: 11, fontWeight: 500 }}>
                    {nodeData.nodeType}
                </div>
                {description && (
                    <div style={{ color: "var(--text-muted)", fontSize: 10, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {description}
                    </div>
                )}
                {parentEnvName && (
                    <div
                        title="Click to unassign from environment"
                        onClick={parentId ? handleUnassign : undefined}
                        style={{
                            marginTop: 4, padding: "2px 6px", background: "var(--bg-elevated)",
                            borderRadius: 4, fontSize: 9, fontFamily: "monospace",
                            display: "inline-block", alignSelf: "flex-start", color: "var(--accent-cyan)",
                            cursor: parentId ? "pointer" : "default", border: parentId ? "1px solid var(--border-subtle)" : "none"
                        }}
                    >
                        env: {parentEnvName} {parentId && <span style={{ marginLeft: 4, opacity: 0.7 }}>✕</span>}
                    </div>
                )}
            </div>

            {/* Output handle */}
            <Handle
                type="source"
                position={Position.Right}
                style={{ background: meta.color, width: 8, height: 8, border: "2px solid var(--bg-elevated)" }}
            />
        </div>
    );
}
