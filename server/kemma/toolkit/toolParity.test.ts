/**
 * Parity test for P1-02 (docs/spec/PHASE-1.md "Tool runtime"): the exact tool names and JSON
 * Schemas offered in each of the scenarios the spec names, checked against FROZEN copies of the
 * hand-written definitions from the pre-refactor server/kemma/tools.ts. Do not "fix" the frozen
 * constants below to match a future code change — if a schema or a tool set has to change, that
 * is a deliberate decision to record in the PR, not a reason to edit this file's expectations.
 *
 * One deliberate behavior fix is called out explicitly where it happens (scenario b): see the
 * comment there and the PR's "Deviations from spec" section.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toOpenAiTools, toolsFor, type OpenAiToolDef } from "./registry";
import type { ToolContext } from "./types";

// ── frozen copies of the old hand-written definitions (server/kemma/tools.ts before P1-02) ──────
const FROZEN: Record<string, OpenAiToolDef> = {
  safe_files: {
    name: "safe_files",
    description: "Secure file operations. Actions: create, read, edit, list, versions. The agent cannot delete, trash, restore, purge or share files.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "The file operation to perform", enum: ["create", "read", "edit", "list", "versions"] },
        path: { type: "string", description: "File path for create action (e.g., '/documents/report.txt')" },
        content: { type: "string", description: "File content for create or edit actions" },
        mimeType: { type: "string", description: "MIME type for create action (e.g., 'text/plain', 'application/json')" },
        fileId: { type: "string", description: "Unique file identifier for read, edit, or versions actions" },
        newContent: { type: "string", description: "New content for edit action (archives old version before overwriting)" },
      },
      required: ["action"],
    },
  },
  web_search: {
    name: "web_search",
    description: "Perform web searches using Perplexity API. Returns search results with citations and summaries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query to execute" },
        numResults: { type: "number", description: "Number of results to return (default: 5, max: 10)" },
        includeCitations: { type: "boolean", description: "Whether to include source citations in results (default: true)" },
        recencyDays: { type: "number", description: "Limit results to content published within this many days (optional)" },
        recency: {
          type: "string",
          description: "Limit results to this recent (P1-08 search provider layer; ignored unless SEARCH_V2 is on)",
          enum: ["day", "week", "month", "year"],
        },
        include_domains: {
          type: "array",
          description: "Only return results from these domains (P1-08 search provider layer; ignored unless SEARCH_V2 is on)",
          items: { type: "string" },
        },
        exclude_domains: {
          type: "array",
          description: "Never return results from these domains (P1-08 search provider layer; ignored unless SEARCH_V2 is on)",
          items: { type: "string" },
        },
        vertical: {
          type: "string",
          description: "Search vertical (P1-08 search provider layer; ignored unless SEARCH_V2 is on)",
          enum: ["web", "news"],
        },
        depth: {
          type: "string",
          description: '"deep" fans the query out to two providers in parallel and fuses the results (P1-08 search provider layer; ignored unless SEARCH_V2 is on)',
          enum: ["standard", "deep"],
        },
      },
      required: ["query"],
    },
  },
  browse: {
    name: "browse",
    description: "Fetch and parse web page content. Extracts text, metadata, and structured content from URLs.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL of the web page to fetch" },
        extractText: { type: "boolean", description: "Extract main text content from the page (default: true)" },
        extractLinks: { type: "boolean", description: "Extract all links from the page (default: false)" },
        extractImages: { type: "boolean", description: "Extract image URLs from the page (default: false)" },
        maxLength: { type: "number", description: "Maximum character length for extracted text (default: 10000)" },
        waitForSelector: { type: "string", description: "CSS selector to wait for before extracting (for dynamic content)" },
        query: { type: "string", description: "What you're looking for on this page. When the page is long, the most relevant sections are returned instead of the whole thing." },
        interactive: { type: "boolean", description: "Use a real browser to render the page (slower). Only set this when the page needs JavaScript or a login/click to show its content." },
        max_chars: { type: "number", description: "Maximum characters of page content to return (default: 10000)" },
      },
      required: ["url"],
    },
  },
  run_code: {
    name: "run_code",
    description: "Execute Python or Node.js code in a sandboxed environment. Supports code execution with output capture and error handling.",
    parameters: {
      type: "object",
      properties: {
        language: { type: "string", description: "Programming language to execute", enum: ["python", "nodejs"] },
        code: { type: "string", description: "The code to execute" },
        timeout: { type: "number", description: "Execution timeout in seconds (default: 30, max: 300)" },
        dependencies: { type: "array", description: "List of npm/pip packages to install before execution", items: { type: "string", description: "Package name (e.g., 'requests', 'lodash')" } },
        inputData: { type: "string", description: "Input data to pass to the code (available as stdin or variable)" },
        environment: { type: "array", description: "Environment variables as KEY=VALUE strings", items: { type: "string", description: "Environment variable in KEY=VALUE format" } },
      },
      required: ["code"],
    },
  },
  generate_file: {
    name: "generate_file",
    description: "Generate documents in various formats including PDF, DOCX, XLSX, CSV, and more. Supports templates and custom styling.",
    parameters: {
      type: "object",
      properties: {
        format: { type: "string", description: "Output file format", enum: ["pdf", "docx", "xlsx", "csv", "txt", "json", "html", "md"] },
        content: { type: "string", description: "Content to include in the generated file (text, HTML, JSON, etc.)" },
        template: { type: "string", description: "Template identifier or predefined template name" },
        filename: { type: "string", description: "Desired filename for the generated file (without extension)" },
        metadata: { type: "string", description: "JSON string containing metadata (title, author, subject, keywords, etc.)" },
        styling: { type: "string", description: "JSON string containing styling options (fonts, colors, margins, etc.)" },
        dataSource: { type: "string", description: "Data source identifier for data-driven document generation" },
      },
      required: ["format", "content"],
    },
  },
  phone_scan: {
    name: "phone_scan",
    description: "Bridge tool for phone file operations. Enables scanning, uploading, and managing files from mobile devices.",
    parameters: {
      type: "object",
      properties: {
        operation: { type: "string", description: "The phone operation to perform", enum: ["scan", "upload", "list", "delete", "sync", "preview"] },
        deviceId: { type: "string", description: "Unique identifier for the connected mobile device" },
        sourcePath: { type: "string", description: "Source file path on the phone for upload or scan operations" },
        destinationPath: { type: "string", description: "Destination path for uploaded or scanned files" },
        scanType: { type: "string", description: "Type of scan for scan operation", enum: ["document", "photo", "qr", "barcode"] },
        fileTypes: { type: "array", description: "Filter file types for list operation", items: { type: "string", description: "File extension or MIME type pattern" } },
        autoCrop: { type: "boolean", description: "Enable automatic cropping for document scans (default: true)" },
        quality: { type: "string", description: "Scan/photo quality setting", enum: ["low", "medium", "high", "original"] },
      },
      required: ["operation"],
    },
  },
  drive_search: {
    name: "drive_search",
    description: "Search the user's Google Drive by name or query. Returns file id, name, mimeType and webViewLink.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search term to match against file names" }, maxResults: { type: "number", description: "Maximum results to return (default 10)" } },
      required: ["query"],
    },
  },
  drive_read: {
    name: "drive_read",
    description: "Read the text content of a Google Drive file by its id. Works for Google Docs (exported as text) and plain text/binary files.",
    parameters: { type: "object", properties: { fileId: { type: "string", description: "The Google Drive file id" } }, required: ["fileId"] },
  },
  drive_create: {
    name: "drive_create",
    description: "Create a new file in the user's Google Drive under the Sutaeru root folder. Returns the file id and link.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name including extension" },
        content: { type: "string", description: "File content" },
        mimeType: { type: "string", description: "MIME type (default text/plain)" },
        folderPath: { type: "string", description: "Optional subfolder path inside Sutaeru root, e.g. 'SpaceName/documents'" },
      },
      required: ["name", "content"],
    },
  },
  drive_edit: {
    name: "drive_edit",
    description: "Propose an edit to an existing Google Drive file. The change is staged as a pending revision and must be confirmed in the UI before it is applied. Does not modify the file immediately.",
    parameters: {
      type: "object",
      properties: {
        fileId: { type: "string", description: "The Google Drive file id" },
        newContent: { type: "string", description: "The proposed new file content" },
        reason: { type: "string", description: "Explanation of the change" },
      },
      required: ["fileId", "newContent", "reason"],
    },
  },
  drive_move: {
    name: "drive_move",
    description: "Move a Google Drive file to a different folder within the Sutaeru root. Returns success.",
    parameters: {
      type: "object",
      properties: { fileId: { type: "string", description: "The Google Drive file id" }, folderPath: { type: "string", description: "Target subfolder path inside Sutaeru root" } },
      required: ["fileId", "folderPath"],
    },
  },
  vps_files: {
    name: "vps_files",
    description: "Admin-only, read-only access to files on the VPS (the host server). Actions: list a directory, read a text file (up to 200KB, use offset to continue), stat a path, search file names under a directory. Secret files (.env, keys, secrets folders) are blocked. Paths are relative to the VPS root; use \".\" for the root.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "What to do", enum: ["list", "read", "stat", "search"] },
        path: { type: "string", description: "File or directory path, relative to the VPS root" },
        query: { type: "string", description: "File name substring to find (search only)" },
        offset: { type: "number", description: "Byte offset to start reading from (read only)" },
      },
      required: ["action"],
    },
  },
  load_skill: {
    name: "load_skill",
    description: "Load the full instructions of an enabled skill by name (from the Skills index in the system prompt). Call this before starting a task the skill covers.",
    parameters: { type: "object", properties: { name: { type: "string", description: "Skill name exactly as listed in the index" } }, required: ["name"] },
  },
  read_skill_file: {
    name: "read_skill_file",
    description: "Read one text file that belongs to a loaded skill (for example references/source-hierarchy.md). Read-only and confined to that skill's folder.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name" }, path: { type: "string", description: "Path relative to the skill folder, for example references/assumptions.md" } },
      required: ["name", "path"],
    },
  },
  run_skill_script: {
    name: "run_skill_script",
    description: "Run a script from a skill's scripts/ folder inside the isolated E2B sandbox (.py, .js or .sh). The skill folder is available at /skills/<name>; write outputs to /output. Returns stdout, stderr and the files written to /output.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        script: { type: "string", description: "Script path relative to the skill folder, for example scripts/build_model.py" },
        args: { type: "array", items: { type: "string" }, description: "Command line arguments" },
      },
      required: ["name", "script"],
    },
  },
};

const CORE_NAMES = ["safe_files", "web_search", "browse", "run_code", "generate_file", "phone_scan"];
const DRIVE_NAMES = ["drive_search", "drive_read", "drive_create", "drive_edit", "drive_move"];
const SKILL_NAMES = ["load_skill", "read_skill_file", "run_skill_script"];

function baseCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return { userId: 42, runId: "run-1", tier: "trial", signal: new AbortController().signal, emit: () => {}, ...overrides };
}

function expectFrozenMatch(defs: OpenAiToolDef[], names: string[]) {
  expect(defs.map((d) => d.name).sort()).toEqual([...names].sort());
  for (const d of defs) expect(d).toEqual(FROZEN[d.name]);
}

const admin = vi.hoisted(() => ({ isAdminUser: vi.fn(async () => false) }));
const google = vi.hoisted(() => ({ getConnectionStatus: vi.fn(async () => ({ connected: false })) }));
// Scenario (f) mocks the MCP registry itself (its own filtering — read/draft kept, confirm
// dropped — is exercised directly in server/kemma/mcp/mcpApprovals.test.ts); here we only check
// that the engine-level merge combines toolsFor's output with whatever the registry already
// decided to expose.
const mcpMock = vi.hoisted(() => ({ getMcpRegistry: vi.fn() }));
// Mock the monitors tool to avoid circular dependency: builtin/index.ts -> monitors.ts -> routes/fn/monitors.ts -> engine.ts -> registerBuiltinTools()
const monitorsMock = vi.hoisted(() => ({ registerMonitorTools: vi.fn() }));
vi.mock("../../../kemma/executors/vpsFiles", () => admin);
vi.mock("../../../services/google", () => google);
vi.mock("../mcp/client", () => mcpMock);
vi.mock("./builtin/monitors", () => monitorsMock);

beforeEach(async () => {
  admin.isAdminUser.mockResolvedValue(false);
  google.getConnectionStatus.mockResolvedValue({ connected: false });
  const { registerBuiltinTools } = await import("./builtin");
  registerBuiltinTools();

  // Manually register drive and vpsFiles tools with mocked available functions
  // since the module-level mocks don't work due to import ordering
  const { registerDriveTools } = await import("./builtin/drive");
  const { registerVpsFiles } = await import("./builtin/vpsFiles");
  registerDriveTools();
  registerVpsFiles();
});
afterEach(() => vi.clearAllMocks());

describe("(a) default user, no allowlist", () => {
  it("offers exactly the 6 core tools, schemas matching the frozen pre-refactor shape", async () => {
    const specs = await toolsFor(baseCtx());
    expectFrozenMatch(toOpenAiTools(specs), CORE_NAMES);
  });
});

describe("(b) Drive-connected user", () => {
  it("adds the 4 Drive tools that need no approval, with no duplicates", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: true });
    const specs = await toolsFor(baseCtx());
    // DELIBERATE FIX vs. pre-refactor: the old KEMMA_TOOLS array baked the 5 Drive tool
    // definitions in statically, so every user — connected or not — was offered them, and a
    // connected user got a second, duplicate copy appended on top (11 or 16 entries sent to the
    // model). toolsFor now gates Drive tools on connection status with no duplicates: 6 when not
    // connected (scenario a). See the PR's "Deviations from spec".
    //
    // DELIBERATE P1-11 CHANGE: that count is 10, not 11, when this run has nobody to ask.
    // drive_edit declares `requiresApproval`, so a run without an approval gate must not be offered
    // it at all — the listing rule applies to the Drive group like every other group. With an
    // approver present (next test) all 11 come back.
    expectFrozenMatch(toOpenAiTools(specs), [
      ...CORE_NAMES,
      "drive_search",
      "drive_read",
      "drive_create",
      "drive_move",
    ]);
    expect(specs.length).toBe(new Set(specs.map((s) => s.name)).size); // no duplicate names
  });

  it("restores drive_edit once the run can actually approve it", async () => {
    process.env.FF_APPROVALS = "1";
    google.getConnectionStatus.mockResolvedValue({ connected: true });
    const specs = await toolsFor(
      baseCtx({ approvals: { request: async () => ({ decision: "approved" as const, args: {}, approvalId: "ap-1" }) } }),
    );
    delete process.env.FF_APPROVALS;
    expectFrozenMatch(toOpenAiTools(specs), [...CORE_NAMES, ...DRIVE_NAMES]);
  });
});

describe("(c) admin user (vps_files included)", () => {
  it("adds vps_files for an admin, alongside the 6 core tools", async () => {
    admin.isAdminUser.mockResolvedValue(true);
    const specs = await toolsFor(baseCtx());
    expectFrozenMatch(toOpenAiTools(specs), [...CORE_NAMES, "vps_files"]);
  });

  it("a non-admin never sees vps_files", async () => {
    admin.isAdminUser.mockResolvedValue(false);
    const specs = await toolsFor(baseCtx());
    expect(specs.map((s) => s.name)).not.toContain("vps_files");
  });

  it("an admin running as a sub-agent is never offered vps_files, even without allowedTools", async () => {
    admin.isAdminUser.mockResolvedValue(true);
    const specs = await toolsFor(baseCtx({ isSubAgent: true }));
    expect(specs.map((s) => s.name)).not.toContain("vps_files");
    expectFrozenMatch(toOpenAiTools(specs), CORE_NAMES);
  });
});

describe("(d) skills enabled, one skill loaded that narrows tools", () => {
  it("narrowing keeps only the skill's allowed tools plus the skill tools themselves", async () => {
    const original = await toolsFor(baseCtx({ skillsEnabled: true }));
    expectFrozenMatch(toOpenAiTools(original), [...CORE_NAMES, ...SKILL_NAMES]);

    // Simulate a loaded skill whose SKILL.md declares allowed-tools: [browse] — the same
    // narrowing rule the engine applies: keep the allowed names, plus the 3 skill tool names.
    const allowed = new Set(["browse", ...SKILL_NAMES]);
    const narrowed = original.filter((s) => allowed.has(s.name));
    expectFrozenMatch(toOpenAiTools(narrowed), ["browse", ...SKILL_NAMES]);
  });

  it("run_skill_script is dropped when run_code itself was filtered out, but load_skill/read_skill_file still appear", async () => {
    // Skill tools are added whenever ctx.skillsEnabled is set, independent of the allowlist — the
    // same unconditional append the pre-refactor engine did — except run_skill_script specifically
    // needs run_code to have survived filtering, which an explicit ["web_search"] allowlist excludes.
    const specs = await toolsFor(baseCtx({ skillsEnabled: true }), ["web_search"]);
    expect(specs.map((s) => s.name).sort()).toEqual(["load_skill", "read_skill_file", "web_search"].sort());
  });
});

describe("(e) explicit allowedTools list", () => {
  it('allowedTools: ["web_search"] offers exactly that tool, even for an admin with Drive connected', async () => {
    admin.isAdminUser.mockResolvedValue(true);
    google.getConnectionStatus.mockResolvedValue({ connected: true });
    const specs = await toolsFor(baseCtx(), ["web_search"]);
    expectFrozenMatch(toOpenAiTools(specs), ["web_search"]);
  });

  it('allowlist naming Drive tools: offers them when connected, but drops them when disconnected', async () => {
    // Connected: both allowed tools offered
    google.getConnectionStatus.mockResolvedValue({ connected: true });
    const connectedSpecs = await toolsFor(baseCtx(), ["web_search", "drive_search"]);
    expectFrozenMatch(toOpenAiTools(connectedSpecs), ["web_search", "drive_search"]);

    // Disconnected: drive_search dropped because Drive is not connected
    google.getConnectionStatus.mockResolvedValue({ connected: false });
    const disconnectedSpecs = await toolsFor(baseCtx(), ["web_search", "drive_search"]);
    expectFrozenMatch(toOpenAiTools(disconnectedSpecs), ["web_search"]);
  });
});

describe("(f) MCP tools, including one confirm-mode tool that stays hidden", () => {
  it("the engine's wire list combines core tools with whatever the (mocked) MCP registry exposes", async () => {
    // The registry has already dropped the confirm-mode tool, exactly as mcpApprovals.test.ts
    // proves it does for a real (SDK-mocked) registry; this checks the merge on the engine side.
    mcpMock.getMcpRegistry.mockReturnValue({
      tools: async () => [
        { name: "mcp__s__search_docs", description: "search", parameters: { type: "object", properties: {}, required: [] } },
        { name: "mcp__s__make_draft", description: "draft", parameters: { type: "object", properties: {}, required: [] } },
        // mcp__s__send_the_thing (confirm-mode) is deliberately absent: the registry already hid it.
      ],
    });
    const { getMcpRegistry } = await import("../mcp/client");
    const mcpDefs = await getMcpRegistry().tools();
    const specs = await toolsFor(baseCtx());
    const wireNames = [...toOpenAiTools(specs), ...mcpDefs].map((d) => d.name).sort();
    expect(wireNames).toEqual([...CORE_NAMES, "mcp__s__make_draft", "mcp__s__search_docs"].sort());
    expect(wireNames.some((n) => n.includes("send_the_thing"))).toBe(false);
  });
});
