/**
 * Sensitive-subject classifier and Venice routing helpers.
 *
 * `classifyPrompt` answers three things about a prompt:
 *   blocked    sexual content involving minors, or other content that is illegal to produce. Refused with a short
 *              plain message BEFORE any model call, on every path (chat, image, video), whatever the settings say.
 *   sensitive  lawful adult content the main models refuse or water down (explicit adult themes between adults,
 *              graphic fiction violence, drugs and weapons questions that are legal to discuss, dark fiction,
 *              controversial topics). Admin accounts only get these answered by Venice (uncensored models).
 *   neither    everything else, including self-harm and suicide: those stay on the main model, which handles
 *              them with care (category "self_harm", sensitive false).
 *
 * The check is a cheap regex prefilter first. Strong signals are decided right there. Weak signals ("kill",
 * "drugs", "gun") are borderline and go to one small model call with a short timeout; when that call fails or
 * is not configured the answer is "not sensitive". The blocked check never depends on a model, a key or a setting.
 */

import { apiKeyFor, chatRoute, resolveRouteAuth, routeFor, veniceBaseUrl } from "../core/kemmaRouter";

export type SensitiveCategory = "adult" | "violence" | "drugs" | "weapons" | "dark_fiction" | "controversial" | "self_harm" | "minors" | "illegal";

export interface PromptClassification {
  sensitive: boolean;
  category?: string;
  blocked?: boolean;
}

/** What every path answers when a prompt is blocked. Short, plain, no detail about why. */
export const BLOCKED_MESSAGE = "I can't help with that.";

// ─── Text normalisation ──────────────────────────────────────────────────────

