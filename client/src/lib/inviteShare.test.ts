import { describe, expect, it } from "vitest";

import {
  INVITE_SHARE_TITLE,
  INVITE_SHARE_UNAVAILABLE_COPY,
  copyInviteLinkFromWindow,
  shareInviteLink,
  shareInviteLinkFromWindow,
} from "./inviteShare";

const URL = "https://sutaeru.example.com/?invite=AB3DEFGHIJKL";

function cancelledShare(): Error & { name: string } {
  // What a browser throws when the person closes the share sheet without sharing.
  const error = new Error("The user did not choose anything");
  error.name = "AbortError";
  return error;
}

describe("sharing an invite link", () => {
  it("uses the share sheet when the browser has one", async () => {
    const payloads: unknown[] = [];
    const outcome = await shareInviteLink({
      url: URL,
      share: async (data) => {
        payloads.push(data);
      },
    });
    expect(outcome).toEqual({ status: "shared" });
    expect(payloads).toEqual([{ title: INVITE_SHARE_TITLE, url: URL }]);
  });

  it("copies the link when there is no share sheet", async () => {
    const copied: string[] = [];
    const outcome = await shareInviteLink({
      url: URL,
      copy: async (text) => {
        copied.push(text);
      },
    });
    expect(outcome).toEqual({ status: "copied" });
    expect(copied).toEqual([URL]);
  });

  it("falls back to copying when the share sheet fails", async () => {
    const copied: string[] = [];
    const outcome = await shareInviteLink({
      url: URL,
      share: async () => {
        throw new TypeError("share is not allowed here");
      },
      copy: async (text) => {
        copied.push(text);
      },
    });
    expect(outcome).toEqual({ status: "copied" });
    expect(copied).toEqual([URL]);
  });

  it("says nothing was shared when the person walked away from the sheet", async () => {
    const copied: string[] = [];
    const outcome = await shareInviteLink({
      url: URL,
      share: async () => {
        throw cancelledShare();
      },
      copy: async (text) => {
        copied.push(text);
      },
    });
    expect(outcome).toEqual({ status: "cancelled" });
    // Closing the sheet must not leave a link pasted in their clipboard behind their back.
    expect(copied).toEqual([]);
  });

  it("says so when the clipboard refuses the link", async () => {
    const outcome = await shareInviteLink({
      url: URL,
      copy: async () => {
        throw new Error("clipboard blocked");
      },
    });
    expect(outcome).toEqual({ status: "unavailable", message: INVITE_SHARE_UNAVAILABLE_COPY });
  });

  it("says so when the browser offers neither way out", async () => {
    expect(await shareInviteLink({ url: URL })).toEqual({
      status: "unavailable",
      message: INVITE_SHARE_UNAVAILABLE_COPY,
    });
  });

  it("never throws, whatever the browser does", async () => {
    await expect(
      shareInviteLink({
        url: URL,
        share: () => {
          throw new TypeError("nope");
        },
        copy: () => {
          throw new TypeError("nope either");
        },
      }),
    ).resolves.toEqual({ status: "unavailable", message: INVITE_SHARE_UNAVAILABLE_COPY });
  });

  it("has nothing to offer outside a browser", async () => {
    const nothing = { status: "unavailable", message: INVITE_SHARE_UNAVAILABLE_COPY };
    await expect(shareInviteLinkFromWindow(URL)).resolves.toEqual(nothing);
    // The Copy button takes the same path, so it cannot reach for a clipboard that is not there.
    await expect(copyInviteLinkFromWindow(URL)).resolves.toEqual(nothing);
  });

  it("keeps the words free of model and vendor names", async () => {
    const outcome = await shareInviteLink({ url: URL });
    const words = [INVITE_SHARE_TITLE, INVITE_SHARE_UNAVAILABLE_COPY, (outcome as { message: string }).message];
    for (const text of words) {
      const lower = text.toLowerCase();
      for (const banned of ["gpt", "claude", "gemini", "model", "token", "error", "clipboard", "api"]) {
        expect(lower.includes(banned), `${text} :: ${banned}`).toBe(false);
      }
    }
  });
});
