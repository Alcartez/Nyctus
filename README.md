# Nyctus

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-yellow)]

Nyctus is a visual container sandbox for building and executing data processing pipelines. Create node-based workflows with an intuitive drag-and-drop interface, then run them securely inside containers on your local machine.

## Key Features

- **Visual Pipeline Builder** — Design data processing workflows using an intuitive node-based editor. Drag nodes from the toolbox, connect them to define data flow, and configure properties through a visual form interface or direct JSON editing.

- **Containerized Execution** — Execute pipelines inside isolated containers using Podman or Docker. Each pipeline runs in an isolated environment with configurable resources, environment variables, and port mappings.

- **Integrated Terminal & GUI** — Monitor pipeline execution in real-time through an integrated terminal. GUI-based services (like Streamlit or web apps) render directly within the application via embedded preview panels.

- **Project Management** — Save and load pipelines as `.nyc` project files. Projects bundle the graph definition, environment configuration, and source code into a single portable archive.

- **Environment Groups** — Group nodes with specific runtime environments (Python, R, Node.js, or custom Docker images). Environment groups automatically configure the runtime for all contained nodes.

## Architecture Overview

Nyctus follows a desktop application architecture with a Rust backend and React frontend:

- **Frontend** — React 19 with ReactFlow for the node graph editor, Monaco Editor for JSON configuration, and xterm.js for terminal output. State is managed via Zustand.

- **Backend** — Tauri 2 handles desktop integration (window management, file dialogs, shell commands). The Rust backend uses the `bollard` library to interface with Docker/Podman APIs for container lifecycle management.

- **Runtime** — Pipelines execute inside containers based on the NyctusOS base image, which provides a pre-configured environment with micromamba for package management.

## Quick Start

### Prerequisites

- Node.js (with npm)
- Rust toolchain
- Podman or Docker

### Setup & Run

```bash
# Install dependencies
npm install

# Launch in development mode
npm run tauri dev
```

Nyctus will detect your container runtime (Podman or Docker), pull the base image if needed, and display the GUI.

### Build for Release

```bash
# Build frontend and package desktop app
npm run build
npm run tauri build
```

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, ReactFlow, Monaco Editor, xterm.js, Zustand |
| Backend | Tauri 2, Rust, bollard (Docker/Podman API), tokio |
| Runtime | Podman/Docker, micromamba, NyctusOS base image |

## Supported Node Types

- **ScriptNode** — Execute Python, R, Node.js, or shell scripts
- **ServiceNode** — Run long-running services (APIs, servers)
- **DataNode** — Mount data files and directories into the pipeline
- **GuiNode** — Launch GUI applications (Streamlit, Flask, etc.)
- **GenericNode** — Custom nodes for flexible use cases

## Showcase

https://github.com/user-attachments/assets/c694f1ef-0236-4b9b-b218-9f676ad67f3c
Create pipelines easily

## Licensing

Nyctus is distributed under a dual-licensing model:

**1. Open Source License (AGPLv3)**
Free to use, modify, and distribute for academic, personal, and non-profit use under the GNU Affero General Public License v3.0. See the `LICENSE` file for details.

**2. Commercial License**
Commercial use, integration into proprietary products, or running as a hosted service requires a commercial license. Contact us for pricing and terms.
