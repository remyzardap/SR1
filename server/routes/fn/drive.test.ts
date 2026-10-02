import { describe, it, expect, vi, beforeEach } from "vitest";

// Only the Google service is faked here: no network, no credentials, obvious ids.
const google = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  listDriveAttachments: vi.fn(),
}));

vi.mock("../../services/google", () => google);

import { FnError } from "../../lib/fnErrors";
import { handleDrive } from "./drive";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const request = (body: unknown, userId: number) => ({ body, user: { id: userId }, on: () => {} }) as never;

async function attempt(body: unknown, userId = 7) {
  const res = fakeRes();
  try {
    await handleDrive(userId, request(body, userId), res as never);
    return { status: res.statusCode, body: res.body };
  } catch (err) {
    if (err instanceof FnError) return { status: err.status, body: { error: err.message } };
    throw err;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.test" });
  google.listDriveAttachments.mockResolvedValue({ files: [] });
});

describe("action status", () => {
  it("reports a connected account with its email", async () => {
    const { status, body } = await attempt({ action: "status" });
    expect(status).toBe(200);
    expect(body).toEqual({ connected: true, email: "user@example.test" });
    expect(google.getConnectionStatus).toHaveBeenCalledWith(7);
  });

  it("reports a missing connection as a plain answer, never an error", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });
    const { status, body } = await attempt({ action: "status" }, 12);
    expect(status).toBe(200);
    expect(body).toEqual({ connected: false });
    expect(google.getConnectionStatus).toHaveBeenCalledWith(12);
  });

  it("leaves the email out when the stored row has none", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: true, email: null });
    expect((await attempt({ action: "status" })).body).toEqual({ connected: true });
  });
});

describe("action list", () => {
  const page = {
    files: [
      { id: "folder-1", name: "Decks", mimeType: "application/vnd.google-apps.folder", isFolder: true },
      { id: "file-1", name: "Q3.pdf", mimeType: "application/pdf", size: 1200, modifiedTime: "2026-01-04T09:00:00Z", isFolder: false },
    ],
    nextPageToken: "next-page-token",
  };

  it("returns the contract shape for one page", async () => {
    google.listDriveAttachments.mockResolvedValue(page);
    const { status, body } = await attempt({ action: "list", query: "Q3", folderId: "folder-1", pageToken: "tok" });

    expect(status).toBe(200);
    expect(body).toEqual(page);
    expect(google.listDriveAttachments).toHaveBeenCalledWith(7, { query: "Q3", folderId: "folder-1", pageToken: "tok" });
  });

  it("works without any filter", async () => {
    await attempt({ action: "list" }, 9);
    expect(google.listDriveAttachments).toHaveBeenCalledWith(9, { query: undefined, folderId: undefined, pageToken: undefined });
  });

  it("leaves the page token out when Google has no more rows", async () => {
    google.listDriveAttachments.mockResolvedValue({ files: page.files });
    const { body } = await attempt({ action: "list" });
    expect(body).not.toHaveProperty("nextPageToken");
  });

  it("answers 409 and never asks Drive when Google is not connected", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });
    const { status, body } = await attempt({ action: "list" }, 5);

    expect(status).toBe(409);
    expect(body).toEqual({ error: "Connect Google on the Connections page first." });
    expect(google.listDriveAttachments).not.toHaveBeenCalled();
    expect(google.getConnectionStatus).toHaveBeenCalledWith(5);
  });

  it("reads only the session user's Drive, whatever the body says", async () => {
    await handleDrive(3, request({ action: "list", userId: 99, as: "admin" }, 3), fakeRes() as never);
    expect(google.listDriveAttachments).toHaveBeenCalledWith(3, expect.anything());
    expect(google.getConnectionStatus).toHaveBeenCalledWith(3);
  });

  it("refuses an over-long search phrase before asking Drive", async () => {
    const { status, body } = await attempt({ action: "list", query: "x".repeat(400) });
    expect(status).toBe(413);
    expect(body).toEqual({ error: "Query is too large (max 200)." });
    expect(google.listDriveAttachments).not.toHaveBeenCalled();
  });
});

describe("the request body", () => {
  it("needs an action, and only knows two of them", async () => {
    expect((await attempt({})).status).toBe(400);
    const { status, body } = await attempt({ action: "download", fileId: "file-1" });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Unknown action: download" });
    expect(google.listDriveAttachments).not.toHaveBeenCalled();
  });

  it("needs a JSON body object", async () => {
    await expect(handleDrive(7, request(null, 7), fakeRes() as never)).rejects.toMatchObject({ status: 400 });
  });
});
