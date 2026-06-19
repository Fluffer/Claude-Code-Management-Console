// source: GitInfo.cs — in-memory only; camelCase is idiomatic TS
/** Lightweight git status for a project row. */
export interface GitInfo {
  /** Current branch name, or a short commit hash when detached. */
  branch: string;
  /** True when the working tree has uncommitted changes; null when unknown (git CLI unavailable or timed out). */
  isDirty: boolean | null;
}
