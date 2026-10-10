import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** Remy's cleanup of /chat: the bottom bar and the run box are gone for good. */
describe("/chat cleanup", () => {
  const chat = read("./Chat.tsx");
  const css = [read("../styles/chat-reskin.css"), read("../styles/preview.css")].join("\n");

  it("has no bottom icon bar and no Run details box", () => {
    for (const gone of ["sutaeru-run-actions", "sutaeru-mobile-details", "mobileDetailsOpen", "Run details", "No active run"]) {
      expect(chat).not.toContain(gone);
      expect(css).not.toContain(gone);
    }
  });

  it("docks only the composer: the controls row holds ChatInput and nothing else", () => {
    expect(chat).toContain("The conversation's composer is the only thing docked at the bottom");
    expect(chat).toContain("<ChatInput");
  });

  it("has no fixed bottom bar", () => {
    expect(chat).not.toMatch(/fixed[^"\n]*bottom-0|bottom-0[^"\n]*fixed/);
    expect(chat).not.toContain("BottomBar");
  });

  it("private chat flips without a 'not available yet' toast, and skips memory extraction", () => {
    const home = read("../components/home/Home.tsx");
    expect(home).not.toContain("PRIVATE_HINT");
    expect(home).not.toMatch(/not available yet/i);
    expect(home).toContain("onPrivateChange,");
    expect(chat).toContain("if (privateRef.current) return;");
  });

  it("keeps Code mode admin-only", () => {
    expect(chat).toContain('const isCode = mode === "code" && isAdmin');
    expect(chat).toContain("if (isAdmin) setMode(\"code\")");
    expect(chat).toContain('me.isFetched && !isAdmin && mode === "code"');
    expect(chat).toContain("chatModes(isAdmin)");
  });

  it("sends the mode sheet's choices with the request", () => {
    expect(chat).toContain("model: modelIdFor(messageModel, availableModels)");
    expect(chat).toContain("taggedSkills: taggedSkills.length > 0 ? taggedSkills : undefined");
    expect(chat).toContain("isThinking: thinking");
    expect(chat).toContain('mode === "deep" ? `${apiOrigin}/api/fn/research`');
  });

  it("feeds the chat energy store from the streaming state, code runs included", () => {
    expect(chat).toContain("useChatEnergyFeed({");
    expect(chat).toContain("streaming: isStreaming || (isCode && code.running)");
    expect(chat).toContain("error: !!error");
  });

  it("opens past chats and new chat from the logo menu's address", () => {
    expect(chat).toContain('params.get("session")');
    expect(chat).toContain('params.get("history")');
    expect(chat).toContain('params.get("new")');
    expect(read("../components/chrome/NavLogoMenu.tsx")).toContain("/chat?history=1");
  });
});
