import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { onContainerLog, onContainerKilled } from "../../lib/tauri-bridge";

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

export function useTerminal() {
    const termRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const onKilledRef = useRef<(() => void) | null>(null);

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
            onKilledRef.current?.();
        }).then((fn) => { unlistenKill = fn; });

        return () => { unlistenLog?.(); unlistenKill?.(); };
    }, []);

    const write = useCallback((message: string) => {
        xtermRef.current?.writeln(message);
    }, []);

    const setOnKilled = useCallback((callback: (() => void) | null) => {
        onKilledRef.current = callback;
    }, []);

    return { termRef, write, setOnKilled };
}
