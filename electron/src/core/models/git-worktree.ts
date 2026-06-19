// source: GitWorktree.cs — in-memory only; camelCase is idiomatic TS
/** One entry from `git worktree list --porcelain`. */
export interface GitWorktree {
  path: string;
  branch: string | null;
  isDetached: boolean;
  isBare: boolean;
}
