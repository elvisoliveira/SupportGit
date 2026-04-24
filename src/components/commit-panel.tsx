import { GitBranch, GitCommitHorizontal, Layers, Sparkles } from 'lucide-react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Textarea } from '@/components/ui/textarea';

interface CommitPanelProps {
  branchName: string;
  busyBranch: boolean;
  busyCommit: boolean;
  busyGenerateBranch: boolean;
  busyGenerateCommit: boolean;
  busyGroupStage: boolean;
  commitMessage: string;
  openAiApiKey: string;
  openAiModel: string;
  openAiModels: readonly string[];
  repoPath: string;
  stagedFilesCount: number;
  unstagedFilesCount: number;
  onBranchNameChange: (value: string) => void;
  onCreateBranch: () => Promise<void>;
  onCommit: () => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onGenerateBranchName: () => Promise<void>;
  onGenerateCommitMessage: () => Promise<void>;
  onGroupAndStage: () => Promise<void>;
  onOpenAiApiKeyChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
}

export function CommitPanel({
  branchName,
  busyBranch,
  busyCommit,
  busyGenerateBranch,
  busyGenerateCommit,
  busyGroupStage,
  commitMessage,
  openAiApiKey,
  openAiModel,
  openAiModels,
  repoPath,
  stagedFilesCount,
  unstagedFilesCount,
  onBranchNameChange,
  onCreateBranch,
  onCommit,
  onCommitMessageChange,
  onGenerateBranchName,
  onGenerateCommitMessage,
  onGroupAndStage,
  onOpenAiApiKeyChange,
  onOpenAiModelChange
}: CommitPanelProps) {
  return (
    <ScrollArea className="min-h-0 w-full">
      <Accordion
        multiple
        defaultValue={['openai', 'branch-commit']}
        className="w-full"
      >
        <AccordionItem value="openai">
          <Card className="w-full">
            <AccordionHeader>
              <AccordionTrigger className="px-4 py-4">
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-muted-foreground" />
                    <CardTitle>OpenAI</CardTitle>
                  </div>
                  <CardDescription>
                    Configure AI generation for branch names and commit messages.
                  </CardDescription>
                </div>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
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
            </AccordionPanel>
          </Card>
        </AccordionItem>

        <AccordionItem value="branch-commit">
          <Card className="w-full">
            <AccordionHeader>
              <AccordionTrigger className="px-4 py-4">
                <div className="grid gap-1">
                  <CardTitle>Branch and Commit</CardTitle>
                  <CardDescription>
                    Create a branch first, then commit the staged changes.
                  </CardDescription>
                </div>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
              <CardContent>
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm">New Branch</CardTitle>
                    </div>
                    <CardDescription>
                      Creates and switches to a new branch from the current HEAD.
                    </CardDescription>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!repoPath || stagedFilesCount === 0 || busyGenerateBranch || busyBranch}
                      onClick={() => void onGenerateBranchName()}
                    >
                      <Sparkles />
                      {busyGenerateBranch ? 'Generating...' : 'Generate Branch Name'}
                    </Button>
                    {busyGenerateBranch ? (
                      <p className="text-xs text-muted-foreground">
                        OpenAI request in progress. The suggested name is based on staged changes.
                      </p>
                    ) : null}
                    <Input
                      disabled={!repoPath || busyBranch || busyGenerateBranch}
                      placeholder="feature/example-branch"
                      value={branchName}
                      onChange={(event) => onBranchNameChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void onCreateBranch();
                        }
                      }}
                    />
                    <Button
                      className="w-full"
                      disabled={!repoPath || busyBranch || !branchName.trim()}
                      onClick={() => void onCreateBranch()}
                    >
                      {busyBranch ? 'Creating Branch...' : 'Create and Switch Branch'}
                    </Button>
                  </section>

                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Group & Stage Next</CardTitle>
                    </div>
                    <CardDescription>
                      AI picks one coherent set of hunks from unstaged changes, stages them, and suggests a commit message. Review the staged diff before committing.
                    </CardDescription>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={!repoPath || unstagedFilesCount === 0 || busyGroupStage || busyCommit}
                      onClick={() => void onGroupAndStage()}
                    >
                      <Sparkles />
                      {busyGroupStage ? 'Grouping...' : 'Group & Stage Next Feature'}
                    </Button>
                    {busyGroupStage ? (
                      <p className="text-xs text-muted-foreground">
                        Parsing hunks and asking {openAiModel} to pick a coherent group.
                      </p>
                    ) : null}
                  </section>

                  <section className="space-y-3 pb-4">
                    <div className="flex items-center gap-2">
                      <GitCommitHorizontal className="size-4 text-muted-foreground" />
                      <CardTitle className="text-sm">Commit</CardTitle>
                    </div>
                    <CardDescription>
                      {busyGenerateCommit
                        ? `Generating commit message with ${openAiModel}...`
                        : 'Creates a commit from staged changes only.'}
                    </CardDescription>
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
                  </section>
                </div>
              </CardContent>
            </AccordionPanel>
          </Card>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  );
}
