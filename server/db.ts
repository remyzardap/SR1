import {
  and, desc, eq, gte, inArray, lte, sql
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  InsertUser, users, files, InsertFileRecord,
  receipts, InsertReceipt,
  tasks, InsertTask,
  procurementRequests, InsertProcurementRequest,
  messageLogs, InsertMessageLog,
  payments, InsertPayment,
  identities, type Identity, type InsertIdentity,
  skills, type Skill, type InsertSkill,
  memories, type Memory, type InsertMemory,
  connections, type Connection, type InsertConnection,
  passwordResetTokens,
  businesses, type Business, type InsertBusiness,
  emailVerificationTokens,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByHandle(handle: string) {
  const db = await getDb();
  if (!db) return undefined;
  const identity = await db.select().from(identities).where(eq(identities.handle, handle.toLowerCase())).limit(1);
  if (!identity[0]) return undefined;
  const result = await db.select().from(users).where(eq(users.id, identity[0].userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setUserPasswordHash(openId: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ passwordHash }).where(eq(users.openId, openId));
}

export async function setUserTotpSecret(userId: number, secret: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ totpSecret: secret }).where(eq(users.id, userId));
}

export async function setUserTotpEnabled(userId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ totpEnabled: enabled }).where(eq(users.id, userId));
}

export async function markUserOnboarded(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ onboarded: true }).where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

// ─── Files ────────────────────────────────────────────────────────────────────

export async function createFile(data: InsertFileRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(files).values(data);
  return result;
}

export async function getFilesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(files).where(eq(files.userId, userId)).orderBy(files.createdAt);
}

export async function getFileById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const file = result[0];
  if (!file || file.userId !== userId) return undefined;
  return file;
}

export async function renameFile(id: number, userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(files).set({ name }).where(eq(files.id, id));
}

export async function deleteFile(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const file = await getFileById(id, userId);
  if (!file) throw new Error("File not found or access denied");
  await db.delete(files).where(eq(files.id, id));
  return file;
}

export async function moveFileToSpace(id: number, userId: number, spaceId: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { files } = await import("../drizzle/schema");
  await db.update(files).set({ spaceId }).where(and(eq(files.id, id), eq(files.userId, userId)));
}

export async function setFileTrashed(id: number, userId: number, trashed: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { files } = await import("../drizzle/schema");
  await db.update(files)
    .set({ trashed, trashedAt: trashed ? new Date() : null })
    .where(and(eq(files.id, id), eq(files.userId, userId)));
}

export async function getFilesCountByUser(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`count(*)` }).from(files).where(eq(files.userId, userId));
  return Number(result[0]?.count ?? 0);
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

export async function createReceipt(data: InsertReceipt) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(receipts).values(data);
  const result = await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(1);
  return result[0];
}

export async function getReceipts(filters?: { status?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(receipts.status, filters.status as any));
  return db
    .select()
    .from(receipts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(receipts.createdAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
}

export async function getReceiptById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
  return result[0];
}

export async function updateReceipt(id: number, data: Partial<InsertReceipt>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(receipts).set({ ...data, updatedAt: new Date() }).where(eq(receipts.id, id));
  return getReceiptById(id);
}

export async function deleteReceipt(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(receipts).where(eq(receipts.id, id));
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function createTask(data: InsertTask) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(tasks).values(data);
  const result = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).limit(1);
  return result[0];
}

export async function getTasks(filters?: { status?: string; category?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(tasks.status, filters.status as any));
  if (filters?.category) conditions.push(eq(tasks.category, filters.category));
  return db
    .select()
    .from(tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result[0];
}

export async function updateTask(id: number, data: Partial<InsertTask>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set({ ...data, updatedAt: new Date() }).where(eq(tasks.id, id));
  return getTaskById(id);
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(tasks).where(eq(tasks.id, id));
}

// ─── Procurement ──────────────────────────────────────────────────────────────

export async function createProcurement(data: InsertProcurementRequest) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(procurementRequests).values(data);
  const result = await db.select().from(procurementRequests).orderBy(desc(procurementRequests.createdAt)).limit(1);
  return result[0];
}

