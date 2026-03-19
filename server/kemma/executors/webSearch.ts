/**
 * Perplexity Sonar API Client for Web Search
 * 
 * Provides web search functionality using Perplexity's Sonar model.
 * Returns structured search results with title, URL, and snippet.
 */

// ============================================================================
// Types
// ============================================================================

interface PerplexityMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface PerplexityCitation {
  url: string;
}

interface PerplexityChoice {
  index: number;
  message: PerplexityMessage;
  finish_reason: string;
}

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations?: PerplexityCitation[];
  choices: PerplexityChoice[];
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface PerplexityErrorResponse {
  error?: {
    message: string;
    type: string;
    code: string;
  };
  message?: string;
}

// ============================================================================
// Constants
// ============================================================================

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = 'sonar';

// ============================================================================
// Error Classes
// ============================================================================

class PerplexityAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'PerplexityAPIError';
  }
}

class PerplexityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerplexityConfigError';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates that the API key is configured
 */
function validateApiKey(): string {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new PerplexityConfigError(
      'PERPLEXITY_API_KEY environment variable is not set or is empty'
    );
  }
  return apiKey;
}

/**
 * Extracts title from URL for fallback when no explicit title is available
 */
function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Use pathname or hostname as fallback title
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      // Convert last path segment to readable title
      const lastSegment = pathParts[pathParts.length - 1];
      return lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\.(html?|php|asp)$/i, '')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return 'Untitled Result';
  }
}

/**
 * Parses the Perplexity API response to extract search results
 */
function parseSearchResults(response: PerplexityResponse): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract citations from the response
  const citations = response.citations || [];

  // Get the assistant's response content for snippets
  const assistantMessage = response.choices.find(
    (choice) => choice.message.role === 'assistant'
  );
  const content = assistantMessage?.message.content || '';

  // Map citations to search results
  for (const citation of citations) {
    if (citation.url) {
      results.push({
        title: extractTitleFromUrl(citation.url),
        url: citation.url,
        snippet: content.slice(0, 500), // Use response content as snippet
      });
    }
  }

  return results;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Performs a web search using the Perplexity Sonar API.
 * 
 * @param query - The search query string
 * @returns Promise resolving to an array of search results with title, url, and snippet
 * @throws PerplexityConfigError if API key is not configured
 * @throws PerplexityAPIError if the API request fails
 * 
 * @example
 * ```typescript
 * const results = await webSearch('TypeScript best practices');
 * // Returns: [{ title: '...', url: '...', snippet: '...' }, ...]
 * ```
 */
export async function webSearch(
  query: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  // Validate input
  if (!query || query.trim() === '') {
    throw new Error('Search query cannot be empty');
  }

  // Get and validate API key
  const apiKey = validateApiKey();

  // Prepare request body
  const requestBody = {
    model: PERPLEXITY_MODEL,
    messages: [
      {
        role: 'user' as const,
        content: query.trim(),
      },
    ],
  };

  try {
    // Make API request
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorBody = await response.text();
      let parsedError: PerplexityErrorResponse | null = null;

      try {
        parsedError = JSON.parse(errorBody) as PerplexityErrorResponse;
      } catch {
        // Failed to parse error body, use raw text
      }

      const errorMessage =
        parsedError?.error?.message ||
        parsedError?.message ||
        `Perplexity API returned status ${response.status}`;

      throw new PerplexityAPIError(
        errorMessage,
        response.status,
        parsedError || errorBody
      );
    }

    // Parse successful response
    const data = (await response.json()) as PerplexityResponse;

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices)) {
      throw new PerplexityAPIError(
        'Invalid response structure from Perplexity API: missing choices array'
      );
    }

    // Extract and return search results
    const results = parseSearchResults(data);

    // If no citations found but we have content, return a single result
    if (results.length === 0 && data.choices.length > 0) {
      const content = data.choices[0]?.message?.content || '';
      if (content) {
        return [
          {
            title: 'Search Result',
            url: '',
            snippet: content.slice(0, 500),
          },
        ];
      }
    }

    return results;
  } catch (error) {
    // Re-throw known errors
    if (error instanceof PerplexityAPIError || error instanceof PerplexityConfigError) {
      throw error;
    }

    // Handle network/fetch errors
    if (error instanceof Error) {
      throw new PerplexityAPIError(
        `Failed to connect to Perplexity API: ${error.message}`
      );
    }

    // Handle unknown errors
    throw new PerplexityAPIError(
      'An unexpected error occurred while calling Perplexity API'
    );
  }
}

// ============================================================================
// Re-export error classes for consumers
// ============================================================================

export { PerplexityAPIError, PerplexityConfigError };

// Default export for convenience
export default webSearch;
