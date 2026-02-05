import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Calendar,
  User,
  Repeat,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import type { Chore } from "@shared/schema";

const CATEGORIES = [
  { id: "cleaning", label: "Cleaning", color: "bg-blue-500" },
  { id: "kitchen", label: "Kitchen", color: "bg-green-500" },
  { id: "laundry", label: "Laundry", color: "bg-purple-500" },
  { id: "yard", label: "Yard", color: "bg-amber-500" },
  { id: "pets", label: "Pets", color: "bg-pink-500" },
  { id: "shopping", label: "Shopping", color: "bg-teal-500" },
  { id: "other", label: "Other", color: "bg-gray-500" },
];

const PRIORITIES = [
  { id: "low", label: "Low", color: "text-green-500" },
  { id: "medium", label: "Medium", color: "text-yellow-500" },
  { id: "high", label: "High", color: "text-red-500" },
];

const RECURRING_OPTIONS = [
  { id: "none", label: "One-time" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function ChoreCard({
  chore,
  onToggle,
  onDelete,
}: {
  chore: Chore;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const category = CATEGORIES.find(c => c.id === chore.category);
  const priority = PRIORITIES.find(p => p.id === chore.priority);
  const isOverdue = chore.dueDate && !chore.completed && new Date(chore.dueDate) < new Date();
  const isDueToday = chore.dueDate && new Date(chore.dueDate).toDateString() === new Date().toDateString();

  return (
    <Card
      className={cn(
        "p-4 transition-all hover:scale-[1.01] cursor-pointer",
        chore.completed && "opacity-60",
        isOverdue && !chore.completed && "border-red-500/50 bg-red-500/5"
      )}
      onClick={onToggle}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <div className="flex-shrink-0 pt-1">
          {chore.completed ? (
            <CheckSquare className="h-8 w-8 text-green-500" />
          ) : (
            <Square className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={cn(
                "text-lg font-medium",
                chore.completed && "line-through text-muted-foreground"
              )}
            >
              {chore.title}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>

          {chore.description && (
            <p className="text-sm text-muted-foreground mt-1">{chore.description}</p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {category && (
              <Badge variant="outline" className="text-xs">
                <span className={cn("w-2 h-2 rounded-full mr-1", category.color)} />
                {category.label}
              </Badge>
            )}

            {priority && priority.id !== "medium" && (
              <Badge variant="outline" className={cn("text-xs", priority.color)}>
                <AlertCircle className="h-3 w-3 mr-1" />
                {priority.label}
              </Badge>
            )}

            {chore.assignedTo && (
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                {chore.assignedTo}
              </Badge>
            )}

            {chore.recurring !== "none" && (
              <Badge variant="outline" className="text-xs">
                <Repeat className="h-3 w-3 mr-1" />
                {chore.recurring}
              </Badge>
            )}

            {chore.dueDate && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  isOverdue && !chore.completed && "border-red-500 text-red-500",
                  isDueToday && !chore.completed && "border-amber-500 text-amber-500"
                )}
              >
                <Calendar className="h-3 w-3 mr-1" />
                {isOverdue ? "Overdue" : isDueToday ? "Today" : new Date(chore.dueDate).toLocaleDateString()}
              </Badge>
            )}

            {chore.completed && chore.completedAt && (
              <Badge variant="outline" className="text-xs text-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Done {new Date(chore.completedAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AddChoreDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (chore: Partial<Chore>) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [category, setCategory] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly" | "monthly">("none");

  const handleSubmit = () => {
    if (!title.trim()) return;

    onAdd({
      title: title.trim(),
      description: description.trim() || undefined,
      assignedTo: assignedTo.trim() || undefined,
      dueDate: dueDate || undefined,
      priority,
      category: category || undefined,
      recurring,
      completed: false,
    });

    // Reset form
    setTitle("");
    setDescription("");
    setAssignedTo("");
    setDueDate("");
    setPriority("medium");
    setCategory("");
    setRecurring("none");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add New Chore
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">What needs to be done?</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Clean the kitchen"
              className="text-lg"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Details (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Any additional details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assign to</Label>
              <Input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Name"
              />
            </div>

            <div className="space-y-2">
              <Label>Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className={p.color}>{p.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", c.color)} />
                        {c.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Repeat</Label>
            <Select value={recurring} onValueChange={(v) => setRecurring(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRING_OPTIONS.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={!title.trim()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Chore
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ChoresPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: chores = [], isLoading } = useQuery<Chore[]>({
    queryKey: ["/api/chores"],
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedChores: Chore[]) => {
      await apiRequest("POST", "/api/chores", { chores: updatedChores });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chores"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save chores",
        variant: "destructive",
      });
    },
  });

  const handleAddChore = (choreData: Partial<Chore>) => {
    const newChore: Chore = {
      id: crypto.randomUUID(),
      title: choreData.title || "",
      description: choreData.description,
      assignedTo: choreData.assignedTo,
      dueDate: choreData.dueDate,
      recurring: choreData.recurring || "none",
      completed: false,
      createdAt: new Date().toISOString(),
      priority: choreData.priority || "medium",
      category: choreData.category,
    };

    saveMutation.mutate([...chores, newChore]);
    toast({
      title: "Chore added",
      description: `"${newChore.title}" has been added`,
    });
  };

  const handleToggleChore = (choreId: string) => {
    const updatedChores = chores.map((chore) => {
      if (chore.id === choreId) {
        const completed = !chore.completed;
        return {
          ...chore,
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        };
      }
      return chore;
    });

    saveMutation.mutate(updatedChores);

    const chore = chores.find((c) => c.id === choreId);
    if (chore && !chore.completed) {
      toast({
        title: "Well done!",
        description: `"${chore.title}" completed`,
      });
    }
  };

  const handleDeleteChore = (choreId: string) => {
    const chore = chores.find((c) => c.id === choreId);
    const updatedChores = chores.filter((c) => c.id !== choreId);
    saveMutation.mutate(updatedChores);

    if (chore) {
      toast({
        title: "Deleted",
        description: `"${chore.title}" has been removed`,
      });
    }
  };

  // Filter and sort chores
  const filteredChores = chores
    .filter((chore) => {
      if (filter === "pending") return !chore.completed;
      if (filter === "completed") return chore.completed;
      return true;
    })
    .sort((a, b) => {
      // Completed items go to the bottom
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      // High priority items first
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Earlier due dates first
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      // Newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const pendingCount = chores.filter((c) => !c.completed).length;
  const todayCount = chores.filter((c) => {
    if (c.completed || !c.dueDate) return false;
    return new Date(c.dueDate).toDateString() === new Date().toDateString();
  }).length;
  const overdueCount = chores.filter((c) => {
    if (c.completed || !c.dueDate) return false;
    return new Date(c.dueDate) < new Date();
  }).length;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <CheckSquare className="h-6 w-6 text-purple-500" />
              Family Chores
            </h1>
            <p className="text-muted-foreground mt-1">
              {pendingCount === 0 ? (
                <span className="flex items-center gap-1 text-green-500">
                  <Sparkles className="h-4 w-4" /> All done! Great job!
                </span>
              ) : (
                <>
                  {pendingCount} chore{pendingCount !== 1 && "s"} pending
                  {todayCount > 0 && ` • ${todayCount} due today`}
                  {overdueCount > 0 && (
                    <span className="text-red-500"> • {overdueCount} overdue</span>
                  )}
                </>
              )}
            </p>
          </div>

          <Button onClick={() => setDialogOpen(true)} size="lg">
            <Plus className="h-5 w-5 mr-2" />
            Add Chore
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-4">
          {(["all", "pending", "completed"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" && "All"}
              {f === "pending" && "To Do"}
              {f === "completed" && "Done"}
            </Button>
          ))}
        </div>
      </div>

      {/* Chores list */}
      <ScrollArea className="flex-1 p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Clock className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredChores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckSquare className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">
              {filter === "completed"
                ? "No completed chores yet"
                : filter === "pending"
                ? "No pending chores"
                : "No chores yet"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "all" && "Add your first chore to get started"}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {filteredChores.map((chore) => (
              <ChoreCard
                key={chore.id}
                chore={chore}
                onToggle={() => handleToggleChore(chore.id)}
                onDelete={() => handleDeleteChore(chore.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <AddChoreDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={handleAddChore}
      />
    </div>
  );
}
