export interface ChatSource {
  title: string;
  url: string;
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
}