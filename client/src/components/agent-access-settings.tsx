import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bot, Copy, Check, KeyRound, Plus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "@/components/ui/alert-dialog";

type TokenScope =
  | "calendar:read"
  | "calendar:write"
  | "mail:read"
  | "mail:write"
  | "data:read"
  | "data:write";

type AccessLevel = "none" | "read" | "write";

interface ApiTokenRecord {
  id: string;
  name: string;
  scopes: TokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
}

interface CreatedToken {
  token: string;
  record: ApiTokenRecord;
}

const SCOPE_LABELS: Record<TokenScope, string> = {
  "calendar:read": "Read calendar",
  "calendar:write": "Create/edit/delete events",
  "mail:read": "Read mailbox",
  "mail:write": "Publish/edit mailbox",
  "data:read": "Read app data",
  "data:write": "Publish app data & schemas",
};

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "none", label: "None" },
  { value: "read", label: "Read" },
  { value: "write", label: "Read & write" },
];

/** apiRequest throws `${status}: ${body}`; pull the server's `error` field out of it. */
function serverErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const body = raw.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON; fall through
  }
  return body || "Something went wrong";
}

export function AgentAccessSettings() {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [writeScope, setWriteScope] = useState(true);
  const [mailAccess, setMailAccess] = useState<AccessLevel>("none");
  const [dataAccess, setDataAccess] = useState<AccessLevel>("none");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "command" | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenRecord | null>(null);

  const { data: tokens, isLoading } = useQuery<ApiTokenRecord[]>({
    queryKey: queryKeys.apiTokens(),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; scopes: TokenScope[] }) =>
      apiRequest<CreatedToken>("POST", "/api/tokens/new", body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens() });
      setCreatedToken(result.token);
      setFormOpen(false);
      setName("");
      setWriteScope(true);
      setMailAccess("none");
      setDataAccess("none");
    },
    onError: (err) => {
      toast({ title: "Could not create token", description: serverErrorMessage(err), variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tokens/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiTokens() });
      setRevokeTarget(null);
      toast({ title: "Token revoked" });
    },
    onError: (err) => {
      toast({ title: "Could not revoke token", description: serverErrorMessage(err), variant: "destructive" });
    },
  });

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const scopes: TokenScope[] = ["calendar:read"];
    if (writeScope) scopes.push("calendar:write");
    if (mailAccess !== "none") scopes.push("mail:read");
    if (mailAccess === "write") scopes.push("mail:write");
    if (dataAccess !== "none") scopes.push("data:read");
    if (dataAccess === "write") scopes.push("data:write");
    createMutation.mutate({ name: trimmed, scopes });
  };

  const command = createdToken
    ? `claude mcp add --transport http family-frame ${window.location.origin}/mcp --header "Authorization: Bearer ${createdToken}"`
    : "";

  const copy = async (kind: "token" | "command", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy it manually.", variant: "destructive" });
    }
  };

  const closeTokenDialog = () => {
    setCreatedToken(null);
    setCopied(null);
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : tokens && tokens.length > 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border"
                data-testid={`token-row-${t.id}`}
              >
                <div className="space-y-1">
                  <div className="font-medium flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                    {t.name}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.scopes.map((s) => (
                      <Badge key={s} variant="secondary">{SCOPE_LABELS[s as TokenScope] ?? s}</Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Created {new Date(t.createdAt).toLocaleDateString("en-CA")} · Last used{" "}
                    {t.lastUsedAt ? formatRelativeTime(t.lastUsedAt) : "Never"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setRevokeTarget(t)}
                  data-testid={`button-revoke-${t.id}`}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Bot}
            title="No agent tokens yet"
            description="Create a token to let an AI agent, like a Claude Code session, manage your calendar."
          />
        </Card>
      )}

      <Button variant="outline" className="w-full" onClick={() => setFormOpen(true)} data-testid="button-new-token">
        <Plus className="h-4 w-4 mr-2" />
        New token
      </Button>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New token</DialogTitle>
            <DialogDescription>Name the agent this token is for and choose what it can do.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                placeholder="e.g. Claude Code on my laptop"
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-token-name"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="scope-read" checked disabled aria-required="true" />
              <Label htmlFor="scope-read">Read calendar</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="scope-write"
                checked={writeScope}
                onCheckedChange={(v) => setWriteScope(v === true)}
                data-testid="checkbox-scope-write"
              />
              <Label htmlFor="scope-write">Create/edit/delete events</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-mail">Mailbox access</Label>
              <Select value={mailAccess} onValueChange={(v) => setMailAccess(v as AccessLevel)}>
                <SelectTrigger id="scope-mail" aria-label="Mailbox access" data-testid="select-scope-mail">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} data-testid={`option-scope-mail-${o.value}`}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">Lets an agent publish processed emails</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope-data">App data access</Label>
              <Select value={dataAccess} onValueChange={(v) => setDataAccess(v as AccessLevel)}>
                <SelectTrigger id="scope-data" aria-label="App data access" data-testid="select-scope-data">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} data-testid={`option-scope-data-${o.value}`}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">Lets an agent upload custom JSON schemas and records</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
              data-testid="button-create-token"
            >
              {createMutation.isPending ? "Creating..." : "Create token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createdToken !== null} onOpenChange={(open) => { if (!open) closeTokenDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new token</DialogTitle>
            <DialogDescription>You won't be able to see this token again.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={createdToken ?? ""} className="font-mono" data-testid="input-raw-token" />
              <Button variant="outline" onClick={() => copy("token", createdToken ?? "")} data-testid="button-copy-token">
                {copied === "token" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Add it to Claude Code</Label>
              <pre className="font-mono text-xs p-3 rounded-md bg-muted whitespace-pre-wrap break-all" data-testid="text-mcp-command">
                {command}
              </pre>
              <Button variant="outline" onClick={() => copy("command", command)} data-testid="button-copy-command">
                {copied === "command" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copy command
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeTokenDialog}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke "{revokeTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Any agent using this token will immediately lose access. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (revokeTarget) revokeMutation.mutate(revokeTarget.id);
              }}
              data-testid="button-confirm-revoke"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
