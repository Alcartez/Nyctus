import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useAppStore } from "../../store/useAppStore";
import {
    deployEnvironment,
    killEnvironment,
    onContainerLog,
    onContainerKilled,
} from "../../lib/tauri-bridge";
import type { DeployConfig } from "../../types";

const XTERM_THEME = {
    background: "#0a0b10", foreground: "#e8eaf0", cursor: "#6366f1",
    cursorAccent: "#0a0b10",
    black: "#1a1e2a", brightBlack: "#4a5270",
    red: "#ef4444", brightRed: "#f87171",
    green: "#10b981", brightGreen: "#34d399",
    yellow: "#f59e0b", brightYellow: "#fbbf24",
    blue: "#6366f1", brightBlue: "#818cf8",
    magenta: "#a78bfa", brightMagenta: "#c4b5fd",
    cyan: "#22d3ee", brightCyan: "#67e8f9",
    white: "#e8eaf0", brightWhite: "#f8fafc",
};

type RunState = "idle" | "running" | "done";

export default function ExecuteModeLayout() {
    const {
        nodes, edges, deployConfig,
        setActiveContainerId, setIsDeploying, isDeploying,
    } = useAppStore();

    const termRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);

    const [runState, setRunState] = useState<RunState>("idle");
    const [guiPort, setGuiPort] = useState<number | null>(null);
    const [guiReady, setGuiReady] = useState(false);

    // Pipeline nodes available to select
    const scriptNodes = nodes.filter((n) => n.data?.nodeType === "ScriptNode");
    const [selectedScript, setSelectedScript] = useState<string>(
        scriptNodes[0]?.id ?? ""
    );

    // ── Helper: b64-encode a string safely ──────────────────────────────────────
    const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

    // ── Helper: collect DataNode write steps for a given set of upstream node IDs
    const collectDataSteps = (upstreamIds: string[]): string[] => {
        const steps: string[] = [];
        for (const srcId of upstreamIds) {
            const srcNode = nodes.find((n) => n.id === srcId);
            if (srcNode?.data?.nodeType !== "DataNode") continue;
            try {
                const dnCfg = JSON.parse((srcNode.data?.config as string) ?? "{}");
                const content: string | undefined = dnCfg.params?.content;
                const mountPath: string | undefined = dnCfg.params?.mount_path;
                if (content && mountPath) {
                    const dir = mountPath.split("/").slice(0, -1).join("/");
                    steps.push(`mkdir -p ${dir} && echo '${b64(content)}' | base64 -d > ${mountPath}`);
                }
            } catch {/* ignore */ }
        }
        return steps;
    };

    // Active environment: derive from selected node config + global deploy config
    const buildRunConfig = (): DeployConfig => {
        const guiNode = nodes.find((n) => n.data?.nodeType === "GuiNode");
        // Read port from GuiNode config first, then deployConfig fallback, then 8080
        const guiNodeCfg = guiNode ? JSON.parse((guiNode.data?.config as string) ?? "{}") : null;
        const port = guiNode
            ? (guiNodeCfg?.params?.port ?? deployConfig.port_bindings[0]?.host_port ?? 8080)
            : undefined;

        // ── Resolve env deps for all parent groups of script nodes ──────────
        const scriptNodes = nodes.filter((n) => n.data?.nodeType === "ScriptNode");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parentIds = [...new Set(scriptNodes.map((n: any) => n.parentId).filter(Boolean))];
        const envGroupsToSetup = parentIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);

        const envSetupSteps: string[] = [];

        if (envGroupsToSetup.length === 0 && scriptNodes.length > 0) {
            // Fallback: create a default env if scripts are floating outside any env group
            envSetupSteps.push(`micromamba env remove -n nyctus-demo -y 2>&1 || true`);
            envSetupSteps.push(`micromamba create -n nyctus-demo python=3.11 pip -y -c conda-forge`);
        }

        for (const group of envGroupsToSetup) {
            const parentCfg = JSON.parse((group!.data?.config as string) ?? "{}");
            const params = parentCfg.params ?? parentCfg; // fallback to root for legacy demos without RJSF
            const envType = params.envType || "micromamba";
            const envName = params.envName || "nyctus-demo";
            
            if (envType === "bun") {
                // Install Bun directly in container
                envSetupSteps.push(`curl -fsSL https://bun.sh/install | bash`);
                envSetupSteps.push(`export PATH="$HOME/.bun/bin:$PATH"`);
                const npmDeps: string[] = params.dependencies ?? [];
                if (npmDeps.length > 0) {
                    envSetupSteps.push(`mkdir -p /tmp/bun_${envName} && cd /tmp/bun_${envName} && bun add ${npmDeps.join(" ")}`);
                }
            } else {
                // Conda / Micromamba
                const deps: string[] = params.dependencies ?? [];
                const depsStr = deps.length > 0 ? deps.join(" ") : "python=3.11";
                const pipDeps: string[] = params.pip_deps ?? [];

                const depsWithPip = [...new Set([...depsStr.split(" "), "pip"])].join(" ");

                envSetupSteps.push(`micromamba env remove -n ${envName} -y 2>&1 || true`);
                envSetupSteps.push(`micromamba create -n ${envName} ${depsWithPip} -y -c conda-forge`);
                if (pipDeps.length > 0) {
                    envSetupSteps.push(`micromamba run -n ${envName} python -m pip install ${pipDeps.join(" ")}`);
                }
            }
        }

        let cmd: string[] | undefined;
        try {
            const steps: string[] = [`mkdir -p /out /data`];

            if (selectedScript) {
                // ── Single ScriptNode mode ────────────────────────────────────
                const node = nodes.find((n) => n.id === selectedScript)!;
                const cfg = JSON.parse((node.data?.config as string) ?? "{}");
                if (!cfg.params?.script) throw new Error("no script");

                // Determine environment for this specific node
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const pId = (node as any)?.parentId as string | undefined;
                const pGroup = pId ? nodes.find((n) => n.id === pId) : undefined;
                const pCfg = pGroup ? JSON.parse((pGroup.data?.config as string) ?? "{}") : {};
                const pParams = pCfg.params ?? pCfg;
                const scriptEnvName = pParams.envName || "nyctus-demo";
                const envType = pParams.envType || "micromamba";
                const lang = cfg.params.language || "python";

                const upstreamIds = edges
                    .filter((e: { target: string }) => e.target === node.id)
                    .map((e: { source: string }) => e.source);
                steps.push(...collectDataSteps(upstreamIds));
                
                let ext = "py";
                if (lang === "r") ext = "R";
                if (lang === "javascript") ext = "js";
                if (lang === "typescript") ext = "ts";
                if (lang === "bash") ext = "sh";

                const scriptPath = `/tmp/nyctus_script.${ext}`;
                steps.push(`echo '${b64(cfg.params.script)}' | base64 -d > ${scriptPath}`);
                
                // In single script mode, we run the setup for its parent group
                steps.push(...envSetupSteps); 

                if (envType === "bun") {
                    steps.push(`export PATH="$HOME/.bun/bin:$PATH"`);
                    steps.push(`cd /tmp/bun_${scriptEnvName} && bun run ${scriptPath}`);
                } else if (lang === "r") {
                    steps.push(`micromamba run -n ${scriptEnvName} Rscript ${scriptPath}`);
                } else if (lang === "bash") {
                    steps.push(`bash ${scriptPath}`);
                } else {
                    steps.push(`micromamba run -n ${scriptEnvName} python3 -u ${scriptPath}`);
                }

            } else {
                // ── Full pipeline mode: all DataNodes → all ScriptNodes → GuiNode
                // Write all DataNode content
                const allDataIds = nodes
                    .filter((n) => n.data?.nodeType === "DataNode")
                    .map((n) => n.id);
                steps.push(...collectDataSteps(allDataIds));

                // Create the shared env + pip deps once
                steps.push(...envSetupSteps);

                // Run all ScriptNodes in graph order
                scriptNodes.forEach((sn, i) => {
                    const cfg = JSON.parse((sn.data?.config as string) ?? "{}");
                    if (!cfg.params?.script) return;

                    // Determine environment for this specific script
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const pId = (sn as any)?.parentId as string | undefined;
                    const pGroup = pId ? nodes.find((n) => n.id === pId) : undefined;
                    const pCfg = pGroup ? JSON.parse((pGroup.data?.config as string) ?? "{}") : {};
                    const pParams = pCfg.params ?? pCfg;
                    const scriptEnvName = pParams.envName || "nyctus-demo";
                    const envType = pParams.envType || "micromamba";
                    const lang = cfg.params.language || "python";

                    let ext = "py";
                    if (lang === "r") ext = "R";
                    if (lang === "javascript") ext = "js";
                    if (lang === "typescript") ext = "ts";
                    if (lang === "bash") ext = "sh";

                    const scriptPath = `/tmp/nyctus_script_${i}.${ext}`;
                    steps.push(`echo '${b64(cfg.params.script)}' | base64 -d > ${scriptPath}`);
                    
                    if (envType === "bun") {
                        steps.push(`export PATH="$HOME/.bun/bin:$PATH"`);
                        steps.push(`cd /tmp/bun_${scriptEnvName} && bun run ${scriptPath}`);
                    } else if (lang === "r") {
                        steps.push(`micromamba run -n ${scriptEnvName} Rscript ${scriptPath}`);
                    } else if (lang === "bash") {
                        steps.push(`bash ${scriptPath}`);
                    } else {
                        steps.push(`micromamba run -n ${scriptEnvName} python3 -u ${scriptPath}`);
                    }
                });

                // Start GuiNode — framework-aware launcher (keeps container alive)
                if (guiNode) {
                    const guiCfg = JSON.parse((guiNode.data?.config as string) ?? "{}");
                    const framework: string = guiCfg.params?.framework ?? "http.server";
                    const guiPort = port ?? 8080;

                    // Determine environment for the GuiNode
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const pId = (guiNode as any)?.parentId as string | undefined;
                    const pGroup = pId ? nodes.find((n) => n.id === pId) : undefined;
                    const pCfg = pGroup ? JSON.parse((pGroup.data?.config as string) ?? "{}") : {};
                    const pParams = pCfg.params ?? pCfg;
                    const guiEnvName = pParams.envName || "nyctus-demo";

                    if (framework === "http.server") {
                        const serveDir: string = guiCfg.params?.serve_dir ?? "/out";
                        steps.push(
                            `cd ${serveDir} && micromamba run -n ${guiEnvName} ` +
                            `python3 -m http.server ${guiPort}`
                        );
                    } else if (framework === "streamlit") {
                        const guiScript: string = guiCfg.params?.entrypoint_script ?? "";
                        if (guiScript) {
                            steps.push(`echo '${b64(guiScript)}' | base64 -d > /tmp/dashboard.py`);
                            steps.push(
                                `micromamba run -n ${guiEnvName} streamlit run /tmp/dashboard.py ` +
                                `--server.port ${guiPort} --server.headless true`
                            );
                        }
                    } else {
                        // Generic: entrypoint_script run with python3
                        const guiScript: string = guiCfg.params?.entrypoint_script ?? "";
                        if (guiScript) {
                            steps.push(`echo '${b64(guiScript)}' | base64 -d > /tmp/gui.py`);
                            steps.push(`micromamba run -n ${guiEnvName} python3 /tmp/gui.py`);
                        }
                    }
                }
            }

            cmd = ["/bin/bash", "-c", steps.join(" && ")];
        } catch {/* ignore */ }

        return {
            ...deployConfig,
            port_bindings: port ? [{ host_port: port, container_port: port }] : [],
            cmd
        };
    };

    // ── Init xterm ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!termRef.current) return;
        const term = new Terminal({
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            theme: XTERM_THEME,
            cursorBlink: true,
            convertEol: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(termRef.current);
        fit.fit();
        xtermRef.current = term;
        fitRef.current = fit;

        term.writeln("\x1b[1;34m┌──────────────────────────────┐");
        term.writeln("│  Nyctus-core  ·  terminal    │");
        term.writeln("└──────────────────────────────┘\x1b[0m\n");
        term.writeln("\x1b[2mSelect a pipeline above and click Run.\x1b[0m");

        const ro = new ResizeObserver(() => fitRef.current?.fit());
        ro.observe(termRef.current!);
        return () => { ro.disconnect(); term.dispose(); };
    }, []);

    // ── Listen to container events ─────────────────────────────────────────────
    useEffect(() => {
        let unlistenLog: (() => void) | undefined;
        let unlistenKill: (() => void) | undefined;

        onContainerLog((payload) => {
            const term = xtermRef.current;
            if (!term) return;
            const color = payload.stream_type === "stderr" ? "\x1b[31m" : "";
            const reset = payload.stream_type === "stderr" ? "\x1b[0m" : "";
            term.writeln(`${color}${payload.line.trimEnd()}${reset}`);
        }).then((fn) => { unlistenLog = fn; });

        onContainerKilled(() => {
            xtermRef.current?.writeln("\x1b[33m\n[container stopped]\x1b[0m");
            setActiveContainerId(null);
            setIsDeploying(false);
            setGuiReady(false);
            setRunState("done");
        }).then((fn) => { unlistenKill = fn; });

        return () => { unlistenLog?.(); unlistenKill?.(); };
    }, [setActiveContainerId, setIsDeploying]);

    // ── Port polling: show iframe only once server responds ───────────────────
    const pollPortRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startPolling = (port: number) => {
        if (pollPortRef.current) clearInterval(pollPortRef.current);
        xtermRef.current?.writeln(`\x1b[2m[waiting for GUI server on :${port}…]\x1b[0m`);
        pollPortRef.current = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:${port}`, { mode: "no-cors", cache: "no-store" });
                // no-cors always gives opaque status — any response (even opaque) means the port is up
                if (res.type === "opaque" || res.ok) {
                    clearInterval(pollPortRef.current!);
                    pollPortRef.current = null;
                    xtermRef.current?.writeln(`\x1b[32m✓ GUI server ready on :${port}\x1b[0m`);
                    setGuiReady(true);
                }
            } catch {
                // port not ready yet — keep polling silently
            }
        }, 2000);
    };

    // ── Run ────────────────────────────────────────────────────────────────────
    const handleRun = async () => {
        if (scriptNodes.length === 0) return; // nothing on canvas
        setRunState("running");
        setIsDeploying(true);
        const term = xtermRef.current;
        term?.writeln("\n\x1b[36m▶ Deploying environment…\x1b[0m");

        try {
            const config = buildRunConfig();
            const id = await deployEnvironment(config);
            setActiveContainerId(id);
            term?.writeln(`\x1b[32m✓ Container started: ${id.slice(0, 12)}\x1b[0m`);
            setIsDeploying(false);

            const guiNode = nodes.find((n) => n.data?.nodeType === "GuiNode");
            if (guiNode) {
                const port = config.port_bindings[0]?.host_port ?? 8080;
                setGuiPort(port);
                startPolling(port);
            }
        } catch (err) {
            term?.writeln(`\x1b[31m✗ Deploy failed: ${err}\x1b[0m`);
            setIsDeploying(false);
            setRunState("idle");
        }
    };

    const handleKill = async () => {
        if (pollPortRef.current) { clearInterval(pollPortRef.current); pollPortRef.current = null; }
        xtermRef.current?.writeln("\x1b[33m■ Stopping container…\x1b[0m");
        try {
            await killEnvironment();
            // Intentionally not auto-switching back to BUILD mode so user can see final logs
        } catch (err) {
            xtermRef.current?.writeln(`\x1b[31m✗ Kill failed: ${err}\x1b[0m`);
        }
    };

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
                {/* Pipeline selector */}
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
                    {scriptNodes.map((n) => (
                        <option key={n.id} value={n.id}>{n.data?.label as string}</option>
                    ))}
                    <option value="">Full pipeline (all nodes)</option>
                </select>

                <div style={{ flex: 1 }} />

                {runState !== "running" ? (
                    <button
                        className="btn btn--primary btn--sm"
                        onClick={handleRun}
                        disabled={isDeploying}
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
                    ref={termRef}
                    className="terminal-wrap"
                    style={{ flex: 1, minHeight: 0 }}
                />
            </div>

        </div>
    );
}
