import { useState, useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useTerminal } from "../../hooks/useTerminal";
import { usePipelineExecutor } from "../../hooks/usePipelineExecutor";
import type { Node } from "@xyflow/react";

export default function ExecuteModeLayout() {
    const { nodes, edges, deployConfig } = useAppStore();
    const scriptNodes = nodes.filter((n) => n.data?.nodeType === "ScriptNode");
    const [selectedScript, setSelectedScript] = useState<string>(
        scriptNodes[0]?.id ?? ""
    );

    const terminal = useTerminal();

    const {
        runState,
        setRunState,
        guiPort,
        guiReady,
        handleRun,
        handleKill,
        handleContainerKilled,
    } = usePipelineExecutor({
        nodes,
        edges,
        deployConfig,
        selectedScript,
        writeToTerminal: terminal.write,
    });

    useEffect(() => {
        terminal.setOnKilled(() => handleContainerKilled());
        return () => terminal.setOnKilled(null);
    }, [terminal, handleContainerKilled]);

    const showGuiWaiting = guiPort !== null && !guiReady && runState === "running";
    const showGui = guiReady && guiPort !== null;

    return (
        <div className="execute-mode" style={{ flex: 1, minWidth: 0 }}>

            {/* ── Top bar: pipeline selector + run / kill ── */}
            <div style={{
                height: 48, background: "var(--bg-surface)",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex", alignItems: "center", padding: "0 14px", gap: 10,
                flexShrink: 0,
            }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase" }}>Pipeline</span>
                <select
                    value={selectedScript}
                    onChange={(e) => setSelectedScript(e.target.value)}
                    disabled={runState === "running"}
                    style={{
                        background: "var(--bg-elevated)", color: "var(--text-primary)",
                        border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)",
                        padding: "4px 10px", fontSize: 12, cursor: "pointer",
                        minWidth: 180,
                    }}
                >
                    {scriptNodes.length === 0 && (
                        <option value="">— no ScriptNodes found —</option>
                    )}
                    {scriptNodes.map((n: Node) => (
                        <option key={n.id} value={n.id}>{n.data?.label as string}</option>
                    ))}
                    <option value="">Full pipeline (all nodes)</option>
                </select>

                <div style={{ flex: 1 }} />

                {runState !== "running" ? (
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handleRun}
                    >
                        ▶ Run
                    </button>
                ) : (
                    <>
                        <span style={{ fontSize: 12, color: "var(--accent-emerald)" }}>● Running</span>
                        <button className="btn btn--danger btn--sm" onClick={handleKill}>
                            ■ Kill
                        </button>
                    </>
                )}

                {runState === "done" && (
                    <button className="btn btn--ghost btn--sm" onClick={() => setRunState("idle")}>
                        ↺ Reset
                    </button>
                )}
            </div>

            {/* ── Canvas area — terminal is ALWAYS mounted to avoid xterm detach ── */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                {/* Top: iframe OR waiting placeholder — only shown when a GUI node is active */}
                {(showGui || showGuiWaiting) && (
                    <div style={{ flex: "0 0 60%", minHeight: 0, borderBottom: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                        {showGui ? (
                            <iframe
                                src={`http://localhost:${guiPort}`}
                                title="Pipeline Output"
                                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                                style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                            />
                        ) : (
                            <div style={{
                                height: "100%", display: "flex", flexDirection: "column",
                                alignItems: "center", justifyContent: "center",
                                background: "var(--bg-base)", gap: 14,
                            }}>
                                <div style={{ fontSize: 32, animation: "spin 1.4s linear infinite" }}>⟳</div>
                                <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>
                                    Waiting for GUI server on :{guiPort}
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                    Installing environment &amp; starting service…
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "monospace" }}>
                                    Polling every 2 s · watch the terminal below
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Terminal — always in DOM so xterm never detaches */}
                <div
                    ref={terminal.termRef}
                    className="terminal-wrap"
                    style={{ flex: 1, minHeight: 0 }}
                />
            </div>

        </div>
    );
}
