import { Link } from "wouter";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HalftoneRamp } from "@/components/art";
import { SutaeruIcon, type SutaeruIconName } from "@/components/SutaeruIcon";
import "@/styles/settings-reskin.css";

interface MoreItem {
  label: string;
  href: string;
  icon: SutaeruIconName;
  /** One mono line under the name: what the page holds. */
  meta: string;
}

const WORKSPACE: MoreItem[] = [
  { label: "Generate", href: "/generate", icon: "make", meta: "Image, video" },
  { label: "Images", href: "/images", icon: "image", meta: "Generate" },
  { label: "Video", href: "/video", icon: "video", meta: "Generate" },
  { label: "Memories", href: "/memories", icon: "memory", meta: "Recall" },
  { label: "Skills", href: "/skills", icon: "make", meta: "Routines" },
  { label: "Monitors", href: "/monitors", icon: "schedule", meta: "Scheduled" },
  { label: "Connections", href: "/connections", icon: "connections", meta: "Linked" },
  { label: "Identity", href: "/identity", icon: "agent", meta: "Profile" },
];

const ACCOUNT: MoreItem[] = [
  { label: "Settings", href: "/settings", icon: "settings", meta: "Appearance" },
];

const ADMIN: MoreItem[] = [
  { label: "Admin", href: "/admin", icon: "admin", meta: "People" },
  { label: "Invite links", href: "/admin/invites", icon: "share", meta: "Send" },
  { label: "Audit logs", href: "/admin/audit-logs", icon: "review", meta: "Records" },
];

function MoreCard({ item }: { item: MoreItem }) {
  return (
    <Link href={item.href} className="sr-more-card">
      <span className="sr-more-tile" aria-hidden="true">
        <SutaeruIcon name={item.icon} signal className="sr-more-tile-icon" />
      </span>
      <span className="sr-more-name">{item.label}</span>
      <span className="sr-more-meta">{item.meta}</span>
    </Link>
  );
}

function Group({ label, items }: { label: string; items: MoreItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="sr-more-group">
      <h2 className="sr-more-meta sr-more-group-label">{label}</h2>
      <div className="sr-more-grid">
        {items.map((item) => (
          <MoreCard key={item.href} item={item} />
        ))}
      </div>
    </section>
  );
}

/**
 * More: the pages that do not fit in the tab bar, grouped. Admin links only appear
 * for admins (the pages themselves check on the server as well).
 */
export default function More() {
  useSeoMeta({ title: "More", path: "/more" });
  const { user } = useAuth();
  const t = trpc as any;
  const quota = t.kemma.quota.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  const isAdmin = user?.role === "admin";
  const name = user?.name || user?.email || "Account";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="sk-page sr-more">
      <header className="sk-header">
        <div>
          <h1 className="sk-h1">More</h1>
        </div>
      </header>

      <Group label="Workspace" items={WORKSPACE} />
      <Group label="Account" items={ACCOUNT} />
      {isAdmin && <Group label="Admin" items={ADMIN} />}

      <div className="sr-more-account">
        <span className="sr-more-account-avatar" aria-hidden="true">{initial}</span>
        <span className="sr-more-account-copy">
          <span className="sr-more-account-name">{name}</span>
          <span className="sr-more-account-plan">{quota.data?.tier ?? "free"} plan</span>
        </span>
        <HalftoneRamp columns={7} rows={5} cell={12} maxRadius={3.4} />
      </div>
    </div>
  );
}
