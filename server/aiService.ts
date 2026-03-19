import { invokeLLM } from "./_core/llm";

export interface ExtractedReceiptData {
  vendor: string | null;
  date: string | null;
  amount: number | null;
  taxAmount: number | null;
  currency: string;
  category: string | null;
  paymentMethod: string | null;
  description: string | null;
  rawText: string;
  confidence: number; // 0–1
  needsReview: boolean;
}

export interface ParsedWhatsAppMessage {
  type: "receipt" | "task" | "procurement" | "unknown";
  data: Record<string, unknown>;
  rawText: string;
}

/**
 * Extract structured receipt data from an image URL or raw text using LLM/OCR.
 * In production, replace with a dedicated OCR service (e.g., Google Vision, AWS Textract).
 */
export async function extractReceiptData(
  input: { imageUrl?: string; text?: string }
): Promise<ExtractedReceiptData> {
  const messages: Array<{ role: "system" | "user"; content: any }> = [
    {
      role: "system",
      content: `You are an OCR and receipt extraction assistant. Extract structured data from receipts, bills, and payment screenshots. Always respond with valid JSON matching the schema. If a field cannot be determined, use null. Set confidence between 0 and 1 based on how certain you are about the extraction. If confidence < 0.7, set needsReview to true.`,
    },
  ];

  if (input.imageUrl) {
    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: input.imageUrl, detail: "high" },
        },
        {
          type: "text",
          text: "Extract receipt/bill data from this image. Return JSON with fields: vendor, date (ISO format), amount (number), taxAmount (number or null), currency (3-letter code, default IDR), category (one of: food, transport, utilities, supplies, equipment, services, other), paymentMethod (cash/transfer/card/other), description, rawText (full text you see), confidence (0-1), needsReview (boolean).",
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Extract receipt/bill data from this text: "${input.text}". Return JSON with fields: vendor, date (ISO format), amount (number), taxAmount (number or null), currency (3-letter code, default IDR), category (one of: food, transport, utilities, supplies, equipment, services, other), paymentMethod (cash/transfer/card/other), description, rawText, confidence (0-1), needsReview (boolean).`,
    });
  }

  try {
    const response = await invokeLLM({
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "receipt_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              vendor: { type: ["string", "null"] },
              date: { type: ["string", "null"] },
              amount: { type: ["number", "null"] },
              taxAmount: { type: ["number", "null"] },
              currency: { type: "string" },
              category: { type: ["string", "null"] },
              paymentMethod: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              rawText: { type: "string" },
              confidence: { type: "number" },
              needsReview: { type: "boolean" },
            },
            required: ["vendor", "date", "amount", "taxAmount", "currency", "category", "paymentMethod", "description", "rawText", "confidence", "needsReview"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return parsed as ExtractedReceiptData;
  } catch (err) {
    console.error("[AI] Receipt extraction failed:", err);
    return {
      vendor: null,
      date: null,
      amount: null,
      taxAmount: null,
      currency: "IDR",
      category: null,
      paymentMethod: null,
      description: input.text ?? null,
      rawText: input.text ?? "",
      confidence: 0,
      needsReview: true,
    };
  }
}

/**
 * Parse a WhatsApp text message to determine its intent and extract structured data.
 */
export async function parseWhatsAppMessage(text: string): Promise<ParsedWhatsAppMessage> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an AI assistant for a business back office. Classify incoming WhatsApp messages and extract structured data. Respond with JSON only.`,
        },
        {
          role: "user",
          content: `Classify this message and extract data: "${text}"
          
          Rules:
          - If it mentions paying a bill, receipt, or expense → type: "receipt"
          - If it mentions a reminder, task, order, or plan → type: "task"  
          - If it mentions finding/buying/sourcing items with quantity/budget → type: "procurement"
          - Otherwise → type: "unknown"
          
          For "task": extract { text, dueDate (ISO or null), category }
          For "procurement": extract { description, quantity (number), budgetPerUnit (number or null), location (or null) }
          For "receipt": extract { vendor, amount, currency, description }
          For "unknown": data = {}
          
          Return JSON: { type, data, rawText }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "whatsapp_parse",
          strict: false,
          schema: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["receipt", "task", "procurement", "unknown"] },
              data: { type: "object" },
              rawText: { type: "string" },
            },
            required: ["type", "data", "rawText"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return { ...parsed, rawText: text };
  } catch (err) {
    console.error("[AI] WhatsApp parse failed:", err);
    return { type: "unknown", data: {}, rawText: text };
  }
}
