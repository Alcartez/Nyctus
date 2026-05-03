export interface ProjectSlice {
    projectName: string;
    projectPath: string | null;
    cacheDir: string | null;
    environmentYaml: string;
    setProjectName: (name: string) => void;
    setProjectPath: (path: string | null) => void;
    setCacheDir: (dir: string | null) => void;
    setEnvironmentYaml: (yaml: string) => void;
}

export const createProjectSlice = (set: any) => ({
    projectName: "untitled",
    projectPath: null as string | null,
    cacheDir: null as string | null,
    environmentYaml: "",
    setProjectName: (projectName: string) => set({ projectName }),
    setProjectPath: (projectPath: string | null) => set({ projectPath }),
    setCacheDir: (cacheDir: string | null) => set({ cacheDir }),
    setEnvironmentYaml: (environmentYaml: string) => set({ environmentYaml }),
});
