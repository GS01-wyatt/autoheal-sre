
import type { RecoveryWorker } from "./engine";
import type { AllowedTarget } from "./allowlist";

export const demoRecoveryWorker: RecoveryWorker = {
  async restart(target: AllowedTarget) {
    if (target !== "demo-app") {
      return {
        ok: false,
        detail: "Target is not allowlisted",
      };
    }

    // Safe simulation only; no shell commands or real process restart.
    return {
      ok: true,
      detail: "Demo recovery simulated successfully",
    };
  },
};
