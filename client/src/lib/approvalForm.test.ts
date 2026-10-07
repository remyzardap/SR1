import { describe, expect, it } from "vitest";

import {
  buildArgs,
  countdownFor,
  deepEqual,
  deriveFields,
  editedArgsIfChanged,
  EXPIRED_COPY,
  fieldsFromJsonText,
  formToJsonText,
  formatRemaining,
  isLongText,
  mergeApprovals,
  toArgsObject,
  valuesFromFields,
  type ApprovalField,
  type JsonField,
  type TextField,
} from "./approvalForm";

const LONG_BODY =
  "Hi Ada,\n\nThe quarterly numbers are ready to go out to the whole team, and the attachment is " +
  "the one from finance. Let me know if anything looks off before I send it.\n\nBest, Sam";

/** The argument list a `send_email` approval would actually arrive with. */
function sampleArgs() {
  return {
    to: "ada@example.com",
    subject: "Quarterly numbers",
    body: LONG_BODY,
    copies: 2,
    deliverBy: "2026-02-01T09:00:00.000Z",
    readReceipt: true,
    ccList: ["team@example.com", "boss@example.com"],
    headers: { "X-Priority": "high" },
    mixedUp: [1, 2],
    signature: null,
  };
}

function fieldByKey(fields: ApprovalField[], key: string): ApprovalField {
  const found = fields.find((field) => field.key === key);
  if (!found) throw new Error(`no field derived for ${key}`);
  return found;
}

function textFieldByKey(fields: ApprovalField[], key: string): TextField {
  const found = fieldByKey(fields, key);
  if (found.kind !== "text") {
    throw new Error(`${key} came out as ${found.kind}, not a text field`);
  }
  return found;
}

function jsonFieldByKey(fields: ApprovalField[], key: string): JsonField {
  const found = fieldByKey(fields, key);
  if (found.kind !== "json") {
    throw new Error(
      `${key} came out as ${found.kind}, not the raw-value fallback`,
    );
  }
  return found;
}

describe("deriving fields from the arguments", () => {
  it("gives one field per top-level argument, in the order they arrived", () => {
    const fields = deriveFields(sampleArgs());
    expect(fields.map((field) => field.key)).toEqual(Object.keys(sampleArgs()));
  });

  it("uses a text input for a short string and a readable label", () => {
    const to = fieldByKey(deriveFields(sampleArgs()), "to");
    expect(to).toMatchObject({
      kind: "text",
      label: "To",
      value: "ada@example.com",
      multiline: false,
    });
  });

  it("uses a textarea once a string is long, and also when it only has newlines", () => {
    expect(textFieldByKey(deriveFields(sampleArgs()), "body").multiline).toBe(
      true,
    );
    expect(
      textFieldByKey(deriveFields({ note: "one\ntwo" }), "note").multiline,
    ).toBe(true);
    expect(
      textFieldByKey(deriveFields({ note: "x".repeat(80) }), "note").multiline,
    ).toBe(false);
    expect(
      textFieldByKey(deriveFields({ note: "x".repeat(81) }), "note").multiline,
    ).toBe(true);
  });

  it("uses a number input for a number and a switch for a flag", () => {
    const fields = deriveFields(sampleArgs());
    expect(fieldByKey(fields, "copies")).toMatchObject({
      kind: "number",
      value: "2",
    });
    expect(fieldByKey(fields, "readReceipt")).toMatchObject({
      kind: "boolean",
      value: true,
    });
  });

  it("uses an add/remove list for an array of strings and the raw fallback for anything else", () => {
    const fields = deriveFields(sampleArgs());
    expect(fieldByKey(fields, "ccList")).toMatchObject({
      kind: "chips",
      value: ["team@example.com", "boss@example.com"],
    });
    expect(fieldByKey(fields, "mixedUp")).toMatchObject({
      kind: "json",
      expect: "array",
    });
    expect(fieldByKey(fields, "headers")).toMatchObject({
      kind: "json",
      expect: "object",
    });
    expect(fieldByKey(fields, "signature")).toMatchObject({
      kind: "json",
      value: "null",
    });
    expect(JSON.parse(jsonFieldByKey(fields, "headers").value)).toEqual({
      "X-Priority": "high",
    });
  });

  it("turns snake_case and camelCase keys into words a person can read", () => {
    expect(deriveFields({ recipient_addresses: "a@b.c" })[0].label).toBe(
      "Recipient addresses",
    );
    expect(deriveFields({ dryRun: false })[0].label).toBe("Dry run");
    expect(deriveFields({ to: "a@b.c" })[0].label).toBe("To");
  });

  it("accepts arguments that arrived as a JSON string and stops pretending for anything else", () => {
    expect(
      deriveFields('{"to":"ada@example.com"}').map((field) => field.key),
    ).toEqual(["to"]);
    expect(deriveFields("not json")).toEqual([]);
    expect(deriveFields(["a", "b"])).toEqual([]);
    expect(deriveFields(undefined)).toEqual([]);
    expect(toArgsObject(42)).toBeNull();
  });
});

