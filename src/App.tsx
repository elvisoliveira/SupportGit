import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Moon,
  RefreshCcw,
  Search,
  Sparkles,
  Sun,
  Tag
} from 'lucide-react';

import type { CheckoutResult, GitRef, RefType } from '@/shared/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type FilterType = 'all' | RefType;
type Tone = 'neutral' | 'success' | 'error';
type ThemeMode = 'light' | 'dark';

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

interface GenerateCommitMessageResult {
  message: string;
}

const refTypeMeta: Record<FilterType, { label: string; icon: typeof GitBranch }> = {
  all: { label: 'All', icon: GitFork },
  local: { label: 'Local', icon: GitBranch },
  remote: { label: 'Remote', icon: GitFork },
  tag: { label: 'Tags', icon: Tag }
};

const openAiModels = ['gpt-5-mini', 'gpt-5', 'gpt-4.1-mini'] as const;

function statusToneClass(tone: Tone): string {
  if (tone === 'error') {
    return 'text-destructive';
  }

  if (tone === 'success') {
    return 'text-emerald-700';
  }

  return 'text-muted-foreground';
}

function refBadgeVariant(type: RefType): 'default' | 'secondary' | 'outline' {
  if (type === 'local') {
    return 'default';
  }

  if (type === 'remote') {
    return 'secondary';
  }

  return 'outline';
}

