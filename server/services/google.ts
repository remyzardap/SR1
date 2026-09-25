import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { googleTokens } from "../../drizzle/schema";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(): Promise<DbClient> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

function deriveKey(): Buffer | null {
  if (!ENCRYPTION_KEY) return null;
  return crypto.scryptSync(ENCRYPTION_KEY, "sutaeru-google-tokens", 32);
}

function encryptToken(plaintext: string): string {
  const key = deriveKey();
  if (!key) return plaintext;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["enc", iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptToken(ciphertext: string): string {
  if (!ciphertext.startsWith("enc:")) return ciphertext;
  const key = deriveKey();
  if (!key) return ciphertext;
  const parts = ciphertext.split(":");
  if (parts.length !== 4) return ciphertext;
  const [, ivB64, authTagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf-8");
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || getDefaultRedirectUri();

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getDefaultRedirectUri(): string {
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}/api/google/callback`;
  return "http://localhost:5000/api/google/callback";
}

const oauthStateStore = new Map<string, { userId: number; expiresAt: number }>();

export function getAuthUrl(userId: number): { url: string; state: string } {
  const state = crypto.randomBytes(32).toString("hex");
  oauthStateStore.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });

  for (const [key, val] of oauthStateStore) {
    if (val.expiresAt < Date.now()) oauthStateStore.delete(key);
  }

  const oauth2Client = getOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
  return { url, state };
}

export function validateOAuthState(state: string): number | null {
  const entry = oauthStateStore.get(state);
  if (!entry || entry.expiresAt < Date.now()) {
    oauthStateStore.delete(state);
    return null;
  }
  oauthStateStore.delete(state);
  return entry.userId;
}

export async function exchangeCodeForTokens(code: string, userId: number) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to get tokens from Google");
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  const db = await requireDb();
  const existing = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).limit(1);

  const tokenData = {
    userId,
    email: profile.email || null,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: encryptToken(tokens.refresh_token),
    expiresAt: new Date(tokens.expiry_date || Date.now() + 3600000),
    scopes: SCOPES.join(" "),
  };

  if (existing.length > 0) {
    await db.update(googleTokens).set({ ...tokenData, updatedAt: new Date() }).where(eq(googleTokens.userId, userId));
  } else {
    await db.insert(googleTokens).values(tokenData);
  }

  return { email: profile.email };
}

async function getAuthenticatedClient(userId: number) {
  const db = await requireDb();
  const [token] = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).limit(1);

  if (!token) throw new Error("Google account not connected");

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decryptToken(token.accessToken),
    refresh_token: decryptToken(token.refreshToken),
    expiry_date: token.expiresAt.getTime(),
  });

  if (token.expiresAt.getTime() < Date.now() + 60000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (credentials.access_token) updates.accessToken = credentials.access_token;
      if (credentials.refresh_token) updates.refreshToken = credentials.refresh_token;
      if (credentials.expiry_date) updates.expiresAt = new Date(credentials.expiry_date);
      await db.update(googleTokens).set(updates).where(eq(googleTokens.userId, userId));
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      throw new Error("Google token expired. Please reconnect your account.");
    }
  }

  oauth2Client.on("tokens", async (newTokens) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (newTokens.access_token) updates.accessToken = newTokens.access_token;
    if (newTokens.refresh_token) updates.refreshToken = newTokens.refresh_token;
    if (newTokens.expiry_date) updates.expiresAt = new Date(newTokens.expiry_date);
    await db.update(googleTokens).set(updates).where(eq(googleTokens.userId, userId));
  });

  return oauth2Client;
}

export async function getConnectionStatus(userId: number) {
  const db = await requireDb();
  const [token] = await db.select().from(googleTokens).where(eq(googleTokens.userId, userId)).limit(1);
  if (!token) return { connected: false, email: null };
  return { connected: true, email: token.email };
}

export async function disconnect(userId: number) {
  const db = await requireDb();
  try {
    const auth = await getAuthenticatedClient(userId);
    await auth.revokeCredentials();
  } catch {}
  await db.delete(googleTokens).where(eq(googleTokens.userId, userId));
}

export async function listEmails(userId: number, maxResults = 10, query?: string) {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: query || "in:inbox",
  });

  if (!data.messages || data.messages.length === 0) return [];

  const emails = await Promise.all(
    data.messages.map(async (msg) => {
      const { data: detail } = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date", "To"],
      });

      const headers = detail.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || "";

      return {
        id: detail.id,
        threadId: detail.threadId,
        snippet: detail.snippet,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        to: getHeader("To"),
        date: getHeader("Date"),
        labelIds: detail.labelIds,
        isUnread: detail.labelIds?.includes("UNREAD") || false,
      };
    })
  );

  return emails;
}

export async function getEmailContent(userId: number, messageId: string) {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = data.payload?.headers || [];
  const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || "";

  let body = "";
  if (data.payload?.body?.data) {
    body = Buffer.from(data.payload.body.data, "base64url").toString("utf-8");
  } else if (data.payload?.parts) {
    const textPart = data.payload.parts.find((p) => p.mimeType === "text/plain");
    const htmlPart = data.payload.parts.find((p) => p.mimeType === "text/html");
    const part = textPart || htmlPart;
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }

  return {
    id: data.id,
    threadId: data.threadId,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    to: getHeader("To"),
    date: getHeader("Date"),
    body,
    snippet: data.snippet,
  };
}

export async function sendEmail(userId: number, to: string, subject: string, body: string) {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\n");

  const encodedMessage = Buffer.from(message).toString("base64url");

  const { data } = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  return { id: data.id, threadId: data.threadId };
}

export async function listCalendarEvents(userId: number, maxResults = 10, timeMin?: string) {
  const auth = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const { data } = await calendar.events.list({
    calendarId: "primary",
    maxResults,
    timeMin: timeMin || new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (data.items || []).map((event) => ({
    id: event.id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    htmlLink: event.htmlLink,
    status: event.status,
    attendees: event.attendees?.map((a) => ({ email: a.email, responseStatus: a.responseStatus })),
  }));
}

export async function createCalendarEvent(
  userId: number,
  summary: string,
  startTime: string,
  endTime: string,
  description?: string,
  location?: string,
  attendees?: string[]
) {
  const auth = await getAuthenticatedClient(userId);
  const calendar = google.calendar({ version: "v3", auth });

  const { data } = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description,
      location,
      start: { dateTime: startTime, timeZone: "UTC" },
      end: { dateTime: endTime, timeZone: "UTC" },
      attendees: attendees?.map((email) => ({ email })),
    },
  });

  return {
    id: data.id,
    summary: data.summary,
    htmlLink: data.htmlLink,
    start: data.start?.dateTime,
    end: data.end?.dateTime,
  };
}

export async function listDriveFiles(userId: number, maxResults = 10, query?: string) {
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: "v3", auth });

  const q = query
    ? `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : "trashed = false";

  const { data } = await drive.files.list({
    pageSize: maxResults,
    q,
    fields: "files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, owners)",
    orderBy: "modifiedTime desc",
  });

  return (data.files || []).map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink,
    iconLink: file.iconLink,
    owner: file.owners?.[0]?.emailAddress,
  }));
}