describe("building the arguments back from the form", () => {
  it("round-trips an untouched form to exactly what the server sent", () => {
    const args = sampleArgs();
    const fields = deriveFields(args);
    const built = buildArgs(fields, valuesFromFields(fields));
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.args).toEqual(args);
  });

  it("keeps types: a number box sends a number and a switch sends a flag", () => {
    const fields = deriveFields({ copies: 2, readReceipt: true });
    const built = buildArgs(fields, { copies: "5", readReceipt: false });
    expect(built).toEqual({
      ok: true,
      args: { copies: 5, readReceipt: false },
    });
  });

  it("drops blank items from a list instead of sending an empty recipient", () => {
    const fields = deriveFields({ ccList: ["team@example.com"] });
    const built = buildArgs(fields, { ccList: ["  boss@example.com  ", ""] });
    expect(built).toEqual({ ok: true, args: { ccList: ["boss@example.com"] } });
  });

  it("refuses a number box holding words and says so in plain words", () => {
    const fields = deriveFields({ copies: 2 });
    const built = buildArgs(fields, { copies: "lots" });
    expect(built.ok).toBe(false);
    if (!built.ok)
      expect(built.errors.copies).toBe(
        "Copies must be a number, like 12 or 3.5.",
      );
  });

  it("refuses an emptied number box too", () => {
    const fields = deriveFields({ copies: 2 });
    const built = buildArgs(fields, { copies: "  " });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.errors.copies).toContain("needs a number");
  });

  it("refuses to send an argument that had text in it now blank", () => {
    const fields = deriveFields({ to: "ada@example.com" });
    const built = buildArgs(fields, { to: "" });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.errors.to).toContain("is empty");
  });

  it("lets a string argument that arrived blank stay blank", () => {
    const fields = deriveFields({ nickname: "" });
    expect(buildArgs(fields, { nickname: "" })).toEqual({
      ok: true,
      args: { nickname: "" },
    });
  });

  it("reports every broken field at once so the person fixes the form in one go", () => {
    const fields = deriveFields({ to: "ada@example.com", copies: 2 });
    const built = buildArgs(fields, { to: " ", copies: "two" });
    expect(built.ok).toBe(false);
    if (!built.ok)
      expect(Object.keys(built.errors).sort()).toEqual(["copies", "to"]);
  });

  it("rejects a raw fallback that is no longer valid JSON or the wrong shape", () => {
    const objectField = deriveFields({ headers: { "X-Priority": "high" } });
    const broken = buildArgs(objectField, { headers: "{oops" });
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.errors.headers).toContain("not valid JSON");

    const reshaped = buildArgs(objectField, { headers: '"high"' });
    expect(reshaped.ok).toBe(false);
    if (!reshaped.ok)
      expect(reshaped.errors.headers).toContain("has to stay an object");

    const listField = deriveFields({ rows: [1, 2] });
    const wrongList = buildArgs(listField, { rows: '{"a":1}' });
    expect(wrongList.ok).toBe(false);
    if (!wrongList.ok)
      expect(wrongList.errors.rows).toContain("has to stay a list");
  });

  it("refuses an emptied raw fallback instead of quietly sending nothing for it", () => {
    const fields = deriveFields({ headers: { a: 1 } });
    const blank = buildArgs(fields, { headers: "  " });
    expect(blank.ok).toBe(false);
    if (!blank.ok)
      expect(blank.errors.headers).toContain("has to stay an object");
  });
});

