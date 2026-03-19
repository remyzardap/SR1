/**
 * Kemma Agent Tool Dispatcher
 * 
 * Routes tool calls to the appropriate executor modules.
 * Provides centralized error handling and result structuring.
 */

import {
  createFile,
  readFile,
  editFile,
  listFiles,
  trashFile,
  restoreFile,
  purgeFile,
  listTrashedFiles,
  listFileVersions,
} from './executors/safeFiles';

import { webSearch } from './executors/webSearch';
import { browse } from './executors/browse';
import { runCode } from './executors/runCode';
import { generateAndSaveFile as generateFile } from './executors/generateFile';
import { phoneScan } from './executors/phoneScan';

/** Valid tool names supported by the dispatcher */
type ToolName = 
  | 'safe_files'
  | 'web_search'
  | 'browse'
  | 'run_code'
  | 'generate_file'
  | 'phone_scan';

/** Valid safe_files action names */
type SafeFilesAction = 
  | 'create'
  | 'read'
  | 'edit'
  | 'list'
  | 'trash'
  | 'restore'
  | 'purge'
  | 'bin'
  | 'versions';

/** Structured result for successful tool execution */
interface SuccessResult<T = unknown> {
  success: true;
  data: T;
}

/** Structured result for failed tool execution */
interface ErrorResult {
  success: false;
  error: string;
  code: string;
}

/** Union type for tool execution results */
type ToolResult<T = unknown> = SuccessResult<T> | ErrorResult;

/**
 * Creates a standardized success result object
 * @param data - The result data from the tool execution
 * @returns A structured success result
 */
function createSuccessResult<T>(data: T): SuccessResult<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Creates a standardized error result object
 * @param error - The error message
 * @param code - The error code for categorization
 * @returns A structured error result
 */
function createErrorResult(error: string, code: string): ErrorResult {
  return {
    success: false,
    error,
    code,
  };
}

/**
 * Type guard to check if a value is a valid ToolName
 * @param value - The value to check
 * @returns True if the value is a valid ToolName
 */
function isValidToolName(value: unknown): value is ToolName {
  const validTools: ToolName[] = [
    'safe_files',
    'web_search',
    'browse',
    'run_code',
    'generate_file',
    'phone_scan',
  ];
  return typeof value === 'string' && validTools.includes(value as ToolName);
}

/**
 * Type guard to check if a value is a valid SafeFilesAction
 * @param value - The value to check
 * @returns True if the value is a valid SafeFilesAction
 */
function isValidSafeFilesAction(value: unknown): value is SafeFilesAction {
  const validActions: SafeFilesAction[] = [
    'create',
    'read',
    'edit',
    'list',
    'trash',
    'restore',
    'purge',
    'bin',
    'versions',
  ];
  return typeof value === 'string' && validActions.includes(value as SafeFilesAction);
}

/**
 * Routes safe_files actions to the appropriate handler function
 * @param userId - The ID of the user making the request
 * @param action - The action to perform
 * @param args - The arguments for the action
 * @returns Promise resolving to the tool result
 */
async function routeSafeFilesAction(
  userId: number,
  action: SafeFilesAction,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (action) {
    case 'create': {
      const { path, content, mimeType } = args;
      if (typeof path !== 'string') {
        return createErrorResult('Missing or invalid "path" parameter', 'INVALID_PARAMS');
      }
      if (typeof content !== 'string') {
        return createErrorResult('Missing or invalid "content" parameter', 'INVALID_PARAMS');
      }
      const result = await createFile(
        userId,
        path,
        content,
        typeof mimeType === 'string' ? mimeType : undefined
      );
      return createSuccessResult(result);
    }

    case 'read': {
      const { fileId } = args;
      if (typeof fileId !== 'string' && typeof fileId !== 'number') {
        return createErrorResult('Missing or invalid "fileId" parameter', 'INVALID_PARAMS');
      }
      const result = await readFile(userId, String(fileId));
      return createSuccessResult(result);
    }

    case 'edit': {
      const { fileId, newContent } = args;
      if (typeof fileId !== 'string' && typeof fileId !== 'number') {
        return createErrorResult('Missing or invalid "fileId" parameter', 'INVALID_PARAMS');
      }
      if (typeof newContent !== 'string') {
        return createErrorResult('Missing or invalid "newContent" parameter', 'INVALID_PARAMS');
      }
      const result = await editFile(userId, String(fileId), newContent);
      return createSuccessResult(result);
    }

    case 'list': {
      const result = await listFiles(userId);
      return createSuccessResult(result);
    }

    case 'trash': {
      const { fileId } = args;
      if (typeof fileId !== 'string' && typeof fileId !== 'number') {
        return createErrorResult('Missing or invalid "fileId" parameter', 'INVALID_PARAMS');
      }
      const result = await trashFile(userId, String(fileId));
      return createSuccessResult(result);
    }

    case 'restore': {
      const { fileId } = args;
      if (typeof fileId !== 'string' && typeof fileId !== 'number') {
        return createErrorResult('Missing or invalid "fileId" parameter', 'INVALID_PARAMS');
      }
      const result = await restoreFile(userId, String(fileId));
      return createSuccessResult(result);
    }

    case 'purge': {
      const { fileId, password } = args;
      if (typeof fileId !== 'string' && typeof fileId !== 'number') {
        return createErrorResult('Missing or invalid "fileId" parameter', 'INVALID_PARAMS');
      }
      if (typeof password !== 'string') {
        return createErrorResult('Missing or invalid "password" parameter', 'INVALID_PARAMS');
      }
      const result = await purgeFile(userId, String(fileId), password);
      return createSuccessResult(result);
    }

    case 'bin': {
      const result = await listTrashedFiles(userId);
      return createSuccessResult(result);
    }

    case 'versions': {
      const { fileId } = args;
      if (typeof fileId !== 'string' && typeof fileId !== 'number') {
        return createErrorResult('Missing or invalid "fileId" parameter', 'INVALID_PARAMS');
      }
      const result = await listFileVersions(userId, String(fileId));
      return createSuccessResult(result);
    }

    default: {
      // This should never happen due to type guard, but included for exhaustiveness
      return createErrorResult(`Unknown safe_files action: ${action}`, 'UNKNOWN_ACTION');
    }
  }
}