export async function createDriveFolder(userId: number, name: string, parentId?: string) {
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const metadata: any = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) metadata.parents = [parentId];
  const { data } = await drive.files.create({ requestBody: metadata, fields: "id, name, webViewLink" });
  return { id: data.id, name: data.name, webViewLink: data.webViewLink };
}

export async function uploadDriveFile(userId: number, name: string, mimeType: string, buffer: Buffer, parentId?: string) {
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const metadata: any = { name };
  if (parentId) metadata.parents = [parentId];
  const { data } = await drive.files.create({
    requestBody: metadata,
    media: { mimeType, body: buffer },
    fields: "id, name, mimeType, size, webViewLink",
  });
  return { id: data.id, name: data.name, mimeType: data.mimeType, size: data.size, webViewLink: data.webViewLink };
}

export async function moveDriveFile(userId: number, fileId: string, newParentId: string, previousParentId?: string) {
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  if (previousParentId) {
    await drive.files.update({ fileId, removeParents: previousParentId });
  }
  await drive.files.update({ fileId, addParents: newParentId });
  return { success: true };
}

export async function readDriveFile(userId: number, fileId: string): Promise<{ name?: string; mimeType?: string; text: string }> {
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const { data: meta } = await drive.files.get({ fileId, fields: "name, mimeType" });
  const isGoogleDoc = meta.mimeType?.startsWith("application/vnd.google-apps.");
  if (isGoogleDoc) {
    const { data } = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
    return { name: meta.name ?? undefined, mimeType: meta.mimeType ?? undefined, text: String(data) };
  }
  const { data } = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
  return { name: meta.name ?? undefined, mimeType: meta.mimeType ?? undefined, text: String(data) };
}

export async function updateDriveFile(userId: number, fileId: string, buffer: Buffer, mimeType: string) {
  const auth = await getAuthenticatedClient(userId);
  const drive = google.drive({ version: "v3", auth });
  const { data } = await drive.files.update({
    fileId,
    media: { mimeType, body: buffer },
    fields: "id, name, mimeType, size, modifiedTime",
  });
  return { id: data.id, name: data.name, modifiedTime: data.modifiedTime };
}

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
