// Definitive JSON Schemas for Nyctus Built-in Nodes
// These schemas drive both the Visual RJSF Editor and Monaco's Auto-complete.

export const DATA_NODE_SCHEMA = {
    title: "Data Source",
    type: "object",
    required: ["filename", "content", "mount_path"],
    properties: {
        label: { type: "string", title: "Node Label" },
        description: { type: "string", title: "Description", format: "textarea" },
        filename: { type: "string", title: "Filename", default: "data.csv" },
        content: { type: "string", title: "File Content", format: "textarea" },
        mount_path: { type: "string", title: "Mount Path (Inside Container)", default: "/data/file.csv" },
    },
};

export const SCRIPT_NODE_SCHEMA = {
    title: "Script Runner",
    type: "object",
    required: ["runtime", "env", "language", "script"],
    properties: {
        label: { type: "string", title: "Node Label" },
        description: { type: "string", title: "Description", format: "textarea" },
        runtime: { type: "string", title: "Runtime", enum: ["micromamba", "docker"], default: "micromamba" },
        language: { type: "string", title: "Language", enum: ["python", "r", "typescript", "javascript", "bash"], default: "python" },
        env: { type: "string", title: "Environment Name", default: "nyctus-demo" },
        script: { type: "string", title: "Script Code", format: "textarea" },
    },
};

export const GUI_NODE_SCHEMA = {
    title: "Web Service",
    type: "object",
    required: ["framework", "port"],
    properties: {
        label: { type: "string", title: "Node Label" },
        description: { type: "string", title: "Description", format: "textarea" },
        framework: {
            type: "string",
            title: "Framework",
            enum: ["http.server", "streamlit", "generic"],
            default: "http.server"
        },
        serve_dir: { type: "string", title: "Serve Directory (http.server only)", default: "/out" },
        port: { type: "number", title: "Container Port", default: 8080 },
        entrypoint_script: { type: "string", title: "Entrypoint Script (Optional)", format: "textarea" },
    },
};

export const ENV_GROUP_SCHEMA = {
    title: "Environment Definitions",
    type: "object",
    required: ["envType", "dependencies"],
    properties: {
        label: { type: "string", title: "Environment Label" },
        description: { type: "string", title: "Description", format: "textarea" },
        envType: { type: "string", title: "Engine", enum: ["micromamba", "conda", "docker", "bun"], default: "micromamba" },
        envName: { type: "string", title: "Environment Name", default: "nyctus-env" },
        dependencies: {
            type: "array",
            title: "Conda Packages",
            items: { type: "string" },
            default: ["python=3.11"]
        },
        pip_deps: {
            type: "array",
            title: "Pip Packages / Bun (via installer)",
            items: { type: "string" },
            default: []
        },
    },
    dependencies: {
        envType: {
            oneOf: [
                {
                    properties: {
                        envType: { enum: ["docker"] },
                        image: { type: "string", title: "Docker Image", default: "debian:latest" }
                    }
                },
                {
                    properties: {
                        envType: { enum: ["micromamba", "conda"] },
                        dependencies: { type: "array", title: "Conda Packages", items: { type: "string" }, default: ["python=3.11", "r-base"] }
                    }
                },
                {
                    properties: {
                        envType: { enum: ["bun"] },
                        dependencies: { type: "array", title: "NPM Packages", items: { type: "string" }, default: ["express", "zod"] }
                    }
                }
            ]
        }
    }
};

// Map node types to their canonical schema
export const SCHEMA_MAP: Record<string, Record<string, any>> = {
    DataNode: DATA_NODE_SCHEMA,
    ScriptNode: SCRIPT_NODE_SCHEMA,
    GuiNode: GUI_NODE_SCHEMA,
    EnvGroupNode: ENV_GROUP_SCHEMA,
    ServiceNode: { title: "Service", type: "object", properties: {} },
    GenericNode: { title: "Generic Node", type: "object", properties: {} },
};
