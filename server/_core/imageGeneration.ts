import { GoogleGenerativeAI } from "@google/generative-ai";

interface GenerateImageInput {
  prompt: string;
  originalImages?: Array<{ url: string; mimeType: string }>;
}

interface GenerateImageResult {
  buffer: Buffer;
  mimeType: string;
  revisedPrompt?: string;
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const modelName = process.env.KEMMA_MODEL_IMAGE || "gemini-2.0-flash-exp-image-generation";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(input.prompt);
    const response = await result.response;

    const parts = (response as any).candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return {
          buffer: Buffer.from(part.inlineData.data, "base64"),
          mimeType,
          revisedPrompt: input.prompt,
        };
      }
    }

    throw new Error("Gemini returned no image data");
  } catch (err: any) {
    console.warn("[imageGeneration] Gemini image generation failed:", err);
    throw new Error(`Gemini image generation failed: ${err?.message ?? "unknown error"}`);
  }
}
