import { useState } from "react";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  approvedSources,
  pendingSources,
  useHouseholdInbox,
  useRotateInbox,
  useSetInboxEnabled,
  useSetInboxOrganize,
  useSetInboxSource,
} from "@/lib/household-inbox";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

function AddressRow({ label, address, testId }: { label: string; address: string; testId: string }) {
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: "Address copied" });
    } catch {
      toast({ title: "Could not copy", description: "Select the address and copy it by hand.", variant: "destructive" });
    }
  };
  return (
    <div className="flex items-center justify-between gap-3" data-testid={`row-${testId}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground break-all" data-testid={`text-${testId}`}>{address}</p>
      </div>
      <Button variant="outline" size="sm" onClick={copy} data-testid={`button-copy-${testId}`}>
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </Button>
    </div>
  );
}

export function HouseholdEmailSettings() {
  const { data: view, isLoading } = useHouseholdInbox();
  const setEnabled = useSetInboxEnabled();
  const setOrganize = useSetInboxOrganize();
  const setSource = useSetInboxSource();
  const rotate = useRotateInbox();
  const [confirmRotate, setConfirmRotate] = useState(false);

  if (isLoading || !view) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!view.configured) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground" data-testid="text-inbox-not-configured">
            Household email is not set up on this server yet
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!view.enabled || !view.address) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="inbox-enabled">Turn on household email</Label>
              <p className="text-sm text-muted-foreground">
                Get a private address for your household. Forward bills and school mail to it from Gmail.
              </p>
            </div>
            <Switch
              id="inbox-enabled"
              checked={false}
              disabled={setEnabled.isPending}
              onCheckedChange={(on) => setEnabled.mutate(on)}
              data-testid="switch-inbox-enabled"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  const pending = pendingSources(view);
  const approved = approvedSources(view);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <AddressRow label="Household address" address={view.address} testId="inbox-household" />
          {view.people.map((p) => (
            <AddressRow key={p.id} label={p.name} address={p.address} testId={`inbox-person-${p.id}`} />
          ))}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRotate(true)} data-testid="button-rotate-inbox">
              Rotate address
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={setEnabled.isPending}
              onClick={() => setEnabled.mutate(false)}
              data-testid="button-disable-inbox"
            >
              Turn off
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-medium">Set up Gmail forwarding</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground" data-testid="list-gmail-guide">
            <li>
              In Gmail, open Settings &gt; Forwarding and POP/IMAP &gt; Add a forwarding address, and paste the address above.
            </li>
            <li>Gmail sends a confirmation request. It appears below; open the Gmail confirmation link and approve it.</li>
            <li>
              Create a filter in Gmail (From: the sender) with &ldquo;Forward it to&rdquo; this address.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-medium">Forwarding sources</h3>
          {pending.length === 0 && approved.length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-no-sources">
              No forwarding sources yet. They appear here after Gmail sends its request.
            </p>
          )}
          {pending.length > 0 && (
            <div className="space-y-3" data-testid="list-pending-sources">
              <p className="text-sm font-medium">Waiting for you</p>
              {pending.map((s) => (
                <div key={s.email} className="flex flex-wrap items-center justify-between gap-3" data-testid={`row-pending-${s.email}`}>
                  <div className="min-w-0">
                    <p className="text-sm break-all">{s.email}</p>
                    {s.verifyUrl && (
                      <a
                        href={s.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline"
                        data-testid={`link-verify-${s.email}`}
                      >
                        Open Gmail confirmation
                      </a>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={setSource.isPending}
                      onClick={() => setSource.mutate({ email: s.email, status: "approved" })}
                      data-testid={`button-approve-${s.email}`}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setSource.isPending}
                      onClick={() => setSource.mutate({ email: s.email, status: "blocked" })}
                      data-testid={`button-block-${s.email}`}
                    >
                      Block
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {approved.length > 0 && (
            <div className="space-y-3" data-testid="list-approved-sources">
              <p className="text-sm font-medium">Approved</p>
              {approved.map((s) => (
                <div key={s.email} className="flex items-center justify-between gap-3" data-testid={`row-approved-${s.email}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm break-all">{s.email}</p>
                    <Badge variant="secondary">Approved</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setSource.isPending}
                    onClick={() => setSource.mutate({ email: s.email, status: "blocked" })}
                    data-testid={`button-block-${s.email}`}
                  >
                    Block
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="inbox-organize">Let Family Frame organize forwarded mail</Label>
              <p className="text-sm text-muted-foreground">
                When this is on, the text of forwarded mail is read by an AI model to fill in your bills and daily sheets.
                When it is off, forwarded mail is kept but not read.
              </p>
            </div>
            <Switch
              id="inbox-organize"
              checked={view.organize.enabled}
              disabled={setOrganize.isPending}
              onCheckedChange={(on) => setOrganize.mutate(on)}
              data-testid="switch-inbox-organize"
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate the household address?</AlertDialogTitle>
            <AlertDialogDescription>
              The current addresses stop working. You must update the forwarding address and filters in Gmail, or
              forwarded mail will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-rotate">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => rotate.mutate()} data-testid="button-confirm-rotate">
              Rotate address
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