export async function getProcurements(filters?: { status?: string; limit?: number; offset?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status) conditions.push(eq(procurementRequests.status, filters.status as any));
  return db
    .select()
    .from(procurementRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(procurementRequests.createdAt))
    .limit(filters?.limit ?? 50)
    .offset(filters?.offset ?? 0);
}

export async function getProcurementById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(procurementRequests).where(eq(procurementRequests.id, id)).limit(1);
  return result[0];
}

export async function updateProcurement(id: number, data: Partial<InsertProcurementRequest>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(procurementRequests).set({ ...data, updatedAt: new Date() }).where(eq(procurementRequests.id, id));
  return getProcurementById(id);
}

export async function deleteProcurement(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(procurementRequests).where(eq(procurementRequests.id, id));
}

// ─── Message Logs ─────────────────────────────────────────────────────────────

export async function createMessageLog(data: InsertMessageLog) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(messageLogs).values(data);
  const result = await db.select().from(messageLogs).orderBy(desc(messageLogs.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function getMessageLogs(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(messageLogs).orderBy(desc(messageLogs.createdAt)).limit(limit);
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getMonthlyExpenseSummary(year: number, month: number) {
  const db = await getDb();
  if (!db) return { total: 0, byCategory: [] as { category: string; amount: number }[], entries: [] as any[] };
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const entries = await db
    .select()
    .from(receipts)
    .where(and(gte(receipts.createdAt, startDate), lte(receipts.createdAt, endDate), sql`${receipts.status} != 'rejected'`))
    .orderBy(desc(receipts.createdAt));
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    const amt = parseFloat(entry.amount ?? "0");
    total += amt;
    const cat = entry.category ?? "Uncategorized";
    byCategory[cat] = (byCategory[cat] ?? 0) + amt;
  }
  return {
    total,
    byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
    entries,
  };
}

export async function getMonthlyTrend(months = 6) {
  const db = await getDb();
  if (!db) return [];
  const results = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const summary = await getMonthlyExpenseSummary(d.getFullYear(), d.getMonth() + 1);
    results.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString("default", { month: "short", year: "numeric" }), total: summary.total });
  }
  return results;
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalReceipts: 0, needsReview: 0, openTasks: 0, openProcurements: 0, thisMonthExpenses: 0 };
  const now = new Date();
  const [totalReceipts, needsReview, openTasks, openProcurements, monthSummary] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(receipts),
    db.select({ count: sql<number>`count(*)` }).from(receipts).where(eq(receipts.status, "needs_review")),
    db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.status, "open")),
    db.select({ count: sql<number>`count(*)` }).from(procurementRequests).where(eq(procurementRequests.status, "open")),
    getMonthlyExpenseSummary(now.getFullYear(), now.getMonth() + 1),
  ]);
  return {
    totalReceipts: Number(totalReceipts[0]?.count ?? 0),
    needsReview: Number(needsReview[0]?.count ?? 0),
    openTasks: Number(openTasks[0]?.count ?? 0),
    openProcurements: Number(openProcurements[0]?.count ?? 0),
    thisMonthExpenses: monthSummary.total,
  };
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function createPayment(data: InsertPayment) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(payments).values(data);
  const result = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(1);
  return result[0];
}

export async function getPaymentsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt));
}

export async function getReceiptsNeedingReview() {
  return getReceipts({ status: "needs_review" });
}

export async function countReceiptsByStatus() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ status: receipts.status, count: sql<number>`count(*)` })
    .from(receipts)
    .groupBy(receipts.status);
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function getAllUsersWithStats() {
  const db = await getDb();
  if (!db) return [];

  const allUsers = await db.select().from(users);

  const results = await Promise.all(
    allUsers.map(async (user) => {
      const fileCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(files)
        .where(eq(files.userId, user.id));

      return {
        ...user,
        filesGenerated: Number(fileCount[0]?.count ?? 0),
      };
    })
  );

  return results;
}

// ─── Sutaeru: Identity helpers ───────────────────────────────────────────────────

export async function getIdentityByUserId(userId: number): Promise<Identity | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(identities).where(eq(identities.userId, userId)).limit(1);
  return result[0] ?? null;
}

export async function getOrCreateIdentity(userId: number): Promise<Identity | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await getIdentityByUserId(userId);
  if (existing) return existing;
  await db.insert(identities).values({ userId });
  return getIdentityByUserId(userId);
}

