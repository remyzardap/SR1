/**
 * drive function (POST /api/fn/drive): the Google Drive side of the attachment
 * picker. Two actions, both JSON, both scoped to the signed-in user's own
 * Google connection.
 *
 *   { "action": "status" } -> { "connected": boolean, "email"?: string }
 *   { "action": "list", "query"?, "folderId"?, "pageToken"? }
 *      -> { "files": [{ id, name, mimeType, size?, modifiedTime?, isFolder }], "nextPageToken"? }
 *
 * Without a Google connection `list` answers 409 so the browser can send the
 * user to the Connections page; `status` is the check itself and always answers.
 */

import type { Request, Response } from "express";
import { getConnectionStatus, listDriveAttachments } from "../../services/google";
import { FnError } from "../../lib/fnErrors";
import { DRIVE_NOT_CONNECTED } from "../../lib/attachments";
import { actionOf, asRecord, optionalText, unknownAction } from "./shared";

export const MAX_DRIVE_QUERY_CHARS = 200;
export const MAX_DRIVE_ID_CHARS = 200;
export const MAX_DRIVE_PAGE_TOKEN_CHARS = 800;

export async function handleDrive(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const action = actionOf(body);

  switch (action) {
    case "status":
      res.json(await driveStatus(userId));
      return;
    case "list":
      res.json(await driveList(userId, body));
      return;
    default:
      unknownAction(action);
  }
}

/** `{ connected, email? }`: the shape the Connections page and the picker share. */
export async function driveStatus(userId: number): Promise<{ connected: boolean; email?: string }> {
  const status = await getConnectionStatus(userId);
  const connected = !!status.connected;
  return connected && status.email ? { connected, email: status.email } : { connected };
}

async function driveList(userId: number, body: Record<string, unknown>) {
  const status = await getConnectionStatus(userId);
  if (!status.connected) throw new FnError(409, DRIVE_NOT_CONNECTED);

  return listDriveAttachments(userId, {
    query: optionalText(body, "query", MAX_DRIVE_QUERY_CHARS),
    folderId: optionalText(body, "folderId", MAX_DRIVE_ID_CHARS),
    pageToken: optionalText(body, "pageToken", MAX_DRIVE_PAGE_TOKEN_CHARS),
  });
}
