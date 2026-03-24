import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, Bot, User, Image as ImageIcon } from "lucide-react";
import { formatDate } from "@/lib/utils";

const SAMPLE_MESSAGES = [
  { label: "Pay PLN bill reminder", text: "Reminder to pay PLN bill next Monday" },
  { label: "Order massage tables", text: "Order 20 massage tables next month for new spa" },
  { label: "Find massage tables", text: "Find 20 massage tables under 3 juta each in Jakarta" },
  { label: "Receipt text", text: "Paid electricity bill 450,000 IDR to PLN today via transfer" },
];

type ConversationEntry = {
  direction: "inbound" | "outbound";
  content: string;
  processedAs?: string;
  timestamp: Date;
};

export default function WhatsAppSimulator() {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: logs, isLoading: logsLoading } = trpc.whatsapp.logs.useQuery({ limit: 30 });

  const sendMutation = trpc.whatsapp.inbound.useMutation({
    onSuccess: (data) => {
      setConversation((prev) => [
        ...prev,
        {
          direction: "outbound",
          content: data.reply,
          processedAs: data.processedAs,
          timestamp: new Date(),
        },
      ]);
      utils.whatsapp.logs.invalidate();
      utils.reports.dashboardStats.invalidate();
      utils.receipts.needsReview.invalidate();
      setText("");
      setImageUrl("");
    },
    onError: (e) => toast.error("Error: " + e.message),
  });

  function handleSend() {
    if (!text && !imageUrl) return;
    setConversation((prev) => [
      ...prev,
      { direction: "inbound", content: text || "[Image sent]", timestamp: new Date() },
    ]);
    sendMutation.mutate({ text: text || undefined, mediaUrl: imageUrl || undefined, mediaType: imageUrl ? "image/jpeg" : undefined });
  }

  function processedAsColor(type?: string) {
    switch (type) {
      case "receipt": return "text-blue-700 border-blue-200 bg-blue-50";
      case "task": return "text-green-700 border-green-200 bg-green-50";
      case "procurement": return "text-purple-700 border-purple-200 bg-purple-50";
      default: return "text-gray-700 border-gray-200 bg-gray-50";
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp Simulator</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Test the WhatsApp integration by simulating inbound messages. In production, wire the webhook to <code className="bg-muted px-1 rounded text-xs">/api/trpc/whatsapp.inbound</code>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Simulator */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Send a Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Quick samples:</p>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_MESSAGES.map((s) => (
                    <Button key={s.label} variant="outline" size="sm" className="text-xs h-7" onClick={() => setText(s.text)}>
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Textarea
                  placeholder="Type a WhatsApp message... (receipt, task, procurement request)"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleSend(); }}
                />
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Or paste an image URL (for receipt OCR):</p>
                  <Input
                    placeholder="https://example.com/receipt.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={handleSend}
                  disabled={(!text && !imageUrl) || sendMutation.isPending}
                >
                  {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sendMutation.isPending ? "Processing with AI..." : "Send Message"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Conversation */}
          {conversation.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Conversation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversation.map((entry, i) => (
                  <div key={i} className={`flex gap-2 ${entry.direction === "outbound" ? "flex-row-reverse" : ""}`}>
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${entry.direction === "inbound" ? "bg-green-100" : "bg-primary/10"}`}>
                      {entry.direction === "inbound" ? <User className="h-3.5 w-3.5 text-green-700" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${entry.direction === "inbound" ? "bg-green-50 text-green-900" : "bg-muted"}`}>
                      <p>{entry.content}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs opacity-60">{entry.timestamp.toLocaleTimeString()}</span>
                        {entry.processedAs && (
                          <Badge variant="outline" className={`text-xs h-4 px-1 ${processedAsColor(entry.processedAs)}`}>
                            {entry.processedAs}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Message Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Message Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !logs || logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="px-5 py-3 hover:bg-muted/20">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-xs ${log.direction === "inbound" ? "text-green-700 border-green-200 bg-green-50" : "text-blue-700 border-blue-200 bg-blue-50"}`}>
                          {log.direction}
                        </Badge>
                        {log.processedAs && (
                          <Badge variant="outline" className={`text-xs ${processedAsColor(log.processedAs)}`}>
                            {log.processedAs}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">{log.content || "(media message)"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* API Integration Notes */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground">Developer Integration Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p><strong>Webhook endpoint:</strong> <code className="bg-muted px-1 rounded">POST /api/trpc/whatsapp.inbound</code></p>
          <p><strong>WhatsApp Cloud API:</strong> Configure your webhook URL in Meta Business Manager to point to this endpoint. Map the incoming message fields to: <code className="bg-muted px-1 rounded">from</code>, <code className="bg-muted px-1 rounded">text</code>, <code className="bg-muted px-1 rounded">mediaUrl</code>, <code className="bg-muted px-1 rounded">mediaType</code>.</p>
          <p><strong>AI/OCR:</strong> Currently using the built-in LLM for extraction. Replace <code className="bg-muted px-1 rounded">server/aiService.ts</code> with a dedicated OCR service (Google Vision, AWS Textract) for production accuracy.</p>
          <p><strong>Storage:</strong> Receipt images are stored in S3. Configure <code className="bg-muted px-1 rounded">STORAGE_*</code> environment variables for production.</p>
        </CardContent>
      </Card>
    </div>
  );
}
