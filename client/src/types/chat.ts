import type { ActivityItem } from "@/components/ActivityFeed";
import type { AgentStep } from "@/lib/streamReducer";

export interface ChatSource {
  title: string;
  url: string;
  /** Stable source id from the server (P1-07); chips and cards number by it. */
  id?: number;
  snippet?: string;
}

export interface PlanDirection {
  id: string;
  title: string;
  concept: string;
  emphasis: string;
  palette: [string, string, string];
  tags: string[];
  recommended?: boolean;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  streaming?: boolean;
  skills?: Array<{ id: number; name: string }>;
  createdAt: Date;
  sources?: ChatSource[];
  question?: string;
  references?: string[];
  planOptions?: PlanDirection[];
  selectedOptionId?: string;
  /** True for a message held on screen while the device is offline (never sent). */
  queued?: boolean;
  thinking?: string;
  segments?: Array<{ kind: "narration" | "answer"; end: number }>;
  steps?: AgentStep[];
  activity?: ActivityItem[];
}