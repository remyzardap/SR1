import type { MenuChat, MenuPerson, MenuPill, MenuRun, MenuTile } from "@/components/chrome/LogoMenuSheet";
import { pickArt } from "@/lib/pickArt";

/* Fixtures for /__lab/menu: the logo sheet in every state it can be in. */

export const MENU_TILES: MenuTile[] = [
  { label: "Chat", href: "/chat", art: pickArt("nav-chat"), active: true },
  { label: "Generate", href: "/generate", art: pickArt("nav-agent"), active: false },
  { label: "Images", href: "/images", art: pickArt("nav-images"), active: false },
  { label: "Documents", href: "/documents", art: pickArt("nav-documents"), active: false },
  { label: "Files", href: "/files", art: pickArt("nav-files"), active: false },
  { label: "Video", href: "/video", art: pickArt("nav-video"), active: false },
];

export const MENU_RUNS: MenuRun[] = [
  { id: "run-1", label: "Quarterly board deck", detail: "Code · working", href: "/chat?session=run-1", live: true },
  { id: "run-2", label: "Crawler for the pricing pages", detail: "Code · needs you", href: "/chat?session=run-2", live: false },
];

export const MENU_CHATS: MenuChat[] = [
  { id: "chat-1", title: "Rewrite the onboarding email", when: "now", href: "/chat?session=chat-1" },
  { id: "chat-2", title: "Q3 numbers into a one-pager", when: "2h", href: "/chat?session=chat-2" },
  { id: "chat-3", title: "Naming for the photo series", when: "1d", href: "/chat?session=chat-3" },
  { id: "chat-4", title: "Trip plan, Kyoto in November", when: "3d", href: "/chat?session=chat-4" },
  { id: "chat-5", title: "Studio brief for the launch film", when: "6d", href: "/chat?session=chat-5" },
];

export const MENU_PILLS: MenuPill[] = [
  { label: "Memories", href: "/memories", active: false },
  { label: "Skills", href: "/skills", active: false },
  { label: "Monitors", href: "/monitors", active: false },
  { label: "Connections", href: "/connections", active: false },
  { label: "Identity", href: "/identity", active: false },
  { label: "Settings", href: "/settings", active: false },
  { label: "Admin", href: "/admin", active: false },
];

export const MENU_PILLS_MEMBER: MenuPill[] = MENU_PILLS.filter((p) => p.label !== "Admin");

export const MENU_PERSON_ADMIN: MenuPerson = {
  name: "Remy",
  initial: "R",
  plan: "free plan · 38/50 messages",
  meter: { used: 38, of: 50 },
  meta: "Admin",
};
export const MENU_PERSON_MEMBER: MenuPerson = {
  name: "Ana Souza",
  initial: "A",
  plan: "free plan · 4/50 messages",
  meter: { used: 4, of: 50 },
};
