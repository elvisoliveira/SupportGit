import { GitCommitHorizontal, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface CommitPanelProps {
  busyCommit: boolean;
  busyGenerateCommit: boolean;
  commitMessage: string;
  openAiApiKey: string;
  openAiModel: string;
  openAiModels: readonly string[];
  repoPath: string;
  stagedFilesCount: number;
  onCommit: () => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onGenerateCommitMessage: () => Promise<void>;
  onOpenAiApiKeyChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
}

export function CommitPanel({
  busyCommit,
  busyGenerateCommit,
  commitMessage,
  openAiApiKey,
  openAiModel,
  openAiModels,
  repoPath,
  stagedFilesCount,
  onCommit,
  onCommitMessageChange,
  onGenerateCommitMessage,
  onOpenAiApiKeyChange,
  onOpenAiModelChange
}: CommitPanelProps) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-px">
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
              onChange={(event) => onOpenAiApiKeyChange(event.target.value)}
              placeholder="sk-..."
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">Model</span>
            <select
              className="flex h-8 w-full border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={openAiModel}
              onChange={(event) => onOpenAiModelChange(event.target.value)}
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
              disabled={!repoPath || stagedFilesCount === 0 || busyGenerateCommit || busyCommit}
              onClick={() => void onGenerateCommitMessage()}
            >
              <Sparkles />
              {busyGenerateCommit ? 'Generating...' : 'Generate Commit Message'}
            </Button>
            {busyGenerateCommit ? (
              <p className="text-xs text-muted-foreground">
                OpenAI request in progress. You can keep using the app.
              </p>
            ) : null}
            <Textarea
              disabled={!repoPath || busyCommit || busyGenerateCommit}
              placeholder="Commit message"
              rows={4}
              value={commitMessage}
              onChange={(event) => onCommitMessageChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void onCommit();
                }
              }}
            />
            <Button
              className="w-full"
              disabled={!repoPath || stagedFilesCount === 0 || busyCommit}
              onClick={() => void onCommit()}
            >
              {busyCommit ? 'Committing...' : 'Commit Staged Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
