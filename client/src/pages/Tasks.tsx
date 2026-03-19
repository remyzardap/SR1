import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, CheckSquare, Loader2, Check, Pencil, Trash2, Calendar } from "lucide-react";

const STATUS_OPTIONS = ["open", "in_progress", "done", "cancelled"] as const;
const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;
const CATEGORY_OPTIONS = ["bills", "procurement", "operations", "admin", "maintenance", "other"];

type TaskStatus = typeof STATUS_OPTIONS[number];
type TaskPriority = typeof PRIORITY_OPTIONS[number];

function statusColor(s: string) {
  switch (s) {
    case "done": return "text-green-700 border-green-200 bg-green-50";
    case "in_progress": return "text-blue-700 border-blue-200 bg-blue-50";
    case "cancelled": return "text-red-700 border-red-200 bg-red-50";
    default: return "text-gray-700 border-gray-200 bg-gray-50";
  }
}

function priorityColor(p: string) {
  switch (p) {
    case "high": return "text-red-700 border-red-200 bg-red-50";
    case "medium": return "text-amber-700 border-amber-200 bg-amber-50";
    default: return "text-green-700 border-green-200 bg-green-50";
  }
}

const emptyForm = { text: "", dueDate: "", category: "", priority: "medium" as TaskPriority, status: "open" as TaskStatus };

export default function Tasks() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<any | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const { data: tasks, isLoading } = trpc.tasks.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
    offset: 0,
  });

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.reports.dashboardStats.invalidate(); setCreateOpen(false); setForm({ ...emptyForm }); toast.success("Task created"); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.tasks.update.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); setEditTask(null); toast.success("Task updated"); },
    onError: (e) => toast.error(e.message),
  });

  const markDoneMutation = trpc.tasks.markDone.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.reports.dashboardStats.invalidate(); toast.success("Task marked as done"); },
  });

  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => { utils.tasks.list.invalidate(); utils.reports.dashboardStats.invalidate(); toast.success("Task deleted"); },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks & Plans</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your business tasks and action items</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "open", "in_progress", "done", "cancelled"].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="capitalize"
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <CheckSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">No tasks found</p>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>Create your first task</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className={task.status === "done" ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    className={`mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${task.status === "done" ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground hover:border-primary"}`}
                    onClick={() => task.status !== "done" && markDoneMutation.mutate({ id: task.id })}
                  >
                    {task.status === "done" && <Check className="h-3 w-3" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                      {task.text}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {task.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                      {task.category && <Badge variant="outline" className="text-xs">{task.category}</Badge>}
                      <Badge variant="outline" className={`text-xs ${statusColor(task.status)}`}>{task.status.replace("_", " ")}</Badge>
                      <Badge variant="outline" className={`text-xs ${priorityColor(task.priority)}`}>{task.priority}</Badge>
                      {task.source === "whatsapp" && (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50">WhatsApp</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTask({ ...task })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate({ id: task.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Task Description *</Label>
              <Textarea
                placeholder="What needs to be done?"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({ ...form, dueDate: form.dueDate || undefined, category: form.category || undefined })}
              disabled={!form.text || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTask} onOpenChange={(o) => !o && setEditTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          {editTask && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Task Description</Label>
                <Textarea value={editTask.text} onChange={(e) => setEditTask({ ...editTask, text: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={editTask.dueDate ? new Date(editTask.dueDate).toISOString().split("T")[0] : ""}
                    onChange={(e) => setEditTask({ ...editTask, dueDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editTask.category ?? ""} onValueChange={(v) => setEditTask({ ...editTask, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={editTask.priority} onValueChange={(v) => setEditTask({ ...editTask, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editTask.status} onValueChange={(v) => setEditTask({ ...editTask, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate({
                id: editTask.id,
                text: editTask.text,
                dueDate: editTask.dueDate ? new Date(editTask.dueDate).toISOString() : undefined,
                category: editTask.category || undefined,
                priority: editTask.priority,
                status: editTask.status,
              })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
