/**
 * P1-12: the calendar tools' contract with Google, and the card that names who gets invited.
 *
 * Two things are checked beyond the argument mapping: the window, which the service only half-supports
 * (`timeMin`) and the tool finishes cutting; and the times, which the tool normalizes to UTC because
 * the service labels everything it writes as UTC. `calendar_create` is the outward action, so its card
 * has to carry the full guest list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const google = vi.hoisted(() => ({
  isGoogleConfigured: vi.fn(() => true),
  getConnectionStatus: vi.fn(async () => ({ connected: true, email: "user@example.com" })),
  listCalendarEvents: vi.fn(async () => []),
  createCalendarEvent: vi.fn(async () => ({
    id: "evt-1",
    summary: "Design review",
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
    start: "2026-10-08T09:00:00Z",
    end: "2026-10-08T09:30:00Z",
  })),
}));

vi.mock("../../../services/google", () => google);

import { registerCalendarTools } from "./calendar";
import { getToolSpec, runTool, toOpenAiTools, toolsFor, __resetRegistryForTests } from "../registry";
import type { ApprovalGate, ToolContext } from "../types";

const CREATE_ARGS = {
  title: "Design review",
  start: "2026-10-08T09:00:00Z",
  end: "2026-10-08T09:30:00Z",
  attendees: ["ada@example.com", "Acme Billing <billing@acme.example>"],
  location: "Studio 2",
  description: "Bring the annotated mockups.",
};

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: 7,
    runId: "r-calendar",
    tier: "trial",
    signal: new AbortController().signal,
    emit: () => {},
    ...overrides,
  };
}

function gate(): { value: ApprovalGate; requests: any[] } {
  const requests: any[] = [];
  const value: ApprovalGate = {
    request: async (params: any) => {
      requests.push(params);
      return { decision: "approved" as const, args: params.args, approvalId: "cal-1" };
    },
  };
  return { value, requests };
}

beforeEach(() => {
  __resetRegistryForTests();
  vi.resetAllMocks();
  google.isGoogleConfigured.mockReturnValue(true);
  google.getConnectionStatus.mockResolvedValue({ connected: true, email: "user@example.com" });
  google.listCalendarEvents.mockResolvedValue([]);
  google.createCalendarEvent.mockResolvedValue({
    id: "evt-1",
    summary: "Design review",
    htmlLink: "https://calendar.google.com/event?eid=evt-1",
    start: "2026-10-08T09:00:00Z",
    end: "2026-10-08T09:30:00Z",
  });
  registerCalendarTools();
  process.env.FF_APPROVALS = "1";
});

afterEach(() => {
  delete process.env.FF_APPROVALS;
});

describe("calendar_list", () => {
  it("asks Google for the window from 'from' and the number asked for", async () => {
    google.listCalendarEvents.mockResolvedValueOnce([
      {
        id: "e1",
        summary: "Standup",
        description: null,
        location: null,
        start: "2026-10-07T09:00:00Z",
        end: "2026-10-07T09:15:00Z",
        htmlLink: "https://calendar.google.com/event?eid=e1",
        status: "confirmed",
        attendees: [{ email: "ada@example.com", responseStatus: "accepted" }],
      },
    ]);

    const outcome = await runTool("calendar_list", { from: "2026-10-07T00:00:00+02:00", max: 5 }, ctx());

    // The window opens at the same instant whichever side of the zero meridian it was written from.
    expect(google.listCalendarEvents).toHaveBeenCalledWith(7, 5, "2026-10-06T22:00:00.000Z");
    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: [
          {
            id: "e1",
            summary: "Standup",
            start: "2026-10-07T09:00:00Z",
            end: "2026-10-07T09:15:00Z",
            location: null,
            status: "confirmed",
            attendees: ["ada@example.com"],
            htmlLink: "https://calendar.google.com/event?eid=e1",
            description: null,
          },
        ],
      },
    });
  });

  it("reads from now when the model gives no window", async () => {
    await runTool("calendar_list", {}, ctx());

    expect(google.listCalendarEvents).toHaveBeenCalledWith(7, 10, undefined);
  });

  it("cuts the far end of the window itself, because Google takes only the near one", async () => {
    google.listCalendarEvents.mockResolvedValueOnce([
      { id: "in", summary: "inside", start: "2026-10-07T09:00:00Z", end: "2026-10-07T10:00:00Z" },
      { id: "edge", summary: "on the edge", start: "2026-10-07T18:00:00Z", end: "2026-10-07T19:00:00Z" },
      { id: "out", summary: "after", start: "2026-10-07T20:00:00Z", end: "2026-10-07T21:00:00Z" },
    ]);

    const outcome = await runTool(
      "calendar_list",
      { from: "2026-10-07T00:00:00Z", to: "2026-10-07T18:00:00Z" },
      ctx()
    );

    expect((outcome as any).data.data.map((event: any) => event.id)).toEqual(["in", "edge"]);
  });

  it("keeps a long description and marks where it was cut", async () => {
    google.listCalendarEvents.mockResolvedValueOnce([
      { id: "e1", summary: "Long", start: "2026-10-07T09:00:00Z", description: "y".repeat(1_500) },
    ]);

    const outcome = await runTool("calendar_list", {}, ctx());
    const description = (outcome as any).data.data[0].description;

    expect(description).toHaveLength(1_001);
    expect(description.endsWith("…")).toBe(true);
  });

  it("refuses a window it cannot read as a moment", async () => {
    const outcome = await runTool("calendar_list", { from: "tomorrow morning" }, ctx());

    expect(google.listCalendarEvents).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_PARAMS" } });
  });

  it("is not offered when Google is not connected", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: false, email: null });

    const names = (await toolsFor(ctx())).map((s) => s.name);
    expect(names).not.toContain("calendar_list");
    expect(names).not.toContain("calendar_create");
  });
});

describe("calendar_create", () => {
  it("maps the arguments onto createCalendarEvent in the order the service takes them", async () => {
    const outcome = await runTool("calendar_create", CREATE_ARGS, ctx({ approvals: gate().value }));

    expect(google.createCalendarEvent).toHaveBeenCalledWith(
      7,
      "Design review",
      "2026-10-08T09:00:00.000Z",
      "2026-10-08T09:30:00.000Z",
      "Bring the annotated mockups.",
      "Studio 2",
      ["ada@example.com", "Acme Billing <billing@acme.example>"]
    );
    expect(outcome).toEqual({
      ok: true,
      data: {
        success: true,
        data: {
          id: "evt-1",
          start: "2026-10-08T09:00:00Z",
          end: "2026-10-08T09:30:00Z",
          htmlLink: "https://calendar.google.com/event?eid=evt-1",
          attendeeCount: 2,
        },
      },
    });
  });

  it("reads a time with no offset as UTC, the way the event will be labelled", async () => {
    await runTool(
      "calendar_create",
      { title: "No offset", start: "2026-10-08T09:00", end: "2026-10-08T10:00" },
      ctx({ approvals: gate().value })
    );

    expect(google.createCalendarEvent).toHaveBeenCalledWith(7, "No offset", "2026-10-08T09:00:00.000Z", "2026-10-08T10:00:00.000Z", undefined, undefined, undefined);
  });

  it("moves a time with an offset to the instant it names", async () => {
    await runTool(
      "calendar_create",
      { title: "Tokyo", start: "2026-10-08T09:00:00+09:00", end: "2026-10-08T10:00:00+09:00" },
      ctx({ approvals: gate().value })
    );

    expect(google.createCalendarEvent).toHaveBeenCalledWith(7, "Tokyo", "2026-10-08T00:00:00.000Z", "2026-10-08T01:00:00.000Z", undefined, undefined, undefined);
  });

  it("needs an approval, and does not write when this run has nobody to ask", async () => {
    const outcome = await runTool("calendar_create", CREATE_ARGS, ctx());

    expect(google.createCalendarEvent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
  });

  it("refuses an event that ends before it starts, before any card is shown", async () => {
    const g = gate();
    const outcome = await runTool(
      "calendar_create",
      { ...CREATE_ARGS, start: "2026-10-08T11:00:00Z", end: "2026-10-08T09:00:00Z" },
      ctx({ approvals: g.value })
    );

    expect(g.requests).toHaveLength(0);
    expect(google.createCalendarEvent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("re-checks the times after the approval, when the arguments come back changed", async () => {
    // The decision route lets the human edit an approved call, so `execute` validates what it is
    // actually handed rather than trusting the card (P1-11).
    const g = gate();
    g.value.request = async (params: any) => ({
      decision: "approved" as const,
      approvalId: "cal-1",
      args: { ...params.args, end: "2026-10-08T08:00:00Z" },
    });

    const outcome = await runTool("calendar_create", CREATE_ARGS, ctx({ approvals: g.value }));

    expect(google.createCalendarEvent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_PARAMS" } });
  });

  it("refuses a time that is not a moment in time", async () => {
    const outcome = await runTool(
      "calendar_create",
      { ...CREATE_ARGS, start: "next Tuesday-ish" },
      ctx({ approvals: gate().value })
    );

    expect(google.createCalendarEvent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("names every attendee and both times on the card, and carries no description text", async () => {
    const many = Array.from({ length: 10 }, (_unused, i) => `guest${i}@example.com`);
    const preview = (getToolSpec("calendar_create") as any).preview;

    const shown = await preview({ ...CREATE_ARGS, attendees: many }, ctx());

    expect(shown.title).toBe("Add a calendar event");
    expect(shown.detail).toContain("Design review");
    expect(shown.detail).toContain("2026-10-08T09:00:00.000Z to 2026-10-08T09:30:00.000Z (UTC)");
    expect(shown.attendees).toEqual(many);
    expect(shown.location).toBe("Studio 2");
    expect(shown.descriptionChars).toBe(CREATE_ARGS.description.length);
    expect(JSON.stringify(shown)).not.toContain("annotated mockups");
  });

  it("keeps the guest list at ten", async () => {
    const eleven = Array.from({ length: 11 }, (_unused, i) => `guest${i}@example.com`);

    const outcome = await runTool("calendar_create", { ...CREATE_ARGS, attendees: eleven }, ctx({ approvals: gate().value }));

    expect(google.createCalendarEvent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, code: "INVALID_ARGS" });
  });

  it("refuses an attendee entry that is two addresses, because the card counts one", async () => {
    const outcome = await runTool(
      "calendar_create",
      { ...CREATE_ARGS, attendees: ["ada@example.com, bob@example.com"] },
      ctx({ approvals: gate().value })
    );

    expect(google.createCalendarEvent).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: true, data: { success: false, code: "INVALID_PARAMS" } });
  });

  it("still reaches the model as one event with two times", async () => {
    // The cross-field check above lives on the schema, and the wire format is generated from it, so
    // this is the proof that the check did not eat the field descriptions the model reads.
    const def = toOpenAiTools([getToolSpec("calendar_create")!])[0];

    expect(def.parameters.required).toEqual(["title", "start", "end"]);
    expect(Object.keys(def.parameters.properties).sort()).toEqual([
      "attendees",
      "description",
      "end",
      "location",
      "start",
      "title",
    ]);
    expect(def.parameters.properties.start.description).toContain("read as UTC");
    expect(def.parameters.properties.end.type).toBe("string");
  });

  it("is offered only to a run that can answer an approval", async () => {
    expect((await toolsFor(ctx())).map((s) => s.name)).toEqual(["calendar_list"]);
    expect((await toolsFor(ctx({ approvals: gate().value }))).map((s) => s.name)).toContain("calendar_create");
  });
});
