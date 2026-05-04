import type { DeployConfig } from "../../types";

export interface DeploySlice {
    deployConfig: DeployConfig;
    setDeployConfig: (cfg: Partial<DeployConfig>) => void;
}

export const createDeploySlice = (set: any) => ({
    deployConfig: {
        volumes: [],
        port_bindings: [{ host_port: 8080, container_port: 8080 }],
        use_gpu: false,
    } as DeployConfig,
    setDeployConfig: (cfg: Partial<DeployConfig>) =>
        set((state: any) => ({
            deployConfig: { ...state.deployConfig, ...cfg },
        })),
});
