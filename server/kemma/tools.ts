/**
 * Kemma Agent Tool Layer
 * OpenAI Function-Calling Format Tool Definitions
 * 
 * @module kemma/tools
 * @description Type-safe tool definitions for the Kemma agent system
 */

/**
 * OpenAI Function-Calling Tool Definition Interface
 */
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: {
        type: string;
        description?: string;
      };
    }>;
    required: string[];
  };
}

/**
 * Tool 1: safe_files
 * Secure file operations. The agent may create, read, edit, list, and view
 * versions. Trash, restore, purge, delete and sharing are UI-only actions;
 * they are never exposed as agent tools.
 */
const safeFilesTool: ToolDefinition = {
  name: "safe_files",
  description: "Secure file operations. Actions: create, read, edit, list, versions. The agent cannot delete, trash, restore, purge or share files.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "The file operation to perform",
        enum: ["create", "read", "edit", "list", "versions"]
      },
      path: {
        type: "string",
        description: "File path for create action (e.g., '/documents/report.txt')"
      },
      content: {
        type: "string",
        description: "File content for create or edit actions"
      },
      mimeType: {
        type: "string",
        description: "MIME type for create action (e.g., 'text/plain', 'application/json')"
      },
      fileId: {
        type: "string",
        description: "Unique file identifier for read, edit, or versions actions"
      },
      newContent: {
        type: "string",
        description: "New content for edit action (archives old version before overwriting)"
      }
    },
    required: ["action"]
  }
};

/**
 * Tool 2: web_search
 * Web search using Perplexity API
 */
const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Perform web searches using Perplexity API. Returns search results with citations and summaries.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to execute"
      },
      numResults: {
        type: "number",
        description: "Number of results to return (default: 5, max: 10)"
      },
      includeCitations: {
        type: "boolean",
        description: "Whether to include source citations in results (default: true)"
      },
      recencyDays: {
        type: "number",
        description: "Limit results to content published within this many days (optional)"
      }
    },
    required: ["query"]
  }
};

/**
 * Tool 3: browse
 * Fetch and parse web pages
 */
const browseTool: ToolDefinition = {
  name: "browse",
  description: "Fetch and parse web page content. Extracts text, metadata, and structured content from URLs.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the web page to fetch"
      },
      extractText: {
        type: "boolean",
        description: "Extract main text content from the page (default: true)"
      },
      extractLinks: {
        type: "boolean",
        description: "Extract all links from the page (default: false)"
      },
      extractImages: {
        type: "boolean",
        description: "Extract image URLs from the page (default: false)"
      },
      maxLength: {
        type: "number",
        description: "Maximum character length for extracted text (default: 10000)"
      },
      waitForSelector: {
        type: "string",
        description: "CSS selector to wait for before extracting (for dynamic content)"
      },
      query: {
        type: "string",
        description: "What you're looking for on this page. When the page is long, the most relevant sections are returned instead of the whole thing."
      },
      interactive: {
        type: "boolean",
        description: "Use a real browser to render the page (slower). Only set this when the page needs JavaScript or a login/click to show its content."
      },
      max_chars: {
        type: "number",
        description: "Maximum characters of page content to return (default: 10000)"
      }
    },
    required: ["url"]
  }
};

/**
 * Tool 4: run_code
 * Execute Python or Node.js code
 */
const runCodeTool: ToolDefinition = {
  name: "run_code",
  description: "Execute Python or Node.js code in a sandboxed environment. Supports code execution with output capture and error handling.",
  parameters: {
    type: "object",
    properties: {
      language: {
        type: "string",
        description: "Programming language to execute",
        enum: ["python", "nodejs"]
      },
      code: {
        type: "string",
        description: "The code to execute"
      },
      timeout: {
        type: "number",
        description: "Execution timeout in seconds (default: 30, max: 300)"
      },
      dependencies: {
        type: "array",
        description: "List of npm/pip packages to install before execution",
        items: {
          type: "string",
          description: "Package name (e.g., 'requests', 'lodash')"
        }
      },
      inputData: {
        type: "string",
        description: "Input data to pass to the code (available as stdin or variable)"
      },
      environment: {
        type: "array",
        description: "Environment variables as KEY=VALUE strings",
        items: {
          type: "string",
          description: "Environment variable in KEY=VALUE format"
        }
      }
    },
    required: ["language", "code"]
  }
};

