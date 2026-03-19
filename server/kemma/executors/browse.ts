/**
 * URL fetch and parse utility for extracting readable content from web pages.
 * Handles timeouts, HTML stripping, and error recovery.
 */

interface BrowseResult {
  title: string;
  content: string;
}

interface BrowseError extends Error {
  code: string;
  statusCode?: number;
}

const FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_LENGTH = 5000;

/**
 * Creates an error with additional metadata for debugging
 */
function createBrowseError(message: string, code: string, statusCode?: number): BrowseError {
  const error = new Error(message) as BrowseError;
  error.code = code;
  if (statusCode !== undefined) {
    error.statusCode = statusCode;
  }
  return error;
}

/**
 * Validates and normalizes a URL string
 */
function validateUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw createBrowseError('URL is required and must be a string', 'INVALID_URL');
  }

  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    throw createBrowseError('URL cannot be empty', 'INVALID_URL');
  }

  // Add protocol if missing
  let normalizedUrl = trimmedUrl;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    const urlObj = new URL(normalizedUrl);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw createBrowseError(`Unsupported protocol: ${urlObj.protocol}`, 'INVALID_URL');
    }
    return normalizedUrl;
  } catch (err) {
    if (err instanceof BrowseError) throw err;
    throw createBrowseError(`Invalid URL format: ${trimmedUrl}`, 'INVALID_URL');
  }
}

/**
 * Fetches a URL with timeout support
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw createBrowseError(`Request timed out after ${timeoutMs}ms`, 'TIMEOUT');
      }
      if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
        throw createBrowseError(`Host not found: ${url}`, 'HOST_NOT_FOUND');
      }
      if (err.message.includes('ECONNREFUSED')) {
        throw createBrowseError(`Connection refused: ${url}`, 'CONNECTION_REFUSED');
      }
      if (err.message.includes('ETIMEDOUT')) {
        throw createBrowseError(`Connection timed out: ${url}`, 'TIMEOUT');
      }
    }
    throw createBrowseError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'NETWORK_ERROR');
  }
}

/**
 * Extracts title from HTML content
 */
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return decodeHtmlEntities(titleMatch[1].trim()) || 'Untitled';
  }
  return 'Untitled';
}

/**
 * Decodes common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&hellip;': '…',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return decoded;
}

/**
 * Strips HTML tags and extracts readable text
 */
function stripHtml(html: string): string {
  // Remove script tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');

  // Remove style tags and their content
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');

  // Remove noscript tags
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');

  // Remove iframe tags
  text = text.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, ' ');

  // Remove SVG content
  text = text.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ');

  // Replace common block elements with newlines for better readability
  text = text.replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote)>/gi, '\n');
  text = text.replace(/<(?:br|hr)\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Normalize whitespace: collapse multiple spaces/tabs into single space
  text = text.replace(/[ \t]+/g, ' ');

  // Normalize newlines: collapse multiple newlines into double newline (paragraph break)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace from each line and the whole text
  text = text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();

  return text;
}

/**
 * Fetches a URL and extracts readable title and content.
 *
 * @param url - The URL to fetch and parse
 * @returns Promise resolving to title and extracted text content
 * @throws BrowseError on timeout, network errors, or invalid URLs
 *
 * @example
 * ```typescript
 * const result = await browseUrl('https://example.com');
 * console.log(result.title);   // "Example Domain"
 * console.log(result.content); // "This domain is for use in..."
 * ```
 */
export async function browse(url: string): Promise<BrowseResult> {
  const validatedUrl = validateUrl(url);

  let response: Response;
  try {
    response = await fetchWithTimeout(validatedUrl, FETCH_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof BrowseError) throw err;
    throw createBrowseError(`Failed to fetch URL: ${err instanceof Error ? err.message : 'Unknown error'}`, 'FETCH_ERROR');
  }

  // Handle HTTP error status codes
  if (!response.ok) {
    if (response.status === 404) {
      throw createBrowseError(`Page not found (404): ${validatedUrl}`, 'NOT_FOUND', 404);
    }
    if (response.status === 403) {
      throw createBrowseError(`Access forbidden (403): ${validatedUrl}`, 'FORBIDDEN', 403);
    }
    if (response.status === 401) {
      throw createBrowseError(`Unauthorized (401): ${validatedUrl}`, 'UNAUTHORIZED', 401);
    }
    if (response.status >= 500) {
      throw createBrowseError(`Server error (${response.status}): ${validatedUrl}`, 'SERVER_ERROR', response.status);
    }
    throw createBrowseError(`HTTP error ${response.status}: ${validatedUrl}`, 'HTTP_ERROR', response.status);
  }

  // Check content type
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    // Still try to parse if no content-type or unexpected type
    // Some servers don't set proper headers
  }

  let html: string;
  try {
    html = await response.text();
  } catch (err) {
    throw createBrowseError(`Failed to read response body: ${err instanceof Error ? err.message : 'Unknown error'}`, 'READ_ERROR');
  }

  if (!html || html.trim().length === 0) {
    throw createBrowseError('Response body is empty', 'EMPTY_RESPONSE');
  }

  const title = extractTitle(html);
  const rawContent = stripHtml(html);

  // Limit content length
  const content = rawContent.length > MAX_CONTENT_LENGTH
    ? rawContent.substring(0, MAX_CONTENT_LENGTH)
    : rawContent;

  return { title, content };
}

export type { BrowseResult, BrowseError };