describe("the advanced JSON editor", () => {
  it("shows the edited form as JSON", () => {
    const args = sampleArgs();
    const fields = deriveFields(args);
    const values = { ...valuesFromFields(fields), copies: "3" };
    const text = formToJsonText(fields, values, args);
    expect(JSON.parse(text).copies).toBe(3);
    expect(JSON.parse(text).to).toBe("ada@example.com");
  });

  it("keeps the original value for a field that cannot be read yet instead of dropping it", () => {
    const args = sampleArgs();
    const fields = deriveFields(args);
    const values = { ...valuesFromFields(fields), copies: "lots", ccList: [] };
    const parsed = JSON.parse(formToJsonText(fields, values, args));
    expect(parsed.copies).toBe(2);
    expect(parsed.ccList).toEqual([]);
  });

  it("re-derives the fields coming back from JSON, so a new long body gets a textarea", () => {
    const result = fieldsFromJsonText(
      JSON.stringify({
        to: "sam@example.com",
        body: LONG_BODY,
        urgent: true,
        extra: "hello",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields.map((field) => [field.kind, field.key])).toEqual([
      ["text", "to"],
      ["text", "body"],
      ["boolean", "urgent"],
      ["text", "extra"],
    ]);
    expect(textFieldByKey(result.fields, "body").multiline).toBe(true);
    expect(result.values).toMatchObject({
      to: "sam@example.com",
      urgent: true,
    });
  });

  it("refuses JSON that is broken or is not one object", () => {
    const broken = fieldsFromJsonText("{oops");
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toContain("not valid JSON");

    for (const text of ["[1,2]", '"just text"', "42", "null"]) {
      const failed = fieldsFromJsonText(text);
      expect(failed.ok).toBe(false);
      if (!failed.ok) expect(failed.error).toContain("one object");
    }
  });
});

describe("sending only what changed", () => {
  it("sends nothing when the form still matches the arguments", () => {
    const args = sampleArgs();
    const fields = deriveFields(args);
    const built = buildArgs(fields, valuesFromFields(fields));
    if (!built.ok) throw new Error("an untouched form should be valid");
    expect(editedArgsIfChanged(args, built.args)).toBeNull();
  });

  it("ignores key order but not list order", () => {
    expect(editedArgsIfChanged({ a: 1, b: "x" }, { b: "x", a: 1 })).toBeNull();
    expect(
      editedArgsIfChanged({ list: ["a", "b"] }, { list: ["b", "a"] }),
    ).toEqual({
      list: ["b", "a"],
    });
    expect(deepEqual({ a: [1, { b: "c" }] }, { a: [1, { b: "c" }] })).toBe(
      true,
    );
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual("2", 2)).toBe(false);
  });

  it("hands back the whole edited object when one argument changed", () => {
    const args = { to: "ada@example.com", copies: 2 };
    const built = { to: "sam@example.com", copies: 2 };
    expect(editedArgsIfChanged(args, built)).toEqual(built);
  });
});

describe("the countdown on a server deadline", () => {
  const EXPIRES = Date.parse("2026-02-01T12:10:00.000Z");
  const deadline = new Date(EXPIRES).toISOString();

  it("counts the minutes and seconds left off the server's expiry", () => {
    const view = countdownFor(deadline, EXPIRES - 272_000);
    expect(view).toEqual({
      hasDeadline: true,
      expired: false,
      urgent: false,
      text: "Expires in 4:32",
    });
  });

  it("turns amber under a minute and stays calm above it", () => {
    expect(countdownFor(deadline, EXPIRES - 59_999)).toMatchObject({
      urgent: true,
      expired: false,
    });
    expect(countdownFor(deadline, EXPIRES - 60_000).urgent).toBe(false);
    expect(countdownFor(deadline, EXPIRES - 61_000).urgent).toBe(false);
  });

  it("reads as expired at the deadline and after it", () => {
    expect(countdownFor(deadline, EXPIRES)).toMatchObject({
      expired: true,
      urgent: false,
      text: "",
    });
    expect(countdownFor(deadline, EXPIRES - 1)).toMatchObject({
      expired: false,
      text: "Expires in 0:00",
    });
    expect(countdownFor(deadline, EXPIRES + 5_000).expired).toBe(true);
    expect(EXPIRED_COPY).toBe("This request expired. Ask again.");
  });

  it("takes a plain timestamp or a number, and gives up quietly on anything else", () => {
    expect(countdownFor(EXPIRES, EXPIRES - 30_000)).toMatchObject({
      hasDeadline: true,
      urgent: true,
    });
    expect(countdownFor(undefined, Date.now()).hasDeadline).toBe(false);
    expect(countdownFor(null, Date.now()).text).toBe("");
    expect(countdownFor("not a date", Date.now()).hasDeadline).toBe(false);
    expect(countdownFor("", Date.now()).hasDeadline).toBe(false);
  });

  it("pads seconds but not minutes, and never goes negative", () => {
    expect(formatRemaining(272_000)).toBe("4:32");
    expect(formatRemaining(60_000)).toBe("1:00");
    expect(formatRemaining(59_999)).toBe("0:59");
    expect(formatRemaining(3_600_000)).toBe("60:00");
    expect(formatRemaining(-500)).toBe("0:00");
  });
});

describe("showing more of a long value", () => {
  it("collapses anything that would run past the phone screen", () => {
    expect(isLongText(LONG_BODY)).toBe(true);
    // Seven wrapped lines at roughly 40 characters per line on a 390 px screen.
    expect(isLongText("x".repeat(281))).toBe(true);
    expect(isLongText("a\nb\nc\nd\ne\nf\ng")).toBe(true);
  });

  it("leaves a short value alone", () => {
    expect(isLongText("ada@example.com")).toBe(false);
    expect(isLongText("a\nb\nc")).toBe(false);
    expect(isLongText("x".repeat(240))).toBe(false);
    expect(isLongText("")).toBe(false);
  });
});

describe("putting restored cards next to live ones", () => {
  it("keeps one card per request id", () => {
    const live = [{ id: "a", tool: "send_email" }];
    const restored = [
      { id: "a", tool: "send_email" },
      { id: "b", tool: "delete_file" },
    ];
    expect(mergeApprovals(live, restored).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not touch the live list when the server had nothing new", () => {
    const live = [{ id: "a" }];
    expect(mergeApprovals(live, [{ id: "a" }])).toBe(live);
    expect(mergeApprovals([], [])).toEqual([]);
  });
});