/**
 * Main tool dispatcher function.
 * Routes tool calls to the appropriate executor based on toolName.
 * 
 * @param userId - The ID of the user making the tool call
 * @param toolName - The name of the tool to execute
 * @param args - The arguments for the tool execution
 * @returns Promise resolving to a structured result (success or error)
 */
export async function executeToolCall(
  userId: number,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  try {
    // Validate tool name
    if (!isValidToolName(toolName)) {
      return createErrorResult(`Unknown tool: ${toolName}`, 'UNKNOWN_TOOL');
    }

    // Ensure args is an object for parameter extraction
    const safeArgs = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {};

    switch (toolName) {
      case 'safe_files': {
        const { action } = safeArgs;
        if (!isValidSafeFilesAction(action)) {
          return createErrorResult(
            'Missing or invalid "action" parameter for safe_files tool',
            'INVALID_PARAMS'
          );
        }
        return await routeSafeFilesAction(userId, action, safeArgs);
      }

      case 'web_search': {
        const { query } = safeArgs;
        if (typeof query !== 'string') {
          return createErrorResult('Missing or invalid "query" parameter', 'INVALID_PARAMS');
        }
        const result = await webSearch(query);
        return createSuccessResult(result);
      }

      case 'browse': {
        const { url, operation } = safeArgs;
        if (typeof url !== 'string') {
          return createErrorResult('Missing or invalid "url" parameter', 'INVALID_PARAMS');
        }
        const result = await browse(url);
        return createSuccessResult(result);
      }

      case 'run_code': {
        const { code, language } = safeArgs;
        if (typeof code !== 'string') {
          return createErrorResult('Missing or invalid "code" parameter', 'INVALID_PARAMS');
        }
        const result = await runCode(code, typeof language === 'string' ? language : undefined);
        return createSuccessResult(result);
      }

      case 'generate_file': {
        const { description, outputPath, options } = safeArgs;
        if (typeof description !== 'string') {
          return createErrorResult('Missing or invalid "description" parameter', 'INVALID_PARAMS');
        }
        if (typeof outputPath !== 'string') {
          return createErrorResult('Missing or invalid "outputPath" parameter', 'INVALID_PARAMS');
        }
        const result = await generateFile(
          description,
          outputPath,
          typeof options === 'object' && options !== null ? options as Record<string, unknown> : undefined
        );
        return createSuccessResult(result);
      }

      case 'phone_scan': {
        const { target, scanType } = safeArgs;
        if (typeof target !== 'string') {
          return createErrorResult('Missing or invalid "target" parameter', 'INVALID_PARAMS');
        }
        const result = await phoneScan(target, typeof scanType === 'string' ? scanType : undefined);
        return createSuccessResult(result);
      }

      default: {
        // This should never happen due to type guard, but included for exhaustiveness
        return createErrorResult(`Unhandled tool: ${toolName}`, 'INTERNAL_ERROR');
      }
    }
  } catch (error) {
    // Centralized error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorCode = error instanceof Error && 'code' in error 
      ? String((error as Error & { code: unknown }).code) 
      : 'EXECUTION_ERROR';
    
    return createErrorResult(errorMessage, errorCode);
  }
}

export type { ToolResult, SuccessResult, ErrorResult, ToolName, SafeFilesAction };
