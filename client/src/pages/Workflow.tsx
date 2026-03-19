/**
 * S1 Workflow Builder — Sutaeru
 * Obsidian glass canvas. Nodes feel like living organisms, not boxes.
 */

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Zap, MessageSquare, GitBranch, RefreshCw, Clock,
  Layers, Brain, Webhook, Cpu, Split, Merge,
  Save, X, ChevronDown, ChevronUp, Circle, Dot,
} from "lucide-react";

// ─── Node palette definitions ─────────────────────────────────────────────────

export type NodeType =
  | "trigger" | "message" | "condition" | "loop"
  | "delay" | "skill" | "memory" | "webhook"
  | "llm" | "split" | "merge";

interface NodeDef {
  type: NodeType;
  label: string;
  icon: React.ElementType;
  color: string;       // accent glow color
  barColor: string;    // top-bar gradient start
  description: string;
  category: "flow" | "ai" | "data" | "control";
}

const NODE_DEFS: NodeDef[] = [
  { type: "trigger",   label: "Trigger",   icon: Zap,          color: "#f59e0b", barColor: "#f59e0b", description: "Entry point",          category: "flow"    },
  { type: "message",   label: "Message",   icon: MessageSquare, color: "#60a5fa", barColor: "#3b82f6", description: "Send to S1",           category: "ai"      },
  { type: "llm",       label: "LLM Call",  icon: Cpu,          color: "#e8442a", barColor: "#e8442a", description: "Direct model call",     category: "ai"      },
  { type: "skill",     label: "Skill",     icon: Layers,       color: "#a78bfa", barColor: "#7c3aed", description: "Run a saved skill",     category: "ai"      },
  { type: "memory",    label: "Memory",    icon: Brain,        color: "#fbbf24", barColor: "#d97706", description: "Read / write memory",   category: "data"    },
  { type: "condition", label: "Condition", icon: GitBranch,    color: "#34d399", barColor: "#059669", description: "Branch on condition",   category: "control" },
  { type: "loop",      label: "Loop",      icon: RefreshCw,    color: "#6ee7b7", barColor: "#10b981", description: "Repeat N times",        category: "control" },
  { type: "split",     label: "Split",     icon: Split,        color: "#818cf8", barColor: "#6366f1", description: "Parallel branches",     category: "control" },
  { type: "merge",     label: "Merge",     icon: Merge,        color: "#c4b5fd", barColor: "#8b5cf6", description: "Join branches",         category: "control" },
  { type: "delay",     label: "Delay",     icon: Clock,        color: "#f97316", barColor: "#ea580c", description: "Wait before next step", category: "flow"    },
  { type: "webhook",   label: "Webhook",   icon: Webhook,      color: "#2dd4bf", barColor: "#0d9488", description: "Call external URL",     category: "data"    },
];

const CATEGORIES = [
  { id: "flow",    label: "Flow"    },
  { id: "ai",      label: "AI"      },
  { id: "data",    label: "Data"    },
  { id: "control", label: "Control" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  config: Record<string, string>;
  collapsed: boolean;
}

interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

// Placeholder component export
export default function Workflow() {
  return null;
}
