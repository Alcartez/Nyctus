import { useState, useRef, useEffect, useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { DeployConfig } from "../types";
import { useContainerManager } from "./useContainerManager";

type RunState = "idle" | "running" | "done";

interface UsePipelineExecutorOptions {
    nodes: Node[];
    edges: Edge[];
    deployConfig: DeployConfig;
    selectedScript: string;
    writeToTerminal: (message: string) => void;
}

export function usePipelineExecutor({
    nodes,
    edges,
    deployConfig,
    selectedScript,
    writeToTerminal,
}: UsePipelineExecutorOptions) {
    const [runState, setRunState] = useState<RunState>("idle");
    const [guiPort, setGuiPort] = useState<number | null>(null);
    const [guiReady, setGuiReady] = useState(false);

    const pollPortRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const { deploy, kill, setActiveContainerId, setIsDeploying } = useContainerManager();

    const startPolling = useCallback((port: number) => {
        if (pollPortRef.current) clearInterval(pollPortRef.current);
        writeToTerminal(`\x1b[2m[waiting for GUI server on :${port}…]\x1b[0m`);
        pollPortRef.current = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:${port}`, { mode: "no-cors", cache: "no-store" });
                if (res.type === "opaque" || res.ok) {
                    clearInterval(pollPortRef.current!);
                    pollPortRef.current = null;
                    writeToTerminal(`\x1b[32m✓ GUI server ready on :${port}\x1b[0m`);
                    setGuiReady(true);
                }
            } catch {
                // port not ready yet — keep polling silently
            }
        }, 2000);
    }, [writeToTerminal]);

    const handleRun = async () => {
        const scriptNodes = nodes.filter((n) => n.data?.nodeType === "ScriptNode");
        if (scriptNodes.length === 0) return;
        setRunState("running");
        writeToTerminal("\n\x1b[36m▶ Deploying environment…\x1b[0m");

        try {
            // Call backend to build pipeline config
            const pipelineConfig = await window.__TAURI__.invoke("build_pipeline_config", {
                nodes: nodes.map((n) => ({
                    id: n.id,
                    type: n.type,
                    data: {
                        label: n.data?.label || "",
                        nodeType: n.data?.nodeType || "",
                        config: n.data?.config || "{}",
                        parentId: (n as any).parentId || null,
                    },
                })),
                edges: edges.map((e) => ({
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    sourceHandle: e.sourceHandle || null,
                    targetHandle: e.targetHandle || null,
                })),
                selectedScript: selectedScript || null,
            });

            // Merge pipeline config with deploy config
            const config: DeployConfig = {
                ...deployConfig,
                cmd: pipelineConfig.cmd,
                volumes: pipelineConfig.volumes || deployConfig.volumes,
                use_gpu: pipelineConfig.use_gpu || deployConfig.use_gpu,
                port_bindings: pipelineConfig.port
                    ? [{ host_port: pipelineConfig.port, container_port: pipelineConfig.port }]
                    : deployConfig.port_bindings,
            };

            const id = await deploy(config);
            setActiveContainerId(id);
            writeToTerminal(`\x1b[32m✓ Container started: ${id.slice(0, 12)}\x1b[0m`);
            setIsDeploying(false);

            if (pipelineConfig.port) {
                setGuiPort(pipelineConfig.port);
                startPolling(pipelineConfig.port);
            }
        } catch (err) {
            writeToTerminal(`\x1b[31m✗ Deploy failed: ${err}\x1b[0m`);
            setIsDeploying(false);
            setRunState("idle");
        }
    };

    const handleKill = async () => {
        if (pollPortRef.current) { clearInterval(pollPortRef.current); pollPortRef.current = null; }
        writeToTerminal("\x1b[33m■ Stopping container…\x1b[0m");
        try {
            await kill();
        } catch (err) {
            writeToTerminal(`\x1b[31m✗ Kill failed: ${err}\x1b[0m`);
        }
    };

    useEffect(() => {
        return () => {
            if (pollPortRef.current) clearInterval(pollPortRef.current);
        };
    }, []);

    const handleContainerKilled = useCallback(() => {
        setActiveContainerId(null);
        setIsDeploying(false);
        setGuiReady(false);
        setRunState("done");
    }, [setActiveContainerId, setIsDeploying]);

    return {
        runState,
        setRunState,
        guiPort,
        setGuiPort,
        guiReady,
        setGuiReady,
        handleRun,
        handleKill,
        startPolling,
        handleContainerKilled,
        pollPortRef,
    };
}
