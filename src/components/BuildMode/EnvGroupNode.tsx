import { NodeResizer, useReactFlow, applyNodeChanges, type NodeProps } from "@xyflow/react";
import type { EnvGroupData, EnvType } from "../../types";

const ENV_META: Record<EnvType, { color: string; badge: string; icon: string }> = {
    micromamba: { color: "#22d3ee", badge: "μmamba", icon: "🐍" },
    conda: { color: "#10b981", badge: "conda", icon: "🐍" },
    docker: { color: "#6366f1", badge: "docker", icon: "🐳" },
    bun: { color: "#fca5a5", badge: "bun", icon: "🥟" },
};

const MIN_W = 320;
const MIN_H = 200;

export default function EnvGroupNode({ id, data, selected }: NodeProps) {
    const d = data as EnvGroupData;
    const meta = ENV_META[d.envType] ?? ENV_META.micromamba;
    const { deleteElements, setNodes } = useReactFlow();

    let description = "";
    let envName = d.envName;
    let image = d.image;
    try {
        const cfg = JSON.parse(d.config || "{}");
        description = cfg.description || cfg.params?.description || "";

        const params = cfg.params ?? cfg;
        if (params.envName) envName = params.envName;
        if (params.image) image = params.image;
    } catch { /* ignore */ }

    return (
        <div
            className={`env-group env-group--${d.envType} ${selected ? "env-group--selected" : ""}`}
            style={{ borderColor: meta.color }}
        >
            {/* React Flow's built-in resize handles */}
            <NodeResizer
                minWidth={MIN_W}
                minHeight={MIN_H}
                isVisible={selected}
                lineStyle={{ borderColor: meta.color }}
                handleStyle={{ background: meta.color, border: "none", width: 8, height: 8 }}
                onResizeEnd={(_, params) => {
                    setNodes((nds) =>
                        applyNodeChanges([{
                            id,
                            type: 'dimensions',
                            dimensions: { width: params.width, height: params.height },
                            setAttributes: true,
                        }], nds)
                    );
                }}
            />

            {/* Header bar */}
            <div className="env-group__header" style={{ background: meta.color + "22", borderBottomColor: meta.color + "44" }}>
                <span className="env-group__icon">{meta.icon}</span>
                <span className="env-group__label">{d.label}</span>
                <span className="env-group__badge" style={{ background: meta.color + "33", color: meta.color }}>
                    {meta.badge}
                </span>
                <span style={{ flex: 1 }} />
                {envName && (
                    <span style={{ fontSize: 10, color: meta.color, fontFamily: "monospace", opacity: 0.85 }}>
                        {envName}
                    </span>
                )}
                {description && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 350 }}>
                        — {description}
                    </span>
                )}
                {image && (
                    <span style={{ fontSize: 10, color: meta.color, fontFamily: "monospace", opacity: 0.85 }}>
                        {image}
                    </span>
                )}
                <button
                    className="nyc-node__delete"
                    style={{ opacity: selected ? 1 : undefined }}
                    onClick={(e) => { e.stopPropagation(); deleteElements({ nodes: [{ id }] }); }}
                    title="Delete environment"
                >✕</button>
            </div>

            {/* Drop zone hint */}
            <div className="env-group__body">
                <span className="env-group__hint">
                    ↙ drag nodes here to assign to this environment
                </span>
            </div>
        </div>
    );
}