export async function upsertIdentity(
  userId: number,
  data: Partial<Pick<InsertIdentity, "handle" | "displayName" | "bio" | "avatarUrl" | "personalityTraits" | "primaryLanguage" | "notificationPrefs">>
): Promise<Identity | null> {
  const db = await getDb();
  if (!db) return null;
  await getOrCreateIdentity(userId);
  await db.update(identities).set(data).where(eq(identities.userId, userId));
  return getIdentityByUserId(userId);
}

export async function getIdentityByHandle(handle: string): Promise<Identity | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(identities).where(eq(identities.handle, handle)).limit(1);
  return result[0] ?? null;
}

// ─── Sutaeru: Skills helpers ─────────────────────────────────────────────────────

export async function getSkillsByIdentity(identityId: number): Promise<Skill[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(skills).where(eq(skills.identityId, identityId)).orderBy(desc(skills.createdAt));
}

export async function createSkill(data: InsertSkill): Promise<Skill | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(skills).values(data);
  const result = await db.select().from(skills).where(eq(skills.identityId, data.identityId)).orderBy(desc(skills.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function deleteSkill(id: number, identityId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(skills).where(and(eq(skills.id, id), eq(skills.identityId, identityId)));
}

export async function incrementSkillUsage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(skills).set({ usageCount: sql`${skills.usageCount} + 1` }).where(eq(skills.id, id));
}

// ─── Sutaeru: Memories helpers ───────────────────────────────────────────────────

export async function getMemoriesByIdentity(
  identityId: number,
  type?: Memory["type"]
): Promise<Memory[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(memories).where(
    type
      ? and(eq(memories.identityId, identityId), eq(memories.type, type))
      : eq(memories.identityId, identityId)
  ).orderBy(desc(memories.createdAt));
  return rows;
}

export async function createMemory(data: InsertMemory): Promise<Memory | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(memories).values(data);
  const result = await db.select().from(memories).where(eq(memories.identityId, data.identityId)).orderBy(desc(memories.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function deleteMemory(id: number, identityId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(memories).where(and(eq(memories.id, id), eq(memories.identityId, identityId)));
}

// ─── Sutaeru: Connections helpers ────────────────────────────────────────────────

export async function getConnectionsByIdentity(identityId: number): Promise<Connection[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(connections).where(eq(connections.identityId, identityId)).orderBy(desc(connections.createdAt));
}

export async function addConnection(data: InsertConnection): Promise<Connection | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(connections).values(data);
  const result = await db.select().from(connections).where(eq(connections.identityId, data.identityId)).orderBy(desc(connections.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function revokeConnection(id: number, identityId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(connections).set({ status: "revoked" }).where(and(eq(connections.id, id), eq(connections.identityId, identityId)));
}

export async function getConnectionById(id: number, identityId: number): Promise<Connection | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(connections).where(and(eq(connections.id, id), eq(connections.identityId, identityId))).limit(1);
  return result[0] ?? null;
}
export async function getActiveConnectionByProvider(
  identityId: number,
  provider: string
): Promise<Connection | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(connections).where(
    and(
      eq(connections.identityId, identityId),
      eq(connections.provider, provider),
      eq(connections.status, "active")
    )
  ).limit(1);
  return result[0] ?? null;
}

// ─── Sutaeru: Public skills discovery ───────────────────────────────────────────
export async function getPublicSkills() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      type: skills.type,
      content: skills.content,
      sourceModel: skills.sourceModel,
      identityId: skills.identityId,
      ownerHandle: identities.handle,
    })
    .from(skills)
    .innerJoin(identities, eq(skills.identityId, identities.id))
    .where(eq(skills.isPublic, true))
    .orderBy(desc(skills.usageCount));
}

export async function getPublicSkillsByHandle(handle: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      type: skills.type,
      content: skills.content,
      sourceModel: skills.sourceModel,
      identityId: skills.identityId,
      ownerHandle: identities.handle,
      usageCount: skills.usageCount,
    })
    .from(skills)
    .innerJoin(identities, eq(skills.identityId, identities.id))
    .where(and(eq(skills.isPublic, true), eq(identities.handle, handle)))
    .orderBy(desc(skills.usageCount));
}

export async function getSkillById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
  return result[0] || null;
}

