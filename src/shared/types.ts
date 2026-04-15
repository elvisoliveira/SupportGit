export type RefType = 'local' | 'remote' | 'tag';

export interface GitRef {
  name: string;
  type: RefType;
  sha: string;
  subject: string;
  checkoutName: string;
  localName?: string;
  remoteName?: string;
  current: boolean;
}

export interface LoadRefsResult {
  repoPath: string;
  refs: GitRef[];
}

export interface CheckoutResult {
  head: string;
  detached: boolean;
}

export interface RepoStatusFile {
  path: string;
  stagedCode: string;
  unstagedCode: string;
  stagedLabel: string;
  unstagedLabel: string;
}

export interface RepoStatusResult {
  staged: RepoStatusFile[];
  unstaged: RepoStatusFile[];
}

export interface GenerateCommitMessageResult {
  message: string;
}
