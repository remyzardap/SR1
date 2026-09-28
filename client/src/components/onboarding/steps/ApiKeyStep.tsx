import { useState } from "react";
import { motion } from "framer-motion";
import { Key, Eye, EyeOff, Shield, ArrowRight, ArrowLeft, SkipForward } from "lucide-react";

export interface ApiKeyData {
  provider: "openai" | "anthropic" | "kimi" | "gemini";
  apiKey: string;
}

interface ApiKeyStepProps {
  initialData?: ApiKeyData;
  onNext: (data: ApiKeyData) => void;
  onBack: () => void;
  onSkip: () => void;
}

const PROVIDERS = [
  { value: "kimi", label: "Kimi (Moonshot AI)", placeholder: "sk-..." },
  { value: "openai", label: "OpenAI", placeholder: "sk-..." },
  { value: "anthropic", label: "Anthropic Claude", placeholder: "sk-ant-..." },
  { value: "gemini", label: "Google Gemini", placeholder: "AIza..." },
] as const;

export function ApiKeyStep({ initialData, onNext, onBack, onSkip }: ApiKeyStepProps) {
  const [provider, setProvider] = useState<ApiKeyData["provider"]>(initialData?.provider ?? "kimi");
  const [apiKey, setApiKey] = useState(initialData?.apiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  const selectedProvider = PROVIDERS.find((p) => p.value === provider)!;

  const handleNext = () => {
    if (!apiKey.trim()) {
      setError("API key is required, or skip this step");
      return;
    }
    if (apiKey.trim().length < 10) {
      setError("That doesn't look like a valid API key");
      return;
    }
    onNext({ provider, apiKey: apiKey.trim() });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Connect your AI</h2>
        <p className="text-muted-foreground">
          Add your own API key to use your preferred AI model. Sutaeru already has Kimi built in — this is optional.
        </p>
      </div>

      <div className="space-y-5">
        {/* Provider selector */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">AI Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => setProvider(p.value)}
                className={`px-4 py-3 border rounded-xl text-sm font-medium text-left transition-all duration-200 ${
                  provider === p.value
                    ? "border-foreground bg-secondary text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* API Key input */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
            <Key className="w-4 h-4" />
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError(""); }}
              placeholder={selectedProvider.placeholder}
              className="w-full px-4 py-3 pr-12 bg-card border border-border rounded-lg text-foreground
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20
                         focus:border-foreground transition-all duration-200 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>

        {/* Security note */}
        <div className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card">
          <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Your API key is encrypted before storage and never logged or shared. It is only used to make requests on your behalf.
          </p>
        </div>
      </div>

      {/* Navigation */}
       <div className="flex flex-wrap gap-3 mt-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 border border-border rounded-xl text-foreground
                     hover:border-foreground hover:text-foreground transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onSkip}
          className="flex items-center gap-2 px-4 py-3 border border-border rounded-xl text-muted-foreground
                     hover:border-foreground hover:text-foreground transition-colors duration-200 text-sm"
        >
          Skip
          <SkipForward className="w-4 h-4" />
        </button>
        <button
          onClick={handleNext}
           className="flex-1 min-w-full sm:min-w-0 flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground
                     font-semibold rounded-xl hover:bg-[#3a3936] transition-colors duration-200"
        >
          Save & Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
