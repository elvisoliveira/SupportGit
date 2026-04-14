import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { GitRef, RefType } from '../shared/types.js';

type FilterType = 'all' | RefType;

interface LoadRefsResult {
  repoPath: string;
  refs: GitRef[];
}

interface CheckoutResult {
  head: string;
  detached: boolean;
}

interface RepoStatusFile {
  path: string;
  stagedCode: string;
  unstagedCode: string;
  stagedLabel: string;
  unstagedLabel: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

interface RepoStatusResult {
  staged: RepoStatusFile[];
  unstaged: RepoStatusFile[];
}

const state = {
  repoPath: '',
  refs: [] as GitRef[],
  stagedFiles: [] as RepoStatusFile[],
  unstagedFiles: [] as RepoStatusFile[],
  filter: 'all' as FilterType,
  query: '',
  busyRef: '',
  busyCommit: false
};

const openRepoButton = document.querySelector<HTMLButtonElement>('#open-repo-button');
const usePathButton = document.querySelector<HTMLButtonElement>('#use-path-button');
const repoPathInput = document.querySelector<HTMLInputElement>('#repo-path-input');
const searchInput = document.querySelector<HTMLInputElement>('#search-input');
const repoPathElement = document.querySelector<HTMLElement>('#repo-path');
const currentHeadElement = document.querySelector<HTMLElement>('#current-head');
const resultsElement = document.querySelector<HTMLElement>('#results');
const resultsSummaryElement = document.querySelector<HTMLElement>('#results-summary');
const statusMessageElement = document.querySelector<HTMLElement>('#status-message');
const statusSummaryElement = document.querySelector<HTMLElement>('#status-summary');
const stagedFilesElement = document.querySelector<HTMLElement>('#staged-files');
const unstagedFilesElement = document.querySelector<HTMLElement>('#unstaged-files');
const stagedCountElement = document.querySelector<HTMLElement>('#staged-count');
const unstagedCountElement = document.querySelector<HTMLElement>('#unstaged-count');
const commitMessageElement = document.querySelector<HTMLTextAreaElement>('#commit-message');
const commitButtonElement = document.querySelector<HTMLButtonElement>('#commit-button');
const filterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter-chip'));

function setStatus(message: string, tone: 'neutral' | 'error' | 'success' = 'neutral'): void {
  if (!statusMessageElement) {
    return;
  }

  statusMessageElement.textContent = message;

  if (tone === 'neutral') {
    statusMessageElement.removeAttribute('data-tone');
  } else {
    statusMessageElement.dataset.tone = tone;
  }
}

function updateCurrentHead(): void {
  const current = state.refs.find((ref) => ref.current);
  currentHeadElement!.textContent = current ? current.name : '-';
}

function updateCommitState(): void {
  const hasRepo = Boolean(state.repoPath);
  const hasStaged = state.stagedFiles.length > 0;

  if (commitMessageElement) {
    commitMessageElement.disabled = !hasRepo || state.busyCommit;
  }

  if (commitButtonElement) {
    commitButtonElement.disabled = !hasRepo || !hasStaged || state.busyCommit;
    commitButtonElement.textContent = state.busyCommit ? 'Committing...' : 'Commit Staged Changes';
  }
}

function getVisibleRefs(): GitRef[] {
  const query = state.query.trim().toLowerCase();

  return state.refs.filter((ref) => {
    if (state.filter !== 'all' && ref.type !== state.filter) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [ref.name, ref.subject, ref.sha, ref.type, ref.remoteName ?? '', ref.localName ?? '']
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function updateSummary(visibleCount: number): void {
  if (!state.repoPath) {
    resultsSummaryElement!.textContent = 'Open a repository to load refs.';
    return;
  }

  resultsSummaryElement!.textContent = `${visibleCount} result${visibleCount === 1 ? '' : 's'} across ${state.refs.length} refs`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderFileList(target: HTMLElement | null, files: RepoStatusFile[], type: 'staged' | 'unstaged'): void {
  if (!target) {
    return;
  }

  if (files.length === 0) {
    target.className = 'file-list empty-state compact-empty';
    target.innerHTML = `<p>No ${type} files.</p>`;
    return;
  }

  target.className = 'file-list';
  target.innerHTML = files
    .map((file) => {
      const label = type === 'staged' ? file.stagedLabel : file.unstagedLabel;
      const code = type === 'staged' ? file.stagedCode : file.unstagedCode;

      return `
        <article class="file-row">
          <span class="file-code">${escapeHtml(code.trim() || '?')}</span>
          <div class="file-copy">
            <div class="file-path">${escapeHtml(file.path)}</div>
            <div class="file-label">${escapeHtml(label)}</div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderStatusPanel(): void {
  if (!state.repoPath) {
    statusSummaryElement!.textContent = 'Open a repository to inspect changes.';
    stagedCountElement!.textContent = '0';
    unstagedCountElement!.textContent = '0';
    renderFileList(stagedFilesElement, [], 'staged');
    renderFileList(unstagedFilesElement, [], 'unstaged');
    updateCommitState();
    return;
  }

  statusSummaryElement!.textContent = `${state.stagedFiles.length} staged, ${state.unstagedFiles.length} unstaged`;
  stagedCountElement!.textContent = String(state.stagedFiles.length);
  unstagedCountElement!.textContent = String(state.unstagedFiles.length);
  renderFileList(stagedFilesElement, state.stagedFiles, 'staged');
  renderFileList(unstagedFilesElement, state.unstagedFiles, 'unstaged');
  updateCommitState();
}

function renderResults(): void {
  if (!resultsElement) {
    return;
  }

  if (!state.repoPath) {
    resultsElement.className = 'results empty-state';
    resultsElement.innerHTML = '<p>Select a local git folder to begin.</p>';
    updateSummary(0);
    return;
  }

  const refs = getVisibleRefs();
  updateSummary(refs.length);

  if (refs.length === 0) {
    resultsElement.className = 'results empty-state';
    resultsElement.innerHTML = '<p>No refs match the current search.</p>';
    return;
  }

  resultsElement.className = 'results';
  resultsElement.innerHTML = refs
    .map((ref) => {
      const disabled = state.busyRef === ref.checkoutName ? 'disabled' : '';
      const buttonLabel = state.busyRef === ref.checkoutName ? 'Working...' : ref.current ? 'Current' : 'Checkout';
      const metaParts = [ref.sha];

      if (ref.type === 'remote' && ref.remoteName && ref.localName) {
        metaParts.push(`tracks ${ref.remoteName} -> ${ref.localName}`);
      }

      return `
        <article class="ref-row ${ref.current ? 'current' : ''}">
          <div class="ref-main">
            <div class="ref-topline">
              <span class="ref-name">${escapeHtml(ref.name)}</span>
              <span class="badge" data-type="${escapeHtml(ref.type)}">${escapeHtml(ref.type)}</span>
              ${ref.current ? '<span class="badge current-pill">current</span>' : ''}
            </div>
            <div class="ref-meta">${escapeHtml(metaParts.join(' • '))}</div>
            <div class="ref-subject">${escapeHtml(ref.subject || 'No commit subject available')}</div>
          </div>
          <button class="checkout-button" data-ref-name="${escapeHtml(ref.checkoutName)}" ${disabled} ${ref.current ? 'disabled' : ''}>
            ${escapeHtml(buttonLabel)}
          </button>
        </article>
      `;
    })
    .join('');
}

async function loadRepo(repoPath: string): Promise<void> {
  const normalizedRepoPath = repoPath.trim();
  state.repoPath = normalizedRepoPath;
  repoPathElement!.textContent = normalizedRepoPath;
  if (repoPathInput) {
    repoPathInput.value = normalizedRepoPath;
  }
  searchInput!.disabled = true;
  updateCommitState();
  setStatus('Loading repository...');
  renderResults();
  renderStatusPanel();

  try {
    const [refsResult, statusResult] = await Promise.all([
      invoke<LoadRefsResult>('load_refs', { repoPath: normalizedRepoPath }),
      invoke<RepoStatusResult>('load_status', { repoPath: normalizedRepoPath })
    ]);

    state.refs = refsResult.refs;
    state.stagedFiles = statusResult.staged;
    state.unstagedFiles = statusResult.unstaged;
    searchInput!.disabled = false;
    updateCurrentHead();
    renderResults();
    renderStatusPanel();
    setStatus(`Loaded ${refsResult.refs.length} refs.`, 'success');
  } catch (error) {
    state.refs = [];
    state.stagedFiles = [];
    state.unstagedFiles = [];
    searchInput!.disabled = true;
    currentHeadElement!.textContent = '-';
    renderResults();
    renderStatusPanel();
    setStatus(error instanceof Error ? error.message : 'Failed to load repository.', 'error');
  }
}

async function handleCheckout(refName: string): Promise<void> {
  const ref = state.refs.find((item) => item.checkoutName === refName);

  if (!ref || !state.repoPath || state.busyRef) {
    return;
  }

  state.busyRef = ref.checkoutName;
  setStatus(`Checking out ${ref.name}...`);
  renderResults();

  try {
    const result = await invoke<CheckoutResult>('checkout_ref', { repoPath: state.repoPath, reference: ref });
    state.busyRef = '';
    setStatus(`Checked out ${result.head}.`, 'success');
    await loadRepo(state.repoPath);
  } catch (error) {
    state.busyRef = '';
    renderResults();
    setStatus(error instanceof Error ? error.message : 'Checkout failed.', 'error');
  }
}

async function handleCommit(): Promise<void> {
  if (!state.repoPath || state.busyCommit) {
    return;
  }

  const message = commitMessageElement?.value.trim() ?? '';

  if (!message) {
    setStatus('Enter a commit message first.', 'error');
    return;
  }

  state.busyCommit = true;
  updateCommitState();
  setStatus('Creating commit...');

  try {
    const result = await invoke<CheckoutResult>('create_commit', {
      repoPath: state.repoPath,
      input: { message }
    });

    if (commitMessageElement) {
      commitMessageElement.value = '';
    }

    state.busyCommit = false;
    updateCommitState();
    setStatus(`Committed on ${result.head}.`, 'success');
    await loadRepo(state.repoPath);
  } catch (error) {
    state.busyCommit = false;
    updateCommitState();
    setStatus(error instanceof Error ? error.message : 'Commit failed.', 'error');
  }
}

openRepoButton?.addEventListener('click', async () => {
  try {
    const selection = await open({
      directory: true,
      multiple: false,
      title: 'Open Git Folder'
    });

    const repoPath = Array.isArray(selection) ? selection[0] : selection;

    if (!repoPath) {
      return;
    }

    await loadRepo(repoPath);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to open the folder chooser.', 'error');
  }
});

usePathButton?.addEventListener('click', async () => {
  const repoPath = repoPathInput?.value.trim() ?? '';

  if (!repoPath) {
    setStatus('Enter a local repository path first.', 'error');
    return;
  }

  await loadRepo(repoPath);
});

repoPathInput?.addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') {
    return;
  }

  const repoPath = repoPathInput.value.trim();

  if (!repoPath) {
    setStatus('Enter a local repository path first.', 'error');
    return;
  }

  await loadRepo(repoPath);
});

commitButtonElement?.addEventListener('click', async () => {
  await handleCommit();
});

commitMessageElement?.addEventListener('keydown', async (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    await handleCommit();
  }
});

searchInput?.addEventListener('input', (event) => {
  state.query = (event.target as HTMLInputElement).value;
  renderResults();
});

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    state.filter = (button.dataset.filter as FilterType) ?? 'all';

    for (const candidate of filterButtons) {
      candidate.classList.toggle('active', candidate === button);
    }

    renderResults();
  });
}

resultsElement?.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('.checkout-button');

  if (!button) {
    return;
  }

  const refName = button.dataset.refName;

  if (!refName) {
    return;
  }

  await handleCheckout(refName);
});

renderResults();
renderStatusPanel();
