import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getAuthToken } from "./lib/authSession";
import { applyAppearance, onAppearanceChange, syncThemeColor } from "./lib/theme";
import "@fontsource/inter-tight/latin-700.css";
import "@fontsource/inter-tight/latin-800.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./index.css";
import "./styles/sutaeru-os.css";
import "./styles/preview.css";
import "./styles/pages-reskin.css";
import "./styles/shell-reskin.css";
import "./styles/chat-reskin.css";
import "./styles/reskin-tokens.css";
import "./components/art/art.css";
import "./styles/chrome.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;

  // Don't redirect if already on a public auth page — prevents infinite reload loop
  const publicPaths = ["/", "/login", "/register", "/reset-password", "/verify-email", "/u/", "/pricing", "/404"];
  const isAlreadyOnPublicPage = window.location.pathname === "/" || publicPaths.some(p => p !== "/" && window.location.pathname.startsWith(p));
  if (isAlreadyOnPublicPage) return;

  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_SR1_API_ORIGIN || ""}/api/trpc`,
      transformer: superjson,
      headers() {
        const token = getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// The saved appearance is already on <html> from the inline script in index.html;
// this keeps the attribute set current and follows the OS while System is chosen.
applyAppearance();
onAppearanceChange(syncThemeColor);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
