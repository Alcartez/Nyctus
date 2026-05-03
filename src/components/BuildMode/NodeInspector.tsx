import { useState, useEffect, useCallback } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { useAppStore } from "../../store/useAppStore";
import { openInOsEditor, readOsFile } from "../../lib/tauri-bridge";
import type { NycNodeData } from "../../types";
import { type Node } from "@xyflow/react";

interface NodeInspectorProps {
    getRfNodes: () => Node<NycNodeData>[];
    setRfNodes: React.Dispatch<React.SetStateAction<Node<NycNodeData>[]>>;
}

export default function NodeInspector({ getRfNodes, setRfNodes }: NodeInspectorProps) {
    const [viewMode, setViewMode] = useState<"VISUAL" | "JSON">("VISUAL");
    const [fullEditorState, setFullEditorState] = useState<{
        isOpen: boolean;
        field: "script" | "content" | "entrypoint_script";
        tempHash: string;
        osFilePath?: string;
    }>({ isOpen: false, field: "script", tempHash: "" });

    const monaco = useMonaco();

    const selectedNodeId = useAppStore((state) => state.selectedNodeId);
    const selectedNode = getRfNodes().find((n) => n.id === selectedNodeId);
    const { updateNodeConfig } = useAppStore();

    // ── Monaco Schema Injection ──────────────────────────────────────────────
    useEffect(() => {
        if (monaco && selectedNode?.data?.schema) {
            const schemaUri = `http://nyctus/${selectedNode.id}-schema.json`;

            // @ts-expect-error Monaco's TS definitions for setDiagnosticsOptions don't expose schemas directly in all versions
            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                validate: true,
                schemas: [{
                    uri: schemaUri,
                    fileMatch: ["*"],
                    schema: selectedNode.data.schema
                }]
            });
        }
    }, [monaco, selectedNode]);

    if (!selectedNode) {
        return (
            <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13, textAlign: "center", marginTop: 40 }}>
                Select a node to inspect...
            </div>
        );
    }

    const nodeData = selectedNode.data;
    let parsedConfig: Record<string, unknown> = {};
    try {
        parsedConfig = JSON.parse(nodeData.config) as Record<string, unknown>;
    } catch {
        // invalid JSON string currently in editor — fallback to empty obj for visual renderer
    }

    const handleVisualChange = useCallback((newJsonData: Record<string, unknown>) => {
        const str = JSON.stringify(newJsonData, null, 2);

        let newLabel = nodeData.label;
        if (nodeData.nodeType === "EnvGroupNode") {
            if (newJsonData.label) newLabel = newJsonData.label as string;
        } else {
            const params = newJsonData.params as Record<string, unknown> | undefined;
            if (params?.label) newLabel = params.label as string;
        }

        updateNodeConfig(selectedNode!.id, str);
        setRfNodes((nds) => nds.map((n) => n.id === selectedNode!.id ? { ...n, data: { ...n.data, config: str, label: newLabel } } : n));
    }, [nodeData, selectedNode, updateNodeConfig, setRfNodes]);

    const handleJsonChange = useCallback((value: string | undefined) => {
        if (value !== undefined && selectedNode) {
            updateNodeConfig(selectedNode.id, value);

            let newLabel = nodeData.label;
            try {
                const parsed = JSON.parse(value) as Record<string, unknown>;
                if (nodeData.nodeType === "EnvGroupNode") {
                    if (parsed.label) newLabel = parsed.label as string;
                } else {
                    const params = parsed.params as Record<string, unknown> | undefined;
                    if (params?.label) newLabel = params.label as string;
                }
            } catch { /* ignore */ }

            setRfNodes((nds) => nds.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, config: value, label: newLabel } } : n));
        }
    }, [nodeData, selectedNode, updateNodeConfig, setRfNodes]);

    const handleSaveFullEditor = async () => {
        let finalContent = fullEditorState.tempHash;

        if (fullEditorState.osFilePath) {
            try {
                finalContent = await readOsFile(fullEditorState.osFilePath);
            } catch (err) {
                console.error("Failed to read back OS file:", err);
                alert("Failed to sync changes from external editor.");
                return;
            }
        }

        const newData = { ...parsedConfig } as Record<string, unknown>;
        if (!newData.params) newData.params = {};
        (newData.params as Record<string, unknown>)[fullEditorState.field] = finalContent;
        handleVisualChange(newData);
        setFullEditorState({ ...fullEditorState, isOpen: false, osFilePath: undefined });
    };

    if (fullEditorState.isOpen) {
        return (
            <div className="node-inspector" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, textAlign: "center" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
                    <h2 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 600 }}>Editing in External Editor</h2>
                    <p style={{ margin: "0 0 24px 0", fontSize: 13, color: "var(--text-muted)", maxWidth: 300, lineHeight: 1.5 }}>
                        Your script has been opened in your computer's default application. Return here to sync your changes when you are done saving.
                    </p>

                    <div style={{ display: "flex", gap: 12 }}>
                        <button
                            onClick={() => setFullEditorState({ ...fullEditorState, isOpen: false, osFilePath: undefined })}
                            style={{ padding: "10px 16px", background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveFullEditor}
                            style={{ padding: "10px 16px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}
                        >
                            <span>↻</span> Sync Changes from Desktop
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="node-inspector" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>

            {/* ── Tabs ── */}
            <div style={{ display: "flex", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
                <button
                    onClick={() => setViewMode("VISUAL")}
                    style={{
                        flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px",
                        background: viewMode === "VISUAL" ? "var(--bg-elevated)" : "transparent",
                        color: viewMode === "VISUAL" ? "var(--text-primary)" : "var(--text-muted)",
                        border: "none", borderBottom: viewMode === "VISUAL" ? "2px solid var(--brand)" : "2px solid transparent",
                        cursor: "pointer", transition: "all .2s"
                    }}
                >
                    Visual Inspector
                </button>
                <button
                    onClick={() => setViewMode("JSON")}
                    style={{
                        flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px",
                        background: viewMode === "JSON" ? "var(--bg-elevated)" : "transparent",
                        color: viewMode === "JSON" ? "var(--text-primary)" : "var(--text-muted)",
                        border: "none", borderBottom: viewMode === "JSON" ? "2px solid var(--brand)" : "2px solid transparent",
                        cursor: "pointer", transition: "all .2s"
                    }}
                >
                    Raw JSON
                </button>
            </div>

            {/* ── Content ── */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                {viewMode === "VISUAL" ? (
                    <div style={{ padding: 20 }} className="visual-inspector">
                        <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
                            borderBottom: "1px solid var(--border-subtle)", paddingBottom: 16
                        }}>
                            <div style={{ background: "var(--bg-elevated)", padding: "4px 8px", borderRadius: 6, fontSize: 16 }}>
                                {nodeData.icon || "⬡"}
                            </div>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{nodeData.label}</h3>
                        </div>

                        {["ScriptNode", "DataNode", "ServiceNode", "GuiNode"].includes(nodeData.nodeType) && (
                            <div style={{ marginBottom: 20 }}>
                                <button
                                    onClick={async () => {
                                        const params = (parsedConfig.params || {}) as Record<string, unknown>;
                                        let field: "script" | "content" | "entrypoint_script" = "script";
                                        let fileExt = ".txt";

                                        if (nodeData.nodeType === "ScriptNode") {
                                            field = "script";
                                            const env = (params.env as string) || "";
                                            if (env.includes("python")) fileExt = ".py";
                                            if (env.includes("node")) fileExt = ".js";
                                            if (env.includes("r")) fileExt = ".R";
                                        } else if (nodeData.nodeType === "DataNode") {
                                            field = "content";
                                            const fn = (params.filename as string) || "";
                                            if (fn.includes(".")) fileExt = "." + fn.split(".").pop();
                                        } else if (nodeData.nodeType === "GuiNode" || nodeData.nodeType === "ServiceNode") {
                                            field = "entrypoint_script";
                                            fileExt = ".py";
                                        }

                                        const currentContent = (params[field] as string) || "";
                                        const safeLabel = nodeData.label.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                                        const filename = `nyctus_${selectedNode!.id}_${safeLabel}${fileExt}`;

                                        try {
                                            const osPath = await openInOsEditor(filename, currentContent);
                                            setFullEditorState({
                                                isOpen: true,
                                                field,
                                                tempHash: currentContent,
                                                osFilePath: osPath
                                            });
                                        } catch (err) {
                                            console.error(err);
                                            alert("Failed to launch OS editor. See console.");
                                        }
                                    }}
                                    style={{
                                        width: "100%", padding: "10px", background: "var(--brand)", color: "#fff",
                                        border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 600,
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                                    }}
                                >
                                    <span>↗</span> Open Script Editor
                                </button>
                            </div>
                        )}

                        {nodeData.schema ? (
                            <Form
                                schema={nodeData.schema}
                                formData={
                                    nodeData.nodeType === "EnvGroupNode"
                                        ? parsedConfig
                                        : ((parsedConfig as Record<string, unknown>).params as Record<string, unknown>) || {}
                                }
                                onChange={(e) => {
                                    if (nodeData.nodeType === "EnvGroupNode") {
                                        handleVisualChange(e.formData as Record<string, unknown>);
                                    } else {
                                        handleVisualChange({ ...parsedConfig, params: e.formData });
                                    }
                                }}
                                validator={validator}
                                onSubmit={() => { }}
                            >
                                <button type="submit" style={{ display: "none" }} />
                            </Form>
                        ) : (
                            <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>
                                No visual schema available for this node type.
                            </div>
                        )}
                    </div>
                ) : (
                    <Editor
                        height="100%"
                        theme="vs-dark"
                        language="json"
                        value={nodeData.config}
                        onChange={handleJsonChange}
                        options={{
                            minimap: { enabled: false },
                            formatOnPaste: true,
                            tabSize: 2,
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', monospace",
                        }}
                    />
                )}
            </div>

        </div>
    );
}
