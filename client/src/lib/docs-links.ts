/** Public GitHub location of the repo's docs/ folder (the repo is public). */
export const DOCS_BASE_URL = "https://github.com/StanislavBG/family-frame/blob/main/docs/";

/** Docs that the UI links to. Add a file here before linking it. */
export type DocsFile = "person-publishing.md" | "time-series.md";

export function docsUrl(file: DocsFile): string {
  return DOCS_BASE_URL + file;
}
