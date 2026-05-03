import { useAppStore } from "../../store/useAppStore";
import { checkRuntime, initRuntime, saveNyc, loadNyc } from "../../lib/tauri-bridge";
import { save, open } from "@tauri-apps/plugin-dialog";
import { DEMO_NODES, DEMO_EDGES } from "../../lib/demo";
import { useTheme } from "../../context/ThemeContext";


export default function NavBar() {
    const {
        appMode, setAppMode,
        runtimeKind, setRuntimeKind,
        projectName, setProjectName,
        projectPath, setProjectPath,
        nodes, edges, environmentYaml,
        setNodes, setEdges, setEnvironmentYaml,
        isDeploying
    } = useAppStore();
    const { theme, toggleTheme, resolvedTheme } = useTheme();

    const runtimeOnline = runtimeKind !== null;

    const handleModeChange = async (mode: typeof appMode) => {
        if (mode === appMode) return;
        if (mode === "EXECUTE") {
            // ensure runtime is ready before switching
            if (!runtimeOnline) {
                const info = await checkRuntime();
                if (info.status === "running" && info.runtime) {
                    await initRuntime(info.runtime);
                    setRuntimeKind(info.runtime);
                } else {
                    return; // will trigger setup wizard elsewhere
                }
            }
        }
        setAppMode(mode);
    };

    const handleSave = async (forceSaveAs = false) => {
        let dest = projectPath;
        if (!dest || forceSaveAs) {
            dest = await save({
                title: "Save Project",
                filters: [{ name: "Nyctus Project", extensions: ["nyc"] }],
                defaultPath: `${projectName}.nyc`
            });
            if (!dest) return; // user cancelled
            setProjectPath(dest);
            // extract filename for project name
            const name = dest.split(/[/\\]/).pop()?.replace(".nyc", "") ?? projectName;
            setProjectName(name);
        }

        const src_files: Record<string, string> = {};

        // Deep clone nodes to dehydrate them without destroying the active canvas
        const dehydratedNodes = JSON.parse(JSON.stringify(nodes));

        // Collect all scripts and external code files from nodes into the /src/ directory of the zip
        for (const node of dehydratedNodes) {
            try {
                // Parse the JSON string carefully
                const configStr = node.data.config as string;
                if (!configStr) continue;

                const parsedConfig = JSON.parse(configStr);
                const p = parsedConfig.params || {};

                let field = "";
                let fileExt = ".txt";

                if (node.data.nodeType === "ScriptNode") {
                    field = "script";
                    const env = p.env || "";
                    if (env.includes("python")) fileExt = ".py";
                    if (env.includes("node")) fileExt = ".js";
                    if (env.includes("r")) fileExt = ".R";
                } else if (node.data.nodeType === "DataNode") {
                    field = "content";
                    const fn = p.filename || "";
                    if (fn.includes(".")) fileExt = "." + fn.split(".").pop();
                } else if (node.data.nodeType === "GuiNode" || node.data.nodeType === "ServiceNode") {
                    field = "entrypoint_script";
                    fileExt = ".py"; // Usually streamlit/http
                }

                if (field && p[field]?.trim() && !p[field].startsWith("file://nyctus_src/")) {
                    const labelStr = (node.data.label as string) || "script";
                    const safeLabel = labelStr.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `nyctus_${node.id}_${safeLabel}${fileExt}`;

                    // 1. Move the real code to the src_files map
                    src_files[filename] = p[field];

                    // 2. Erase the real code from the JSON and insert a Hydration Pointer
                    p[field] = `file://nyctus_src/${filename}`;

                    // 3. Serialize back into the dehydrated node
                    node.data.config = JSON.stringify(parsedConfig);
                }
            } catch (err) {
                // gracefully ignore nodes with invalid json config
            }
        }

        const payload = {
            project_name: projectName,
            graph_json: JSON.stringify({ nodes: dehydratedNodes, edges }),
            environment_yaml: environmentYaml,
            src_files,
        };

        try {
            await saveNyc(payload, dest);
            console.log("Saved to", dest);
        } catch (err) {
            console.error("Save failed:", err);
            alert(`Failed to save: ${err}`);
        }
    };

    const handleLoad = async () => {
        const file = await open({
            title: "Load Project",
            filters: [{ name: "Nyctus Project", extensions: ["nyc"] }],
            multiple: false
        });
        if (!file) return;

        if (nodes.length > 0) {
            const ok = window.confirm("Loading a project will discard your current unsaved canvas. Continue?");
            if (!ok) return;
        }

        try {
            const loaded = await loadNyc(file as string);

            // Extract filename from the path to display in NavBar
            const pathStr = file as string;
            const name = pathStr.split(/[/\\]/).pop()?.replace(".nyc", "") ?? loaded.manifest.name;

            setProjectName(name);
            setProjectPath(pathStr);
            setEnvironmentYaml(loaded.environment_yaml);

            // Parse Graph JSON cautiously
            try {
                const graph = JSON.parse(loaded.graph_json);
                // Deep clone to force React/Zustand to detect a new memory reference
                const newNodes = JSON.parse(JSON.stringify(graph.nodes || []));
                const newEdges = JSON.parse(JSON.stringify(graph.edges || []));

                setNodes(newNodes);
                setEdges(newEdges);

                console.log("Loaded nodes:", newNodes.length);
            } catch (e) {
                console.error("Failed to parse graph JSON:", e);
                alert("Warning: Could not parse project graph data.");
            }
        } catch (err) {
            console.error("Load failed:", err);
            alert(`Failed to load project: ${err}`);
        }
    };

    const handleLoadDemo = () => {
        if (nodes.length > 0) {
            const ok = window.confirm("Loading a new environment will discard your current unsaved canvas. Continue?");
            if (!ok) return;
        }

        setNodes(DEMO_NODES);
        setEdges(DEMO_EDGES);
        setProjectName("fastq-qc-demo");
        setProjectPath(null);
    };

    return (
        <nav className="navbar">
            <div className="navbar__logo">
                <div className="navbar__logo-icon">N</div>
                <span>Nyctus-core</span>
            </div>

            <div className="navbar__divider" />

            <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn--sm btn--ghost" onClick={() => handleSave(false)}>Save</button>
                <button className="btn btn--sm btn--ghost" onClick={() => handleSave(true)}>Save As...</button>
                <button className="btn btn--sm btn--ghost" onClick={handleLoad}>Load</button>
                <button className="btn btn--sm btn--ghost" onClick={handleLoadDemo} style={{ borderColor: "var(--brand)", color: "var(--brand)" }}>⬡ Demo</button>
            </div>

            <div className="navbar__divider" />

            <span className="navbar__project-name">{projectName}</span>

            <div className="navbar__spacer" />

            {/* Theme toggle */}
            <button
                className="btn btn--sm btn--ghost"
                onClick={toggleTheme}
                title={`Current theme: ${theme}`}
                style={{ marginRight: 8 }}
            >
                {resolvedTheme === 'dark' ? '☀️' : '🌙'} {theme}
            </button>

            {/* Runtime badge */}
            <div className={`runtime-badge ${runtimeOnline ? "runtime-badge--online" : "runtime-badge--offline"}`}>
                <span className="runtime-badge__dot" />
                <span>{runtimeOnline ? runtimeKind : "No runtime"}</span>
            </div>

            <div className="mode-toggle">
                <button
                    className={`mode-toggle__btn ${appMode === "BUILD" ? "mode-toggle__btn--active" : ""}`}
                    onClick={() => handleModeChange("BUILD")}
                    disabled={isDeploying}
                >
                    ◈ Build
                </button>
                <button
                    className={`mode-toggle__btn ${appMode === "EXECUTE" ? "mode-toggle__btn--active" : ""}`}
                    onClick={() => handleModeChange("EXECUTE")}
                    disabled={isDeploying}
                >
                    ▶ Execute
                </button>
            </div>
        </nav>
    );
}
