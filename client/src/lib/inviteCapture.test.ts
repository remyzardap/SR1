import { describe, expect, it } from "vitest";

import {
  INVITE_PARAM,
  INVITE_STORAGE_KEY,
  captureInviteCode,
  captureInviteFromWindow,
  clearInviteCode,
  inviteLinkFor,
  normalizeInviteCode,
  peekInviteCode,
  readInviteParam,
  saveInviteCode,
  urlWithoutInviteParam,
  type StorageLike,
} from "./inviteCapture";

/** Minimal sessionStorage stand-in; the real thing is not available in the node test env. */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** Storage that fails like Safari's private mode / a full quota does. */
function brokenStorage(): StorageLike {
  const fail = () => {
    throw new Error("SecurityError: storage is disabled");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

describe("invite code normalization", () => {
  it("uppercases and trims, the way the server checks a code", () => {
    expect(normalizeInviteCode("  aB3dEfGhIjKl  ")).toBe("AB3DEFGHIJKL");
  });

  it("treats blank, whitespace and missing input as no code", () => {
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode("   ")).toBeNull();
    expect(normalizeInviteCode(null)).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
  });
});

describe("reading the invite parameter", () => {
  it("reads the code with or without the leading question mark", () => {
    expect(readInviteParam("?invite=Q7K2M9P4XT8R")).toBe("Q7K2M9P4XT8R");
    expect(readInviteParam("invite=Q7K2M9P4XT8R")).toBe("Q7K2M9P4XT8R");
  });

  it("reads nothing when the parameter is absent or empty", () => {
    expect(readInviteParam("")).toBeNull();
    expect(readInviteParam("?mode=signup")).toBeNull();
    expect(readInviteParam("?invite=")).toBeNull();
    expect(readInviteParam("?invite=%20%20")).toBeNull();
  });

  it("keeps working when the invite parameter sits among others", () => {
    expect(readInviteParam("?mode=signup&invite=AB12&x=1")).toBe("AB12");
  });
});

describe("persisting a captured code", () => {
  it("saves under the documented key and reads back without consuming", () => {
    const storage = fakeStorage();
    expect(saveInviteCode("cd99xxpp11qq", storage)).toBe("CD99XXPP11QQ");
    expect([...storage.data.keys()]).toEqual([INVITE_STORAGE_KEY]);
    expect(peekInviteCode(storage)).toBe("CD99XXPP11QQ");
    expect(peekInviteCode(storage)).toBe("CD99XXPP11QQ");
  });

  it("stores nothing for a blank code", () => {
    const storage = fakeStorage();
    expect(saveInviteCode("  ", storage)).toBeNull();
    expect(storage.data.size).toBe(0);
    expect(peekInviteCode(storage)).toBeNull();
  });

  it("clears the stored code", () => {
    const storage = fakeStorage({ [INVITE_STORAGE_KEY]: "AB12" });
    clearInviteCode(storage);
    expect(peekInviteCode(storage)).toBeNull();
    expect([...storage.data.keys()]).toEqual([]);
  });

  it("survives storage that throws instead of breaking the page", () => {
    const broken = brokenStorage();
    expect(saveInviteCode("AB12", broken)).toBe("AB12");
    expect(peekInviteCode(broken)).toBeNull();
    expect(() => clearInviteCode(broken)).not.toThrow();
  });

  it("treats a missing storage object as no stored code", () => {
    expect(saveInviteCode("AB12", null)).toBe("AB12");
    expect(peekInviteCode(null)).toBeNull();
    expect(() => clearInviteCode(null)).not.toThrow();
  });
});

describe("captureInviteCode", () => {
  it("captures the code from the URL into storage", () => {
    const storage = fakeStorage();
    expect(captureInviteCode("?invite=k9m2p4r7t1vz", storage)).toEqual({
      code: "K9M2P4R7T1VZ",
      hadParam: true,
    });
    expect(peekInviteCode(storage)).toBe("K9M2P4R7T1VZ");
  });

  it("reports an empty invite parameter so the caller can still clean the URL", () => {
    const storage = fakeStorage();
    expect(captureInviteCode(`?${INVITE_PARAM}=&mode=signup`, storage)).toEqual({
      code: null,
      hadParam: true,
    });
    expect(peekInviteCode(storage)).toBeNull();
  });

  it("leaves storage alone for a URL without an invite parameter", () => {
    const storage = fakeStorage({ [INVITE_STORAGE_KEY]: "ALREADY1" });
    expect(captureInviteCode("?mode=signup", storage)).toEqual({ code: null, hadParam: false });
    expect(peekInviteCode(storage)).toBe("ALREADY1");
    expect(captureInviteCode("", storage)).toEqual({ code: null, hadParam: false });
  });

  it("captures nothing on the server, where there is no window", () => {
    expect(typeof window).toBe("undefined");
    expect(captureInviteFromWindow()).toBeNull();
  });
});

describe("cleaning the address bar", () => {
  it("drops only the invite parameter", () => {
    expect(urlWithoutInviteParam("/login", "?invite=AB12")).toBe("/login");
    expect(urlWithoutInviteParam("/", "?invite=AB12&mode=signup")).toBe("/?mode=signup");
    expect(urlWithoutInviteParam("/chat", "?mode=signup")).toBe("/chat?mode=signup");
  });

  it("builds the link an owner shares from the current origin", () => {
    expect(inviteLinkFor("AB12CD34EF56", "https://sutaeru.example")).toBe(
      "https://sutaeru.example/?invite=AB12CD34EF56",
    );
    expect(inviteLinkFor("AB12CD34EF56", "https://sutaeru.example/")).toBe(
      "https://sutaeru.example/?invite=AB12CD34EF56",
    );
    expect(inviteLinkFor("AB12_CD34-EF56", "http://localhost:3000")).toBe(
      "http://localhost:3000/?invite=AB12_CD34-EF56",
    );
  });
});
