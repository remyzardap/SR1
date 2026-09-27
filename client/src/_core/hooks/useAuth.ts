import { trpc } from "@/lib/trpc";
import { clearAuthToken } from "@/lib/authSession";
import { exitDesignPreview, isDesignPreview, previewUser } from "@/lib/designPreview";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};
  const utils = trpc.useUtils();

  // Design-preview mode skips the real session query entirely.
  const preview = isDesignPreview();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !preview,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    if (preview) {
      exitDesignPreview();
      utils.auth.me.setData(undefined, null);
      window.location.href = "/login";
      return;
    }
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      clearAuthToken();
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [preview, logoutMutation, utils]);

  const state = useMemo(() => {
    if (preview) {
      return {
        user: previewUser,
        loading: false,
        error: null,
        isAuthenticated: true,
      };
    }
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    preview,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  // Sync user info to localStorage for manus-runtime
  // Side effects must be in useEffect, not useMemo
  useEffect(() => {
    if (preview) return;
    localStorage.setItem("manus-runtime-user-info", JSON.stringify(meQuery.data ?? null));
  }, [preview, meQuery.data]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (preview) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    preview,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
