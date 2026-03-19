import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Workflow, Wrench, Code2, User, Cpu, AtSign, Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { usePageMeta } from "@/hooks/usePageMeta";

const skillTypeIcons = {
  prompt: Brain,
  workflow: Workflow,
  tool_definition: Wrench,
  behavior: Code2,
};

const skillTypeLabels: Record<string, string> = {
  prompt: "Prompt",
  workflow: "Workflow",
  tool_definition: "Tool",
  behavior: "Behavior",
};

const skillTypeColors: Record<string, string> = {
  prompt: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  workflow: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  tool_definition: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  behavior: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export default function PublicProfile() {
  const params = useParams<{ handle: string }>();
  const handle = params.handle ?? "";

  const utils = trpc.useUtils();

  const { data: profile, isLoading, isError } = trpc.profile.getByHandle.useQuery(
    { handle },
    { enabled: !!handle }
  );

  const displayName = profile?.displayName ?? `@${handle}`;
  const bio = profile?.bio ?? `View ${displayName}'s public Sutaeru agent profile and collect their skills.`;
  const profileUrl = `https://sutaeru.com/u/${handle}`;
  const ogImage = profile?.avatarUrl ?? "https://sutaeru.com/og-image.png";

  usePageMeta({
    title: handle ? `${displayName} (@${handle}) — Sutaeru` : undefined,
    description: handle ? bio : undefined,
    image: handle ? ogImage : undefined,
    url: handle ? profileUrl : undefined,
    type: "profile",
  });

  const collectMutation = trpc.skills.collect.useMutation({
    onSuccess: () => {
      toast.success("Skill collected! Added to your library.");
      utils.skills.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Dynamic SEO meta — updates once profile data is available
  useSeoMeta({
    title: profile
      ? `${profile.displayName ?? `@${handle}`} — Agent Profile`
      : `@${handle} — Sutaeru`,
    description: profile?.bio
      ? profile.bio.slice(0, 160)
      : `View @${handle}'s public agent profile on Sutaeru.`,
    image: profile?.avatarUrl ?? undefined,
    path: `/u/${handle}`,
    type: "profile",
    twitterCard: profile?.avatarUrl ? "summary_large_image" : "summary",
  });

  if (!handle) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground">No handle specified.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading profile…</span>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Profile not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              No Sutaeru identity exists for <span className="font-mono">@{handle}</span>.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Profile header */}
      <div className="mb-10 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <Avatar className="h-20 w-20 shrink-0 ring-2 ring-border">
          {profile.avatarUrl ? (
            <AvatarImage src={profile.avatarUrl} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-xl font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <div className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground sm:justify-start">
            <AtSign className="h-3.5 w-3.5" />
            <span className="font-mono">{profile.handle}</span>
          </div>
          {profile.bio && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xl">
              {profile.bio}
            </p>
          )}
          {/* Chat CTA */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <Link href={`/chat?agent=${encodeURIComponent(profile.handle ?? handle)}`}>
              <Button
                size="sm"
                className="gap-2 rounded-full px-5 font-semibold shadow-sm"
              >
                <MessageSquare className="h-4 w-4" />
                Chat with {profile.displayName ? profile.displayName.split(" ")[0] : `@${handle}`}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Public skills */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          Public Skills
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({profile.skills.length})
          </span>
        </h2>

        {profile.skills.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <Brain className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No public skills yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {profile.handle
                ? `@${profile.handle} hasn't shared any skills publicly.`
                : "This user hasn't shared any skills publicly."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {profile.skills.map((skill) => {
              const TypeIcon =
                skillTypeIcons[skill.type as keyof typeof skillTypeIcons] ?? Brain;
              const colorClass =
                skillTypeColors[skill.type] ?? "bg-gray-500/10 text-gray-600 border-gray-500/20";
              return (
                <Card key={skill.id} className="group flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          colorClass.split(" ")[0]
                        )}
                      >
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-sm">{skill.name}</h3>
                        {skill.sourceModel && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Cpu className="h-3 w-3" />
                            {skill.sourceModel}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col pt-0">
                    <Badge variant="outline" className={cn("text-xs w-fit", colorClass)}>
                      {skillTypeLabels[skill.type] ?? skill.type}
                    </Badge>
                    {skill.description && (
                      <p className="mt-3 flex-1 text-sm text-muted-foreground line-clamp-2">
                        {skill.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        {skill.usageCount ?? 0} uses
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => collectMutation.mutate({ skillId: skill.id })}
                        disabled={collectMutation.isPending}
                      >
                        {collectMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Collect
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
