import { NOT_ADMIN_ERR_MSG, PASSWORD_CHANGE_REQUIRED_MESSAGE, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * A password that an administrator issued is temporary. Until its owner has replaced it, the
 * account may only reach the procedures that let it sign in and change that password: letting it
 * read files or generate documents first would mean a shared or guessed initial password keeps
 * working as an ordinary account. auth.me and auth.logout are publicProcedure, so they are not
 * listed here — only paths that ride on protectedProcedure need an exemption.
 */
const PASSWORD_CHANGE_EXEMPT_PATHS = new Set(["auth.changePassword"]);

const requireNewPassword = t.middleware(async opts => {
  const { ctx, next, path } = opts;

  if (ctx.user?.mustChangePassword && !PASSWORD_CHANGE_EXEMPT_PATHS.has(path)) {
    throw new TRPCError({ code: "FORBIDDEN", message: PASSWORD_CHANGE_REQUIRED_MESSAGE });
  }

  // next() with no ctx: this middleware only refuses. Passing a ctx through here would re-widen
  // `user` to `User | null` and every resolver downstream would lose the guarantee requireUser
  // and requireAdmin already established.
  return next();
});

/**
 * Chained rather than merged into one middleware, so the admin check keeps its own answer
 * (NOT_ADMIN_ERR_MSG) for a signed-in non-admin, exactly as it did before this gate existed.
 */
export const protectedProcedure = t.procedure.use(requireUser).use(requireNewPassword);

const requireAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// An administrator holding a temporary password is refused like everyone else: issuing yourself a
// password you never chose would otherwise be a way to keep an unattended admin account usable.
export const adminProcedure = t.procedure.use(requireAdmin).use(requireNewPassword);