export async function cloneSkillToIdentity(skillId: number, targetIdentityId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const originalSkill = await getSkillById(skillId);
  if (!originalSkill) throw new Error("Skill not found");
  if (!originalSkill.isPublic) throw new Error("Skill is not public");
  const { id, identityId, createdAt, updatedAt, usageCount, ...skillData } = originalSkill;
  await db.insert(skills).values({
    ...skillData,
    identityId: targetIdentityId,
    isPublic: false,
  });
}


// ─── Auth: Email Verification Token helpers ─────────────────────────────────────────

export async function createEmailVerificationToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remove any existing tokens for this user first
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));
  return db.insert(emailVerificationTokens).values({ id: crypto.randomUUID(), userId, token, expiresAt });
}

export async function getEmailVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
  return result[0];
}

export async function deleteEmailVerificationToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.token, token));
}

export async function markEmailVerified(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, userId));
}

// ─── Auth: Password Reset Token helpers ───────────────────────────────────────────────

export async function createPasswordResetToken(userId: number, token: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(passwordResetTokens).values({ id: crypto.randomUUID(), userId, token, expiresAt });
  return result;
}

export async function getPasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).limit(1);
  return result[0];
}

export async function deletePasswordResetToken(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
}

// ─── Businesses ───────────────────────────────────────────────────────────────

export async function getBusinessesByUser(userId: number): Promise<Business[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(businesses).where(eq(businesses.ownerId, userId)).orderBy(desc(businesses.createdAt));
}

export async function getBusinessById(id: number, userId: number): Promise<Business | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(businesses).where(and(eq(businesses.id, id), eq(businesses.ownerId, userId))).limit(1);
  return result[0] ?? null;
}

export async function createBusiness(data: InsertBusiness): Promise<Business | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(businesses).values(data);
  const result = await db.select().from(businesses).where(eq(businesses.ownerId, data.ownerId)).orderBy(desc(businesses.createdAt)).limit(1);
  return result[0] ?? null;
}

export async function updateBusiness(id: number, userId: number, data: Partial<InsertBusiness>): Promise<Business | null> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(businesses).set({ ...data, updatedAt: new Date() }).where(and(eq(businesses.id, id), eq(businesses.ownerId, userId)));
  return getBusinessById(id, userId);
}

export async function deleteBusiness(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(businesses).where(and(eq(businesses.id, id), eq(businesses.ownerId, userId)));
}


// ─── Chat Sessions ─────────────────────────────────────────────────────────────
export async function listChatSessions(userId: number, spaceId?: string) {
  const db = await getDb();
  if (!db) return [];
  const { chatSessions } = await import("../drizzle/schema");
  const where = spaceId
    ? and(eq(chatSessions.userId, userId), eq(chatSessions.spaceId, spaceId))
    : eq(chatSessions.userId, userId);
  return db.select().from(chatSessions)
    .where(where)
    .orderBy(desc(chatSessions.lastMessageAt));
}

export async function getChatSessionForUser(sessionId: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { chatSessions } = await import("../drizzle/schema");
  const [session] = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);
  return session;
}

export async function updateChatSessionSpace(sessionId: string, userId: number, spaceId: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { chatSessions } = await import("../drizzle/schema");
  await db.update(chatSessions)
    .set({ spaceId })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
}

export async function createSpace(userId: number, name: string, description?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { spaces } = await import("../drizzle/schema");
  const id = crypto.randomUUID();
  await db.insert(spaces).values({ id, userId, name: name.slice(0, 255), description: description || null });
  return id;
}

export async function listSpaces(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { spaces } = await import("../drizzle/schema");
  return db.select().from(spaces).where(eq(spaces.userId, userId)).orderBy(spaces.name);
}

export async function getSpace(id: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { spaces } = await import("../drizzle/schema");
  const rows = await db.select().from(spaces).where(eq(spaces.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return undefined;
  return row;
}

export async function updateSpace(id: string, userId: number, updates: { name?: string; description?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { spaces } = await import("../drizzle/schema");
  await db.update(spaces)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(spaces.id, id), eq(spaces.userId, userId)));
}

export async function deleteSpace(id: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { spaces, chatSessions } = await import("../drizzle/schema");
  await db.update(chatSessions).set({ spaceId: null }).where(eq(chatSessions.spaceId, id));
  await db.delete(spaces).where(and(eq(spaces.id, id), eq(spaces.userId, userId)));
}

export async function getChatSessionMessages(sessionId: string) {
  const db = await getDb();
  if (!db) return [];
  const { chatMessages } = await import("../drizzle/schema");
  const { asc } = await import("drizzle-orm");
  return db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));
}

