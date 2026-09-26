import axios from "axios";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "994031575796";

const SECRET_NAMES = [
  "DATABASE_URL",
  "VITE_APP_ID",
  "SESSION_SECRET",
  "OWNER_OPEN_ID",
  "QWEN_API_KEY",
  "GEMINI_API_KEY",
  "SONAR_API_KEY",
  "ELEVEN_LABS_API_KEY",
  "ELEVEN_LABS_AGENT_ID",
  "ELEVEN_LABS_VOICE_ID",
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_USER",
  "EMAIL_PASSWORD",
  "EMAIL_FROM",
  "APP_URL",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
];

async function getAccessToken(): Promise<string> {
  // Try metadata server (when running on GCP)
  try {
    const response = await axios.get(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, timeout: 1000 }
    );
    return response.data.access_token;
  } catch {
    // Fallback to gcloud CLI
    const { execSync } = await import("child_process");
    return execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
  }
}

export async function loadSecretsFromSecretManager(): Promise<Record<string, string>> {
  const secrets: Record<string, string> = {};
  
  // Skip if explicitly disabled
  if (process.env.SKIP_SECRET_MANAGER === "true") {
    console.log("[SecretManager] Skipped (SKIP_SECRET_MANAGER=true)");
    return secrets;
  }

  console.log("[SecretManager] Loading secrets from Google Secret Manager...");

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.log("[SecretManager] Could not get access token, using env vars only");
    return secrets;
  }

  for (const secretName of SECRET_NAMES) {
    try {
      const url = `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${secretName}/versions/latest:access`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 5000,
      });
      
      const value = Buffer.from(response.data.payload.data, "base64").toString("utf-8");
      
      if (value && value !== "placeholder" && !value.startsWith("your-")) {
        secrets[secretName] = value;
        // Also set in process.env so it's available everywhere
        process.env[secretName] = value;
      }
    } catch (err) {
      // Secret doesn't exist or no access - that's okay, we'll use env vars
    }
  }

  console.log(`[SecretManager] Loaded ${Object.keys(secrets).length} secrets`);
  return secrets;
}

export function getSecret(name: string): string {
  // First check process.env (could be from Secret Manager or local .env)
  return process.env[name] || "";
}
