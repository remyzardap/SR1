/**
 * memories function (POST /api/fn/memories).
 *
 * Actions, from client/src/pages/Memories.tsx and the extract call in
 * client/src/pages/Chat.tsx:
 *   { action: "extract", conversation, source }  -> { memories: [{ type, content }] }
 *   { action: "list"   [, type] }                -> { memories: [{ id, type, content, source, createdAt }] }
 *   { action: "delete", id }                     -> { ok: true, id }
 *   { action: "getSetting" }                     -> { enabled: boolean }
 *   { action: "setSetting", enabled }            -> { ok: true, enabled }
 *
 * extract only proposes: the client writes the rows through trpc.memories.create,
 * exactly as the current Lovable function did.
 */

import type { Request, Response } from "express";
import { memoryTypeEnum } from "../../../drizzle/schema";
import { deleteMemory, getMemoriesByIdentity, getOrCreateIdentity } from "../../db";
import { complete, LlmUnavailableError, type ChatMessage } from "../../lib/fnLlm";
import { FnError } from "../../lib/fnErrors";
import { LIVING_MEMORY_KEY, getUserSetting, setUserSetting } from "../../lib/fnStore";
import {
  actionOf,
  asRecord,
  optionalText,
  requireBoolean,
  requireIntegerId,
  requireText,
  unknownAction,
} from "./shared";

const MEMORY_TYPES = memoryTypeEnum.enumValues;
const MAX_CONVERSATION_CHARS = 30000;
const MAX_ITEMS = 8;
const MAX_ITEM_CHARS = 400;

const EXTRACT_SYSTEM_PROMPT = `You note durable facts about a person from a conversation between them and an AI assistant.
Keep only what will still matter later: stable preferences, personal or business facts, ongoing projects, recurring documents.
Skip small talk, one-off questions, temporary states and anything you are unsure about.
Reply with JSON only, in this exact shape: {"memories":[{"type":"preference|fact|project|document|interaction","content":"one short sentence"}]}
Use an empty array when there is nothing worth keeping. Never invent facts.`;

export async function handleMemories(userId: number, req: Request, res: Response): Promise<void> {
  const body = asRecord(req.body);
  const action = actionOf(body);

  switch (action) {
    case "extract":
      res.json(await extractMemories(userId, body));
      return;
    case "list":
      res.json({ memories: await listMemories(userId, body) });
      return;
    case "delete":
      res.json(await deleteOne(userId, body));
      return;
    case "getSetting":
      res.json({ enabled: await livingMemoryEnabled(userId) });
      return;
    case "setSetting":
      return setSetting(userId, body, res);
    default:
      unknownAction(action);
  }
}

async function setSetting(userId: number, body: Record<string, unknown>, res: Response): Promise<void> {
  const enabled = requireBoolean(body, "enabled");
  await setUserSetting(userId, LIVING_MEMORY_KEY, enabled);
  res.json({ ok: true, enabled });
}

/** On unless the user switched it off; a missing row or setting means on. */
export async function livingMemoryEnabled(userId: number): Promise<boolean> {
  const stored = await getUserSetting(userId, LIVING_MEMORY_KEY);
  return stored !== false;
}

async function listMemories(userId: number, body: Record<string, unknown>): Promise<unknown[]> {
  const type = body.type === undefined || body.type === null ? undefined : requireOneOfType(body.type);
  const identity = await getOrCreateIdentity(userId);
  if (!identity) throw new FnError(500, "Memory storage is unavailable.");
  const rows = await getMemoriesByIdentity(identity.id, type);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    content: row.content,
    source: row.sourceApp ?? row.title ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

async function deleteOne(userId: number, body: Record<string, unknown>): Promise<unknown> {
  const id = requireIntegerId(body, "id");
  const identity = await getOrCreateIdentity(userId);
  if (!identity) throw new FnError(500, "Memory storage is unavailable.");
  await deleteMemory(id, identity.id);
  return { ok: true, id };
}

function requireOneOfType(value: unknown): (typeof MEMORY_TYPES)[number] {
  const match = MEMORY_TYPES.find((t) => t === value);
  if (!match) throw new FnError(400, "Memory type is not valid.");
  return match;
}

export async function extractMemories(userId: number, body: Record<string, unknown>): Promise<{ memories: Array<{ type: string; content: string }> }> {
  if ((await livingMemoryEnabled(userId)) === false) return { memories: [] };

  const conversation = requireText(body, "conversation", MAX_CONVERSATION_CHARS);
  const source = optionalText(body, "source", 64) ?? "chat";

  const messages: ChatMessage[] = [
    { role: "system", content: EXTRACT_SYSTEM_PROMPT },
    { role: "user", content: `Source: ${source}\n\nConversation:\n${conversation}` },
  ];

  let text: string;
  try {
    ({ text } = await complete(messages, { userId, purpose: "memory_extract", maxTokens: 600 }));
  } catch (err) {
    if (err instanceof LlmUnavailableError) throw new FnError(503, "Memory extraction is not configured.");
    throw err;
  }

  return { memories: parseExtractedMemories(text) };
}

/** Model output is untrusted: keep only well-formed items with a known type. */
export function parseExtractedMemories(raw: string): Array<{ type: string; content: string }> {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: Array<{ type: string; content: string }> = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { type?: unknown; content?: unknown };
    if (typeof candidate.content !== "string") continue;
    const content = candidate.content.trim();
    if (!content || content.length > MAX_ITEM_CHARS) continue;
    const type = MEMORY_TYPES.find((t) => t === candidate.type);
    if (!type) continue;
    out.push({ type, content });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
