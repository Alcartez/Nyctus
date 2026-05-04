import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { saveNyc } from '../lib/tauri-bridge';

export function useAutoSave(intervalMs = 30000) {
  const saveTimeoutRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const { projectName, nodes, edges, environmentYaml, projectPath } = useAppStore();

  useEffect(() => {
    saveTimeoutRef.current = setInterval(async () => {
      if (!projectPath) return;

      const payload = {
        project_name: projectName,
        graph_json: JSON.stringify({ nodes, edges }),
        environment_yaml: environmentYaml,
        src_files: {},
      };

      try {
        await saveNyc(payload, projectPath);
        console.log('Auto-saved project');
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, intervalMs);

    return () => clearInterval(saveTimeoutRef.current);
  }, [projectName, nodes, edges, environmentYaml, projectPath, intervalMs]);
}
