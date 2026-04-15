import { Badge } from '@/components/ui/badge';
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

interface WorkingTreePanelProps {
  repoPath: string;
  stagedFiles: RepoStatusFile[];
  unstagedFiles: RepoStatusFile[];
}

export function WorkingTreePanel({
  repoPath,
  stagedFiles,
  unstagedFiles
}: WorkingTreePanelProps) {
  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle>Working Tree</CardTitle>
        <CardDescription>
          {repoPath
            ? `${stagedFiles.length} staged, ${unstagedFiles.length} unstaged`
            : 'Open a repository to inspect changes.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-2 gap-4 overflow-hidden">
        <FileList title="Staged" count={stagedFiles.length} files={stagedFiles} kind="staged" />
        <FileList title="Unstaged" count={unstagedFiles.length} files={unstagedFiles} kind="unstaged" />
      </CardContent>
    </Card>
  );
}
