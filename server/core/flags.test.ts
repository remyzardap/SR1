import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { FLAGS, flag, type FlagName } from "./flags";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const PHASE_1_DEFAULTS: Record<FlagName, boolean> = {
  STREAM_TOOL_TURNS: false,
  PARALLEL_TOOLS: false,
  AUTO_CONTINUE: false,
  SEARCH_V2: false,
  READER_V2: false,
  UNTRUSTED_FENCING: true,
  APPROVALS: false,
  ACTION_TOOLS: false,
  CONTEXT_MANAGER: false,
};

const touched = new Set<string>();
function setEnv(name: FlagName, value: string | undefined) {
  const key = `FF_${name}`;
  touched.add(key);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const saved = Object.fromEntries(Object.keys(FLAGS).map((n) => [`FF_${n}`, process.env[`FF_${n}`]]));
afterEach(() => {
  for (const key of touched) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  touched.clear();
});

describe("flag registry", () => {
  it("holds exactly the Phase 1 flags with their defaults", () => {
    expect(Object.fromEntries(Object.entries(FLAGS).map(([n, s]) => [n, s.default]))).toEqual(PHASE_1_DEFAULTS);
  });

  it("gives every flag a one-line description", () => {
    for (const spec of Object.values(FLAGS)) {
      expect(spec.description.trim().length).toBeGreaterThan(10);
      expect(spec.description).not.toContain("\n");
    }
  });

  it("returns the default when FF_<NAME> is unset or blank", () => {
    for (const name of Object.keys(FLAGS) as FlagName[]) {
      setEnv(name, undefined);
      expect(flag(name)).toBe(PHASE_1_DEFAULTS[name]);
      setEnv(name, "   ");
      expect(flag(name)).toBe(PHASE_1_DEFAULTS[name]);
    }
  });
});

describe("env parsing", () => {
  it.each(["1", "true", "on", "TRUE", "On", " true "])("%j turns a default-off flag on", (value) => {
    setEnv("PARALLEL_TOOLS", value);
    expect(flag("PARALLEL_TOOLS")).toBe(true);
  });

  it.each(["0", "false", "off", "no", "yes", "2", "enabled"])("%j leaves a default-off flag off", (value) => {
    setEnv("PARALLEL_TOOLS", value);
    expect(flag("PARALLEL_TOOLS")).toBe(false);
  });

  it.each(["0", "false", "off", "OFF"])("%j turns the default-on UNTRUSTED_FENCING off", (value) => {
    setEnv("UNTRUSTED_FENCING", value);
    expect(flag("UNTRUSTED_FENCING")).toBe(false);
  });

  it("reads the env at call time, not at import", () => {
    setEnv("SEARCH_V2", undefined);
    expect(flag("SEARCH_V2")).toBe(false);
    setEnv("SEARCH_V2", "1");
    expect(flag("SEARCH_V2")).toBe(true);
    setEnv("SEARCH_V2", "0");
    expect(flag("SEARCH_V2")).toBe(false);
  });

  it("reads only its own FF_ variable", () => {
    setEnv("APPROVALS", "1");
    expect(flag("APPROVALS")).toBe(true);
    expect(flag("ACTION_TOOLS")).toBe(PHASE_1_DEFAULTS.ACTION_TOOLS);
  });
});

describe("unknown flags", () => {
  it("throws at runtime when an unknown name is forced through", () => {
    expect(() => flag("NOT_A_FLAG" as FlagName)).toThrow(/Unknown feature flag: NOT_A_FLAG/);
    expect(() => flag("toString" as FlagName)).toThrow(/Unknown feature flag/);
  });

  it("is a type error: the compiler rejects flag(\"NOT_A_FLAG\") and accepts a registered name", () => {
    // Test files are outside `npm run check`, so compile a small probe against flags.ts here.
    const probe = path.join(HERE, "__flags_type_probe__.ts");
    const source = [
      'import { flag } from "./flags";',
      'export const ok: boolean = flag("UNTRUSTED_FENCING");',
      'export const bad: boolean = flag("NOT_A_FLAG");',
      "",
    ].join("\n");
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ["lib.esnext.d.ts"],
      types: ["node"],
      typeRoots: [path.join(ROOT, "node_modules", "@types")],
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    host.getSourceFile = (fileName, languageVersion, ...rest) =>
      path.resolve(fileName) === probe
        ? ts.createSourceFile(fileName, source, languageVersion, true)
        : getSourceFile(fileName, languageVersion, ...rest);
    host.fileExists = (fileName) => path.resolve(fileName) === probe || fileExists(fileName);

    const program = ts.createProgram([probe], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));

    // Exactly one error, on the unknown name, and none from flags.ts itself.
    expect(messages).toHaveLength(1);
    const [only] = diagnostics;
    expect(path.resolve(only.file!.fileName)).toBe(probe);
    expect(only.file!.getLineAndCharacterOfPosition(only.start!).line).toBe(2);
    expect(messages[0]).toMatch(/"NOT_A_FLAG"/);
  }, 30_000);
});
