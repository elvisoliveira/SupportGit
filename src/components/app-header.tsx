import { FolderOpen, Moon, RefreshCcw, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface AppHeaderProps {
  busyLoad: boolean;
  repoInput: string;
  repoPath: string;
  theme: 'light' | 'dark';
  onOpenRepo: () => Promise<void>;
  onLoadRepo: (path: string) => Promise<void>;
  onRepoInputChange: (value: string) => void;
  onToggleTheme: () => void;
}

export function AppHeader({
  busyLoad,
  repoInput,
  repoPath,
  theme,
  onOpenRepo,
  onLoadRepo,
  onRepoInputChange,
  onToggleTheme
}: AppHeaderProps) {
  return (
    <Card size="sm" className="shrink-0 border-b">
      <CardHeader className="grid grid-cols-[minmax(420px,1fr)_minmax(520px,680px)] items-end gap-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            SupportGit
          </p>
          <CardTitle className="text-2xl">Desktop git switching with a working tree view.</CardTitle>
          <CardDescription>
            Browse refs, inspect file changes, and create commits without leaving the app.
          </CardDescription>
        </div>
        <div className="grid grid-cols-[auto_auto_auto_auto_minmax(240px,1fr)] gap-2">
          <Button onClick={() => void onOpenRepo()} disabled={busyLoad}>
            <FolderOpen />
            Open Git Folder
          </Button>
          <Button variant="outline" onClick={() => void onLoadRepo(repoInput)} disabled={busyLoad}>
            Use Path
          </Button>
          <Button variant="outline" onClick={() => void onLoadRepo(repoPath)} disabled={!repoPath || busyLoad}>
            <RefreshCcw />
            Refresh
          </Button>
          <Button variant="outline" onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          <Input
            value={repoInput}
            onChange={(event) => onRepoInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void onLoadRepo(repoInput);
              }
            }}
            placeholder="/path/to/repository"
          />
        </div>
      </CardHeader>
    </Card>
  );
}