function RefListItem({
  reference,
  busy,
  onCheckout
}: {
  reference: GitRef;
  busy: boolean;
  onCheckout: (refName: string) => Promise<void>;
}) {
  const meta = [reference.sha];

  if (reference.type === 'remote' && reference.remoteName && reference.localName) {
    meta.push(`tracks ${reference.remoteName} -> ${reference.localName}`);
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2.5',
        reference.current && 'border-emerald-300/70 shadow-sm'
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{reference.name}</p>
          <Badge variant={refBadgeVariant(reference.type)}>{reference.type}</Badge>
          {reference.current ? <Badge variant="outline">current</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{meta.join(' • ')}</p>
      </div>
      <Button
        size="sm"
        variant={reference.current ? 'outline' : 'default'}
        disabled={reference.current || busy}
        onClick={() => void onCheckout(reference.checkoutName)}
      >
        {busy ? 'Working...' : reference.current ? 'Current' : 'Checkout'}
      </Button>
    </div>
  );
}

function FileList({
  title,
  count,
  files,
  kind
}: {
  title: string;
  count: number;
  files: RepoStatusFile[];
  kind: 'staged' | 'unstaged';
}) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant="outline">{count}</Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-background/70">
        <div className="space-y-2 p-2">
          {files.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No {kind} files.
            </div>
          ) : (
            files.map((file) => {
              const code = kind === 'staged' ? file.stagedCode : file.unstagedCode;
              const label = kind === 'staged' ? file.stagedLabel : file.unstagedLabel;

              return (
                <div key={`${kind}-${file.path}`} className="rounded-md border bg-card px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="min-w-7 justify-center px-1.5">
                      {code.trim() || '?'}
                    </Badge>
                    <div className="min-w-0">
                      <p className="break-all text-xs font-medium">{file.path}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const savedTheme = window.localStorage.getItem('supportgit-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
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
  const [busyCommit, setBusyCommit] = useState(false);
  const [busyGenerateCommit, setBusyGenerateCommit] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('Open a repository to begin.');
  const [statusTone, setStatusTone] = useState<Tone>('neutral');
  const [openAiApiKey, setOpenAiApiKey] = useState(() => window.localStorage.getItem('supportgit-openai-api-key') ?? '');
  const [openAiModel, setOpenAiModel] = useState(() => window.localStorage.getItem('supportgit-openai-model') ?? openAiModels[0]);

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

  const visibleRefs = refs.filter((reference) => {
    if (filter !== 'all' && reference.type !== filter) {
      return false;
    }

    const normalized = query.trim().toLowerCase();
    if (!normalized) {
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
      .includes(normalized);
  });

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
        invoke<{ repoPath: string; refs: GitRef[] }>('load_refs', { repoPath: normalizedPath }),
        invoke<RepoStatusResult>('load_status', { repoPath: normalizedPath })
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
      const result = await invoke<CheckoutResult>('checkout_ref', {
        repoPath,
        reference
      });

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
      const result = await invoke<CheckoutResult>('create_commit', {
        repoPath,
        input: { message }
      });

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
      const result = await invoke<GenerateCommitMessageResult>('generate_commit_message', {
        repoPath,
        input: {
          apiKey: openAiApiKey,
          model: openAiModel
        }
      });

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

  function handleShellWheel(event: React.WheelEvent<HTMLDivElement>): void {
    const shell = event.currentTarget;
    if (!shell) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const viewport = target?.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null;

    if (viewport) {
      const canScrollVertically = viewport.scrollHeight > viewport.clientHeight;
      if (canScrollVertically) {
        return;
      }
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
      <Card size="sm" className="shrink-0 border-b">
        <CardHeader className="grid items-end gap-4 grid-cols-[minmax(420px,1fr)_minmax(520px,680px)]">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            SupportGit
          </p>
          <CardTitle className="text-2xl">Desktop git switching with a working tree view.</CardTitle>
          <CardDescription>
            shadcn/ui components over the existing Tauri commands, with minimal customization.
          </CardDescription>
        </div>
        <div className="grid gap-2 grid-cols-[auto_auto_auto_auto_minmax(240px,1fr)]">
          <Button onClick={() => void handleOpenRepo()} disabled={busyLoad}>
            <FolderOpen />
            Open Git Folder
          </Button>
          <Button variant="outline" onClick={() => void loadRepo(repoInput)} disabled={busyLoad}>
            Use Path
          </Button>
          <Button variant="outline" onClick={() => void loadRepo(repoPath)} disabled={!repoPath || busyLoad}>
            <RefreshCcw />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          <Input
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void loadRepo(repoInput);
              }
            }}
            placeholder="/path/to/repository"
          />
        </div>
        </CardHeader>
      </Card>

      <div
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
        onWheel={handleShellWheel}
      >
        <main className="flex h-full min-w-max min-w-full flex-col gap-px overflow-hidden bg-border">
          <div className="grid min-h-0 flex-1 gap-px overflow-hidden grid-cols-[minmax(720px,1.4fr)_minmax(360px,0.72fr)_minmax(320px,0.58fr)]">
            <Card className="flex min-h-0 flex-col">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Refs</CardTitle>
                  <CardDescription className="mt-1 break-all">
                    {repoPath || 'No repository selected'}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 self-start">
                  <Badge variant="outline">HEAD</Badge>
                  <span className="text-sm font-medium">{currentHead}</span>
                </div>
                </div>
                <Separator />
                <div className="grid gap-2 grid-cols-[minmax(220px,1fr)_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    disabled={!repoPath || busyLoad}
                    placeholder="Search branches and tags"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterType)}>
                  <TabsList>
                    {(['all', 'local', 'remote', 'tag'] as const).map((value) => {
                      const Icon = refTypeMeta[value].icon;
                      return (
                        <TabsTrigger key={value} value={value}>
                          <Icon className="size-3.5" />
                          {refTypeMeta[value].label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
                </div>
                <div className="flex items-center justify-between gap-3">
                <CardDescription>
                  {repoPath
                    ? `${visibleRefs.length} result${visibleRefs.length === 1 ? '' : 's'} across ${refs.length} refs`
                    : 'Open a repository to load refs.'}
                </CardDescription>
                <p className={cn('text-xs', statusToneClass(statusTone))}>{statusMessage}</p>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1">
                <ScrollArea className="h-full min-h-0 border bg-background/70">
                  <div className="space-y-2 p-3">
                    {!repoPath ? (
                      <div className="border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                        Select a local git folder to begin.
                      </div>
                    ) : visibleRefs.length === 0 ? (
                      <div className="border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                        No refs match the current search.
                      </div>
                    ) : (
                      visibleRefs.map((reference) => (
                        <RefListItem
                          key={`${reference.type}-${reference.checkoutName}`}
                          reference={reference}
                          busy={busyRef === reference.checkoutName}
                          onCheckout={handleCheckout}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col">
              <CardHeader>
                <CardTitle>Working Tree</CardTitle>
                <CardDescription>
                  {repoPath
                    ? `${stagedFiles.length} staged, ${unstagedFiles.length} unstaged`
                    : 'Open a repository to inspect changes.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid min-h-0 flex-1 gap-4 grid-rows-2 overflow-hidden">
                <FileList title="Staged" count={stagedFiles.length} files={stagedFiles} kind="staged" />
                <FileList title="Unstaged" count={unstagedFiles.length} files={unstagedFiles} kind="unstaged" />
              </CardContent>
            </Card>

            <div className="grid min-h-0 gap-px grid-rows-[auto_minmax(0,1fr)]">
            <Card className="shrink-0">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <CardTitle>OpenAI</CardTitle>
                </div>
                <CardDescription>Configure commit message generation.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 pb-4">
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">API key</span>
                  <Input
                    type="password"
                    value={openAiApiKey}
                    onChange={(event) => setOpenAiApiKey(event.target.value)}
                    placeholder="sk-..."
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <select
                    className="flex h-8 w-full border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={openAiModel}
                    onChange={(event) => setOpenAiModel(event.target.value)}
                  >
                    {openAiModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GitCommitHorizontal className="size-4 text-muted-foreground" />
                  <CardTitle>Commit</CardTitle>
                </div>
                <CardDescription>
                  {busyGenerateCommit
                    ? `Generating commit message with ${openAiModel}...`
                    : 'Creates a commit from staged changes only.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!repoPath || stagedFiles.length === 0 || busyGenerateCommit || busyCommit}
                  onClick={() => void handleGenerateCommitMessage()}
                >
                  <Sparkles />
                  {busyGenerateCommit ? 'Generating...' : 'Generate Commit Message'}
                </Button>
                {busyGenerateCommit ? (
                  <p className="text-xs text-muted-foreground">OpenAI request in progress. You can keep using the app.</p>
                ) : null}
                <Textarea
                  disabled={!repoPath || busyCommit || busyGenerateCommit}
                  placeholder="Commit message"
                  rows={4}
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void handleCommit();
                    }
                  }}
                />
                <Button
                  className="w-full"
                  disabled={!repoPath || stagedFiles.length === 0 || busyCommit}
                  onClick={() => void handleCommit()}
                >
                  {busyCommit ? 'Committing...' : 'Commit Staged Changes'}
                </Button>
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
