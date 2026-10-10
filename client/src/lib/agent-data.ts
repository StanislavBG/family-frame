import { useMutation, useQuery } from "@tanstack/react-query";
import type { DataRecord, DataSchema, EmailMessage, EmailSummary } from "@shared/agent-data";
import { apiRequest, queryClient } from "./queryClient";
import { queryKeys } from "./api";

export interface MailListParams {
  limit?: number;
  before?: string;
  label?: string;
  kind?: string;
  unreadOnly?: boolean;
  q?: string;
}

export interface DataRecordsParams {
  emailId?: string;
  limit?: number;
  offset?: number;
}

export type MediaKind = "image" | "pdf";

export interface MediaMeta {
  id: string;
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "application/pdf";
  kind: MediaKind;
  size: number;
  sha256: string;
  tags: string[];
  emailIds: string[];
  createdAt: string;
}

export interface MediaListParams {
  kind?: MediaKind;
  tag?: string;
  emailId?: string;
  limit?: number;
  offset?: number;
}

export interface MediaListResponse {
  items: MediaMeta[];
  total: number;
  usage: { bytes: number; count: number };
}

export interface MailListResponse {
  emails: EmailSummary[];
  nextBefore: string | null;
}

export interface DataRecordsResponse<T = unknown> {
  records: Array<Omit<DataRecord, "data"> & { data: T }>;
  total: number;
}

export interface MarkMailReadInput {
  ids: string[] | "all";
  read?: boolean;
}

function withQuery(path: string, entries: Array<[string, string | number | undefined]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function buildMailListUrl(params: MailListParams = {}): string {
  return withQuery("/api/mail/messages", [
    ["limit", params.limit],
    ["before", params.before],
    ["label", params.label],
    ["kind", params.kind],
    ["unread", params.unreadOnly ? "1" : undefined],
    ["q", params.q],
  ]);
}

export function buildDataRecordsUrl(schemaId: string, params: DataRecordsParams = {}): string {
  return withQuery(`/api/data/records/${encodeURIComponent(schemaId)}`, [
    ["emailId", params.emailId],
    ["limit", params.limit],
    ["offset", params.offset],
  ]);
}

export function mediaUrl(id: string): string {
  return `/api/files/${encodeURIComponent(id)}`;
}

export function buildMediaListUrl(params: MediaListParams = {}): string {
  return withQuery("/api/files", [
    ["kind", params.kind],
    ["tag", params.tag],
    ["emailId", params.emailId],
    ["limit", params.limit],
    ["offset", params.offset],
  ]);
}

// The default queryFn URL-encodes key segments, so each hook fetches its own URL.
const get = <T>(url: string) => apiRequest<T>("GET", url);

export function useMailMessages(params: MailListParams = {}) {
  return useQuery({
    queryKey: queryKeys.mail.list(params),
    queryFn: () => get<MailListResponse>(buildMailListUrl(params)),
  });
}

export function useMailMessage(id: string) {
  return useQuery({
    queryKey: queryKeys.mail.detail(id),
    queryFn: () => get<EmailMessage>(`/api/mail/messages/${encodeURIComponent(id)}`),
    enabled: id !== "",
  });
}

export function useMailUnreadCount() {
  return useQuery({
    queryKey: queryKeys.mail.unreadCount(),
    queryFn: () => get<{ count: number }>("/api/mail/unread-count"),
  });
}

export function useMarkMailRead() {
  return useMutation({
    mutationFn: (input: MarkMailReadInput) =>
      apiRequest<{ updated: number }>("POST", "/api/mail/messages/read", input),
    onSuccess: () => {
      // The list/detail prefix covers every list and detail key.
      queryClient.invalidateQueries({ queryKey: ["/api/mail/messages"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.mail.unreadCount() });
    },
  });
}

export function useDataSchema(schemaId: string) {
  return useQuery({
    queryKey: queryKeys.data.schema(schemaId),
    queryFn: () => get<DataSchema>(`/api/data/schemas/${encodeURIComponent(schemaId)}`),
    enabled: schemaId !== "",
  });
}

export function useDataRecords<T = unknown>(schemaId: string, params: DataRecordsParams = {}) {
  return useQuery({
    queryKey: queryKeys.data.records(schemaId, params),
    queryFn: () => get<DataRecordsResponse<T>>(buildDataRecordsUrl(schemaId, params)),
    enabled: schemaId !== "",
  });
}

export function useDataRecord<T = unknown>(schemaId: string, recordId: string) {
  return useQuery({
    queryKey: queryKeys.data.record(schemaId, recordId),
    queryFn: () =>
      get<Omit<DataRecord, "data"> & { data: T }>(
        `/api/data/records/${encodeURIComponent(schemaId)}/${encodeURIComponent(recordId)}`,
      ),
    enabled: schemaId !== "" && recordId !== "",
  });
}

export function useMediaList(params: MediaListParams = {}) {
  return useQuery({
    queryKey: queryKeys.media.list(params),
    queryFn: () => get<MediaListResponse>(buildMediaListUrl(params)),
  });
}

export function useMediaMeta(id: string) {
  return useQuery({
    queryKey: queryKeys.media.meta(id),
    queryFn: () => get<MediaMeta>(`${mediaUrl(id)}/meta`),
    enabled: id !== "",
  });
}
