import type { NycNodeType, EnvGroupData, EnvType } from "../../types";
import { SCHEMA_MAP } from "../../lib/schemas";

export const TOOLBOX_ITEMS: { type: NycNodeType; label: string; desc: string; icon: string; color: string }[] = [
    { type: "GenericNode", label: "Generic", desc: "General purpose", icon: "⬡", color: "var(--node-generic)" },
    { type: "ScriptNode", label: "Script", desc: "Run a script", icon: "⌨", color: "var(--node-script)" },
    { type: "ServiceNode", label: "Service", desc: "Long-running svc", icon: "⚙", color: "var(--node-service)" },
    { type: "DataNode", label: "Data Source", desc: "Input / output", icon: "◈", color: "var(--node-data)" },
    { type: "GuiNode", label: "GUI Render", desc: "Serves a web UI", icon: "◎", color: "var(--node-gui)" },
];

export type EnvGroupPreset = {
    id: string;
    label: string;
    desc: string;
    icon: string;
    color: string;
    data: EnvGroupData;
};

export const ENV_GROUP_PRESETS: EnvGroupPreset[] = [
    {
        id: "python-env",
        label: "Python Env",
        desc: "micromamba + Python 3.11",
        icon: "🐍",
        color: "var(--accent-cyan)",
        data: {
            nodeType: "EnvGroupNode",
            label: "Python Environment",
            envType: "micromamba" as EnvType,
            envName: "python_env",
            dependencies: ["python=3.11", "pip"],
            config: JSON.stringify({
                envType: "micromamba",
                envName: "python_env",
                dependencies: ["python=3.11", "pip"],
                pip_deps: []
            }, null, 2),
            schema: SCHEMA_MAP.EnvGroupNode,
        },
    },
    {
        id: "r-env",
        label: "R Env",
        desc: "conda + R 4.1",
        icon: "📊",
        color: "var(--accent-emerald)",
        data: {
            nodeType: "EnvGroupNode",
            label: "R Environment",
            envType: "conda" as EnvType,
            envName: "r_env",
            dependencies: ["r-base=4.1", "r-ggplot2"],
            config: JSON.stringify({
                envType: "conda",
                envName: "r_env",
                dependencies: ["r-base=4.1", "r-ggplot2"],
                pip_deps: []
            }, null, 2),
            schema: SCHEMA_MAP.EnvGroupNode,
        },
    },
    {
        id: "node-env",
        label: "Node.js Env",
        desc: "micromamba + Node.js 20",
        icon: "🟢",
        color: "var(--node-service)",
        data: {
            nodeType: "EnvGroupNode",
            label: "Node.js Environment",
            envType: "micromamba" as EnvType,
            envName: "node_env",
            dependencies: ["nodejs=20"],
            config: JSON.stringify({
                envType: "micromamba",
                envName: "node_env",
                dependencies: ["nodejs=20"],
                pip_deps: []
            }, null, 2),
            schema: SCHEMA_MAP.EnvGroupNode,
        },
    },
    {
        id: "docker-env",
        label: "Docker Image",
        desc: "Any Docker/Podman image",
        icon: "🐳",
        color: "var(--brand)",
        data: {
            nodeType: "EnvGroupNode",
            label: "Docker Environment",
            envType: "docker" as EnvType,
            image: "docker.io/alcartez/nyctus-os:latest",
            dependencies: [],
            config: JSON.stringify({
                envType: "docker",
                image: "docker.io/alcartez/nyctus-os:latest"
            }, null, 2),
            schema: SCHEMA_MAP.EnvGroupNode,
        },
    },
];

interface ToolboxProps {
    onAddNode?: (type: NycNodeType) => void;
    onAddEnvGroup?: (preset: EnvGroupPreset) => void;
}

export default function Toolbox({ onAddNode, onAddEnvGroup }: ToolboxProps) {
    const onDragStart = (e: React.DragEvent, type: NycNodeType) => {
        e.dataTransfer.setData("application/nyctus-node", type);
        e.dataTransfer.effectAllowed = "copy";
    };

    const onEnvDragStart = (e: React.DragEvent, preset: EnvGroupPreset) => {
        e.dataTransfer.setData("application/nyctus-env-group", JSON.stringify(preset));
        e.dataTransfer.effectAllowed = "copy";
    };

    return (
        <div className="sidebar" style={{ height: "100%" }}>
            <div className="sidebar__header">Toolbox</div>
            <div className="sidebar__body">

                {/* ── Nodes ── */}
                <div className="toolbox-section-label">Nodes</div>
                {TOOLBOX_ITEMS.map((item) => (
                    <div
                        key={item.type}
                        className="toolbox-node"
                        draggable
                        onDragStart={(e) => onDragStart(e, item.type)}
                        onClick={() => onAddNode?.(item.type)}
                    >
                        <div className="toolbox-node__icon" style={{ background: item.color + "22", color: item.color }}>
                            {item.icon}
                        </div>
                        <div>
                            <div className="toolbox-node__label">{item.label}</div>
                            <div className="toolbox-node__desc">{item.desc}</div>
                        </div>
                    </div>
                ))}

                {/* ── Environment Groups ── */}
                <div className="toolbox-section-label" style={{ marginTop: 14 }}>Environments</div>
                {ENV_GROUP_PRESETS.map((preset) => (
                    <div
                        key={preset.id}
                        className="toolbox-node toolbox-node--env"
                        draggable
                        onDragStart={(e) => onEnvDragStart(e, preset)}
                        onClick={() => onAddEnvGroup?.(preset)}
                    >
                        <div className="toolbox-node__icon" style={{ background: preset.color + "22", color: preset.color, fontSize: 16 }}>
                            {preset.icon}
                        </div>
                        <div>
                            <div className="toolbox-node__label">{preset.label}</div>
                            <div className="toolbox-node__desc">{preset.desc}</div>
                        </div>
                    </div>
                ))}

            </div>
        </div>
    );
}
