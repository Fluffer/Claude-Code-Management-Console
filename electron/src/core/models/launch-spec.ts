// source: LaunchSpec.cs — in-memory only (process start spec, never persisted); camelCase is idiomatic TS
/** A fully-built process start specification for launching a session. */
export interface LaunchSpec {
  filePath: string;
  arguments: string;
  workingDirectory: string | null;
}
