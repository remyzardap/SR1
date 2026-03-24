import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Image, Download, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";

export default function ImageGen() {
  const [prompt, setPrompt] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const generateMutation = trpc.imageGen.generate.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        setGeneratedUrl(data.url);
        toast.success("Image generated successfully!");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Image generation failed");
    },
  });

  const { data: history, refetch: refetchHistory } = trpc.imageGen.history.useQuery(
    { limit: 20 },
    { refetchOnWindowFocus: false }
  );

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    generateMutation.mutate({ prompt: prompt.trim() }, {
      onSuccess: () => refetchHistory(),
    });
  };

  const handleDownload = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `sutaeru-image-${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Image className="h-6 w-6 text-primary" />
            Image Generation
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate images from text prompts using AI.
          </p>
        </div>

        {/* Generator Card */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt</label>
              <Textarea
                placeholder="Describe the image you want to generate... e.g. 'A futuristic city skyline at sunset with neon lights'"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleGenerate();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Press Ctrl+Enter or Cmd+Enter to generate
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending || !prompt.trim()}
              className="w-full"
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Image Result */}
        {generatedUrl && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Generated Image</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(generatedUrl)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden border bg-muted/30">
                <img
                  src={generatedUrl}
                  alt="Generated"
                  className="w-full h-auto max-h-[600px] object-contain"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {history && history.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Generations
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="group relative rounded-lg overflow-hidden border bg-muted/20 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setGeneratedUrl(item.fileUrl)}
                >
                  <img
                    src={item.fileUrl}
                    alt={item.originalPrompt}
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-white text-xs line-clamp-2">{item.originalPrompt}</p>
                  </div>
                  <button
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(item.fileUrl);
                    }}
                  >
                    <Download className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
