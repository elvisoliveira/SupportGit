import { invoke } from '@tauri-apps/api/core';

import type {
  CheckoutResult,
  GenerateBranchNameResult,
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

export function stageFile(repoPath: string, path: string): Promise<void> {
  return invoke('stage_file', {
    repoPath,
    input: { path }
  });
}

export function stageAllFiles(repoPath: string): Promise<void> {
  return invoke('stage_all_files', { repoPath });
}

export function unstageFile(repoPath: string, path: string): Promise<void> {
  return invoke('unstage_file', {
    repoPath,
    input: { path }
  });
}

export function unstageAllFiles(repoPath: string): Promise<void> {
  return invoke('unstage_all_files', { repoPath });
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

export function createBranch(repoPath: string, name: string): Promise<CheckoutResult> {
  return invoke<CheckoutResult>('create_branch', {
    repoPath,
    input: { name }
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

export function generateBranchName(
  repoPath: string,
  apiKey: string,
  model: string
): Promise<GenerateBranchNameResult> {
  return invoke<GenerateBranchNameResult>('generate_branch_name', {
    repoPath,
    input: { apiKey, model }
  });
}
