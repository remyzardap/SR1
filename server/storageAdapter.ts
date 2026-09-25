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

export interface StorageAdapter {
  put(key: string, data: Buffer, mimeType: string): Promise<StoragePutResult>;
  get(key: string): Promise<Buffer>;
  getUrl(key: string): Promise<string>;
}

// ─── Local filesystem driver ─────────────────────────────────────────────────

const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT || "/root/sr1-data/files";
const LOCAL_PUBLIC_URL = process.env.STORAGE_LOCAL_URL || "/files";

export class LocalAdapter implements StorageAdapter {
  async put(key: string, data: Buffer, _mimeType: string): Promise<StoragePutResult> {
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
  async put(key: string, data: Buffer, mimeType: string): Promise<StoragePutResult> {
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

// ─── Adapter factory ─────────────────────────────────────────────────────────

export function getStorageAdapter(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER || "local";
  switch (driver) {
    case "forge":
      return new ForgeAdapter();
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
