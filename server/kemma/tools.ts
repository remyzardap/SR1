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
 * Secure file operations with versioning and trash management
 * CRITICAL: No direct delete - only trash/purge with password verification
 */
const safeFilesTool: ToolDefinition = {
  name: "safe_files",
  description: "Secure file operations with versioning and trash management. Actions: create, read, edit, list, trash, restore, purge, bin, versions. NOTE: No direct delete - files are moved to trash. Purge requires password verification.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "The file operation to perform",
        enum: ["create", "read", "edit", "list", "trash", "restore", "purge", "bin", "versions"]
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
        description: "Unique file identifier for read, edit, trash, restore, purge, or versions actions"
      },
      newContent: {
        type: "string",
        description: "New content for edit action (archives old version before overwriting)"
      },
      password: {
        type: "string",
        description: "Required password for purge action to permanently delete files"
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
 * Exported array containing all Kemma tool definitions
 * @type {ToolDefinition[]}
 */
export const KEMMA_TOOLS: ToolDefinition[] = [
  safeFilesTool,
  webSearchTool,
  browseTool,
  runCodeTool,
  generateFileTool,
  phoneScanTool
];

/**
 * Type exports for external use
 */
export type { ToolDefinition };
export type KemmaToolName = typeof KEMMA_TOOLS[number]["name"];
