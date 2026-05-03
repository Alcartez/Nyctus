// Copyright (c) 2026 Alakto Choudhury

import { useEffect, useCallback } from "react";
import "./index.css";
import { useAppStore } from "./store/useAppStore";
import { checkRuntime, initRuntime, pullBaseImage, onPullProgress, checkGpuAvailable } from "./lib/tauri-bridge";
import NavBar from "./components/NavBar/NavBar";
import SetupWizard from "./components/SetupWizard/SetupWizard";
import BuildModeLayout from "./components/BuildMode/BuildModeLayout";
import ExecuteModeLayout from "./components/ExecuteMode/ExecuteModeLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./lib/useToast";
import Toast from "./components/Toast";

export default function App() {
  const {
    appMode,
    runtimeKind, setRuntimeKind,
    setGpuStatus,
    nodes,
    setHasGuiNode,
  } = useAppStore();

  // ── Bootstrap: probe runtime on first load ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const info = await checkRuntime();
        if (info.status === "running" && info.runtime) {
          await initRuntime(info.runtime);
          setRuntimeKind(info.runtime);
          
          const gpuStatus = await checkGpuAvailable(info.runtime);
          setGpuStatus(gpuStatus);
          
          // Pull base image if needed (no-op if already cached)
          const unlisten = await onPullProgress(() => { });
          try { await pullBaseImage(); } finally { unlisten(); }
        }
      } catch {
        // setup wizard will handle it
      }
    })();
  }, [setRuntimeKind]);

  // ── Auto-detect GuiNode in current pipeline ─────────────────────────────────
  useEffect(() => {
    const hasGui = nodes.some((n) => n.data?.nodeType === "GuiNode");
    setHasGuiNode(hasGui);
  }, [nodes, setHasGuiNode]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        // Import dynamically to avoid pulling Tauri APIs in non-Tauri builds
        const { saveNyc } = await import("./lib/tauri-bridge");
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { useAppStore: st } = await import("./store/useAppStore");
        const state = st.getState();
        let dest = state.projectPath;
        if (!dest) {
          dest = await save({
            title: "Save Project",
            filters: [{ name: "Nyctus Project", extensions: ["nyc"] }],
            defaultPath: `${state.projectName}.nyc`,
          });
          if (!dest) return;
          state.setProjectPath(dest);
        }
        const payload = {
          project_name: state.projectName,
          graph_json: JSON.stringify({ nodes: state.nodes, edges: state.edges }),
          environment_yaml: state.environmentYaml,
          src_files: {},
        };
        const { showToast } = (await import("./lib/useToast")).useToast();
        await saveNyc(payload, dest).catch((err) => {
          showToast(`Failed to save project: ${err}`, "error");
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const needsSetup = runtimeKind === null;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <Toast />
        <div className="app-shell">
          <NavBar />
          <div className="app-body">
            {needsSetup ? (
              <SetupWizard />
            ) : (
              <>
                <div style={{ display: appMode === "BUILD" ? "flex" : "none", flex: 1, minWidth: 0 }}>
                  <BuildModeLayout />
                </div>
                <div style={{ display: appMode === "EXECUTE" ? "flex" : "none", flex: 1, minWidth: 0, flexDirection: "column" }}>
                  <ExecuteModeLayout />
                </div>
              </>
            )}
          </div>
        </div>
      </ToastProvider>
    </ErrorBoundary>
  );
}
