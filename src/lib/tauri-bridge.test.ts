import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkRuntime,
  checkGpuAvailable,
  initRuntime,
  pullBaseImage,
  deployEnvironment,
  killEnvironment,
  saveNyc,
  loadNyc,
  openInOsEditor,
  onContainerLog,
  onPullProgress,
  onContainerStarted,
  onContainerKilled,
} from "./tauri-bridge";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Mock Tauri modules
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("tauri-bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkRuntime", () => {
    it("returns mock runtime info when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      const result = await checkRuntime();
      expect(result).toEqual({ status: "running", runtime: "Podman" });
    });

    it("calls invoke when in Tauri environment", async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue({ status: "running", runtime: "Docker" });

      await checkRuntime();
      expect(invoke).toHaveBeenCalledWith("check_runtime");
    });
  });

  describe("checkGpuAvailable", () => {
    it("returns Unavailable when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      const result = await checkGpuAvailable("Podman");
      expect(result).toBe("Unavailable");
    });

    it("calls invoke with runtimeKind when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue("Available");

      await checkGpuAvailable("Docker");
      expect(invoke).toHaveBeenCalledWith("check_gpu_available", { runtimeKind: "Docker" });
    });
  });

  describe("initRuntime", () => {
    it("does nothing when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      await initRuntime("Podman");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls invoke when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);

      await initRuntime("Docker");
      expect(invoke).toHaveBeenCalledWith("init_runtime", { runtimeKind: "Docker" });
    });
  });

  describe("pullBaseImage", () => {
    it("does nothing when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      await pullBaseImage();
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls invoke when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);

      await pullBaseImage();
      expect(invoke).toHaveBeenCalledWith("pull_base_image");
    });
  });

  describe("deployEnvironment", () => {
    it("returns mock container id when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      const config = { volumes: [], port_bindings: [], use_gpu: false };
      const result = await deployEnvironment(config as any);
      expect(result).toBe("mock-container-id");
    });

    it("calls invoke with config when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue("container-123");

      const config = {
        image: "debian:latest",
        volumes: [],
        port_bindings: [],
        use_gpu: true,
      };
      await deployEnvironment(config as any);
      expect(invoke).toHaveBeenCalledWith("deploy_environment", { config });
    });
  });

  describe("killEnvironment", () => {
    it("does nothing when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      await killEnvironment();
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls invoke when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);

      await killEnvironment();
      expect(invoke).toHaveBeenCalledWith("kill_environment");
    });
  });

  describe("saveNyc", () => {
    it("does nothing when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      await saveNyc({ project_name: "test" } as any, "/path/to/file.nyc");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls invoke with payload when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);

      const payload = {
        project_name: "test-project",
        graph_json: "{}",
        environment_yaml: "",
        src_files: {},
      };
      await saveNyc(payload as any, "/path/to/file.nyc");
      expect(invoke).toHaveBeenCalledWith("save_nyc", {
        payload,
        destPath: "/path/to/file.nyc",
      });
    });
  });

  describe("loadNyc", () => {
    it("throws when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      await expect(loadNyc("/path/to/file.nyc")).rejects.toThrow("Not in Tauri");
    });

    it("calls invoke when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue({ manifest: {}, graph_json: "", environment_yaml: "" });

      await loadNyc("/path/to/file.nyc");
      expect(invoke).toHaveBeenCalledWith("load_nyc", { srcPath: "/path/to/file.nyc" });
    });
  });

  describe("openInOsEditor", () => {
    it("returns mock path when not in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(false);

      const result = await openInOsEditor("test.py", "print('hello')");
      expect(result).toBe("mock/path/to/file.py");
    });

    it("calls invoke when in Tauri", async () => {
      vi.mocked(isTauri).mockReturnValue(true);
      vi.mocked(invoke).mockResolvedValue("/path/to/file.py");

      await openInOsEditor("test.py", "content");
      expect(invoke).toHaveBeenCalledWith("open_in_os_editor", {
        filename: "test.py",
        content: "content",
      });
    });
  });

  describe("event listeners", () => {
    it("sets up container log listener", () => {
      const callback = vi.fn();
      onContainerLog(callback);
      expect(listen).toHaveBeenCalledWith("container-log", expect.any(Function));
    });

    it("sets up pull progress listener", () => {
      const callback = vi.fn();
      onPullProgress(callback);
      expect(listen).toHaveBeenCalledWith("pull-progress", expect.any(Function));
    });

    it("sets up container started listener", () => {
      const callback = vi.fn();
      onContainerStarted(callback);
      expect(listen).toHaveBeenCalledWith("container-started", expect.any(Function));
    });

    it("sets up container killed listener", () => {
      const callback = vi.fn();
      onContainerKilled(callback);
      expect(listen).toHaveBeenCalledWith("container-killed", expect.any(Function));
    });
  });
});
