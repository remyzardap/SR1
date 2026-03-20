/**
 * Phone Scan Executor with Gemini Flash Vision
 * 
 * Uses Gemini Flash for:
 * - Document scanning and OCR
 * - Image understanding
 * - Receipt/invoice extraction
 * - Phone camera document capture
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiVisionRoute } from "../../core/kemmaRouter";

export interface PhoneScanInput {
  imageBase64: string;
  mimeType: string;  // "image/jpeg", "image/png", "image/heic", etc.
  scanType?: "receipt" | "document" | "general" | "business_card";
  userPrompt?: string;
}

export interface PhoneScanResult {
  success: boolean;
  text?: string;
  structured?: {
    type: string;
    vendor?: string;
    date?: string;
    total?: string;
    currency?: string;
    items?: Array<{ name: string; price: string }>;
    category?: string;
    confidence: number;
  };
  rawResponse?: string;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI FLASH VISION SCANNER
// ═══════════════════════════════════════════════════════════════════════════════

export async function scanWithGemini(input: PhoneScanInput): Promise<PhoneScanResult> {
  const { imageBase64, mimeType, scanType = "general", userPrompt } = input;
  
  const route = geminiVisionRoute();
  
  try {
    const genAI = new GoogleGenerativeAI(route.apiKey);
    const model = genAI.getGenerativeModel({ 
      model: route.model,
      generationConfig: {
        temperature: 0.1,  // Low temperature for accuracy
        maxOutputTokens: 4096,
      }
    });

    // Build specialized prompt based on scan type
    const prompt = userPrompt || buildScanPrompt(scanType);

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    // Parse structured data from response
    const structured = parseStructuredResponse(text, scanType);

    return {
      success: true,
      text,
      structured,
      rawResponse: text,
    };
  } catch (err) {
    console.error("[scanWithGemini] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error during scan",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildScanPrompt(scanType: string): string {
  switch (scanType) {
    case "receipt":
      return `Analyze this receipt/invoice image and extract the following information in JSON format:
{
  "vendor": "store or business name",
  "date": "transaction date",
  "total": "total amount",
  "currency": "currency code (USD, EUR, IDR, etc)",
  "items": [
    {"name": "item name", "price": "item price"}
  ],
  "category": "expense category",
  "confidence": 0.95
}

If any field is unclear, use null. Return ONLY the JSON, no other text.`;

    case "document":
      return `Extract all text from this document. Preserve the structure and formatting as much as possible.

If this is a form, extract field names and values.
If this is a letter, preserve paragraphs.
If this contains tables, format them as markdown.

Return the extracted text in a clean, readable format.`;

    case "business_card":
      return `Extract contact information from this business card and return in JSON format:
{
  "name": "person's full name",
  "title": "job title",
  "company": "company name",
  "email": "email address",
  "phone": "phone number",
  "website": "website URL",
  "address": "physical address",
  "confidence": 0.95
}

Return ONLY the JSON, no other text.`;

    case "general":
    default:
      return `Describe what you see in this image. If it contains text, transcribe it. If it's a document, summarize the key information.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE PARSERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseStructuredResponse(text: string, scanType: string): PhoneScanResult["structured"] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        type: scanType,
        vendor: parsed.vendor || parsed.store || parsed.merchant,
        date: parsed.date,
        total: parsed.total || parsed.amount,
        currency: parsed.currency,
        items: parsed.items,
        category: parsed.category,
        confidence: parsed.confidence || 0.8,
      };
    }
  } catch {
    // JSON parsing failed, return basic structure
  }

  // Fallback: extract what we can with regex
  const vendor = text.match(/(?:vendor|store|merchant|from)[:\s]+([^\n]+)/i)?.[1]?.trim();
  const date = text.match(/(?:date|when)[:\s]+([^\n]+)/i)?.[1]?.trim();
  const total = text.match(/(?:total|amount|sum)[:\s]+([^\n]+)/i)?.[1]?.trim();
  const currency = text.match(/(?:currency|\$|€|£|Rp)/i)?.[0];

  return {
    type: scanType,
    vendor,
    date,
    total,
    currency: currency === "$" ? "USD" : currency === "€" ? "EUR" : currency === "£" ? "GBP" : currency === "Rp" ? "IDR" : currency,
    confidence: 0.6,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY PHONE SCAN BRIDGE (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PhoneInstructions {
  platform: 'ios' | 'android';
  method: 'shortcut' | 'termux';
  instructions: string;
  script?: string;
  expectedOutput: string;
}

export interface ScanOptions {
  path?: string;
  categories?: string[];
}

export type ScanAction = 'scan' | 'categorize' | 'duplicates' | 'suggest_cleanup';

/**
 * Legacy phone scan function - now redirects to Gemini vision
 */
export async function phoneScan(
  action: ScanAction,
  options?: ScanOptions
): Promise<PhoneInstructions> {
  const platform = detectPlatform();

  switch (action) {
    case 'scan':
      return generateScanInstructions(platform, options);
    case 'categorize':
      return generateCategorizeInstructions(platform, options);
    case 'duplicates':
      return generateDuplicatesInstructions(platform, options);
    case 'suggest_cleanup':
      return generateCleanupInstructions(platform, options);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function detectPlatform(): 'ios' | 'android' {
  return 'ios';
}

// Legacy instruction generators (kept for backward compatibility)
function generateScanInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  const targetPath = options?.path || (platform === 'ios' ? 'iCloud Drive' : '/sdcard');

  if (platform === 'ios') {
    return {
      platform: 'ios',
      method: 'shortcut',
      instructions: `Use the Sutaeru app to scan documents with your camera. Gemini Flash will extract text and data automatically.`,
      expectedOutput: 'Structured JSON with extracted document data'
    };
  } else {
    return {
      platform: 'android',
      method: 'termux',
      instructions: `Use the Sutaeru app camera to scan documents. Gemini Flash will process the image and extract text.`,
      expectedOutput: 'Structured JSON with extracted document data'
    };
  }
}

function generateCategorizeInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  return {
    platform,
    method: platform === 'ios' ? 'shortcut' : 'termux',
    instructions: `Scan documents with your camera. Sutaeru will categorize them automatically using AI.`,
    expectedOutput: 'Categorized document list'
  };
}

function generateDuplicatesInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  return {
    platform,
    method: platform === 'ios' ? 'shortcut' : 'termux',
    instructions: `Sutaeru will analyze your scanned documents and identify duplicates.`,
    expectedOutput: 'List of duplicate documents'
  };
}

function generateCleanupInstructions(
  platform: 'ios' | 'android',
  options?: ScanOptions
): PhoneInstructions {
  return {
    platform,
    method: platform === 'ios' ? 'shortcut' : 'termux',
    instructions: `Sutaeru will suggest cleanup actions for your document library.`,
    expectedOutput: 'Cleanup suggestions'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export async function phoneScanForPlatform(
  platform: 'ios' | 'android',
  action: ScanAction,
  options?: ScanOptions
): Promise<PhoneInstructions> {
  return phoneScan(action, options);
}

export function validateScanOptions(options?: ScanOptions): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options?.path) {
    if (options.path.includes('..') || options.path.includes('~')) {
      errors.push('Path contains invalid characters');
    }
  }

  if (options?.categories) {
    const validCategories = ['images', 'videos', 'documents', 'audio', 'archives', 'other'];
    const invalid = options.categories.filter(c => !validCategories.includes(c));
    if (invalid.length > 0) {
      errors.push(`Invalid categories: ${invalid.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export default phoneScan;
