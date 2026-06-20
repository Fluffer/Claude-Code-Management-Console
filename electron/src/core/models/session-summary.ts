// source: SessionSummary.cs — in-memory only; camelCase is idiomatic TS
/** A resumable Claude session: its id (file stem), last write, and first user line. */
export interface SessionSummary {
  sessionId: string;
  /** ISO-8601 UTC string. */
  lastWriteUtc: string;
  firstUserMessage: string;
}
