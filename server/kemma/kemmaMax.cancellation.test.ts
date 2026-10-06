/**
 * Tests for P1-05 Tool cancellation in kemmaMax.ts (runCode and browse).
 *
 * Covers:
 * - runCode returns immediately with exitCode 130 if signal is already aborted (does not create sandbox).
 * - runCode kills the sandbox (sbx.kill()) when signal aborts during execution.
 * - browse throws ABORTED error immediately if signal is already aborted (does not start browser task).
 * - browse stops browser task (taskRun.stop()) and rejects immediately when signal aborts during execution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env.E2B_API_KEY = "test-e2b-key";
  process.env.BROWSER_USE_API_KEY = "test-browser-key";
});

const sbxMock = vi.hoisted(() => ({
  runCode: vi.fn(),
  kill: vi.fn().mockResolvedValue(undefined),
}));

const sandboxCreateMock = vi.hoisted(() => vi.fn().mockResolvedValue(sbxMock));

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: {
    create: sandboxCreateMock,
  },
}));

const taskRunStopMock = vi.hoisted(() => vi.fn());
const taskRunMock = vi.hoisted(() => {
  const p: any = new Promise(() => {}); // never resolves on its own
  p.stop = taskRunStopMock;
  p.taskId = "task-test-456";
  return p;
});

const clientTasksStopMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const browserRunMock = vi.hoisted(() => vi.fn().mockReturnValue(taskRunMock));

vi.mock("browser-use-sdk", () => ({
  BrowserUse: vi.fn().mockImplementation(() => ({
    run: browserRunMock,
    tasks: {
      stop: clientTasksStopMock,
    },
  })),
}));

import { runCode, browse } from "./kemmaMax";

const savedEnv = new Map<string, string | undefined>();
const ENV_NAMES = ["E2B_API_KEY", "BROWSER_USE_API_KEY"];

beforeEach(() => {
  for (const k of ENV_NAMES) savedEnv.set(k, process.env[k]);
  process.env.E2B_API_KEY = "test-e2b-key";
  process.env.BROWSER_USE_API_KEY = "test-browser-key";

  vi.clearAllMocks();
  sandboxCreateMock.mockResolvedValue(sbxMock);
  sbxMock.kill.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("P1-05: kemmaMax tool cancellation", () => {
  describe("runCode", () => {
    it("returns exitCode 130 immediately when signal is already aborted without creating sandbox", async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await runCode("python", "print('hello')", controller.signal);

      expect(result).toEqual({
        stdout: "",
        stderr: "Execution was aborted",
        exitCode: 130,
        engine: "e2b",
        timedOut: false,
      });
      expect(sandboxCreateMock).not.toHaveBeenCalled();
    });

    it("kills the sandbox on abort while code execution is running", async () => {
      const controller = new AbortController();

      // Make sbx.runCode wait until aborted
      sbxMock.runCode.mockImplementation(async () => {
        return new Promise((resolve) => {
          controller.signal.addEventListener("abort", () => {
            resolve({ logs: { stdout: [], stderr: [] } });
          });
        });
      });

      const execPromise = runCode("python", "import time; time.sleep(10)", controller.signal);

      // Trigger abort while running
      controller.abort();

      const result = await execPromise;

      expect(result).toMatchObject({
        exitCode: 130,
        stderr: "Execution was aborted",
      });
      // sbx.kill() was called to terminate the sandbox immediately
      expect(sbxMock.kill).toHaveBeenCalled();
    });
  });

  describe("browse", () => {
    it("throws ABORTED error immediately when signal is already aborted without starting task", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(browse("https://example.com", { signal: controller.signal })).rejects.toMatchObject({
        code: "ABORTED",
      });
      expect(browserRunMock).not.toHaveBeenCalled();
    });

    it("stops browser task and rejects immediately on abort during browsing", async () => {
      const controller = new AbortController();

      const browsePromise = browse("https://example.com", { signal: controller.signal });

      // Abort while task is in flight
      controller.abort();

      await expect(browsePromise).rejects.toMatchObject({
        code: "ABORTED",
      });
      // taskRun.stop() was called
      expect(taskRunStopMock).toHaveBeenCalled();
    });
  });
});
