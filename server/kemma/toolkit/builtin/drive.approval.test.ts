/**
 * P1-11: what the human is shown before a `drive_edit` is staged, and what the server re-reads
 * before it runs.
 *
 * `drive_edit` rewrites a document the user already owns, so it is the shipped case where an
 * approval needs to name a target and a version: the card has to say *which* file and what is in it
 * now, and the execution-time re-check needs a revision to compare against. Before this wiring the
 * card carried neither, so an approved edit could be replayed against a file nobody read.
 *
 * The Drive service is mocked, so a card that reads metadata is visible here without credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const google = vi.hoisted(() => ({
  // `registerDriveTools` decides whether the tool is offered at all from this call.
  getConnectionStatus: vi.fn(async () => ({ connected: true })),
  getDriveFileMeta: vi.fn(async (_userId: number, fileId: string) => ({
    id: fileId,
    name: "Q3 notes.txt",
    mimeType: "text/plain",
    modifiedTime: "2026-10-05T08:00:00Z",
    isFolder: false,
  })),
  readDriveFile: vi.fn(async () => ({ text: "the old text" })),
  createDriveFolder: vi.fn(async () => ({ id: "root" })),
  listDriveFiles: vi.fn(async () => []),
  moveDriveFile: vi.fn(async () => ({})),
  uploadDriveFile: vi.fn(async () => ({})),
}));

vi.mock("../../../services/google", () => google);

import { registerDriveTools } from "./drive";
import { getToolSpec, runTool, __resetRegistryForTests } from "../registry";
import type { ToolContext } from "../types";

const EDIT_ARGS = { fileId: "f1", newContent: "the new text", reason: "fix the total" };

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 1,
    runId: "r-drive",
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

/** The gate stands in for the approval row + the human; it records what was offered to them. */
function gate() {
  const requests: any[] = [];
  const value = {
    request: async (params: any) => {
      requests.push(params);
      return { decision: "approved" as const, args: params.args, approvalId: "drv-1" };
    },
  };
  return { value, requests };
}

beforeEach(() => {
  __resetRegistryForTests();
  // Each test starts from the same connected Drive with one known version of one known file.
  vi.resetAllMocks();
  google.getConnectionStatus.mockResolvedValue({ connected: true });
  google.getDriveFileMeta.mockImplementation(async (_userId: number, fileId: string) => ({
    id: fileId,
    name: "Q3 notes.txt",
    mimeType: "text/plain",
    modifiedTime: "2026-10-05T08:00:00Z",
    isFolder: false,
  }));
  google.readDriveFile.mockResolvedValue({ text: "the old text" });
  google.createDriveFolder.mockResolvedValue({ id: "root" });
  google.listDriveFiles.mockResolvedValue([]);
  google.moveDriveFile.mockResolvedValue({});
  google.uploadDriveFile.mockResolvedValue({});
  registerDriveTools();
  process.env.FF_APPROVALS = "1";
});

afterEach(() => {
  delete process.env.FF_APPROVALS;
});

function driveEdit() {
  const spec = getToolSpec("drive_edit");
  expect(spec).toBeDefined();
  return spec as unknown as {
    preview?: (args: any, ctx: ToolContext) => Promise<unknown>;
    targetRef?: (args: any, ctx: ToolContext) => Promise<string | undefined> | string | undefined;
    targetRevision?: (args: any, ctx: ToolContext) => Promise<string | undefined> | string | undefined;
  };
}

describe("drive_edit approval card", () => {
  it("names the file that will be changed, without pasting its contents on the card", async () => {
    const preview = driveEdit().preview;
    expect(preview).toBeDefined();

    const shown = await preview!(EDIT_ARGS, ctx());

    expect(google.getDriveFileMeta).toHaveBeenCalledWith(1, "f1");
    expect((shown as any).title).toBe("Stage a Drive edit");
    expect((shown as any).detail).toContain("Q3 notes.txt");
    expect((shown as any).reason).toBe("fix the total");
    expect((shown as any).currentVersion).toBe("2026-10-05T08:00:00Z");
    expect((shown as any).target).toBe("drive:f1");
    // The user wrote the new text themselves and is looking at it in the chat; the card carries the
    // edit, not a copy of the document it replaces.
    expect(JSON.stringify(shown)).not.toContain("the old text");
  });

  it("refuses to read the file at all when the id is not a file", async () => {
    google.getDriveFileMeta.mockImplementationOnce(async () => {
      throw new Error("Google Drive returned no file for that id");
    });

    await expect(driveEdit().preview!(EDIT_ARGS, ctx())).rejects.toThrow(/no file/);
  });

  it("binds the approval to the file id without asking Drive again", async () => {
    // This resolver runs inside the approval route on every edited decision, so it must stay cheap.
    google.getDriveFileMeta.mockClear();

    expect(await driveEdit().targetRef!(EDIT_ARGS, ctx())).toBe("drive:f1");
    expect(google.getDriveFileMeta).not.toHaveBeenCalled();
  });

  it("takes the version from Drive, so an edit that lands first is noticed", async () => {
    expect(await driveEdit().targetRevision!(EDIT_ARGS, ctx())).toBe("2026-10-05T08:00:00Z");
    expect(google.getDriveFileMeta).toHaveBeenCalledWith(1, "f1");

    // A file that reports no version yields no revision, and with it no conflict check to pass.
    google.getDriveFileMeta.mockResolvedValueOnce({
      id: "f1",
      name: "no revision",
      mimeType: "application/octet-stream",
      isFolder: false,
    });
    expect(await driveEdit().targetRevision!(EDIT_ARGS, ctx())).toBeUndefined();
  });
});

