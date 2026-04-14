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
