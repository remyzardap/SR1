/**
 * Semantic vector search using Google Vertex AI
 * - Embeddings: text-embedding-004 (768 dimensions)
 * - Vector index: Vertex AI Vector Search (Matching Engine)
 * - Relational data: MySQL (unchanged)
 *
 * Required env vars:
 *   GOOGLE_PROJECT_ID         - GCP project ID
 *   GOOGLE_LOCATION           - Region (default: us-central1)
 *   VERTEX_INDEX_ENDPOINT_ID  - Vector Search endpoint ID
 *   VERTEX_DEPLOYED_INDEX_ID  - Deployed index ID within the endpoint
 *   GOOGLE_API_KEY            - Service account key JSON (stringified) OR use ADC
 */

import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_PROJECT_ID;
const LOCATION = process.env.GOOGLE_LOCATION || "us-central1";
const ENDPOINT = process.env.VERTEX_INDEX_ENDPOINT_ID;
const DEPLOYED = process.env.VERTEX_DEPLOYED_INDEX_ID;

const BASE = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}`;

// Singleton auth client
let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!_auth) {
    // Support JSON key passed as env var string
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (keyJson) {
      const credentials = JSON.parse(keyJson);
      _auth = new GoogleAuth({
        credentials,
        scopes: "https://www.googleapis.com/auth/cloud-platform",
      });
    } else {
      _auth = new GoogleAuth({
        scopes: "https://www.googleapis.com/auth/cloud-platform",
      });
    }
  }
  return _auth;
}

async function getToken(): Promise<string> {
  const auth = getAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token as string;
}

/**
 * Generate a 768-dimensional embedding for the given text
 * using Google's text-embedding-004 model.
 */
export async function embed(text: string): Promise<number[]> {
  if (!PROJECT) throw new Error("GOOGLE_PROJECT_ID is not configured");
  const token = await getToken();
  const res = await fetch(
    `${BASE}/publishers/google/models/text-embedding-004:predict`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ instances: [{ content: text }] }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.predictions[0].embeddings.values as number[];
}

/**
 * Upsert a memory vector into Vertex AI Vector Search.
 * Uses identityId as a namespace restriction so users only
 * retrieve their own memories.
 */
export async function upsertVector(
  memoryId: number,
  vector: number[],
  identityId: number
): Promise<void> {
  if (!PROJECT || !ENDPOINT) {
    // Silently skip if Vertex AI is not configured (graceful degradation)
    return;
  }
  const token = await getToken();
  await fetch(`${BASE}/indexEndpoints/${ENDPOINT}:upsertDatapoints`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      datapoints: [
        {
          datapointId: String(memoryId),
          featureVector: vector,
          restricts: [
            {
              namespace: "identity",
              allowList: [String(identityId)],
            },
          ],
        },
      ],
    }),
  });
}

/**
 * Remove a memory vector from Vertex AI Vector Search.
 */
export async function removeVector(memoryId: number): Promise<void> {
  if (!PROJECT || !ENDPOINT) return;
  const token = await getToken();
  await fetch(`${BASE}/indexEndpoints/${ENDPOINT}:removeDatapoints`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ datapointIds: [String(memoryId)] }),
  });
}

/**
 * Find the k most semantically similar memories for a given identity.
 * Returns an array of { id, score } sorted by descending similarity.
 */
export async function searchSimilar(
  vector: number[],
  identityId: number,
  k: number = 5
): Promise<Array<{ id: number; score: number }>> {
  if (!PROJECT || !ENDPOINT || !DEPLOYED) {
    // Vertex AI not configured — caller should fall back to recent memories
    return [];
  }
  const token = await getToken();
  const res = await fetch(`${BASE}/indexEndpoints/${ENDPOINT}:findNeighbors`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deployedIndexId: DEPLOYED,
      queries: [
        {
          neighborCount: k,
          featureVector: vector,
          restricts: [
            {
              namespace: "identity",
              allowList: [String(identityId)],
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vector search failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  const neighbors = data.nearestNeighbors?.[0]?.neighbors ?? [];
  return neighbors.map((n: { datapointId: string; distance: number }) => ({
    id: parseInt(n.datapointId),
    score: Math.round((1 - n.distance) * 100) / 100,
  }));
}

/** Returns true if Vertex AI Vector Search is fully configured */
export function isVectorSearchConfigured(): boolean {
  return !!(PROJECT && ENDPOINT && DEPLOYED);
}