export async function createChatSession(userId: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { chatSessions } = await import("../drizzle/schema");
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(chatSessions).values({
    id,
    userId,
    title: title.slice(0, 255),
    lastMessageAt: now,
  });
  return id;
}

export async function updateChatSessionTitle(sessionId: string, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { chatSessions } = await import("../drizzle/schema");
  await db.update(chatSessions)
    .set({ title: title.slice(0, 255) })
    .where(eq(chatSessions.id, sessionId));
}

export async function deleteChatSession(sessionId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { chatSessions, chatMessages } = await import("../drizzle/schema");
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  await db.delete(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
}

export async function searchChatMessages(userId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const { chatMessages, chatSessions } = await import("../drizzle/schema");
  const { like, or, and, asc, isNotNull, desc } = await import("drizzle-orm");
  const sessions = await db.select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.userId, userId));
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return [];

  // Try semantic search via embeddings if Gemini is configured
  const { isVectorSearchConfigured, embed } = await import("./services/vectorSearch");
  if (isVectorSearchConfigured()) {
    try {
      const queryVector = await embed(query);
      const candidates = await db
        .select()
        .from(chatMessages)
        .where(and(inArray(chatMessages.sessionId, sessionIds), isNotNull(chatMessages.embedding)))
        .orderBy(desc(chatMessages.createdAt))
        .limit(200);

      const scored = candidates
        .map((m) => {
          const vector = (m.embedding ?? []) as number[];
          if (!vector.length) return null;
          return { message: m, score: cosineSimilarity(queryVector, vector) };
        })
        .filter((x): x is { message: typeof candidates[0]; score: number } => x !== null && x.score > 0.6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      if (scored.length > 0) {
        return scored.map((s) => ({ ...s.message, similarity: s.score }));
      }
    } catch (err) {
      console.warn("[searchChatMessages] embedding search failed, falling back to LIKE:", err);
    }
  }

  // Fallback to substring search
  const q = `%${query}%`;
  return db.select().from(chatMessages)
    .where(
      and(
        inArray(chatMessages.sessionId, sessionIds),
        or(like(chatMessages.content, q))
      )
    )
    .orderBy(asc(chatMessages.createdAt))
    .limit(50);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function updateChatSessionLastMessageAt(sessionId: string) {
  const db = await getDb();
  if (!db) return;
  const { chatSessions } = await import("../drizzle/schema");
  await db.update(chatSessions)
    .set({ lastMessageAt: Date.now() })
    .where(eq(chatSessions.id, sessionId));
}

export async function addChatMessage(sessionId: string, userId: number, content: string, role: string, model?: string, settings?: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { chatMessages } = await import("../drizzle/schema");
  const id = crypto.randomUUID();

  // Generate embedding for semantic search (best-effort; don't block chat on failure)
  let embedding: number[] | undefined;
  try {
    const { isVectorSearchConfigured, embed } = await import("./services/vectorSearch");
    if (isVectorSearchConfigured() && content.trim()) {
      embedding = await embed(content);
    }
  } catch (err) {
    console.warn("[addChatMessage] failed to generate embedding:", err);
  }

  await db.insert(chatMessages).values({
    id,
    sessionId,
    userId,
    content,
    role,
    model: model || null,
    settings: settings ?? {},
    embedding,
    createdAt: new Date(),
  });
  await updateChatSessionLastMessageAt(sessionId);
  return id;
}

export async function getChatSessionSettings(sessionId: string, userId: number): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) return {};
  const { chatSessions } = await import("../drizzle/schema");
  const rows = await db.select({ settings: chatSessions.settings, userId: chatSessions.userId }).from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return {};
  return (row.settings as Record<string, unknown>) ?? {};
}

export async function updateChatSessionSettings(sessionId: string, userId: number, settings: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { chatSessions } = await import("../drizzle/schema");
  await db.update(chatSessions)
    .set({ settings })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
}