describe("drive_edit through the approval ladder", () => {
  it("offers the human a card that carries a target, a version and a preview", async () => {
    const g = gate();
    const outcome = await runTool("drive_edit", EDIT_ARGS, ctx({ approvals: g.value }));

    expect(g.requests).toHaveLength(1);
    const requested = g.requests[0];
    expect(requested.tool).toBe("drive_edit");
    expect(requested.risk).toBe("write");
    expect(requested.targetRef).toBe("drive:f1");
    expect(requested.targetRevision).toBe("2026-10-05T08:00:00Z");
    expect((requested.preview as any).detail).toContain("Q3 notes.txt");

    // Staging is all this tool is allowed to do (G3), and it happens only after the approval.
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data).toMatchObject({ success: true, data: { pending: true, fileId: "f1" } });
    }
  });

  it("refuses to queue an edit whose current version it cannot read", async () => {
    // The version comes from the same Drive read as the card. If it fails, no human is asked to
    // approve an edit that could not survive its own conflict check.
    google.getDriveFileMeta.mockRejectedValue(new Error("403 the user does not have access"));
    const g = gate();

    const outcome = await runTool("drive_edit", EDIT_ARGS, ctx({ approvals: g.value }));

    expect(g.requests).toHaveLength(0);
    expect(outcome).toEqual({
      ok: false,
      code: "FAILED",
      error: "Could not read the current version of drive_edit's target, so it was not queued for approval. Try again.",
    });
    expect(JSON.stringify(outcome)).not.toContain("403 the user");
  });

  it("stops when the file changes while the card is open", async () => {
    let modifiedTime = "2026-10-05T08:00:00Z";
    google.getDriveFileMeta.mockImplementation(async (_userId: number, fileId: string) => ({
      id: fileId,
      name: "Q3 notes.txt",
      mimeType: "text/plain",
      modifiedTime,
      isFolder: false,
    }));
    const g = gate();
    const request = g.value.request;
    // The human takes their time, and the document is edited somewhere else in the meantime.
    g.value.request = async (params: any) => {
      modifiedTime = "2026-10-05T09:30:00Z";
      return request(params);
    };

    const outcome = await runTool("drive_edit", EDIT_ARGS, ctx({ approvals: g.value }));

    expect(g.requests).toHaveLength(1);
    expect(g.requests[0].targetRevision).toBe("2026-10-05T08:00:00Z");
    expect(outcome).toMatchObject({ ok: false, code: "CONFLICT" });
    if (!outcome.ok) expect(outcome.error).toMatch(/revision/i);
  });

  it("does not ask for an approval nobody can give", async () => {
    const outcome = await runTool("drive_edit", EDIT_ARGS, ctx());

    expect(google.getDriveFileMeta).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });
});

describe("drive_create keeps no approval", () => {
  it("a brand new file has no target to bind to, so it still runs unapproved", async () => {
    const spec = getToolSpec("drive_create") as unknown as {
      requiresApproval?: unknown;
      targetRef?: unknown;
      preview?: unknown;
    };

    // A creation has no prior version, so naming a target for it would be invented: the approval
    // ladder binds edits of things that already exist (P1-11).
    expect(spec.requiresApproval).toBeUndefined();
    expect(spec.targetRef).toBeUndefined();
    expect(spec.preview).toBeUndefined();

    const outcome = await runTool("drive_create", { name: "notes.txt", content: "hello" }, ctx());

    expect(outcome).toMatchObject({ ok: true });
    expect(google.uploadDriveFile).toHaveBeenCalled();
  });
});
