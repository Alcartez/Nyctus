import { useState, useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkRuntime, initRuntime, pullBaseImage, onPullProgress, checkGpuAvailable, RuntimeStatus, RuntimeKind } from "../../lib/tauri-bridge";
import { useAppStore } from "../../store/useAppStore";

const BASE_IMAGE_LABEL = "docker.io/alcartez/nyctus-os:latest";

type WizardStep = "checking" | "stopped" | "not_installed" | "installing" | "pulling" | "done";

export default function SetupWizard() {
    const { setRuntimeKind, setGpuStatus } = useAppStore();
    const [step, setStep] = useState<WizardStep>("checking");
    const [stoppedRuntime, setStoppedRuntime] = useState<RuntimeKind | null>(null);
    const [statusMsg, setStatusMsg] = useState("");
    const [pullLog, setPullLog] = useState<string[]>([]);

    // ── Initial probe ───────────────────────────────────────────────────────────
    useEffect(() => {
        probe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const probe = async () => {
        setStep("checking");
        try {
            const info = await checkRuntime();
            if (info.status === RuntimeStatus.Running && info.runtime) {
                await initRuntime(info.runtime);
                setRuntimeKind(info.runtime);
                
                const gpuStatus = await checkGpuAvailable(info.runtime);
                setGpuStatus(gpuStatus);
                
                // Pull base image if not already present (pull is a no-op if cached)
                await doPull();
            } else if (info.status === RuntimeStatus.StoppedButInstalled && info.runtime) {
                setStoppedRuntime(info.runtime);
                setStep("stopped");
            } else {
                setStep("not_installed");
            }
        } catch {
            setStep("not_installed");
        }
    };

    // ── Pull nyctus-base from GHCR ─────────────────────────────────────────────
    const doPull = async () => {
        setStep("pulling");
        setPullLog([`Pulling ${BASE_IMAGE_LABEL}…`]);
        const unlisten = await onPullProgress((msg) => {
            setPullLog((prev) => [...prev.slice(-60), msg]);
        });
        try {
            await pullBaseImage();
            setStep("done");
        } catch (err) {
            setPullLog((prev) => [...prev, `✗ Pull failed: ${err}`]);
            setStatusMsg(`Could not pull ${BASE_IMAGE_LABEL}. Check your network or push the image first.`);
        } finally {
            unlisten();
        }
    };

    // ── Wait for stopped runtime ────────────────────────────────────────────────
    const handleStartRuntime = async () => {
        setStatusMsg(`Waiting for ${stoppedRuntime} to start…`);
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const info = await checkRuntime();
            if (info.status === RuntimeStatus.Running && info.runtime) {
                await initRuntime(info.runtime);
                setRuntimeKind(info.runtime);
                
                const gpuStatus = await checkGpuAvailable(info.runtime);
                setGpuStatus(gpuStatus);
                
                await doPull();
                return;
            }
            setStatusMsg(`Waiting… (${i + 1}/30s)`);
        }
        setStatusMsg("Timed out. Start the runtime manually then click Retry.");
    };

    const handleInstallPodman = async () => {
        setStep("installing");
        await openUrl("https://podman-desktop.io/downloads");
        setStatusMsg("Follow the installer, then click Retry.");
        setStep("not_installed");
    };

    if (step === "done") return null;

    return (
        <div className="setup-wizard">
            <div className="setup-wizard__card">

                {/* ── Checking ── */}
                {(step === "checking") && (
                    <>
                        <div className="setup-wizard__icon">🔍</div>
                        <h2 className="setup-wizard__title">Checking container runtime…</h2>
                        <p className="setup-wizard__desc">Probing Podman and Docker sockets.</p>
                        <div className="progress-wrap"><div className="progress-bar"><div className="progress-bar__fill" style={{ width: "100%" }} /></div></div>
                    </>
                )}

                {/* ── Stopped ── */}
                {step === "stopped" && (
                    <>
                        <div className="setup-wizard__icon">🟡</div>
                        <h2 className="setup-wizard__title">{stoppedRuntime} is installed but not running</h2>
                        <p className="setup-wizard__desc">
                            Start {stoppedRuntime === "Podman" ? "Podman Desktop" : "Docker Desktop"}, then click below.
                        </p>
                        <p className="text-muted text-sm" style={{ marginBottom: 20 }}>{statusMsg}</p>
                        <div className="setup-wizard__actions">
                            <button className="btn btn--primary" onClick={handleStartRuntime}>↺ Waiting for {stoppedRuntime}…</button>
                            <button className="btn btn--ghost btn--sm" onClick={probe}>Retry manually</button>
                        </div>
                    </>
                )}

                {/* ── Not installed ── */}
                {step === "not_installed" && (
                    <>
                        <div className="setup-wizard__icon">📦</div>
                        <h2 className="setup-wizard__title">No container runtime found</h2>
                        <p className="setup-wizard__desc">
                            Nyctus-core needs <strong>Podman</strong> (recommended) or Docker.
                        </p>
                        <div className="setup-wizard__actions">
                            <button className="btn btn--primary" onClick={handleInstallPodman}>⬇ Install Podman Desktop</button>
                            <button className="btn btn--ghost btn--sm" onClick={() => openUrl("https://docs.docker.com/desktop/install/windows-install/")}>Use Docker Desktop</button>
                            <button className="btn btn--ghost btn--sm" onClick={probe}>↺ Retry</button>
                        </div>
                        {statusMsg && <p className="text-muted text-sm" style={{ marginTop: 12 }}>{statusMsg}</p>}
                    </>
                )}

                {/* ── Installing ── */}
                {step === "installing" && (
                    <>
                        <div className="setup-wizard__icon">⏳</div>
                        <h2 className="setup-wizard__title">Opening installer…</h2>
                        <div className="progress-wrap"><div className="progress-bar"><div className="progress-bar__fill" style={{ width: "60%" }} /></div></div>
                        <div style={{ marginTop: 16 }}><button className="btn btn--ghost btn--sm" onClick={probe}>Retry after install</button></div>
                    </>
                )}

                {/* ── Pulling NyctusOS ── */}
                {step === "pulling" && (
                    <>
                        <div className="setup-wizard__icon">⬇</div>
                        <h2 className="setup-wizard__title">Pulling {BASE_IMAGE_LABEL}…</h2>
                        <p className="setup-wizard__desc">Downloading the NyctusOS base image from GHCR. First run only.</p>
                        <div className="bootstrap-log">
                            {pullLog.map((line, i) => (
                                <div key={i} className={`bootstrap-log__line ${line.startsWith("✗") ? "bootstrap-log__line--error" : ""}`}>
                                    {line}
                                </div>
                            ))}
                        </div>
                        {statusMsg && <p className="text-muted text-sm" style={{ marginTop: 12 }}>{statusMsg}</p>}
                    </>
                )}

            </div>
        </div>
    );
}
