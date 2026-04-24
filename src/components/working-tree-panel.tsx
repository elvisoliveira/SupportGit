import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RepoStatusFile } from '@/shared/types';

function FileList({
  title,
  count,
  files,
  kind,
  busyFileKey,
  onToggleStage
}: {
  title: string;
  count: number;
  files: RepoStatusFile[];
  kind: 'staged' | 'unstaged';
  busyFileKey: string;
  onToggleStage: (file: RepoStatusFile, kind: 'staged' | 'unstaged') => Promise<void>;
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
              const fileKey = `${kind}:${file.actionPath}`;

              return (
                <div key={`${kind}-${file.path}`} className="rounded-md border bg-card px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                    <Badge variant="outline" className="min-w-7 justify-center px-1.5">
                      {code.trim() || '?'}
                    </Badge>
                    <div className="min-w-0">
                      <p className="break-all text-xs font-medium">{file.path}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                    </div>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busyFileKey === fileKey}
                      onClick={() => void onToggleStage(file, kind)}
                    >
                      {busyFileKey === fileKey
                        ? kind === 'staged'
                          ? 'Unstaging...'
                          : 'Staging...'
                        : kind === 'staged'
                          ? 'Unstage'
                          : 'Stage'}
                    </Button>
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

interface WorkingTreePanelProps {
  busyBulkAction: '' | 'stage' | 'unstage';
  busyFileKey: string;
  repoPath: string;
  stagedFiles: RepoStatusFile[];
  unstagedFiles: RepoStatusFile[];
  onStageAll: () => Promise<void>;
  onToggleStage: (file: RepoStatusFile, kind: 'staged' | 'unstaged') => Promise<void>;
  onUnstageAll: () => Promise<void>;
}

export function WorkingTreePanel({
  busyBulkAction,
  busyFileKey,
  repoPath,
  stagedFiles,
  unstagedFiles,
  onStageAll,
  onToggleStage,
  onUnstageAll
}: WorkingTreePanelProps) {
  return (
    <Card className="flex min-h-0 w-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Working Tree</CardTitle>
            <CardDescription>
              {repoPath
                ? `${stagedFiles.length} staged, ${unstagedFiles.length} unstaged`
                : 'Open a repository to inspect changes.'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={!repoPath || unstagedFiles.length === 0 || busyBulkAction !== ''}
              onClick={() => void onStageAll()}
            >
              {busyBulkAction === 'stage' ? 'Staging All...' : 'Stage All'}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!repoPath || stagedFiles.length === 0 || busyBulkAction !== ''}
              onClick={() => void onUnstageAll()}
            >
              {busyBulkAction === 'unstage' ? 'Unstaging All...' : 'Unstage All'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-2 gap-4 overflow-hidden">
        <FileList
          title="Staged"
          count={stagedFiles.length}
          files={stagedFiles}
          kind="staged"
          busyFileKey={busyFileKey}
          onToggleStage={onToggleStage}
        />
        <FileList
          title="Unstaged"
          count={unstagedFiles.length}
          files={unstagedFiles}
          kind="unstaged"
          busyFileKey={busyFileKey}
          onToggleStage={onToggleStage}
        />
      </CardContent>
    </Card>
  );
}
