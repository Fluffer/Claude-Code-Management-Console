// source: RunningSession.cs — in-memory only; camelCase is idiomatic TS
/** A live claude/node/bun process believed to host a Claude session. */
export interface RunningSession {
  pid: number;
  processName: string;
  workingDirectory: string;
  /**
   * Session display name parsed from the `-n <name>` / `--name <name>` flag
   * (the launcher sets this to the project name). Windows CIM cannot read a
   * process's working directory, so this is the only reliable key for mapping a
   * console-launched session back to its project row. Undefined for sessions
   * launched without a name (e.g. a bare `claude` typed manually).
   */
  sessionName?: string;
}
