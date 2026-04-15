import { invoke } from '@tauri-apps/api/core';

import type {
  CheckoutResult,
  GenerateCommitMessageResult,
  GitRef,
  LoadRefsResult,
  RepoStatusResult
} from '@/shared/types';

export function loadRefs(repoPath: string): Promise<LoadRefsResult> {
  return invoke<LoadRefsResult>('load_refs', { repoPath });
}

export function loadStatus(repoPath: string): Promise<RepoStatusResult> {
  return invoke<RepoStatusResult>('load_status', { repoPath });
}

export function checkoutRef(repoPath: string, reference: GitRef): Promise<CheckoutResult> {
  return invoke<CheckoutResult>('checkout_ref', { repoPath, reference });
}

export function createCommit(repoPath: string, message: string): Promise<CheckoutResult> {
  return invoke<CheckoutResult>('create_commit', {
    repoPath,
    input: { message }
  });
}

export function generateCommitMessage(
  repoPath: string,
  apiKey: string,
  model: string
): Promise<GenerateCommitMessageResult> {
  return invoke<GenerateCommitMessageResult>('generate_commit_message', {
    repoPath,
    input: { apiKey, model }
  });
}
