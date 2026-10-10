import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { HouseholdAddress, HouseholdProfile } from "@shared/household";

export const HOUSEHOLD_PROFILE_KEY = ["/api/household/profile"] as const;

export interface AddressForm {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

// Trims every field, drops empty optional ones and adds the browser time zone.
export function buildAddressPayload(form: AddressForm, browserTimeZone?: string): HouseholdAddress {
  const payload: HouseholdAddress = {
    line1: form.line1.trim(),
    city: form.city.trim(),
    country: form.country.trim(),
  };
  const line2 = form.line2.trim();
  const region = form.region.trim();
  const postalCode = form.postalCode.trim();
  if (line2) payload.line2 = line2;
  if (region) payload.region = region;
  if (postalCode) payload.postalCode = postalCode;
  if (browserTimeZone) payload.timezone = browserTimeZone;
  return payload;
}

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// apiRequest throws "<status>: <body>"; pull the server's `error` text out of a JSON body.
export function serverErrorText(error: Error): string {
  const body = error.message.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // not JSON
  }
  return body;
}

export function useHouseholdProfile() {
  return useQuery<HouseholdProfile>({ queryKey: [...HOUSEHOLD_PROFILE_KEY] });
}

export function useSaveAddress() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (address: HouseholdAddress) =>
      apiRequest<HouseholdProfile>("PUT", "/api/household/address", address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...HOUSEHOLD_PROFILE_KEY] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Address saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save address", description: serverErrorText(error), variant: "destructive" });
    },
  });
}

export function useSetEventsSharing() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest<HouseholdProfile>("PUT", "/api/household/events-sharing", { enabled }),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: [...HOUSEHOLD_PROFILE_KEY] });
      toast({ title: profile?.eventsSharing?.enabled ? "Event recommendations on" : "Event recommendations off" });
    },
    onError: (error: Error) => {
      toast({
        title: error.message.startsWith("409") ? "Can't share address yet" : "Failed to update sharing",
        description: serverErrorText(error),
        variant: "destructive",
      });
    },
  });
}
