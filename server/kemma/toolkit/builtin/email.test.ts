/**
 * P1-12: the email tools' contract with Gmail, and the one place a human is asked.
 *
 * `email_search` and `email_read` are reads whose content arrives from Google and is fenced by the
 * engine (P1-10); what is checked here is the argument mapping and the 20k body cap. `email_send` is
 * the tool that leaves the building, so the card is checked too: it has to name every recipient and
 * carry none of the message.
 *
 * The Gmail service is mocked, so no credentials are needed to see a card.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const google = vi.hoisted(() => ({
  isGoogleConfigured: vi.fn(() => true),
  getConnectionStatus: vi.fn(async () => ({ connected: true, email: "user@example.com" })),
  listEmails: vi.fn(async () => [
    {
      id: "m1",
      threadId: "t1",
      snippet: "the invoice is attached",
      subject: "Invoice 42",
      from: "Acme Billing <billing@acme.example>",
      to: "me@example.com",
      date: "Tue, 6 Oct 2026 09:14:00 +0100",
      labelIds: ["INBOX", "UNREAD"],
      isUnread: true,
    },
  ]),
  getEmailContent: vi.fn(async () => ({
    id: "m1",
    threadId: "t1",
    subject: "Invoice 42",
    from: "Acme Billing <billing@acme.example>",
    to: "me@example.com",
    date: "Tue, 6 Oct 2026 09:14:00 +0100",
    body: "Hi. The invoice is attached.",
    snippet: "the invoice is attached",
  })),
  sendEmail: vi.fn(async () => ({ id: "sent-1", threadId: "thread-1" })),
}));

vi.mock("../../../services/google", () => google);

import { registerEmailTools } from "./email";
import { getToolSpec, runTool, toolsFor, __resetRegistryForTests } from "../registry";
import type { ApprovalGate, ToolContext } from "../types";

const SEND_ARGS = {
  to: ["ada@example.com", "Acme Billing <billing@acme.example>"],
  subject: "Invoice 42",
  body: "Paying this today. — Me",
};

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 7,
    runId: "r-email",
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

/** The gate stands in for the human: it records the card and approves whatever it is given. */
function gate() {
  const requests: any[] = [];
  const value = {
    request: async (params: any) => {
      requests.push(params);
      return { decision: "approved" as const, args: params.args, approvalId: "em-1" };
    },
  };
  return { value, requests };
}

beforeEach(() => {
  __resetRegistryForTests();
  vi.resetAllMocks();
  google.isGoogleConfigured.mockReturnValue(true);
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.com" });
  google.listEmails.mockResolvedValue([
    {
      id: "m1",
      threadId: "t1",
      snippet: "the invoice is attached",
      subject: "Invoice 42",
      from: "Acme Billing <billing@acme.example>",
      to: "me@example.com",
      date: "Tue, 6 Oct 2026 09:14:00 +0100",
      labelIds: ["INBOX", "UNREAD"],
      isUnread: true,
    },
  ]);
  google.getEmailContent.mockResolvedValue({
    id: "m1",
    threadId: "t1",
    subject: "Invoice 42",
    from: "Acme Billing <billing@acme.example>",
    to: "me@example.com",
    date: "Tue, 6 Oct 2026 09:14:00 +0100",
    body: "Hi. The invoice is attached.",
    snippet: "the invoice is attached",
  });
  google.sendEmail.mockResolvedValue({ id: "sent-1", threadId: "thread-1" });
  registerEmailTools();
  process.env.FF_APPROVALS = "1";
});

afterEach(() => {
  delete process.env.FF_APPROVALS;
});

describe("email_search", () => {
  it("passes the query and the count to Gmail and returns only what a listing needs", async () => {
    const outcome = await runTool("email_search", { query: "from:acme.example", max: 3 }, ctx());

    expect(google.listEmails).toHaveBeenCalledWith(7, 3, "from:acme.example");
    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: [
          {
            id: "m1",
            from: "Acme Billing <billing@acme.example>",
            subject: "Invoice 42",
            date: "Tue, 6 Oct 2026 09:14:00 +0100",
            snippet: "the invoice is attached",
          },
        ],
      },
    });
  });

  it("lists the inbox at the default size when the model gives nothing", async () => {
    const outcome = await runTool("email_search", {}, ctx());

    expect(google.listEmails).toHaveBeenCalledWith(7, 10, undefined);
    expect(outcome.ok).toBe(true);
  });

  it("is not offered when Google is not connected", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });

    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).not.toContain("email_search");
    expect(names).not.toContain("email_read");
    expect(names).not.toContain("email_send");
  });

  it("is not offered when the connection probe itself fails", async () => {
    // `filterAvailable` treats a throwing probe as "not available", so a broken token store hides the
    // tools instead of offering three calls that can only error.
    google.getConnectionStatus.mockRejectedValue(new Error("no token row"));

    expect((await toolsFor(ctx())).map((s) => s.name)).not.toContain("email_search");
  });
});

