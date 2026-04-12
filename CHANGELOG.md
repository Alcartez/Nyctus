# Changelog

All notable changes to Nyctus will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-12

### Added

- **Visual Pipeline Builder** - Drag-and-drop node-based editor for creating data processing workflows
- **Node Types** - Support for ScriptNode, ServiceNode, DataNode, GuiNode, and GenericNode
- **Environment Groups** - Group nodes with specific runtime environments (Python, R, Node.js, Docker)
- **Property Inspector** - Configure nodes via visual forms (RJSF) or direct JSON editing (Monaco Editor)
- **Auto-parenting** - Nodes dragged into environment groups automatically become children
- **Containerized Execution** - Execute pipelines inside Podman or Docker containers
- **Integrated Terminal** - Real-time container log streaming via xterm.js
- **GUI Preview** - Embedded preview for GUI-based services (Streamlit, Flask, web apps)
- **Project Management** - Save/load pipelines as `.nyc` files (ZIP archives)
- **Project Hydration/Dehydration** - External scripts stored as pointers, embedded when saving
- **Setup Wizard** - Auto-detects Podman/Docker runtime and pulls NyctusOS base image
- **NyctusOS Base Image** - Pre-configured environment with micromamba for package management