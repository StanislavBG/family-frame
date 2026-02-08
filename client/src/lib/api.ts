import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Centralized query keys for React Query.
 * Use these instead of hardcoded strings to ensure consistency.
 */
export const queryKeys = {
  // Settings
  settings: () => ["/api/settings"] as const,
  config: () => ["/api/config"] as const,

  // People
  people: () => ["/api/people/list"] as const,

  // Calendar
  calendar: {
    events: () => ["/api/calendar/events"] as const,
  },

  // Messages
  messages: {
    all: () => ["/api/messages"] as const,
    unreadCount: () => ["/api/messages/unread-count"] as const,
  },

  // Notes
  notes: () => ["/api/notes"] as const,

  // Connections
  connections: {
    all: () => ["/api/connections"] as const,
    requests: () => ["/api/connections/requests"] as const,
    sent: () => ["/api/connections/sent"] as const,
  },

  // Google Photos
  google: {
    pickerCurrent: () => ["/api/google/picker/current"] as const,
  },

  // Weather (dynamic keys)
  weather: {
    byCoords: (lat: number, lon: number) => ["/api/weather/coords", lat, lon] as const,
    byCity: (city: string, country: string) => ["/api/weather", city, country] as const,
  },

  // Shopping
  shopping: () => ["/api/shopping"] as const,

  // Playlists (custom YouTube playlists for Baby Songs)
  playlists: () => ["/api/playlists"] as const,

  // YouTube video info
  youtube: {
    video: (videoId: string) => ["/api/youtube/video", videoId] as const,
    videos: (videoIds: string[]) => ["/api/youtube/videos", videoIds.join(",")] as const,
  },
} as const;

/**
 * Helper to invalidate multiple query keys at once.
 */
export function invalidateQueries(...keys: readonly (readonly string[])[]): void {
  keys.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: key as string[] });
  });
}

/**
 * Options for creating a mutation with toast notifications.
 */
interface MutationOptions<TData, TVariables> {
  successMessage?: string;
  errorMessage?: string;
  invalidateKeys?: readonly (readonly string[])[];
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

/**
 * Hook to create a POST mutation with standard patterns.
 */
export function useCreateMutation<TData = unknown, TVariables = unknown>(
  endpoint: string,
  options: MutationOptions<TData, TVariables> = {}
) {
  const { toast } = useToast();
  const {
    successMessage = "Created successfully",
    errorMessage = "Failed to create",
    invalidateKeys = [],
    onSuccess,
    onError,
  } = options;

  return useMutation({
    mutationFn: async (data: TVariables): Promise<TData> => {
      return apiRequest<TData>("POST", endpoint, data);
    },
    onSuccess: (data, variables) => {
      if (invalidateKeys.length > 0) {
        invalidateQueries(...invalidateKeys);
      }
      if (successMessage) {
        toast({ title: successMessage });
      }
      onSuccess?.(data, variables);
    },
    onError: (error: Error, variables) => {
      toast({
        title: errorMessage,
        description: error.message,
        variant: "destructive",
      });
      onError?.(error, variables);
    },
  });
}

/**
 * Hook to create a PATCH mutation with standard patterns.
 *
 * When `getEndpoint` is a function, variables are used for URL construction only
 * and NOT sent as the request body (use `getBody` to explicitly provide body data).
 * When `getEndpoint` is a static string, variables are sent as the request body.
 */
export function useUpdateMutation<TData = unknown, TVariables = unknown>(
  getEndpoint: string | ((variables: TVariables) => string),
  options: MutationOptions<TData, TVariables> & {
    getBody?: (variables: TVariables) => unknown;
  } = {}
) {
  const { toast } = useToast();
  const {
    successMessage = "Updated successfully",
    errorMessage = "Failed to update",
    invalidateKeys = [],
    onSuccess,
    onError,
    getBody,
  } = options;

  return useMutation({
    mutationFn: async (data: TVariables): Promise<TData> => {
      const endpoint = typeof getEndpoint === "function" ? getEndpoint(data) : getEndpoint;
      // Dynamic endpoints: variables are URL params only, no body unless getBody is provided.
      // Static endpoints: variables are the request body.
      const body = getBody
        ? getBody(data)
        : typeof getEndpoint === "string" ? data : undefined;
      return apiRequest<TData>("PATCH", endpoint, body);
    },
    onSuccess: (data, variables) => {
      if (invalidateKeys.length > 0) {
        invalidateQueries(...invalidateKeys);
      }
      if (successMessage) {
        toast({ title: successMessage });
      }
      onSuccess?.(data, variables);
    },
    onError: (error: Error, variables) => {
      toast({
        title: errorMessage,
        description: error.message,
        variant: "destructive",
      });
      onError?.(error, variables);
    },
  });
}

/**
 * Hook to create a PUT mutation with standard patterns.
 *
 * When `getEndpoint` is a function, variables are used for URL construction only
 * and NOT sent as the request body (use `getBody` to explicitly provide body data).
 * When `getEndpoint` is a static string, variables are sent as the request body.
 */
export function usePutMutation<TData = unknown, TVariables = unknown>(
  getEndpoint: string | ((variables: TVariables) => string),
  options: MutationOptions<TData, TVariables> & {
    getBody?: (variables: TVariables) => unknown;
  } = {}
) {
  const { toast } = useToast();
  const {
    successMessage = "Updated successfully",
    errorMessage = "Failed to update",
    invalidateKeys = [],
    onSuccess,
    onError,
    getBody,
  } = options;

  return useMutation({
    mutationFn: async (data: TVariables): Promise<TData> => {
      const endpoint = typeof getEndpoint === "function" ? getEndpoint(data) : getEndpoint;
      const body = getBody
        ? getBody(data)
        : typeof getEndpoint === "string" ? data : undefined;
      return apiRequest<TData>("PUT", endpoint, body);
    },
    onSuccess: (data, variables) => {
      if (invalidateKeys.length > 0) {
        invalidateQueries(...invalidateKeys);
      }
      if (successMessage) {
        toast({ title: successMessage });
      }
      onSuccess?.(data, variables);
    },
    onError: (error: Error, variables) => {
      toast({
        title: errorMessage,
        description: error.message,
        variant: "destructive",
      });
      onError?.(error, variables);
    },
  });
}

/**
 * Hook to create a DELETE mutation with standard patterns.
 */
export function useDeleteMutation<TData = unknown>(
  getEndpoint: string | ((id: string) => string),
  options: MutationOptions<TData, string> = {}
) {
  const { toast } = useToast();
  const {
    successMessage = "Deleted successfully",
    errorMessage = "Failed to delete",
    invalidateKeys = [],
    onSuccess,
    onError,
  } = options;

  return useMutation({
    mutationFn: async (id: string): Promise<TData> => {
      const endpoint = typeof getEndpoint === "function" ? getEndpoint(id) : `${getEndpoint}/${id}`;
      return apiRequest<TData>("DELETE", endpoint);
    },
    onSuccess: (data, id) => {
      if (invalidateKeys.length > 0) {
        invalidateQueries(...invalidateKeys);
      }
      if (successMessage) {
        toast({ title: successMessage });
      }
      onSuccess?.(data, id);
    },
    onError: (error: Error, id) => {
      toast({
        title: errorMessage,
        description: error.message,
        variant: "destructive",
      });
      onError?.(error, id);
    },
  });
}
