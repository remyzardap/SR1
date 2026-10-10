import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminView, ADMIN_FOLD_IDS } from "./AdminView";
import { adminFixture } from "@/lab/fixtures/lists";

/**
 * AdminView is presentational: these are string assertions on rendered markup. There is no
 * jsdom in this project's vitest config, so the clicking and the accordion live in the lab
 * at /__lab/admin.
 */

function render(state: "default" | "loading" | "empty" | "failed" = "default", open = true): string {
  return renderToStaticMarkup(
    React.createElement(AdminView, {
      ...adminFixture(state),
      openSections: open ? ADMIN_FOLD_IDS : undefined,
      actions: React.createElement("a", { href: "/admin/audit-logs", className: "btn" }, "Audit logs"),
    })
  );
}

describe("the admin screen", () => {
  const html = render();

  it("puts the four numbers in one strip card, not four tall cards", () => {
    expect((html.match(/class="lst-strip"/g) ?? []).length).toBe(1);
    expect((html.match(/class="lst-stat"/g) ?? []).length).toBe(4);
    for (const label of ["Users", "Files", "Admins", "Active today"]) {
      expect(html, `lost ${label}`).toContain(label);
    }
  });

  it("folds invites, activity and health behind one line each", () => {
    expect((html.match(/data-fold="/g) ?? []).length).toBe(ADMIN_FOLD_IDS.length);
    for (const id of ADMIN_FOLD_IDS) {
      expect(html, `lost the ${id} fold`).toContain(`data-fold="${id}"`);
    }
  });

  it("names the pick on the folded header", () => {
    const live = render("default", false);
    // On a phone (no window in node) only the first section is open.
    expect((live.match(/data-state="open"/g) ?? []).length).toBe(3);
    expect(live).toContain("5 in the workspace");
    expect(live).toContain("2 open · 4 made");
    expect(live).toContain("17 failed · 2 critical");
    expect(live).toContain("aria-expanded=\"false\"");
  });

  it("reads the server's own words for an invite status", () => {
    expect(html).toContain("Not used yet");
    expect(html).toContain("Switched off");
    // Expired and switched-off links, and the events that failed, read as dead.
    expect((html.match(/class="lst-row quiet"/g) ?? []).length).toBe(4);
  });

  it("shows people as rows with a live pill", () => {
    expect(html).toContain("rani@sutaeru.app");
    expect(html).toContain("Admin · 42 files · Joined 12 JUL 2026 · Last seen NOW");
    // StatusPill prints the raw word and lets CSS carry the case.
    expect(html).toContain('<span class="art-status" data-tone="ink">live</span>');
    expect(html).toContain(">away<");
  });

  it("keeps loading, empty and failed distinct", () => {
    expect(render("loading")).toContain("lst-skeleton");
    expect(render("empty")).toContain("No one signed up yet.");
    const failed = render("failed");
    expect(failed).toContain("Couldn&#x27;t load this right now.");
    expect((failed.match(/Try again/g) ?? []).length).toBe(4);
  });
});
