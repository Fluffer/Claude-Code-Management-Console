// source: ProjectInfo.cs — in-memory only; camelCase is idiomatic TS
/** A project folder discovered under one of the configured roots. */
export interface ProjectInfo {
  name: string;
  root: string;
  path: string;
  /** ISO-8601 UTC string, or null if never launched. */
  lastUsedUtc: string | null;
  flags: string;
  description: string;
}
