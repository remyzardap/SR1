import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSandbox,
  executeInSandbox,
  killSessionSandbox,
  logSandboxUsage,
  resolveLanguage,
  MAX_SANDBOXES_PER_USER,
} from "./manager";

// Mock kvCache
const kvStore = new Map<string, any>();
vi.mock("../../core/kvCache", () => ({
  kvGet: vi.fn(async (ns: string, key: string) => {
    return kvStore.get(`${ns}:${key}`) ?? null;
  }),
  kvSet: vi.fn(async (ns: string, key: string, value: any, ttlSec: number) => {
    if (value === null || value === undefined || ttlSec <= 0) {
      kvStore.delete(`${ns}:${key}`);
    } else {
      kvStore.set(`${ns}:${key}`, value);
    }
  }),
}));

// Mock DB
const dbRows: any[] = [];
vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({
    insert: vi.fn(() => ({
      values: vi.fn((v: any) => {
        dbRows.push(v);
        return {
          returning: vi.fn().mockResolvedValue([{ id: 101 }]),
        };
      }),
    })),
    execute: vi.fn(async () => ({
      rows: [
        { filename: "test.csv", storage_key: "users/1/uploads/test.csv" },
      ],
    })),
  })),
}));

// Mock storageAdapter
vi.mock("../../storageAdapter", () => ({
  getStorageAdapter: () => ({
    put: vi.fn(async (key: string, data: any) => ({
      provider: "local",
      key,
      url: `/files/${key}`,
      sizeBytes: data.length,
    })),
    get: vi.fn(async () => Buffer.from("id,name,value\n1,Alpha,10\n2,Beta,20\n3,Gamma,30")),
  }),
}));

// Mock E2B Sandbox
interface MockSandboxInstance {
  sandboxId: string;
  runCode: any;
  setTimeout: any;
  kill: any;
  pause?: any;
  files: any;
  _state: Record<string, any>;
}

function createMockSandbox(id: string): MockSandboxInstance {
  const state: Record<string, any> = {};
  return {
    sandboxId: id,
    _state: state,
    runCode: vi.fn(async (code: string, opts?: any) => {
      // Simulate Python persistent state across executions in the same sandbox
      if (code.includes("x = 42")) {
        state["x"] = 42;
        return { logs: { stdout: [], stderr: [] }, results: [] };
      }
      if (code.includes("y = x * 2")) {
        state["y"] = (state["x"] ?? 0) * 2;
        return { logs: { stdout: [], stderr: [] }, results: [] };
      }
      if (code.includes("print(y)")) {
        const out = String(state["y"] ?? "undefined");
        return { logs: { stdout: [out], stderr: [] }, results: [] };
      }
      if (code.includes("matplotlib") || code.includes("plt.show")) {
        return {
          logs: { stdout: ["Chart generated successfully"], stderr: [] },
          results: [
            {
              png: Buffer.from("fake-png-chart-data").toString("base64"),
              isMainResult: true,
            },
          ],
        };
      }
      return { logs: { stdout: ["ok"], stderr: [] }, results: [] };
    }),
    setTimeout: vi.fn(async () => {}),
    kill: vi.fn(async () => {}),
    pause: vi.fn(async () => true),
    files: {
      list: vi.fn(async () => []),
      read: vi.fn(async () => Buffer.from("content")),
      write: vi.fn(async () => {}),
    },
  };
}

let sandboxCounter = 0;
const activeSandboxes = new Map<string, MockSandboxInstance>();

const sandboxCreateMock = vi.fn(async (_optsOrTpl: any) => {
  sandboxCounter++;
  const id = `sbx-test-${sandboxCounter}`;
  const instance = createMockSandbox(id);
  activeSandboxes.set(id, instance);
  return instance;
});

const sandboxConnectMock = vi.fn(async (id: string, _opts: any) => {
  const instance = activeSandboxes.get(id);
  if (!instance) {
    throw new Error(`Sandbox not found: ${id}`);
  }
  return instance;
});

const sandboxKillStaticMock = vi.fn(async (id: string) => {
  const instance = activeSandboxes.get(id);
  if (instance) {
    await instance.kill();
    activeSandboxes.delete(id);
  }
});

vi.mock("@e2b/code-interpreter", () => {
  const MockSandboxClass = class {};
  (MockSandboxClass as any).create = (...args: any[]) => sandboxCreateMock(...args);
  (MockSandboxClass as any).connect = (...args: any[]) => sandboxConnectMock(...args);
  (MockSandboxClass as any).kill = (...args: any[]) => sandboxKillStaticMock(...args);
  return {
    Sandbox: MockSandboxClass,
  };
});

