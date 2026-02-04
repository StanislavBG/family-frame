import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StickyNote, Plus, Pin, PinOff, Trash2, FileText, Clock, Users, Lock, User, AtSign, ChevronDown } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Note, ConnectedUser } from "@shared/schema";
import { format } from "date-fns";

interface NotesResponse {
  mine: Note[];
  shared: Note[];
}

function NotepadSkeleton() {
  return (
    <div className="h-full p-6">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function EmptyNotesState({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <Card className="max-w-lg">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <StickyNote className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">Family Notepad</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Keep track of grocery lists, reminders, and important notes for your household.
            Create your first note to get started.
          </p>
          <Button size="lg" onClick={onCreateNote} data-testid="button-create-first-note">
            <Plus className="h-5 w-5 mr-2" />
            Create Note
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
  isSharedView?: boolean;
}

function NoteCard({ note, onClick, onTogglePin, onDelete, isSharedView = false }: NoteCardProps) {
  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover-elevate group relative",
        note.isPinned && !isSharedView && "ring-2 ring-primary/20",
        isSharedView && "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20"
      )}
      onClick={onClick}
      data-testid={`card-note-${note.id}`}
    >
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg font-medium line-clamp-1">
            {note.title || "Untitled Note"}
          </CardTitle>
          {isSharedView && note.authorName && (
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              <User className="h-3 w-3" />
              <span>{note.authorName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {note.isShared && !isSharedView && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              <Users className="h-3 w-3 mr-1" />
              Shared
            </Badge>
          )}
          {!isSharedView && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onTogglePin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin();
                  }}
                  data-testid={`button-pin-note-${note.id}`}
                >
                  {note.isPinned ? (
                    <PinOff className="h-4 w-4 text-primary" />
                  ) : (
                    <Pin className="h-4 w-4" />
                  )}
                </Button>
              )}
              {onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-delete-note-${note.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Note</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{note.title || "Untitled Note"}"? 
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete} data-testid="button-confirm-delete">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm line-clamp-4 whitespace-pre-wrap mb-3">
          {note.content || "No content"}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{format(new Date(note.updatedAt), "MMM d, h:mm a")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface NoteEditorProps {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note: { title: string; content: string; isPinned?: boolean; isShared?: boolean; mentions?: string[] }) => void;
  isNew: boolean;
  isReadOnly?: boolean;
  connections: ConnectedUser[];
}

function NoteEditor({ note, open, onOpenChange, onSave, isNew, isReadOnly = false, connections }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [isShared, setIsShared] = useState(note?.isShared || false);
  const [mentions, setMentions] = useState<string[]>(note?.mentions || []);
  const [hasChanges, setHasChanges] = useState(false);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(note?.title || "");
      setContent(note?.content || "");
      setIsShared(note?.isShared || false);
      setMentions(note?.mentions || []);
      setHasChanges(false);
    }
  }, [open, note]);

  const handleSave = useCallback(() => {
    if (isReadOnly) {
      onOpenChange(false);
      return;
    }
    onSave({ 
      title: title || "Untitled Note", 
      content,
      isPinned: note?.isPinned,
      isShared,
      mentions
    });
    onOpenChange(false);
  }, [title, content, note?.isPinned, isShared, mentions, onSave, onOpenChange, isReadOnly]);
  
  const toggleMention = useCallback((userId: string) => {
    setMentions(prev => {
      const newMentions = prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId];
      setHasChanges(true);
      return newMentions;
    });
  }, []);

  const handleChange = useCallback((field: "title" | "content", value: string) => {
    if (isReadOnly) return;
    if (field === "title") {
      setTitle(value);
    } else {
      setContent(value);
    }
    setHasChanges(true);
  }, [isReadOnly]);

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen && hasChanges && !isReadOnly) {
        handleSave();
      } else {
        onOpenChange(newOpen);
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {isReadOnly ? "View Note" : isNew ? "Create Note" : "Edit Note"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isReadOnly ? "Viewing a shared note" : isNew ? "Create a new note" : "Edit your note"}
          </DialogDescription>
          <Input
            value={title}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="Note title..."
            className="text-xl font-semibold border-0 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            data-testid="input-note-title"
            readOnly={isReadOnly}
          />
          {isReadOnly && note?.authorName && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <User className="h-4 w-4" />
              <span>Shared by {note.authorName}</span>
            </div>
          )}
        </DialogHeader>
        <Textarea
          value={content}
          onChange={(e) => handleChange("content", e.target.value)}
          placeholder={isReadOnly ? "" : "Start writing your note..."}
          className="flex-1 min-h-[300px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base leading-relaxed"
          data-testid="textarea-note-content"
          readOnly={isReadOnly}
        />
        <DialogFooter className="flex-shrink-0">
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-4">
              {note?.updatedAt && (
                <span className="text-sm text-muted-foreground">
                  Last edited: {format(new Date(note.updatedAt), "MMM d, yyyy h:mm a")}
                </span>
              )}
            </div>
            {!isReadOnly && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="note-shared"
                    checked={isShared}
                    onCheckedChange={(checked) => {
                      setIsShared(checked);
                      setHasChanges(true);
                    }}
                    data-testid="switch-note-shared"
                  />
                  <Label htmlFor="note-shared" className="flex items-center gap-1 text-sm cursor-pointer">
                    {isShared ? (
                      <>
                        <Users className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-600 dark:text-emerald-400">Shared</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        <span>Private</span>
                      </>
                    )}
                  </Label>
                </div>
                
                {connections.length > 0 && (
                  <Popover open={mentionPickerOpen} onOpenChange={setMentionPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className={cn(
                          "gap-1",
                          mentions.length > 0 && "border-blue-500 text-blue-600 dark:text-blue-400"
                        )}
                        data-testid="button-mention-picker"
                      >
                        <AtSign className="h-4 w-4" />
                        {mentions.length > 0 ? `Notify (${mentions.length})` : "Notify"}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="end">
                      <div className="space-y-1">
                        <p className="text-sm font-medium px-2 py-1">Notify households</p>
                        <p className="text-xs text-muted-foreground px-2 pb-2">
                          They'll receive a message about this note
                        </p>
                        {connections.map((conn) => (
                          <div 
                            key={conn.id}
                            className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                            onClick={() => toggleMention(conn.id)}
                            data-testid={`mention-option-${conn.id}`}
                          >
                            <Checkbox 
                              checked={mentions.includes(conn.id)}
                              onCheckedChange={() => {}}
                            />
                            <span className="text-sm">{conn.homeName || conn.username}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                
                <Button onClick={handleSave} data-testid="button-save-note">
                  {isNew ? "Create Note" : "Save Changes"}
                </Button>
              </div>
            )}
            {isReadOnly && (
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-note">
                Close
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NotepadPage() {
  const { toast } = useToast();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey: ["/api/notes"],
  });

  const { data: connections = [] } = useQuery<ConnectedUser[]>({
    queryKey: ["/api/connections"],
  });

  const myNotes = data?.mine || [];
  const sharedNotes = data?.shared || [];
  const totalNotes = myNotes.length + sharedNotes.length;

  const createNoteMutation = useMutation({
    mutationFn: async (note: { title: string; content: string; isPinned?: boolean; isShared?: boolean; mentions?: string[] }) => {
      return await apiRequest("POST", "/api/notes", note);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({ title: "Note created" });
    },
    onError: () => {
      toast({ title: "Failed to create note", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: Partial<Note> }) => {
      return await apiRequest("PATCH", `/api/notes/${noteId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
    },
    onError: () => {
      toast({ title: "Failed to save note", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return await apiRequest("DELETE", `/api/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({ title: "Note deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete note", variant: "destructive" });
    },
  });

  const handleCreateNote = useCallback(() => {
    setSelectedNote(null);
    setIsCreatingNew(true);
    setIsReadOnly(false);
    setEditorOpen(true);
  }, []);

  const handleEditNote = useCallback((note: Note, readOnly = false) => {
    setSelectedNote(note);
    setIsCreatingNew(false);
    setIsReadOnly(readOnly);
    setEditorOpen(true);
  }, []);

  const handleSaveNote = useCallback((noteData: { title: string; content: string; isPinned?: boolean; isShared?: boolean; mentions?: string[] }) => {
    if (isCreatingNew) {
      createNoteMutation.mutate(noteData);
    } else if (selectedNote) {
      updateNoteMutation.mutate({ noteId: selectedNote.id, data: noteData });
    }
  }, [isCreatingNew, selectedNote, createNoteMutation, updateNoteMutation]);

  const handleTogglePin = useCallback((note: Note) => {
    updateNoteMutation.mutate({
      noteId: note.id,
      data: { isPinned: !note.isPinned },
    });
  }, [updateNoteMutation]);

  const handleDeleteNote = useCallback((noteId: string) => {
    deleteNoteMutation.mutate(noteId);
  }, [deleteNoteMutation]);

  if (isLoading) {
    return (
      <div className="h-full bg-background">
        <NotepadSkeleton />
      </div>
    );
  }

  if (totalNotes === 0) {
    return (
      <div className="h-full bg-background">
        <EmptyNotesState onCreateNote={handleCreateNote} />
        <NoteEditor
          note={selectedNote}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={handleSaveNote}
          isNew={isCreatingNew}
          isReadOnly={isReadOnly}
          connections={connections}
        />
      </div>
    );
  }

  const pinnedNotes = myNotes.filter((n) => n.isPinned);
  const unpinnedNotes = myNotes.filter((n) => !n.isPinned);

  return (
    <div className="h-full overflow-auto p-6 bg-background">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <StickyNote className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-notepad-title">Notepad</h1>
            <p className="text-sm text-muted-foreground">
              {myNotes.length} of your own, {sharedNotes.length} shared
            </p>
          </div>
        </div>
        <Button onClick={handleCreateNote} data-testid="button-create-note">
          <Plus className="h-5 w-5 mr-2" />
          New Note
        </Button>
      </div>

      {/* My Notes Section */}
      {myNotes.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">My Notes</h2>
            <Badge variant="secondary">{myNotes.length}</Badge>
          </div>

          {pinnedNotes.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Pin className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Pinned</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onClick={() => handleEditNote(note)}
                    onTogglePin={() => handleTogglePin(note)}
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {unpinnedNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Notes</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {unpinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onClick={() => handleEditNote(note)}
                    onTogglePin={() => handleTogglePin(note)}
                    onDelete={() => handleDeleteNote(note.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shared Notes Section */}
      {sharedNotes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">Shared Notes</h2>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              {sharedNotes.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sharedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={() => handleEditNote(note, true)}
                isSharedView
              />
            ))}
          </div>
        </div>
      )}

      <NoteEditor
        note={selectedNote}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSaveNote}
        isNew={isCreatingNew}
        isReadOnly={isReadOnly}
        connections={connections}
      />
    </div>
  );
}