/** Lowercase, drop zero-width characters, undo simple letter swaps ("l0li", "p0rn") and collapse spaces. */
function normalise(text: string): string {
  return (text || "")
    .normalize("NFKD")
    .replace(/[​-‏⁠﻿̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(?<=[a-z])0(?=[a-z])/g, "o")
    .replace(/(?<=[a-z])1(?=[a-z])/g, "i")
    .replace(/(?<=[a-z])3(?=[a-z])/g, "e")
    .replace(/(?<=[a-z])\$(?=[a-z])/g, "s")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Blocked: minors in a sexual context, other content illegal to produce ───

const SEXUAL =
  "(?:sex|sexy|sexual\\w*|nude|nudes|naked|nsfw|porn\\w*|erotic\\w*|fuck\\w*|blowjob|handjob|boobs|genitals?|penis|vagina|pussy|cock|dick|cum|cumshot|orgasm\\w*|masturbat\\w*|lingerie|topless|undress\\w*|bdsm|fetish|hentai|intercourse|horny|lewd|aroused|arousal)";
const MINOR =
  "(?:child|children|kid|kids|minor|minors|underage|under-age|under age|teen|teens|teenage\\w*|preteen\\w*|pre-teen\\w*|tween|toddler|infant|newborn|schoolgirl|schoolboy|school girl|school boy|high ?school\\w*|middle ?school\\w*|elementary|loli|lolicon|shota|shotacon|jailbait|little girl|little boy|young girl|young boy|prepubescent|pubescent|my daughter|my son|my niece|my nephew|kindergarten\\w*|(?:[5-9]|1[0-7])(?: ?(?:yo|y\\.?o\\.?|y/o)|[ -]?(?:year|years|yr|yrs)[ -]?old))";

const MINOR_SEXUAL_NEAR = new RegExp(
  `(?<!\\w)${SEXUAL}(?!\\w)(?:\\W+\\w+){0,8}?\\W+(?<!\\w)${MINOR}(?!\\w)|(?<!\\w)${MINOR}(?!\\w)(?:\\W+\\w+){0,8}?\\W+(?<!\\w)${SEXUAL}(?!\\w)`
);
/** Unambiguous requests; no pairing needed. */
const BLOCKED_DIRECT: RegExp[] = [
  /\b(?:child|kiddie|kid|preteen|pre-teen|underage|minor) ?(?:porn\w*|sex ?video|nudes?|erotica)\b/,
  /\b(?:csam|cp ?porn|lolicon ?porn|loli ?porn|loli ?hentai|shota ?hentai|jailbait ?(?:nude|porn|pics?|photos?))\b/,
  /\b(?:sexual|sex|erotic|nude|naked) (?:story|stories|scene|roleplay|role-play|pics?|pictures?|images?|photos?|content) (?:of|with|about|involving) (?:a |an |the )?(?:child|kid|minor|toddler|infant|baby|preteen|underage)\b/,
  // Sexual deepfakes of real people, and sexual acts with animals: illegal to produce in many places.
  /\b(?:deepfake|face ?swap)\w* (?:porn\w*|nudes?|sex\w*)\b/,
  /\b(?:bestiality|zoophilia|sex with (?:a |an |my )?(?:dog|horse|animal|pet))\b.*\b(?:story|scene|image|picture|photo|video|write|generate|draw|show)\b/,
];

/** True for content that must be refused before any model call. Pure, no network, no settings. */
export function isBlockedPrompt(text: string): boolean {
  const t = normalise(text);
  if (!t) return false;
  if (BLOCKED_DIRECT.some((re) => re.test(t))) return true;
  return MINOR_SEXUAL_NEAR.test(t);
}

// ─── Self-harm: stays on the main model ──────────────────────────────────────

const SELF_HARM =
  /\b(?:suicid\w*|kill(?:ing)? myself|end(?:ing)? my (?:own )?life|take my own life|self[- ]?harm\w*|cut(?:ting)? myself|hurt(?:ing)? myself|want to die|wanna die|don'?t want to (?:live|be alive)|better off dead|overdose on purpose|hang myself)\b/;

// ─── Sensitive: strong signals decide at once, weak ones are borderline ──────

const STRONG: Array<{ category: SensitiveCategory; re: RegExp }> = [
  {
    category: "adult",
    re: new RegExp(
      `\\b(?:nsfw|porn\\w*|erotic\\w*|hentai|xxx|blowjob|handjob|cumshot|orgasm\\w*|masturbat\\w*|fetish\\w*|bdsm|sex scenes?|sex story|sexual fantasy|sexual fantasies|explicit (?:sex|scene|story|content|image|photo|picture|art)|nude (?:photo|picture|image|art|woman|man|model|portrait)s?|naked (?:woman|man|girl|guy|body|people|couple)|topless|dirty talk|sexting|smut|lewd|having sex|make love|making love|love ?making|steamy (?:scene|romance)|seduce|spicy (?:story|scene|romance))\\b`
    ),
  },
  { category: "violence", re: /\b(?:gore|gory|graphic (?:violence|death|murder|torture)|torture scene|dismember\w*|disembowel\w*|decapitat\w*|mutilat\w*|bloodbath|snuff|brutally (?:murder|kill|beat|slaughter)\w*|slasher)\b/ },
  { category: "drugs", re: /\b(?:how (?:to|do i|can i) (?:make|cook|synthesi[sz]e|produce|extract) (?:meth\w*|crack|cocaine|heroin|lsd|mdma|fentanyl|dmt|ecstasy|amphetamine)|(?:meth|mdma|lsd|dmt) (?:synthesis|recipe|dosage|dose)|trip report)\b/ },
];

const WEAK: Array<{ category: SensitiveCategory; re: RegExp }> = [
  { category: "adult", re: /\b(?:sex|sexual\w*|sexy|nude|naked|intimate scene|kinky|horny|romance novel|adult (?:story|content|roleplay)|roleplay)\b/ },
  { category: "violence", re: /\b(?:murder\w*|kill(?:s|ed|ing|er)?|stab\w*|shoot(?:ing|out)?|blood\w*|violen\w*|assault\w*|massacre|war crime\w*|serial killer|abuse\w*|rape\w*)\b/ },
  { category: "drugs", re: /\b(?:drugs?|weed|cannabis|marijuana|cocaine|heroin|meth\w*|lsd|mdma|psychedelic\w*|shrooms|mushrooms|opioid\w*|narcotic\w*|overdose|dosage)\b/ },
  { category: "weapons", re: /\b(?:gun|guns|firearm\w*|rifle|pistol|silencer|suppressor|ammo|ammunition|explosive\w*|bomb\w*|grenade|knife fight|3d[- ]print(?:ed)? gun|ghost gun|lock ?pick\w*)\b/ },
  { category: "dark_fiction", re: /\b(?:dark (?:fiction|story|themes?|fantasy|romance)|villain monologue|morally grey|villain|horror (?:story|scene)|grimdark|dystopi\w*|cult leader)\b/ },
  { category: "controversial", re: /\b(?:racis\w*|nazi\w*|holocaust|genocide|slur\w*|offensive joke\w*|dark humou?r|extremis\w*|terroris\w*|conspiracy|incel|propaganda|abortion|cancel culture)\b/ },
];

// ─── Model pass for borderline text ──────────────────────────────────────────

export const DEFAULT_CLASSIFIER_TIMEOUT_MS = 4000;
const MAX_CLASSIFY_CHARS = 1500;

const CLASSIFIER_SYSTEM =
  "You triage one user message for a chat product. Reply with exactly one word.\n" +
  "ADULT: explicit sexual or erotic content between adults.\n" +
  "VIOLENCE: graphic violence or gore in fiction.\n" +
  "DRUGS: drug questions or how-to that are legal to discuss.\n" +
  "WEAPONS: weapons questions or how-to that are legal to discuss.\n" +
  "DARK: dark fiction themes the usual assistants refuse or tone down.\n" +
  "CONTROVERSIAL: controversial topics the usual assistants refuse or tone down.\n" +
  "SELFHARM: self-harm or suicide.\n" +
  "BLOCKED: sexual content involving anyone under 18, or content that is illegal to produce.\n" +
  "SAFE: anything an ordinary assistant answers normally.\n" +
  "When unsure, answer SAFE.";

const WORD_TO_CATEGORY: Record<string, SensitiveCategory | "safe"> = {
  ADULT: "adult",
  VIOLENCE: "violence",
  DRUGS: "drugs",
  WEAPONS: "weapons",
  DARK: "dark_fiction",
  CONTROVERSIAL: "controversial",
  SELFHARM: "self_harm",
  BLOCKED: "illegal",
  SAFE: "safe",
};

/** Reads the one-word verdict out of a model reply. Null when it says nothing usable. */
export function parseVerdict(reply: string | null | undefined): SensitiveCategory | "safe" | null {
  const word = (reply || "").toUpperCase().match(/\b(ADULT|VIOLENCE|DRUGS|WEAPONS|DARK|CONTROVERSIAL|SELFHARM|BLOCKED|SAFE)\b/)?.[1];
  return word ? WORD_TO_CATEGORY[word] : null;
}

/** The small model call. Returns the raw reply, or null on any failure. */
export type PromptClassifier = (text: string) => Promise<string | null>;

export function classifierEnabled(): boolean {
  return (process.env.SENSITIVE_CLASSIFIER || "").trim() !== "0";
}

export function classifierTimeoutMs(): number {
  const n = Number((process.env.SENSITIVE_CLASSIFIER_TIMEOUT_MS || "").trim());
  return Number.isFinite(n) && n >= 200 ? n : DEFAULT_CLASSIFIER_TIMEOUT_MS;
}

/** SENSITIVE_CLASSIFIER_MODEL, else the everyday chat model. */
function classifierRoute() {
  const override = (process.env.SENSITIVE_CLASSIFIER_MODEL || "").trim();
  return override ? routeFor(override) : chatRoute();
}

/** The default classifier: one short chat completion on a cheap model. Never throws. */
export const modelClassifier: PromptClassifier = async (text) => {
  try {
    const route = classifierRoute();
    if (route.authKind !== "vertex" && !route.apiKey) return null;
    const target = await resolveRouteAuth(route);
    const res = await fetch(`${target.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${target.auth}` },
      body: JSON.stringify({
        model: target.model,
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM },
          { role: "user", content: text.slice(0, MAX_CLASSIFY_CHARS) },
        ],
        max_tokens: 40,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(classifierTimeoutMs()),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
};

export interface ClassifyOptions {
  /** Replaces the model pass (tests). */
  classifier?: PromptClassifier;
  /** False skips the model pass: borderline text is then "not sensitive". */
  modelPass?: boolean;
}

/**
 * Classifies one prompt. Never throws; when anything about the model pass fails the answer is "not sensitive".
 * Blocked wins over everything, self-harm wins over sensitive.
 */
export async function classifyPrompt(text: string, opts: ClassifyOptions = {}): Promise<PromptClassification> {
  const raw = typeof text === "string" ? text : "";
  if (isBlockedPrompt(raw)) return { sensitive: false, blocked: true, category: "minors_or_illegal" };

  const t = normalise(raw);
  if (!t) return { sensitive: false };
  if (SELF_HARM.test(t)) return { sensitive: false, category: "self_harm" };

  const strong = STRONG.find((s) => s.re.test(t));
  if (strong) return { sensitive: true, category: strong.category };

  const weak = WEAK.find((s) => s.re.test(t));
  if (!weak) return { sensitive: false };

  // Borderline: ask the small model, with a safe default when it cannot answer.
  if (opts.modelPass === false || (!opts.classifier && !classifierEnabled())) return { sensitive: false };
  let verdict: SensitiveCategory | "safe" | null = null;
  try {
    verdict = parseVerdict(await (opts.classifier ?? modelClassifier)(raw));
  } catch {
    verdict = null;
  }
  if (!verdict || verdict === "safe") return { sensitive: false };
  if (verdict === "illegal") return { sensitive: false, blocked: true, category: "minors_or_illegal" };
  if (verdict === "self_harm") return { sensitive: false, category: "self_harm" };
  return { sensitive: true, category: verdict };
}

// ─── Venice routing switches ─────────────────────────────────────────────────

/** Used when VENICE_SENSITIVE_MODEL is not set: the first uncensored chat model in Venice's /models list. */
export const DEFAULT_SENSITIVE_CHAT_MODEL = "venice/venice-uncensored-1-2";
export const DEFAULT_SENSITIVE_IMAGE_MODEL = "lustify-v8";
export const DEFAULT_SENSITIVE_IMAGE_MODEL_PRO = "seedream-v5-pro";

export type SensitiveRoutingSetting = "auto" | "off";

/** True when a Venice key exists and the env kill switch (VENICE_SENSITIVE_ROUTING=0) is not thrown. */
export function sensitiveRoutingAvailable(): boolean {
  if ((process.env.VENICE_SENSITIVE_ROUTING || "").trim() === "0") return false;
  return !!apiKeyFor("venice");
}

/** The thread setting. Default is auto; anything but "off" counts as auto. */
export function readSensitiveRoutingSetting(value: unknown): SensitiveRoutingSetting {
  return value === "off" ? "off" : "auto";
}

/** The Venice chat model for sensitive chats, always with the routing prefix. */
export function sensitiveChatModel(): string {
  const raw = (process.env.VENICE_SENSITIVE_MODEL || "").trim();
  if (!raw) return DEFAULT_SENSITIVE_CHAT_MODEL;
  return raw.toLowerCase().startsWith("venice/") ? raw : `venice/${raw}`;
}

export interface SensitiveDecision {
  /** Refuse before any model call. */
  blocked: boolean;
  /** Answer with Venice. Only ever true for an allowed (admin) user with routing available and not turned off. */
  venice: boolean;
  model?: string;
  category?: string;
}

/**
 * The one decision every chat path uses. `isAdmin` is a lazy check so a non-admin user (or routing that is
 * off) never costs the DB query or the classifier call. A blocked prompt is blocked regardless of every setting.
 */
export async function decideChatRouting(opts: {
  text: string;
  isAdmin: () => Promise<boolean> | boolean;
  setting?: SensitiveRoutingSetting | string;
  classify?: (text: string) => Promise<PromptClassification>;
}): Promise<SensitiveDecision> {
  if (isBlockedPrompt(opts.text)) return { blocked: true, venice: false };
  if (!sensitiveRoutingAvailable() || readSensitiveRoutingSetting(opts.setting) === "off") return { blocked: false, venice: false };
  let admin = false;
  try { admin = await opts.isAdmin(); } catch { admin = false; }
  if (!admin) return { blocked: false, venice: false };
  const verdict = await (opts.classify ?? ((t) => classifyPrompt(t)))(opts.text).catch((): PromptClassification => ({ sensitive: false }));
  if (verdict.blocked) return { blocked: true, venice: false };
  if (!verdict.sensitive) return { blocked: false, venice: false, category: verdict.category };
  return { blocked: false, venice: true, model: sensitiveChatModel(), category: verdict.category };
}

// ─── Video hook ──────────────────────────────────────────────────────────────

const VIDEO_PROBE_TTL_MS = 10 * 60_000;
let videoProbe: { at: number; ok: boolean } | null = null;

/** Test seam. */
export function resetVeniceVideoProbeForTests(): void {
  videoProbe = null;
}

/**
 * True when a Venice key exists and its /models?type=video list has at least one model. False when there is no
 * key, the list is empty, or the probe fails. Cached for ten minutes. The video builder calls this to decide
 * whether a sensitive video prompt can go to Venice; it never throws.
 */
export async function isVeniceVideoAvailable(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const key = apiKeyFor("venice");
  if (!key || (process.env.VENICE_SENSITIVE_ROUTING || "").trim() === "0") return false;
  if (videoProbe && Date.now() - videoProbe.at < VIDEO_PROBE_TTL_MS) return videoProbe.ok;
  let ok = false;
  try {
    const res = await fetchImpl(`${veniceBaseUrl()}/models?type=video`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: unknown[] };
      ok = Array.isArray(data.data) && data.data.length > 0;
    }
  } catch {
    ok = false;
  }
  videoProbe = { at: Date.now(), ok };
  return ok;
}
