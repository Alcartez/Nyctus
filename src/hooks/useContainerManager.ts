import { useAppStore } from "../../store/useAppStore";
import { deployEnvironment, killEnvironment } from "../../lib/tauri-bridge";
import type { DeployConfig } from "../../types";

interface UseContainerManagerReturn {
    deploy: (config: DeployConfig) => Promise<string>;
    kill: () => Promise<void>;
    setActiveContainerId: (id: string | null) => void;
    setIsDeploying: (deploying: boolean) => void;
    isDeploying: boolean;
}

export function useContainerManager(): UseContainerManagerReturn {
    const { setActiveContainerId, setIsDeploying, isDeploying } = useAppStore();

    const deploy = async (config: DeployConfig): Promise<string> => {
        setIsDeploying(true);
        try {
            const id = await deployEnvironment(config);
            return id;
        } catch (err) {
            setIsDeploying(false);
            throw err;
        }
    };

    const kill = async (): Promise<void> => {
        try {
            await killEnvironment();
        } catch (err) {
            throw err;
        }
    };

    return {
        deploy,
        kill,
        setActiveContainerId,
        setIsDeploying,
        isDeploying,
    };
}
