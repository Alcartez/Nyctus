import type { AppMode } from "../types";

export interface UiSlice {
    appMode: AppMode;
    isDeploying: boolean;
    hasGuiNode: boolean;
    setAppMode: (mode: AppMode) => void;
    setIsDeploying: (v: boolean) => void;
    setHasGuiNode: (v: boolean) => void;
}

export const createUiSlice = (set: any) => ({
    appMode: "BUILD" as AppMode,
    isDeploying: false,
    hasGuiNode: false,
    setAppMode: (appMode: AppMode) => set({ appMode }),
    setIsDeploying: (isDeploying: boolean) => set({ isDeploying }),
    setHasGuiNode: (hasGuiNode: boolean) => set({ hasGuiNode }),
});