describe("email_read", () => {
  it("reads one message by id and hands back the body", async () => {
    const outcome = await runTool("email_read", { id: "m1" }, ctx());

    expect(google.getEmailContent).toHaveBeenCalledWith(7, "m1");
    expect(outcome).toMatchObject({
      ok: true,
      data: { success: true, data: { id: "m1", subject: "Invoice 42", body: "Hi. The invoice is attached.", truncated: false } },
    });
  });

  it("cuts a long body at 20,000 characters and says so", async () => {
    google.getEmailContent.mockResolvedValue({
      id: "m1",
      threadId: "t1",
      subject: "Long one",
      from: "a@example.com",
      to: "me@example.com",
      date: "Tue, 6 Oct 2026 09:14:00 +0100",
      body: "x".repeat(25_000),
      snippet: "",
    });

    const outcome = await runTool("email_read", { id: "m1" }, ctx());
    const data = (outcome as any).data.data;

    expect(data.body).toHaveLength(20_000);
    expect(data.truncated).toBe(true);
  });

  it("refuses a message id the model never filled in", async () => {
    const outcome = await runTool("email_read", {}, ctx());

    expect(google.getEmailContent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("refuses an id that is only whitespace", async () => {
    const outcome = await runTool("email_read", { id: "   " }, ctx());

    expect(google.getEmailContent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_PARAMS" } });
  });
});

describe("email_send", () => {
  it("joins the recipients into the one string Gmail takes and reports only ids back", async () => {
    const g = gate();
    const outcome = await runTool("email_send", SEND_ARGS, ctx({ approvals: g.value }));

    expect(google.sendEmail).toHaveBeenCalledWith(7, "ada@example.com, Acme Billing <billing@acme.example>", "Invoice 42", SEND_ARGS.body);
    expect(outcome).toEqual({
      ok: true,
      data: { success: true, data: { id: "sent-1", threadId: "thread-1", recipientCount: 2 } },
    });
    // The result is journalled with the approval row, so the message text must not ride along.
    expect(JSON.stringify(outcome)).not.toContain("Paying this today");
  });

  it("needs an approval, and refuses to run when this run has nobody to ask", async () => {
    const outcome = await runTool("email_send", SEND_ARGS, ctx());

    expect(google.sendEmail).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });

  it("sends nothing when the human declines", async () => {
    const g = gate();
    g.value.request = async (params: any) => ({ decision: "rejected" as const, args: params.args, approvalId: "em-1" });

    const outcome = await runTool("email_send", SEND_ARGS, ctx({ approvals: g.value }));

    expect(google.sendEmail).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "REJECTED" });
  });

  it("names every recipient on the card and carries none of the message", async () => {
    const many = Array.from({ length: 10 }, (_unused, i) => `person${i}@example.com`);
    const preview = getToolSpec("email_send")!.preview!;

    const shown = (await preview({ ...SEND_ARGS, to: many }, ctx())) as Record<string, unknown>;

    expect(shown.title).toBe("Send an email");
    for (const address of many) {
      expect(String(shown.detail)).toContain(address);
    }
    expect(String(shown.detail)).toContain("person9@example.com");
    expect(shown.subject).toBe("Invoice 42");
    expect(shown.bodyChars).toBe(SEND_ARGS.body.length);
    expect(JSON.stringify(shown)).not.toContain("Paying this today");
  });

  it("prefixes a reply so Gmail threads it, on the card and in the send alike", async () => {
    const g = gate();
    const outcome = await runTool("email_send", { ...SEND_ARGS, reply_to_id: "m1" }, ctx({ approvals: g.value }));

    expect(g.requests[0].preview.subject).toBe("Re: Invoice 42");
    expect(google.sendEmail).toHaveBeenCalledWith(7, expect.any(String), "Re: Invoice 42", expect.any(String));
    expect(outcome.ok).toBe(true);

    // A subject that already says "Re:" is not turned into "Re: Re:".
    google.sendEmail.mockClear();
    await runTool("email_send", { ...SEND_ARGS, subject: "Re: Invoice 42", reply_to_id: "m1" }, ctx({ approvals: gate().value }));
    expect(google.sendEmail).toHaveBeenCalledWith(7, expect.any(String), "Re: Invoice 42", expect.any(String));
  });

  it("keeps the recipient list at ten", async () => {
    const eleven = Array.from({ length: 11 }, (_unused, i) => `person${i}@example.com`);

    const outcome = await runTool("email_send", { ...SEND_ARGS, to: eleven }, ctx({ approvals: gate().value }));

    expect(google.sendEmail).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("refuses an entry that is not one address, because the joined list would count it twice", async () => {
    const outcome = await runTool(
      "email_send",
      { ...SEND_ARGS, to: ["ada@example.com, bob@example.com"] },
      ctx({ approvals: gate().value })
    );

    expect(google.sendEmail).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: true,
      data: { success: false, code: "INVALID_PARAMS" },
    });
  });

  it("sends once to an address written twice", async () => {
    const outcome = await runTool(
      "email_send",
      { ...SEND_ARGS, to: ["ada@example.com", "ada@example.com"] },
      ctx({ approvals: gate().value })
    );

    expect(google.sendEmail).toHaveBeenCalledWith(7, "ada@example.com", "Invoice 42", SEND_ARGS.body);
    expect(outcome).toMatchObject({ ok: true, data: { data: { recipientCount: 1 } } });
  });

  it("does not send when the body is empty", async () => {
    const outcome = await runTool("email_send", { ...SEND_ARGS, body: "  " }, ctx({ approvals: gate().value }));

    expect(google.sendEmail).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_PARAMS" } });
  });

  it("is offered only to a run that can answer an approval", async () => {
    // P1-11's listing rule: a tool that asks is hidden when there is no gate to ask through, so the
    // model cannot promise an email the interface would then refuse.
    expect((await toolsFor(ctx())).map((s) => s.name)).not.toContain("email_send");
    expect((await toolsFor(ctx({ approvals: gate().value }))).map((s) => s.name)).toContain("email_send");

    // The reads never needed a gate, and keep being offered either way.
    expect((await toolsFor(ctx())).map((s) => s.name)).toEqual(["email_search", "email_read"]);

    delete process.env.FF_APPROVALS;
    expect((await toolsFor(ctx({ approvals: gate().value }))).map((s) => s.name)).not.toContain("email_send");
  });
});
