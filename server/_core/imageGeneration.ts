import { VertexAI } from "@google-cloud/vertexai";

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
  const project = process.env.VERTEX_PROJECT;
  const location = process.env.VERTEX_LOCATION;
  if (!project || !location) {
    throw new Error("VERTEX_PROJECT and VERTEX_LOCATION must be set for image generation");
  }

  const modelName = process.env.KEMMA_MODEL_IMAGE || "gemini-2.0-flash-001";

  try {
    const vertexAI = new VertexAI({ project, location });
    const model = vertexAI.preview.getGenerativeModel({ model: modelName });

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

    throw new Error("Vertex AI returned no image data");
  } catch (err: any) {
    console.warn("[imageGeneration] Vertex AI image generation failed:", err);
    throw new Error(`Vertex AI image generation failed: ${err?.message ?? "unknown error"}`);
  }
}
