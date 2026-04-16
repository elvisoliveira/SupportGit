import { useEffect, useState, type WheelEvent } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

import { AppHeader } from '@/components/app-header';
import { CommitPanel } from '@/components/commit-panel';
import { RefsPanel, type FilterType, type Tone } from '@/components/refs-panel';
import { WorkingTreePanel } from '@/components/working-tree-panel';
import {
  createBranch,
  checkoutRef,
  createCommit,
  generateBranchName,
  generateCommitMessage,
  loadRefs,
  loadStatus
} from '@/lib/git';
import type { GitRef, RepoStatusFile } from '@/shared/types';

type ThemeMode = 'light' | 'dark';

const openAiModels = ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'] as const;

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem('supportgit-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function filterRefs(refs: GitRef[], filter: FilterType, query: string): GitRef[] {
  const normalizedQuery = query.trim().toLowerCase();

  return refs.filter((reference) => {
    if (filter !== 'all' && reference.type !== filter) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      reference.name,
      reference.subject,
      reference.sha,
      reference.type,
      reference.remoteName ?? '',
      reference.localName ?? ''
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [repoPath, setRepoPath] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [refs, setRefs] = useState<GitRef[]>([]);
  const [stagedFiles, setStagedFiles] = useState<RepoStatusFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<RepoStatusFile[]>([]);
  const [currentHead, setCurrentHead] = useState('-');
  const [filter, setFilter] = useState<FilterType>('all');
  const [query, setQuery] = useState('');
  const [busyRef, setBusyRef] = useState('');
  const [busyLoad, setBusyLoad] = useState(false);
  const [busyBranch, setBusyBranch] = useState(false);
  const [busyCommit, setBusyCommit] = useState(false);
  const [busyGenerateBranch, setBusyGenerateBranch] = useState(false);
  const [busyGenerateCommit, setBusyGenerateCommit] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('Open a repository to begin.');
  const [statusTone, setStatusTone] = useState<Tone>('neutral');
  const [openAiApiKey, setOpenAiApiKey] = useState(
    () => window.localStorage.getItem('supportgit-openai-api-key') ?? ''
  );
  const [openAiModel, setOpenAiModel] = useState(
    () => window.localStorage.getItem('supportgit-openai-model') ?? openAiModels[0]
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('supportgit-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('supportgit-openai-api-key', openAiApiKey);
  }, [openAiApiKey]);

  useEffect(() => {
    window.localStorage.setItem('supportgit-openai-model', openAiModel);
  }, [openAiModel]);

  const visibleRefs = filterRefs(refs, filter, query);

  async function loadRepo(path: string): Promise<void> {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      setStatusMessage('Enter a local repository path first.');
      setStatusTone('error');
      return;
    }

    setBusyLoad(true);
    setRepoPath(normalizedPath);
    setRepoInput(normalizedPath);
    setStatusMessage('Loading repository...');
    setStatusTone('neutral');

    try {
      const [refsResult, statusResult] = await Promise.all([
        loadRefs(normalizedPath),
        loadStatus(normalizedPath)
      ]);

      setRefs(refsResult.refs);
      setStagedFiles(statusResult.staged);
      setUnstagedFiles(statusResult.unstaged);

      const current = refsResult.refs.find((reference) => reference.current);
      setCurrentHead(current ? current.name : '-');
      setStatusMessage(`Loaded ${refsResult.refs.length} refs.`);
      setStatusTone('success');
    } catch (error) {
      setRefs([]);
      setStagedFiles([]);
      setUnstagedFiles([]);
      setCurrentHead('-');
      setStatusMessage(error instanceof Error ? error.message : 'Failed to load repository.');
      setStatusTone('error');
    } finally {
      setBusyLoad(false);
    }
  }

  async function handleOpenRepo(): Promise<void> {
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: 'Open Git Folder'
      });

      const path = Array.isArray(selection) ? selection[0] : selection;
      if (!path) {
        return;
      }

      await loadRepo(path);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to open the folder chooser.');
      setStatusTone('error');
    }
  }

  async function handleCheckout(refName: string): Promise<void> {
    const reference = refs.find((item) => item.checkoutName === refName);
    if (!reference || !repoPath || busyRef) {
      return;
    }

    setBusyRef(reference.checkoutName);
    setStatusMessage(`Checking out ${reference.name}...`);
    setStatusTone('neutral');

    try {
      const result = await checkoutRef(repoPath, reference);
      setStatusMessage(`Checked out ${result.head}.`);
      setStatusTone('success');
      await loadRepo(repoPath);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Checkout failed.');
      setStatusTone('error');
    } finally {
      setBusyRef('');
    }
  }

  async function handleCommit(): Promise<void> {
    if (!repoPath || busyCommit) {
      return;
    }

    const message = commitMessage.trim();
    if (!message) {
      setStatusMessage('Enter a commit message first.');
      setStatusTone('error');
      return;
    }

    setBusyCommit(true);
    setStatusMessage('Creating commit...');
    setStatusTone('neutral');

    try {
      const result = await createCommit(repoPath, message);
      setCommitMessage('');
      setStatusMessage(`Committed on ${result.head}.`);
      setStatusTone('success');
      await loadRepo(repoPath);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Commit failed.');
      setStatusTone('error');
    } finally {
      setBusyCommit(false);
    }
  }

  async function handleCreateBranch(): Promise<void> {
    if (!repoPath || busyBranch) {
      return;
    }

    const name = branchName.trim();
    if (!name) {
      setStatusMessage('Enter a branch name first.');
      setStatusTone('error');
      return;
    }

    setBusyBranch(true);
    setStatusMessage(`Creating branch ${name}...`);
    setStatusTone('neutral');

    try {
      const result = await createBranch(repoPath, name);
      setBranchName('');
      setStatusMessage(`Created and switched to ${result.head}.`);
      setStatusTone('success');
      await loadRepo(repoPath);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Branch creation failed.');
      setStatusTone('error');
    } finally {
      setBusyBranch(false);
    }
  }

  async function handleGenerateCommitMessage(): Promise<void> {
    if (!repoPath || busyGenerateCommit) {
      return;
    }

    if (!openAiApiKey.trim()) {
      setStatusMessage('Add an OpenAI API key first.');
      setStatusTone('error');
      return;
    }

    if (stagedFiles.length === 0) {
      setStatusMessage('Stage changes before generating a commit message.');
      setStatusTone('error');
      return;
    }

    setBusyGenerateCommit(true);
    setStatusMessage('Generating commit message...');
    setStatusTone('neutral');

    try {
      const result = await generateCommitMessage(repoPath, openAiApiKey, openAiModel);
      setCommitMessage(result.message);
      setStatusMessage(`Commit message generated with ${openAiModel}.`);
      setStatusTone('success');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Commit message generation failed.');
      setStatusTone('error');
    } finally {
      setBusyGenerateCommit(false);
    }
  }

  async function handleGenerateBranchName(): Promise<void> {
    if (!repoPath || busyGenerateBranch) {
      return;
    }

    if (!openAiApiKey.trim()) {
      setStatusMessage('Add an OpenAI API key first.');
      setStatusTone('error');
      return;
    }

    if (stagedFiles.length === 0) {
      setStatusMessage('Stage changes before generating a branch name.');
      setStatusTone('error');
      return;
    }

    setBusyGenerateBranch(true);
    setStatusMessage('Generating branch name...');
    setStatusTone('neutral');

    try {
      const result = await generateBranchName(repoPath, openAiApiKey, openAiModel);
      setBranchName(result.branchName);
      setStatusMessage(`Branch name generated with ${openAiModel}.`);
      setStatusTone('success');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Branch name generation failed.');
      setStatusTone('error');
    } finally {
      setBusyGenerateBranch(false);
    }
  }

  function handleShellWheel(event: WheelEvent<HTMLDivElement>): void {
    const shell = event.currentTarget;
    const target = event.target as HTMLElement | null;
    const viewport = target?.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;

    if (viewport && viewport.scrollHeight > viewport.clientHeight) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) {
      return;
    }

    shell.scrollBy({ left: delta });
    event.preventDefault();
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-border">
      <AppHeader
        busyLoad={busyLoad}
        repoInput={repoInput}
        repoPath={repoPath}
        theme={theme}
        onOpenRepo={handleOpenRepo}
        onLoadRepo={loadRepo}
        onRepoInputChange={setRepoInput}
        onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
      />

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden" onWheel={handleShellWheel}>
        <main className="flex h-full min-w-full min-w-max flex-col gap-px overflow-hidden bg-border">
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(720px,1.4fr)_minmax(360px,0.72fr)_minmax(320px,0.58fr)] gap-px overflow-hidden">
            <RefsPanel
              busyLoad={busyLoad}
              busyRef={busyRef}
              currentHead={currentHead}
              filter={filter}
              query={query}
              repoPath={repoPath}
              refsCount={refs.length}
              statusMessage={statusMessage}
              statusTone={statusTone}
              visibleRefs={visibleRefs}
              onCheckout={handleCheckout}
              onFilterChange={setFilter}
              onQueryChange={setQuery}
            />

            <WorkingTreePanel
              repoPath={repoPath}
              stagedFiles={stagedFiles}
              unstagedFiles={unstagedFiles}
            />

            <CommitPanel
              branchName={branchName}
              busyBranch={busyBranch}
              busyCommit={busyCommit}
              busyGenerateBranch={busyGenerateBranch}
              busyGenerateCommit={busyGenerateCommit}
              commitMessage={commitMessage}
              openAiApiKey={openAiApiKey}
              openAiModel={openAiModel}
              openAiModels={openAiModels}
              repoPath={repoPath}
              stagedFilesCount={stagedFiles.length}
              onBranchNameChange={setBranchName}
              onCreateBranch={handleCreateBranch}
              onCommit={handleCommit}
              onCommitMessageChange={setCommitMessage}
              onGenerateBranchName={handleGenerateBranchName}
              onGenerateCommitMessage={handleGenerateCommitMessage}
              onOpenAiApiKeyChange={setOpenAiApiKey}
              onOpenAiModelChange={setOpenAiModel}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