describe("sandbox/manager", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    kvStore.clear();
    dbRows.length = 0;
    activeSandboxes.clear();
    sandboxCounter = 0;

    savedEnv.E2B_API_KEY = process.env.E2B_API_KEY;
    savedEnv.SANDBOX_IDLE_MIN = process.env.SANDBOX_IDLE_MIN;
    savedEnv.SANDBOX_COST_PER_MIN = process.env.SANDBOX_COST_PER_MIN;

    process.env.E2B_API_KEY = "test-e2b-key";
    process.env.SANDBOX_IDLE_MIN = "15";
    process.env.SANDBOX_COST_PER_MIN = "0.03";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe("resolveLanguage", () => {
    it("resolves python, javascript, bash, and r", () => {
      expect(resolveLanguage("python")).toBe("python");
      expect(resolveLanguage("py")).toBe("python");
      expect(resolveLanguage("javascript")).toBe("javascript");
      expect(resolveLanguage("nodejs")).toBe("javascript");
      expect(resolveLanguage("bash")).toBe("bash");
      expect(resolveLanguage("sh")).toBe("bash");
      expect(resolveLanguage("r")).toBe("r");
      expect(resolveLanguage("unknown")).toBe("python");
    });
  });

  describe("getSandbox and persistence", () => {
    it("creates a new sandbox when no cached sandbox exists, and reconnects on subsequent calls", async () => {
      const sbx1 = await getSandbox(1, "sess-1");
      expect(sbx1.sandboxId).toBe("sbx-test-1");
      expect(sandboxCreateMock).toHaveBeenCalledTimes(1);
      expect(sandboxConnectMock).toHaveBeenCalledTimes(0);

      // Second call in the same session re-connects by sandboxId
      const sbx2 = await getSandbox(1, "sess-1");
      expect(sbx2.sandboxId).toBe("sbx-test-1");
      expect(sandboxConnectMock).toHaveBeenCalledWith("sbx-test-1", expect.objectContaining({ apiKey: "test-e2b-key" }));
      expect(sandboxCreateMock).toHaveBeenCalledTimes(1);
    });

    it("extends the idle timeout on each access", async () => {
      const sbx = await getSandbox(1, "sess-timeout");
      expect(sbx.setTimeout).toHaveBeenCalledWith(15 * 60 * 1000);

      // Reconnect also extends timeout
      await getSandbox(1, "sess-timeout");
      expect(sbx.setTimeout).toHaveBeenCalledTimes(2);
    });

    it("creates a new sandbox if reconnect to a stale/killed sandbox fails", async () => {
      const sbx1 = await getSandbox(1, "sess-stale");
      expect(sbx1.sandboxId).toBe("sbx-test-1");

      // Simulate sandbox killed externally on E2B
      activeSandboxes.delete("sbx-test-1");

      const sbx2 = await getSandbox(1, "sess-stale");
      expect(sbx2.sandboxId).toBe("sbx-test-2");
      expect(sandboxCreateMock).toHaveBeenCalledTimes(2);
    });

    it("enforces per-user cap of at most 3 sandboxes, killing the oldest on the 4th", async () => {
      // Create sandboxes for session 1, 2, 3
      const sbx1 = await getSandbox(1, "sess-1");
      const sbx2 = await getSandbox(1, "sess-2");
      const sbx3 = await getSandbox(1, "sess-3");

      expect(sbx1.sandboxId).toBe("sbx-test-1");
      expect(sbx2.sandboxId).toBe("sbx-test-2");
      expect(sbx3.sandboxId).toBe("sbx-test-3");

      // Creating a 4th session sandbox for user 1 kills the oldest (sess-1)
      const sbx4 = await getSandbox(1, "sess-4");
      expect(sbx4.sandboxId).toBe("sbx-test-4");

      // sbx1 must have been killed
      expect(sbx1.kill).toHaveBeenCalled();
    });
  });

  describe("executeInSandbox", () => {
    it("AC1: a variable defined in call 1 is readable in call 3 of the same session", async () => {
      // Call 1: define x = 42
      const res1 = await executeInSandbox({
        userId: 1,
        sessionId: "session-persistent",
        language: "python",
        code: "x = 42",
      });
      expect(res1.exitCode).toBe(0);

      // Call 2: compute y = x * 2
      const res2 = await executeInSandbox({
        userId: 1,
        sessionId: "session-persistent",
        language: "python",
        code: "y = x * 2",
      });
      expect(res2.exitCode).toBe(0);

      // Call 3: print(y)
      const res3 = await executeInSandbox({
        userId: 1,
        sessionId: "session-persistent",
        language: "python",
        code: "print(y)",
      });
      expect(res3.exitCode).toBe(0);
      expect(res3.stdout).toBe("84");
    });

    it("AC2: an uploaded CSV can be analyzed and a chart comes back as an image", async () => {
      const emit = vi.fn();
      const res = await executeInSandbox({
        userId: 1,
        sessionId: "session-chart",
        language: "python",
        code: `
          import pandas as pd
          import matplotlib.pyplot as plt
          df = pd.read_csv('/home/user/data/test.csv')
          plt.plot(df['value'])
          plt.show()
        `,
        emit,
      });

      expect(res.exitCode).toBe(0);
      expect(res.images).toHaveLength(1);
      expect(res.images![0].mime).toBe("image/png");
      expect(res.files).toHaveLength(1);
      expect(res.files![0].url).toContain("/files/");
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "image",
          mime: "image/png",
        })
      );
    });

    it("uploads session files on first use, but does not re-upload on subsequent turns", async () => {
      const res1 = await executeInSandbox({
        userId: 1,
        sessionId: "session-upload-test",
        language: "python",
        code: "print('turn 1')",
      });
      expect(res1.exitCode).toBe(0);

      const sbx = activeSandboxes.get("sbx-test-1");
      expect(sbx).toBeDefined();
      expect(sbx!.files.write).toHaveBeenCalledWith(
        "/home/user/data/test.csv",
        expect.anything()
      );

      // Turn 2 in same session
      sbx!.files.write.mockClear();
      const res2 = await executeInSandbox({
        userId: 1,
        sessionId: "session-upload-test",
        language: "python",
        code: "print('turn 2')",
      });
      expect(res2.exitCode).toBe(0);
      // files.write should NOT be called for session_files on turn 2
      expect(sbx!.files.write).not.toHaveBeenCalled();
    });

    it("collects output files from /home/user/output and returns them", async () => {
      let runCount = 0;
      // Setup mock to report a generated file on execution
      const sbx = await getSandbox(1, "session-output");
      sbx.files.list.mockImplementation(async () => {
        runCount++;
        if (runCount > 1) {
          return [
            {
              name: "output.txt",
              path: "/home/user/output/output.txt",
              size: 24,
              type: "file",
              modifiedTime: Date.now(),
            },
          ];
        }
        return [];
      });
      sbx.files.read.mockResolvedValue(Buffer.from("Generated output data"));

      const emit = vi.fn();
      const res = await executeInSandbox({
        userId: 1,
        sessionId: "session-output",
        language: "python",
        code: "with open('/home/user/output/output.txt', 'w') as f: f.write('hello')",
        emit,
      });

      expect(res.exitCode).toBe(0);
      expect(res.files).toBeDefined();
      const file = res.files!.find((f) => f.name === "output.txt");
      expect(file).toBeDefined();
      expect(file!.name).toBe("output.txt");
      expect(file!.mime).toBe("text/plain");
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "file",
          name: "output.txt",
        })
      );
    });

    it("logs sandbox execution usage in seconds with purpose='sandbox'", async () => {
      await executeInSandbox({
        userId: 7,
        sessionId: "sess-usage",
        language: "python",
        code: "x = 1",
      });

      const usageRow = dbRows.find((r) => r.purpose === "sandbox");
      expect(usageRow).toBeDefined();
      expect(usageRow.userId).toBe(7);
      expect(usageRow.sessionId).toBe("sess-usage");
      expect(usageRow.provider).toBe("e2b");
      expect(usageRow.model).toBe("sandbox");
      expect(usageRow.totalTokens).toBeGreaterThanOrEqual(1); // seconds logged in totalTokens
      expect(Number(usageRow.estimatedCostUsd)).toBeGreaterThan(0);
    });

    it("aborts execution and kills sandbox when signal is aborted during run", async () => {
      const controller = new AbortController();

      // Configure mock to wait until aborted
      const sbx = await getSandbox(1, "sess-abort");
      sbx.runCode.mockImplementation(async () => {
        return new Promise((resolve) => {
          controller.signal.addEventListener("abort", () => {
            resolve({ logs: { stdout: [], stderr: [] } });
          });
        });
      });

      const execPromise = executeInSandbox({
        userId: 1,
        sessionId: "sess-abort",
        language: "python",
        code: "import time; time.sleep(10)",
        signal: controller.signal,
      });

      controller.abort();
      const res = await execPromise;

      expect(res.exitCode).toBe(130);
      expect(res.stderr).toBe("Execution was aborted");
      expect(sbx.kill).toHaveBeenCalled();
    });

    it("returns exitCode 130 immediately if signal was already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const res = await executeInSandbox({
        userId: 1,
        sessionId: "sess-preabort",
        language: "python",
        code: "print('hello')",
        signal: controller.signal,
      });

      expect(res.exitCode).toBe(130);
      expect(res.stderr).toBe("Execution was aborted");
      expect(sandboxCreateMock).not.toHaveBeenCalled();
    });

    it("blocks dangerous code before creating sandbox", async () => {
      const res = await executeInSandbox({
        userId: 1,
        sessionId: "sess-danger",
        language: "bash",
        code: "rm -rf /",
      });

      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("Blocked: recursive root deletion");
      expect(sandboxCreateMock).not.toHaveBeenCalled();
    });

    it("returns error when E2B_API_KEY is not configured", async () => {
      delete process.env.E2B_API_KEY;

      const res = await executeInSandbox({
        userId: 1,
        sessionId: "sess-nokey",
        language: "python",
        code: "print('hi')",
      });

      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain("E2B_API_KEY is not configured");
    });
  });

  describe("killSessionSandbox", () => {
    it("kills the sandbox and clears its session entry from kv_cache", async () => {
      const sbx = await getSandbox(1, "sess-kill");
      expect(activeSandboxes.has(sbx.sandboxId)).toBe(true);

      await killSessionSandbox(1, "sess-kill");
      expect(sbx.kill).toHaveBeenCalled();

      // Next getSandbox creates a new sandbox
      const newSbx = await getSandbox(1, "sess-kill");
      expect(newSbx.sandboxId).not.toBe(sbx.sandboxId);
    });
  });
});
