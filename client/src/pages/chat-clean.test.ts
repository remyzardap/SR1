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

  it("opens past chats and new chat from the logo menu's address", () => {
    expect(chat).toContain('params.get("history")');
    expect(chat).toContain('params.get("new")');
    expect(read("../components/chrome/NavLogoMenu.tsx")).toContain("/chat?history=1");
  });
});
