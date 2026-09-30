/**
 * vertexAuth.ts
 * Shared Google Cloud Vertex AI auth plus the Vertex request shapes used for
 * every Gemini-routed call when GEMINI_BACKEND=vertex (see kemmaRouter).
 *
 * Auth model (verified live): a service account JSON file at the path in
 * GOOGLE_APPLICATION_CREDENTIALS, the cloud-platform scope, and one shared
 * GoogleAuth instance - the library caches and refreshes the access token.
 *
 * Hard rules: never log a token and never include one in an Error message.
 */

import { accessSync, constants as fsConstants } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

export const VERTEX_EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIMENSIONS = 768;

let sharedAuth: GoogleAuth | null = null;
let cachedProjectId: string | null = null;
let backendFallbackWarned = false;
let embeddingModelWarned = false;

/** "google/gemini-x" -> "gemini-x". Vertex builders add the publisher prefix themselves. */
export function stripGooglePrefix(model: string): string {
  return model.replace(/^google\//i, "");
}

function credentialsReadable(): boolean {
  const path = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!path) return false;
  try {
    accessSync(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * True when Gemini calls must go to Vertex AI.
 * GEMINI_BACKEND defaults to aistudio; vertex also requires GOOGLE_APPLICATION_CREDENTIALS
 * to point at a readable file. Missing credentials warn once (env var name only, never the
 * path) and fall back to AI Studio.
 */
export function vertexEnabled(): boolean {
  if ((process.env.GEMINI_BACKEND || "").trim().toLowerCase() !== "vertex") return false;
  if (!credentialsReadable()) {
    if (!backendFallbackWarned) {
      backendFallbackWarned = true;
      console.warn(
        "[vertex] GEMINI_BACKEND=vertex but GOOGLE_APPLICATION_CREDENTIALS is unset or unreadable; using the AI Studio backend."
      );
    }
    return false;
  }
  return true;
}

function auth(): GoogleAuth {
  if (!sharedAuth) sharedAuth = new GoogleAuth({ scopes: SCOPES });
  return sharedAuth;
}

/** A fresh OAuth access token for Vertex calls. Token material never leaves this function. */
export async function getVertexToken(): Promise<string> {
  let token: string | undefined;
  try {
    const client = await auth().getClient();
    token = (await client.getAccessToken()).token ?? undefined;
  } catch {
    // The library's error text can mention credential files; keep our message generic.
    throw new Error("Vertex AI authentication failed. Check GOOGLE_APPLICATION_CREDENTIALS.");
  }
  if (!token) throw new Error("Vertex AI authentication returned no access token.");
  return token;
}

/** VERTEX_PROJECT when set; otherwise the ADC project from google-auth-library (env or the service-account file), cached after the first resolve. */
export async function getVertexProject(): Promise<string> {
  const fromEnv = (process.env.VERTEX_PROJECT || "").trim();
  if (fromEnv) {
    cachedProjectId = fromEnv;
    return fromEnv;
  }
  if (cachedProjectId) return cachedProjectId;
  let id = "";
  try {
    id = ((await auth().getProjectId()) || "").trim();
  } catch {
    id = "";
  }
  if (!id) throw new Error("Could not determine the Vertex project id. Set VERTEX_PROJECT.");
  cachedProjectId = id;
  return id;
}

/** Best-effort sync project id for building RouteConfig base URLs; "" when nothing is known yet. */
export function vertexProjectCached(): string {
  return (process.env.VERTEX_PROJECT || "").trim() || cachedProjectId || "";
}

/** Location for chat/openapi and generateContent calls. Default global (the 3.x models are global-only). */
export function vertexLocation(): string {
  return (process.env.VERTEX_LOCATION || "global").trim() || "global";
}

/** Location for embedding predict calls. text-embedding-004 is not served from global. */
export function vertexEmbeddingLocation(): string {
  return (process.env.VERTEX_EMBEDDING_LOCATION || "us-central1").trim() || "us-central1";
}

function vertexHost(location: string): string {
  return location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
}

/** OpenAI-compatible base; call sites append /chat/completions. */
export function vertexChatBaseUrl(project: string): string {
  const loc = vertexLocation();
  return `${vertexHost(loc)}/v1/projects/${project}/locations/${loc}/endpoints/openapi`;
}

export function vertexGenerateContentUrl(project: string, model: string): string {
  const loc = vertexLocation();
  return `${vertexHost(loc)}/v1/projects/${project}/locations/${loc}/publishers/google/models/${stripGooglePrefix(model)}:generateContent`;
}

export function vertexEmbeddingPredictUrl(project: string, model: string): string {
  const loc = vertexEmbeddingLocation();
  return `${vertexHost(loc)}/v1/projects/${project}/locations/${loc}/publishers/google/models/${stripGooglePrefix(model)}:predict`;
}

async function vertexPost(url: string, body: unknown): Promise<any> {
  const token = await getVertexToken();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Vertex AI request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  return await res.json();
}

export interface VertexInlineImage {
  data: string;
  mimeType: string;
}

/** Standard Gemini generateContent body: one user content with the text parts, then optional inlineData. */
export function vertexGenerateContentBody(options: {
  texts: string[];
  image?: VertexInlineImage;
  generationConfig?: Record<string, unknown>;
}): Record<string, unknown> {
  const parts: Record<string, unknown>[] = options.texts.filter(Boolean).map((text) => ({ text }));
  if (options.image) {
    parts.push({ inlineData: { mimeType: options.image.mimeType, data: options.image.data } });
  }
  const body: Record<string, unknown> = { contents: [{ role: "user", parts }] };
  if (options.generationConfig) body.generationConfig = options.generationConfig;
  return body;
}

/** Concatenated text of the first candidate, mirroring the SDK's response.text(). */
export function vertexResponseText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
}

/** Native generateContent call (vision, documents). Returns the answer text. */
export async function vertexGenerateContentText(model: string, body: Record<string, unknown>): Promise<string> {
  const project = await getVertexProject();
  const data = await vertexPost(vertexGenerateContentUrl(project, model), body);
  return vertexResponseText(data);
}

/** Only text-embedding-004 works on this project's predict endpoint; anything else maps to it, logged once. */
export function vertexEmbeddingModel(configured: string): string {
  const model = stripGooglePrefix((configured || "").trim());
  if (model === VERTEX_EMBEDDING_MODEL) return model;
  if (!embeddingModelWarned) {
    embeddingModelWarned = true;
    console.warn(
      `[vertex] KEMMA_MODEL_EMBEDDING "${model || "unset"}" is not available on Vertex predict; using ${VERTEX_EMBEDDING_MODEL}.`
    );
  }
  return VERTEX_EMBEDDING_MODEL;
}

/** Native embedding predict. Always returns EMBEDDING_DIMENSIONS floats. */
export async function vertexEmbed(text: string, configuredModel: string): Promise<number[]> {
  const model = vertexEmbeddingModel(configuredModel);
  const project = await getVertexProject();
  const data = await vertexPost(vertexEmbeddingPredictUrl(project, model), { instances: [{ content: text }] });
  const values = data?.predictions?.[0]?.embeddings?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Vertex embedding returned ${Array.isArray(values) ? values.length : 0} values; expected ${EMBEDDING_DIMENSIONS}.`
    );
  }
  return values as number[];
}
