/**
 * Admin-facing user accounts (T-84).
 *
 * An admin creates an account, hands over the one-time password out-of-band, and the new holder has
 * to replace it before the account can do anything (see the gate in server/_core/trpc.ts).
 *
 * Gating uses a local assertAdmin instead of adminProcedure because that is what the rest of the
 * admin surface does (admin.userStats, routers/betaInvites.ts throw "Admin access required"). Every
 * procedure here is a protectedProcedure, so the authentication, disabled-account and
 * must-change-password gates all run before this code does.
 *
 * A password is returned from exactly two places — create and resetPassword — exactly once, to the
 * admin who asked. It is never written to the database, to audit_logs or to any log.
 */
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { AuditActions, type User } from "../../drizzle/schema";
import { generateOneTimePassword } from "../lib/oneTimePassword";
import { protectedProcedure, router } from "../_core/trpc";
import {
  countActiveAdmins,
  createManagedUser,
  getUserByEmailIgnoreCase,
  getUserById,
  listManagedUsers,
  setUserDisabledAt,
  updateUserPassword,
} from "../db";
import { logAuditEvent } from "../middleware/audit-logging";

const BCRYPT_COST = 12;
const OPEN_ID_PREFIX = "local:";

function assertAdmin(ctx: { user: Pick<User, "role"> }) {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

// The target of a state change has to exist before we write anything; the id came from a client.
async function requireTargetUser(id: number) {
  const target = await getUserById(id);
  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }
  return target;
}

export const adminUsersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx);
    const rows = await listManagedUsers();
    return rows.map((row) => ({ ...row, disabled: row.disabledAt !== null }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        email: z.string().trim().min(1).email(),
        name: z.string().trim().min(1).max(200).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const email = input.email.toLowerCase();

      // users.email has no unique index, so the check has to be part of this procedure. Two admins
      // racing on the same address can still both pass it; the second one writes a duplicate row
      // rather than corrupting an account, and de-duplicating the column is out of scope here.
      if (await getUserByEmailIgnoreCase(email)) {
        await logAuditEvent({
          userId: String(ctx.user.id),
          action: AuditActions.USER_CREATE,
          resourceType: "user",
          severity: "warn",
          status: "failure",
          errorMessage: "A user with that email already exists",
        });
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with that email already exists",
        });
      }

      const oneTimePassword = generateOneTimePassword();
      const passwordHash = await bcrypt.hash(oneTimePassword, BCRYPT_COST);
      const created = await createManagedUser({
        openId: `${OPEN_ID_PREFIX}${nanoid(21)}`,
        email,
        name: input.name ?? null,
        passwordHash,
      });
      if (!created) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
      }

      await logAuditEvent({
        userId: String(ctx.user.id),
        action: AuditActions.USER_CREATE,
        resourceType: "user",
        resourceId: String(created.id),
        changes: { role: created.role, mustChangePassword: true },
      });

      return {
        id: created.id,
        email: created.email,
        name: created.name,
        role: created.role,
        mustChangePassword: true,
        oneTimePassword,
      };
    }),

  resetPassword: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const target = await requireTargetUser(input.id);

      // An admin replacing their own password is a login-flow concern (auth.changePassword); going
      // through this door would let an admin lock the account they are signed in as, so the intent
      // of the click is never "reset the password I am using right now".
      if (target.id === ctx.user.id) {
        await logAuditEvent({
          userId: String(ctx.user.id),
          action: AuditActions.USER_PASSWORD_RESET,
          resourceType: "user",
          resourceId: String(target.id),
          severity: "warn",
          status: "failure",
          errorMessage: "Cannot reset your own password",
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot reset your own password",
        });
      }

      const oneTimePassword = generateOneTimePassword();
      const passwordHash = await bcrypt.hash(oneTimePassword, BCRYPT_COST);
      // Hash and flag in one write: the new password must never be usable without being changed.
      await updateUserPassword(target.id, passwordHash, true);

      await logAuditEvent({
        userId: String(ctx.user.id),
        action: AuditActions.USER_PASSWORD_RESET,
        resourceType: "user",
        resourceId: String(target.id),
        changes: { mustChangePassword: true },
      });

      return { id: target.id, oneTimePassword };
    }),

  setDisabled: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), disabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx);
      const target = await requireTargetUser(input.id);

      if (target.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot switch off your own account",
        });
      }

      if (input.disabled && target.role === "admin" && (await countActiveAdmins()) <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot switch off the last active administrator",
        });
      }

      await setUserDisabledAt(target.id, input.disabled ? new Date() : null);

      await logAuditEvent({
        userId: String(ctx.user.id),
        action: input.disabled ? AuditActions.USER_DISABLE : AuditActions.USER_ENABLE,
        resourceType: "user",
        resourceId: String(target.id),
        severity: input.disabled ? "warn" : "info",
        changes: { disabled: input.disabled },
      });

      return { id: target.id, disabled: input.disabled };
    }),
});