/**
 * Tool 5: generate_file
 * Generate documents in various formats
 */
const generateFileTool: ToolDefinition = {
  name: "generate_file",
  description: "Generate documents in various formats including PDF, DOCX, XLSX, CSV, and more. Supports templates and custom styling.",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        description: "Output file format",
        enum: ["pdf", "docx", "xlsx", "csv", "txt", "json", "html", "md"]
      },
      content: {
        type: "string",
        description: "Content to include in the generated file (text, HTML, JSON, etc.)"
      },
      template: {
        type: "string",
        description: "Template identifier or predefined template name"
      },
      filename: {
        type: "string",
        description: "Desired filename for the generated file (without extension)"
      },
      metadata: {
        type: "string",
        description: "JSON string containing metadata (title, author, subject, keywords, etc.)"
      },
      styling: {
        type: "string",
        description: "JSON string containing styling options (fonts, colors, margins, etc.)"
      },
      dataSource: {
        type: "string",
        description: "Data source identifier for data-driven document generation"
      }
    },
    required: ["format", "content"]
  }
};

/**
 * Tool 6: phone_scan
 * Bridge tool for phone file operations
 */
const phoneScanTool: ToolDefinition = {
  name: "phone_scan",
  description: "Bridge tool for phone file operations. Enables scanning, uploading, and managing files from mobile devices.",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "The phone operation to perform",
        enum: ["scan", "upload", "list", "delete", "sync", "preview"]
      },
      deviceId: {
        type: "string",
        description: "Unique identifier for the connected mobile device"
      },
      sourcePath: {
        type: "string",
        description: "Source file path on the phone for upload or scan operations"
      },
      destinationPath: {
        type: "string",
        description: "Destination path for uploaded or scanned files"
      },
      scanType: {
        type: "string",
        description: "Type of scan for scan operation",
        enum: ["document", "photo", "qr", "barcode"]
      },
      fileTypes: {
        type: "array",
        description: "Filter file types for list operation",
        items: {
          type: "string",
          description: "File extension or MIME type pattern"
        }
      },
      autoCrop: {
        type: "boolean",
        description: "Enable automatic cropping for document scans (default: true)"
      },
      quality: {
        type: "string",
        description: "Scan/photo quality setting",
        enum: ["low", "medium", "high", "original"]
      }
    },
    required: ["operation"]
  }
};

/**
 * Tool 7: drive_search
 * Search the user's Google Drive.
 */
const driveSearchTool: ToolDefinition = {
  name: "drive_search",
  description: "Search the user's Google Drive by name or query. Returns file id, name, mimeType and webViewLink.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search term to match against file names"
      },
      maxResults: {
        type: "number",
        description: "Maximum results to return (default 10)"
      }
    },
    required: ["query"]
  }
};

/**
 * Tool 8: drive_read
 * Read content from a Google Drive file.
 */
const driveReadTool: ToolDefinition = {
  name: "drive_read",
  description: "Read the text content of a Google Drive file by its id. Works for Google Docs (exported as text) and plain text/binary files.",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The Google Drive file id"
      }
    },
    required: ["fileId"]
  }
};

/**
 * Tool 9: drive_create
 * Create a new file in Google Drive.
 */
const driveCreateTool: ToolDefinition = {
  name: "drive_create",
  description: "Create a new file in the user's Google Drive under the Sutaeru root folder. Returns the file id and link.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "File name including extension"
      },
      content: {
        type: "string",
        description: "File content"
      },
      mimeType: {
        type: "string",
        description: "MIME type (default text/plain)"
      },
      folderPath: {
        type: "string",
        description: "Optional subfolder path inside Sutaeru root, e.g. 'SpaceName/documents'"
      }
    },
    required: ["name", "content"]
  }
};

