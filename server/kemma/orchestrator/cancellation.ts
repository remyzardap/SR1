/**
 * server/kemma/orchestrator/cancellation.ts
 * Unified cancellation and timeout manager for orchestrator runs.
 */

export class CancellationController {
  private controller = new AbortController();
  private timeoutTimer?: NodeJS.Timeout;
  private isCancelled = false;
  private cancelReason?: string;

  constructor(parentSignal?: AbortSignal, timeoutMs?: number) {
    if (parentSignal) {
      if (parentSignal.aborted) {
        this.abort(parentSignal.reason ? String(parentSignal.reason) : "Parent signal aborted");
      } else {
        parentSignal.addEventListener("abort", () => {
          this.abort(parentSignal.reason ? String(parentSignal.reason) : "Parent signal aborted");
        }, { once: true });
      }
    }

    if (timeoutMs && timeoutMs > 0) {
      this.timeoutTimer = setTimeout(() => {
        this.abort(`Execution timed out after ${timeoutMs}ms`);
      }, timeoutMs);
    }
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get aborted(): boolean {
    return this.isCancelled || this.controller.signal.aborted;
  }

  public get reason(): string | undefined {
    return this.cancelReason;
  }

  public abort(reason = "Execution cancelled"): void {
    if (this.isCancelled) return;
    this.isCancelled = true;
    this.cancelReason = reason;
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
    this.controller.abort(new Error(reason));
  }

  public dispose(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }
}
