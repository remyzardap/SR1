
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  Plus,
  Brain,
  Workflow,
  Wrench,
  Code2,
  User,
  Cpu,
  BookOpen,
  FilterX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";

const skillTypeIcons = {
  prompt: Brain,
  workflow: Workflow,
  tool_definition: Wrench,
  behavior: Code2,
};

const skillTypeLabels = {
  prompt: "Prompt",
  workflow: "Workflow",
  tool_definition: "Tool",
  behavior: "Behavior",
};

const skillTypeColors = {
  prompt: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  workflow: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  tool_definition: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  behavior: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export default function Discover() {
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: skills, isLoading } = trpc.skills.discover.useQuery();

  const collectMutation = trpc.skills.collect.useMutation({
    onSuccess: () => {
      toast.success("Skill collected! Added to your library.");
      utils.skills.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const filteredSkills = useMemo(() => {
    if (!skills) return [];

    return skills.filter((skill) => {
      const matchesType = filterType === "all" || skill.type === filterType;
      const matchesSearch =
        searchQuery === "" ||
        skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (skill.description?.toLowerCase() || "").includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [skills, filterType, searchQuery]);

  const handleCollect = (skillId: number) => {
    collectMutation.mutate({ skillId });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilterType("all");
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading public skills...</span>
        </div>
      </div>
    );
  }

  const hasSkills = skills && skills.length > 0;
  const hasFilteredResults = filteredSkills.length > 0;
  const isFiltering = searchQuery !== "" || filterType !== "all";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-700 text-foreground">Discover Skills</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and collect public skills from the Sutaeru community
        </p>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="prompt">Prompts</SelectItem>
            <SelectItem value="workflow">Workflows</SelectItem>
            <SelectItem value="tool_definition">Tools</SelectItem>
            <SelectItem value="behavior">Behaviors</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Skills Grid */}
      {!hasSkills ? (
        // Case 1: No public skills at all
        <EmptyState
          icon={BookOpen}
          title="No public skills yet"
          description="Be the first to share a skill with the community. Make any of your skills public from the Skills page."
          ctaLabel="Go to Skills"
          ctaHref="/skills"
        />
      ) : !hasFilteredResults ? (
        // Case 2: Skills exist but filters return nothing
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FilterX className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-sm font-medium text-foreground mb-1">No skills match your filters</p>
          <p className="text-sm text-muted-foreground mb-6">Try adjusting your search or type filter.</p>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <FilterX className="mr-2 h-4 w-4" />
            Clear Filters
          </Button>
        </div>
      ) : (
        // Case 3: Show filtered results
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSkills.map((skill) => {
            const TypeIcon = skillTypeIcons[skill.type];
            return (
              <Card key={skill.id} className="group flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          skillTypeColors[skill.type].split(" ")[0]
                        )}
                      >
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm line-clamp-1">{skill.name}</h3>
                        {skill.sourceModel && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Cpu className="h-3 w-3" />
                            {skill.sourceModel}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 flex-1 flex flex-col">
                  <Badge
                    variant="outline"
                    className={cn("text-xs w-fit", skillTypeColors[skill.type])}
                  >
                    {skillTypeLabels[skill.type]}
                  </Badge>

                  {skill.description && (
                    <p className="mt-3 text-sm text-muted-foreground line-clamp-2 flex-1">
                      {skill.description}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      {skill.ownerHandle ? (
                        <Link
                          href={`/u/${skill.ownerHandle}`}
                          className="hover:text-foreground hover:underline transition-colors"
                        >
                          @{skill.ownerHandle}
                        </Link>
                      ) : (
                        <span>anonymous</span>
                      )}
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleCollect(skill.id)}
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
  );
}
