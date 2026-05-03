import type { RuntimeKind, GpuStatus } from "../types";

export interface RuntimeSlice {
    runtimeKind: RuntimeKind | null;
    gpuStatus: GpuStatus;
    activeContainerId: string | null;
    setRuntimeKind: (kind: RuntimeKind | null) => void;
    setGpuStatus: (s: GpuStatus) => void;
    setActiveContainerId: (id: string | null) => void;
}

export const createRuntimeSlice = (set: any) => ({
    runtimeKind: null as RuntimeKind | null,
    gpuStatus: "Unavailable" as GpuStatus,
    activeContainerId: null as string | null,
    setRuntimeKind: (kind: RuntimeKind | null) => set({ runtimeKind: kind }),
    setGpuStatus: (gpuStatus: GpuStatus) => set({ gpuStatus }),
    setActiveContainerId: (id: string | null) => set({ activeContainerId: id }),
});
