/**
 * More: the pages that do not fit in the tab bar, grouped — on the shared list pattern.
 *
 * Three folds (Workspace, Account, Admin), each one line when closed. Rows carry the same
 * picture the logo menu uses, so the two agree about what each page looks like. Admin links
 * only appear for admins (the pages themselves check on the server as well).
 */
import { Link } from "wouter";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { ReactNode } from "react";
import { ListFold, ListFolds, ListPage, Row, Rows, useListFolds } from "@/components/list";
import type { PickArtId } from "@/lib/pickArt";
import { pickArt } from "@/lib/pickArt";

interface MoreItem {
  label: string;
  href: string;
  /** The picture the logo menu uses for the same destination. */
  art: PickArtId;
  /** One mono line under the name: what the page holds. */
  meta: string;
}

const WORKSPACE: MoreItem[] = [
  { label: "Generate", href: "/generate", art: "image", meta: "Image, video" },
  { label: "Images", href: "/images", art: "nav-images", meta: "Generate" },
  { label: "Video", href: "/video", art: "nav-video", meta: "Generate" },
  { label: "Memories", href: "/memories", art: "style-keep", meta: "Recall" },
  { label: "Skills", href: "/skills", art: "code", meta: "Routines" },
  { label: "Monitors", href: "/monitors", art: "out-monitor", meta: "Scheduled" },
  { label: "Connections", href: "/connections", art: "src-drive", meta: "Linked" },
  { label: "Identity", href: "/identity", art: "nav-agent", meta: "Profile" },
];

const ACCOUNT: MoreItem[] = [{ label: "Settings", href: "/settings", art: "theme-auto", meta: "Appearance" }];

const ADMIN: MoreItem[] = [
  { label: "Admin", href: "/admin", art: "eng-forge", meta: "People" },
  { label: "Invite links", href: "/admin/invites", art: "tone-friendly", meta: "Send" },
  { label: "Audit logs", href: "/admin/audit-logs", art: "depth-deep", meta: "Records" },
];

const FOLD_IDS = ["workspace", "account", "admin"];

function Group({ label, id, index, items, fold, after }: { label: string; id: string; index: number; items: MoreItem[]; fold: ReturnType<typeof useListFolds>; after?: ReactNode }) {
  if (items.length === 0 && !after) return null;
  return (
    <ListFold id={id} index={index} fold={fold} label={label} pick={`${items.length} ${items.length === 1 ? "page" : "pages"}`}>
      <Rows label={label}>
        {items.map((item) => (
          <Row
            key={item.href}
            title={<Link href={item.href}>{item.label}</Link>}
            meta={item.meta.toUpperCase()}
            art={pickArt(item.art)}
            truncate
            chevron
          />
        ))}
        {after}
      </Rows>
    </ListFold>
  );
}

export default function More() {
  useSeoMeta({ title: "More", path: "/more" });
  const { user } = useAuth();
  const t = trpc as any;
  const quota = t.kemma.quota.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  const isAdmin = user?.role === "admin";
  const name = user?.name || user?.email || "Account";
  const initial = name.charAt(0).toUpperCase();

  const fold = useListFolds("more", FOLD_IDS, { first: "workspace" });

  return (
    <ListPage title="More" lede="Everything that does not fit in the tab bar." fold={fold}>
      <ListFolds fold={fold}>
        <Group label="Workspace" id="workspace" index={1} items={WORKSPACE} fold={fold} />
        <Group
          label="Account"
          id="account"
          index={2}
          items={ACCOUNT}
          fold={fold}
          after={
            <Row
              key="you"
              title={name}
              meta={`${quota.data?.tier ?? "free"} plan`.toUpperCase()}
              initials={initial}
            />
          }
        />
        {isAdmin && <Group label="Admin" id="admin" index={3} items={ADMIN} fold={fold} />}
      </ListFolds>

      <div className="lst-strip sr-more-account">
        <div className="lst-stat">
          <span className="mono">Signed in</span>
          <span className="lst-num sm">{name}</span>
          <span className="mono">{(quota.data?.tier ?? "free") as string} plan</span>
        </div>
      </div>
    </ListPage>
  );
}
