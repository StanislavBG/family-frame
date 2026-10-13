import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { serverErrorText } from "@/lib/household";
import type { InboxSource } from "@shared/household-inbox";

export const HOUSEHOLD_INBOX_KEY = ["/api/household/inbox"] as const;

export interface InboxPersonAddress {
  id: string;
  name: string;
  address: string;
}

export type HouseholdInboxView =
  | { configured: false }
  | {
      configured: true;
      enabled: boolean;
      key: string | null;
      address?: string;
      people: InboxPersonAddress[];
      sources: InboxSource[];
      organize: { enabled: boolean; at?: string };
    };

// Sources awaiting a decision; those with a Gmail verification link come first.
export function pendingSources(view: HouseholdInboxView | undefined): InboxSource[] {
  if (!view || !view.configured) return [];
  const pending = view.sources.filter((s) => s.status === "pending");
  return [...pending.filter((s) => s.verifyUrl), ...pending.filter((s) => !s.verifyUrl)];
}

export function approvedSources(view: HouseholdInboxView | undefined): InboxSource[] {
  if (!view || !view.configured) return [];
  return view.sources.filter((s) => s.status === "approved");
}

export function useHouseholdInbox() {
  return useQuery<HouseholdInboxView>({ queryKey: [...HOUSEHOLD_INBOX_KEY] });
}

function useInboxMutation<V>(
  request: (variables: V) => Promise<HouseholdInboxView>,
  failureTitle: string,
  successTitle?: (view: HouseholdInboxView) => string | undefined,
) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: request,
    onSuccess: (view) => {
      queryClient.invalidateQueries({ queryKey: [...HOUSEHOLD_INBOX_KEY] });
      const title = successTitle?.(view);
      if (title) toast({ title });
    },
    onError: (error: Error) => {
      toast({ title: failureTitle, description: serverErrorText(error), variant: "destructive" });
    },
  });
}

export function useSetInboxEnabled() {
  return useInboxMutation<boolean>(
    (enabled) => apiRequest<HouseholdInboxView>("PUT", "/api/household/inbox/enabled", { enabled }),
    "Failed to update household email",
    (view) => (view.configured ? (view.enabled ? "Household email is on" : "Household email is off") : undefined),
  );
}

export function useRotateInbox() {
  return useInboxMutation<void>(
    () => apiRequest<HouseholdInboxView>("POST", "/api/household/inbox/rotate"),
    "Failed to change the address",
    () => "Address changed. Update your forwarding rules.",
  );
}

export function useSetInboxSource() {
  return useInboxMutation<{ email: string; status: "approved" | "blocked" }>(
    (body) => apiRequest<HouseholdInboxView>("PUT", "/api/household/inbox/sources", body),
    "Failed to update sender",
  );
}

export function useSetInboxOrganize() {
  return useInboxMutation<boolean>(
    (enabled) => apiRequest<HouseholdInboxView>("PUT", "/api/household/inbox/organize", { enabled }),
    "Failed to update organizing",
  );
}
