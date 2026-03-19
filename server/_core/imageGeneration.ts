const LITELLM_BASE = process.env.LITELLM_BASE_URL || "https://litellm.koboi2026.biz.id/v1";

interface GenerateImageInput {
  prompt: string;
  originalImages?: Array<{ url: string; mimeType: string }>;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  quality?: "standard" | "hd";
}

interface GenerateImageResult {
  url: string;
  revisedPrompt?: string;
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
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

  return {
    url: imageData.url,
    revisedPrompt: imageData.revised_prompt,
  };
}