/**
 * Tool 10: drive_edit
 * Edit an existing Drive file (creates a pending revision; user confirmation required before applying).
 */
const driveEditTool: ToolDefinition = {
  name: "drive_edit",
  description: "Propose an edit to an existing Google Drive file. The change is staged as a pending revision and must be confirmed in the UI before it is applied. Does not modify the file immediately.",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The Google Drive file id"
      },
      newContent: {
        type: "string",
        description: "The proposed new file content"
      },
      reason: {
        type: "string",
        description: "Explanation of the change"
      }
    },
    required: ["fileId", "newContent", "reason"]
  }
};

/**
 * Tool 11: drive_move
 * Move a Google Drive file to a different folder.
 */
const driveMoveTool: ToolDefinition = {
  name: "drive_move",
  description: "Move a Google Drive file to a different folder within the Sutaeru root. Returns success.",
  parameters: {
    type: "object",
    properties: {
      fileId: {
        type: "string",
        description: "The Google Drive file id"
      },
      folderPath: {
        type: "string",
        description: "Target subfolder path inside Sutaeru root"
      }
    },
    required: ["fileId", "folderPath"]
  }
};

/**
 * Skill tools. Not part of KEMMA_TOOLS: the engine adds them only on runs where at least one skill
 * is enabled. They are read-only (load, read) or sandbox-only (run_skill_script) and never widen access.
 */
export const SKILL_TOOL_NAMES = ["load_skill", "read_skill_file", "run_skill_script"] as const;

export const SKILL_TOOLS: ToolDefinition[] = [
  {
    name: "load_skill",
    description: "Load the full instructions of an enabled skill by name (from the Skills index in the system prompt). Call this before starting a task the skill covers.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name exactly as listed in the index" } },
      required: ["name"],
    },
  },
  {
    name: "read_skill_file",
    description: "Read one text file that belongs to a loaded skill (for example references/source-hierarchy.md). Read-only and confined to that skill's folder.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        path: { type: "string", description: "Path relative to the skill folder, for example references/assumptions.md" },
      },
      required: ["name", "path"],
    },
  },
  {
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
];

/**
 * Admin-only, read-only host filesystem access. Not part of KEMMA_TOOLS: the engine adds it only
 * for admin users, and the executor re-checks the role on every call.
 */
export const VPS_FILES_TOOL: ToolDefinition = {
  name: "vps_files",
  description: "Admin-only, read-only access to files on the VPS (the host server). Actions: list a directory, read a text file (up to 200KB, use offset to continue), stat a path, search file names under a directory. Secret files (.env, keys, secrets folders) are blocked. Paths are relative to the VPS root; use \".\" for the root.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "What to do", enum: ["list", "read", "stat", "search"] },
      path: { type: "string", description: "File or directory path, relative to the VPS root" },
      query: { type: "string", description: "File name substring to find (search only)" },
      offset: { type: "number", description: "Byte offset to start reading from (read only)" }
    },
    required: ["action"]
  }
};

/**
 * Exported array containing all Kemma tool definitions
 * @type {ToolDefinition[]}
 */
export const KEMMA_TOOLS: ToolDefinition[] = [
  safeFilesTool,
  webSearchTool,
  browseTool,
  runCodeTool,
  generateFileTool,
  phoneScanTool,
  driveSearchTool,
  driveReadTool,
  driveCreateTool,
  driveEditTool,
  driveMoveTool,
];

export const DRIVE_TOOLS = [
  "drive_search",
  "drive_read",
  "drive_create",
  "drive_edit",
  "drive_move",
];

/**
 * Type exports for external use
 */
export type { ToolDefinition };
export type KemmaToolName = typeof KEMMA_TOOLS[number]["name"];
