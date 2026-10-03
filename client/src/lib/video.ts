/**
 * Typed client helpers for video generation (/api/fn/video).
 *
 * Provides typed functions to start, poll with abort support, and cancel video jobs.
 */

import type { Attachment } from "./attachments";
import { getAuthToken } from "./authSession";
import { CloudFunctionError } from "./kemmaCloud";

const VIDEO_API_BASE = `${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/fn/video`;

export type VideoEngineId = "openai" | "gemini" | "qwen" | "forge";
export type VideoQuality = "standard" | "high";
export type VideoAspectRatio = "16:9" | "9:16" | "1:1";
export type VideoJobState = "QUEUED" | "DRAWING" | "SAVING" | "DONE" | "FAILED" | "CANCELLED";

export interface StartVideoParams {
  prompt: string;
  engine?: VideoEngineId;
  quality?: VideoQuality;
  aspectRatio?: VideoAspectRatio;
  durationSec?: number;
  referenceImages?: Attachment[];
}

export interface StartVideoResult {
  ok: boolean;
  jobId: string;
  state: VideoJobState;
  etaSeconds: number | null;
}

export interface VideoJobStatus {
  id: string;
  state: VideoJobState;
  progress: number;
  etaSeconds: number | null;
  videoUrl?: string;
  fileId?: number;
  error?: string;
  engine?: VideoEngineId;
  model?: string;
}

export interface VideoEngineInfo {
  id: VideoEngineId;
  label: string;
  model: string;
  qualityModel: string;
  available: boolean;
  defaultEngine: boolean;
  supportsReference: boolean;
  minDurationSec: number;
  maxDurationSec: number;
}

export interface PollVideoOptions {
  /** Polling interval in ms. Defaults to 2000 ms. */
  intervalMs?: number;
  /** Max time to poll in ms before timing out. Defaults to 300,000 ms (5 min). */
  timeoutMs?: number;
  /** Optional AbortSignal to stop polling. */
  signal?: AbortSignal;
  /** Progress callback invoked on every poll response. */
  onUpdate?: (status: VideoJobStatus) => void;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${VIDEO_API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!res.ok) {
    let message = `Video request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data?.error === "string" && data.error) {
        message = data.error;
      }
    } catch {
      // keep default message
    }
    throw new CloudFunctionError(message, res.status);
  }

  return (await res.json()) as T;
}

/**
 * Start a video generation job.
 * Returns immediately with the job id and initial queue state.
 */
export async function startVideo(params: StartVideoParams): Promise<StartVideoResult> {
  return request<StartVideoResult>("/start", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Check current status and progress of a video job.
 */
export async function getVideoStatus(jobId: string, signal?: AbortSignal): Promise<VideoJobStatus> {
  if (!jobId) throw new Error("jobId is required");
  return request<VideoJobStatus>(`/status?id=${encodeURIComponent(jobId)}`, {
    method: "GET",
    signal,
  });
}

/**
 * Cancel an active video job.
 */
export async function cancelVideo(jobId: string): Promise<{ ok: boolean }> {
  if (!jobId) throw new Error("jobId is required");
  return request<{ ok: boolean }>("/cancel", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
}

/**
 * Query available video engines and models.
 */
export async function listVideoEngines(): Promise<VideoEngineInfo[]> {
  const data = await request<{ engines: VideoEngineInfo[] }>("/engines", {
    method: "GET",
  });
  return data.engines || [];
}

/**
 * Poll a video job until it completes, fails, or is cancelled.
 * Calls onUpdate with status updates. Supports abort via AbortSignal.
 */
export async function pollVideo(jobId: string, options: PollVideoOptions = {}): Promise<VideoJobStatus> {
  const { intervalMs = 2000, timeoutMs = 300_000, signal, onUpdate } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error("Polling aborted by user");
    }

    const status = await getVideoStatus(jobId, signal);
    onUpdate?.(status);

    if (status.state === "DONE") {
      return status;
    }

    if (status.state === "FAILED" || status.state === "CANCELLED") {
      throw new CloudFunctionError(status.error || `Video generation ${status.state.toLowerCase()}`, 500);
    }

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("Polling aborted by user"));
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Polling aborted by user"));
      }, { once: true });
    });
  }

  throw new CloudFunctionError("Video generation timed out while waiting for completion.", 504);
}
