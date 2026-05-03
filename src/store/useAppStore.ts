import { create } from "zustand";

import type { GraphSlice } from "./slices/graphSlice";
import { createGraphSlice } from "./slices/graphSlice";
import type { RuntimeSlice } from "./slices/runtimeSlice";
import { createRuntimeSlice } from "./slices/runtimeSlice";
import type { ProjectSlice } from "./slices/projectSlice";
import { createProjectSlice } from "./slices/projectSlice";
import type { UiSlice } from "./slices/uiSlice";
import { createUiSlice } from "./slices/uiSlice";
import type { DeploySlice } from "./slices/deploySlice";
import { createDeploySlice } from "./slices/deploySlice";

type AppStore = GraphSlice & RuntimeSlice & ProjectSlice & UiSlice & DeploySlice;

export const useAppStore = create<AppStore>()((set) => ({
    ...createGraphSlice(set),
    ...createRuntimeSlice(set),
    ...createProjectSlice(set),
    ...createUiSlice(set),
    ...createDeploySlice(set),
}));

export type { AppStore };
