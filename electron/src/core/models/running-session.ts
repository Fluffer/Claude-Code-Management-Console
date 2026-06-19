// source: RunningSession.cs — in-memory only; camelCase is idiomatic TS
/** A live claude/node/bun process believed to host a Claude session. */
export interface RunningSession {
  pid: number;
  processName: string;
  workingDirectory: string;
}
