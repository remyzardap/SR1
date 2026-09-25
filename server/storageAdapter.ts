/**
 * Swappable storage layer.
 *
 * Drivers:
 *   - local: stores bytes under /root/sr1-data/files, serves via /files/:key
 *   - forge: legacy Forge proxy (current storage.ts)
 *   - drive: Google Drive adapter (Stage E)
 */

import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface StoragePutResult {
  key: string;
  url: string;
  sizeBytes: number;
  provider: string;
}

export interface StoragePutMeta {
  userId?: number;
  spaceId?: string;
  name?: string;
}

export interface StorageAdapter {
  put(key: string, data: Buffer, mimeType: string, meta?: StoragePutMeta): Promise<StoragePutResult>;
  get(key: string): Promise<Buffer>;
  getUrl(key: string): Promise<string>;
}

// ─── Local filesystem driver ─────────────────────────────────────────────────

const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT || "/root/sr1-data/files";
const LOCAL_PUBLIC_URL = process.env.STORAGE_LOCAL_URL || "/files";

export class LocalAdapter implements StorageAdapter {
  async put(key: string, data: Buffer, _mimeType: string, _meta?: StoragePutMeta): Promise<StoragePutResult> {
    const safeKey = key.replace(/^\/+/, "").replace(/\.\./g, "");
    const fullPath = path.join(LOCAL_ROOT, safeKey);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return {
      key: safeKey,
      url: `${LOCAL_PUBLIC_URL}/${safeKey}`,
      sizeBytes: data.length,
      provider: "local",
    };
  }

  async get(key: string): Promise<Buffer> {
    const safeKey = key.replace(/^\/+/, "").replace(/\.\./g, "");
    const fullPath = path.join(LOCAL_ROOT, safeKey);
    return readFile(fullPath);
  }

  async getUrl(key: string): Promise<string> {
    const safeKey = key.replace(/^\/+/, "").replace(/\.\./g, "");
    return `${LOCAL_PUBLIC_URL}/${safeKey}`;
  }
}

// ─── Forge proxy driver (legacy) ─────────────────────────────────────────────

import { storagePut as forgePut, storageGet as forgeGet } from "./storage";

class ForgeAdapter implements StorageAdapter {
  async put(key: string, data: Buffer, mimeType: string, _meta?: StoragePutMeta): Promise<StoragePutResult> {
    const result = await forgePut(key, data, mimeType);
    return {
      key: result.key,
      url: result.url,
      sizeBytes: data.length,
      provider: "forge",
    };
  }

  async get(key: string): Promise<Buffer> {
    return forgeGet(key);
  }

  async getUrl(key: string): Promise<string> {
    // Best effort: local URL is not known; callers should use the DB fileUrl.
    return key;
  }
}

// ─── Google Drive driver ─────────────────────────────────────────────────────

import {
  createDriveFolder,
  uploadDriveFile,
  getConnectionStatus,
} from "./services/google";

class DriveAdapter implements StorageAdapter {
  private folderCache = new Map<string, Promise<string | undefined>>();

  private async rootFolderId(userId: number): Promise<string | undefined> {
    const cached = this.folderCache.get(`root:${userId}`);
    if (cached) return cached;

    const promised = (async () => {
      const status = await getConnectionStatus(userId);
      if (!status.connected) return undefined;

      const envRoot = process.env.DRIVE_ROOT_FOLDER_ID?.trim();
      if (envRoot) return envRoot;

      try {
        const folder = await createDriveFolder(userId, "Sutaeru");
        return folder.id ?? undefined;
      } catch {
        return undefined;
      }
    })();

    this.folderCache.set(`root:${userId}`, promised);
    return promised;
  }

  private async ensureFolder(userId: number, pathSegments: string[]): Promise<string | undefined> {
    const rootId = await this.rootFolderId(userId);
    if (!rootId) return undefined;

    let parentId = rootId;
    for (const segment of pathSegments) {
      const cacheKey = `${userId}:${parentId}/${segment}`;
      const cached = this.folderCache.get(cacheKey);
      if (cached) {
        parentId = (await cached) ?? parentId;
        continue;
      }

      const promised = (async () => {
        try {
          const folder = await createDriveFolder(userId, segment, parentId);
          return folder.id ?? parentId;
        } catch {
          return parentId;
        }
      })();

      this.folderCache.set(cacheKey, promised);
      parentId = (await promised) ?? parentId;
    }
    return parentId;
  }

  async put(key: string, data: Buffer, mimeType: string, meta?: StoragePutMeta): Promise<StoragePutResult> {
    const userId = meta?.userId;
    if (!userId) throw new Error("Drive adapter requires userId");

    const segments = key.replace(/^\/+/, "").split("/");
    const fileName = meta?.name || segments.pop() || "untitled";
    const parentId = await this.ensureFolder(userId, segments);
    if (!parentId) throw new Error("Google Drive not connected or root folder unavailable");

    const uploaded = await uploadDriveFile(userId, fileName, mimeType, data, parentId);
    return {
      key: uploaded.id || key,
      url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      sizeBytes: data.length,
      provider: "drive",
    };
  }

  async get(_key: string): Promise<Buffer> {
    throw new Error("Drive adapter get() not implemented; use the webViewLink");
  }

  async getUrl(key: string): Promise<string> {
    return `https://drive.google.com/file/d/${key}/view`;
  }
}

// ─── Adapter factory ─────────────────────────────────────────────────────────

export function getStorageAdapter(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER || "local";
  switch (driver) {
    case "forge":
      return new ForgeAdapter();
    case "drive":
      return new DriveAdapter();
    case "local":
    default:
      return new LocalAdapter();
  }
}

export async function ensureLocalStorageRoot(): Promise<void> {
  if (!existsSync(LOCAL_ROOT)) {
    await mkdir(LOCAL_ROOT, { recursive: true });
  }
}
