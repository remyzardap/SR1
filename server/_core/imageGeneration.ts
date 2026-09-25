import { GoogleGenerativeAI } from "@google/generative-ai";

interface GenerateImageInput {
  prompt: string;
  originalImages?: Array<{ url: string; mimeType: string }>;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
}

interface GenerateImageResult {
  buffer: Buffer;
  mimeType: string;
  revisedPrompt?: string;
}

const LITELLM_BASE = process.env.LITELLM_BASE_URL || "https://litellm.koboi2026.biz.id/v1";

async function generateWithGemini(prompt: string): Promise<GenerateImageResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.KEMMA_MODEL_IMAGE || "gemini-2.0-flash-exp-image-generation",
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Try to extract inline image data
    const parts = (response as any).candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return {
          buffer: Buffer.from(part.inlineData.data, "base64"),
          mimeType,
          revisedPrompt: prompt,
        };
      }
    }

    return null;
  } catch (err) {
    console.warn("[imageGeneration] Gemini image generation failed:", err);
    return null;
  }
}

async function generateWithDallE(input: GenerateImageInput): Promise<GenerateImageResult> {
  const apiKey = process.env.LITELLM_API_KEY;
  if (!apiKey) {
    throw new Error("LITELLM_API_KEY is not configured");
  }

  const response = await fetch(`${LITELLM_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/dall-e-3",
      prompt: input.prompt,
      n: 1,
      size: input.size || "1024x1024",
      quality: input.quality || "standard",
      response_format: "url",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DALL-E API error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ url?: string; revised_prompt?: string }>;
  };

  const imageData = data.data?.[0];
  if (!imageData?.url) {
    throw new Error("No image URL returned from DALL-E");
  }

  const imageResponse = await fetch(imageData.url);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch generated image: ${imageResponse.status}`);
  }
  const arrayBuffer = await imageResponse.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: "image/png",
    revisedPrompt: imageData.revised_prompt,
  };
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const gemini = await generateWithGemini(input.prompt);
  if (gemini) return gemini;

  return generateWithDallE(input);
}
