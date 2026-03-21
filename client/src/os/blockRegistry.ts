// ============================================
// UPDATED FILE: client/src/os/blockRegistry.ts
// Grid positions match MagicDraft/Debtrix layout from images
// ============================================

import {
  MessageSquare, CheckSquare, Brain, FolderOpen,
  Compass, Terminal, Users,
} from 'lucide-react';

export type BlockId =
  | 'chat' | 'tasks' | 'memory' | 'files'
  | 'research' | 'terminal' | 'crew';

export type BlockVariant = 'featured' | 'stat' | 'list' | 'terminal';

export interface BlockConfig {
  id: BlockId;
  label: string;
  icon: any;
  variant: BlockVariant;
  accentColor: string;
  statCardClass?: string;    // os-stat-card--color for tinted bg
  gridDesktop: string;
  gridRow?: number;
  route: string;
}

export const BLOCKS: BlockConfig[] = [
  // Row 1: Chat banner — full width (like MagicDraft "Welcome back")
  {
    id: 'chat',
    label: 'Chat',
    icon: MessageSquare,
    variant: 'featured',
    accentColor: 'var(--os-amber)',
    statCardClass: 'os-stat-card--amber',
    gridDesktop: '1 / -1',
    gridRow: 1,
    route: '/chat',
  },
  // Row 2: Three stat cards (like Debtrix/Sales dashboard stat row)
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CheckSquare,
    variant: 'stat',
    accentColor: 'var(--os-amber)',
    statCardClass: 'os-stat-card--amber',
    gridDesktop: 'span 4',
    gridRow: 2,
    route: '/tasks',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: Brain,
    variant: 'stat',
    accentColor: 'var(--os-indigo)',
    statCardClass: 'os-stat-card--indigo',
    gridDesktop: 'span 4',
    gridRow: 2,
    route: '/memories',
  },
  {
    id: 'crew',
    label: 'Crew',
    icon: Users,
    variant: 'stat',
    accentColor: 'var(--os-blue)',
    statCardClass: 'os-stat-card--blue',
    gridDesktop: 'span 4',
    gridRow: 2,
    route: '/connections',
  },
  // Row 3: Files + Research — 6+6 (like MagicDraft Knowledge Base + Projects)
  {
    id: 'files',
    label: 'Files',
    icon: FolderOpen,
    variant: 'list',
    accentColor: 'var(--os-green)',
    gridDesktop: 'span 6',
    gridRow: 3,
    route: '/files',
  },
  {
    id: 'research',
    label: 'Research',
    icon: Compass,
    variant: 'stat',
    accentColor: 'var(--os-indigo)',
    statCardClass: 'os-stat-card--indigo',
    gridDesktop: 'span 6',
    gridRow: 3,
    route: '/discover',
  },
  // Row 4: Terminal — full width
  {
    id: 'terminal',
    label: 'Terminal',
    icon: Terminal,
    variant: 'terminal',
    accentColor: 'var(--os-teal)',
    gridDesktop: '1 / -1',
    gridRow: 4,
    route: '/terminal',
  },
];

export const BLOCK_MAP = new Map(BLOCKS.map(b => [b.id, b]));
export function getBlock(id: BlockId) { return BLOCK_MAP.get(id) || BLOCKS[0]; }