// ─── Memory Full-Text Search ──────────────────────────────────────────────────
export interface SearchFilters {
  dateRange?: { start?: number; end?: number };
  agentId?: string;
  tags?: string[];
  source?: ("chat" | "memory")[];
}

export interface SearchResult {
  id: string;
  content: string;
  title?: string;
  source: "chat" | "memory";
  createdAt: number;
  agentId?: string;
  tags?: string[];
  relevanceScore: number;
  highlights: string[];
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  includeContent?: boolean;
}

function extractHighlights(content: string, query: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const highlights: string[] = [];
  const contentLower = content.toLowerCase();
  for (const term of terms) {
    const index = contentLower.indexOf(term);
    if (index !== -1) {
      const start = Math.max(0, index - 50);
      const end = Math.min(content.length, index + term.length + 50);
      let snippet = content.slice(start, end);
      if (start > 0) snippet = "..." + snippet;
      if (end < content.length) snippet = snippet + "...";
      highlights.push(snippet);
    }
  }
  return highlights.slice(0, 3);
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + "...";
}

export async function searchMemories(
  identityId: number,
  query: string,
  filters: SearchFilters = {},
  options: SearchOptions = {}
): Promise<{ results: SearchResult[]; total: number }> {
  const { limit = 20, offset = 0, includeContent = true } = options;
  const { source = ["chat", "memory"] } = filters;

  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return { results: [], total: 0 };

  const db = await getDb();
  if (!db) return { results: [], total: 0 };

  const results: SearchResult[] = [];
  let totalCount = 0;

  if (source.includes("memory")) {
    const memRows = await db.execute(
      sql`SELECT id, title, content, createdAt, tags
          FROM memories
          WHERE identityId = ${identityId}
            AND MATCH(content) AGAINST(${trimmedQuery} IN NATURAL LANGUAGE MODE)
          ORDER BY MATCH(content) AGAINST(${trimmedQuery} IN NATURAL LANGUAGE MODE) DESC
          LIMIT ${limit} OFFSET ${offset}`
    );
    const countRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM memories
          WHERE identityId = ${identityId}
            AND MATCH(content) AGAINST(${trimmedQuery} IN NATURAL LANGUAGE MODE)`
    );
    totalCount += Number(((countRows as unknown as { rows: Record<string, unknown>[] }).rows?.[0])?.cnt ?? 0);
    for (const row of (memRows as unknown as { rows: Record<string, unknown>[] }).rows ?? []) {
      const content = String(row.content ?? "");
      results.push({
        id: String(row.id),
        content: includeContent ? content : truncateContent(content, 200),
        title: row.title ? String(row.title) : undefined,
        source: "memory",
        createdAt: Number(row.createdAt),
        tags: row.tags ? JSON.parse(String(row.tags)) : undefined,
        relevanceScore: 1,
        highlights: extractHighlights(content, trimmedQuery),
      });
    }
  }

  if (source.includes("chat")) {
    const chatRows = await db.execute(
      sql`SELECT id, content, createdAt
          FROM chat_messages
          WHERE userId = ${identityId}
            AND MATCH(content) AGAINST(${trimmedQuery} IN NATURAL LANGUAGE MODE)
          ORDER BY MATCH(content) AGAINST(${trimmedQuery} IN NATURAL LANGUAGE MODE) DESC
          LIMIT ${limit} OFFSET ${offset}`
    );
    const countRows = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM chat_messages
          WHERE userId = ${identityId}
            AND MATCH(content) AGAINST(${trimmedQuery} IN NATURAL LANGUAGE MODE)`
    );
    totalCount += Number(((countRows as unknown as { rows: Record<string, unknown>[] }).rows?.[0])?.cnt ?? 0);
    for (const row of (chatRows as unknown as { rows: Record<string, unknown>[] }).rows ?? []) {
      const content = String(row.content ?? "");
      results.push({
        id: String(row.id),
        content: includeContent ? content : truncateContent(content, 200),
        source: "chat",
        createdAt: Number(row.createdAt),
        relevanceScore: 1,
        highlights: extractHighlights(content, trimmedQuery),
      });
    }
  }

  results.sort((a, b) => b.createdAt - a.createdAt);
  return { results: results.slice(0, limit), total: totalCount };
}
