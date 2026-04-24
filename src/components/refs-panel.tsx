import { GitBranch, GitFork, Search, Tag } from 'lucide-react';

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
import { cn } from '@/lib/utils';
import type { GitRef, RefType } from '@/shared/types';

export type FilterType = 'all' | RefType;
export type Tone = 'neutral' | 'success' | 'error';

const refTypeMeta: Record<FilterType, { label: string; icon: typeof GitBranch }> = {
  all: { label: 'All', icon: GitFork },
  local: { label: 'Local', icon: GitBranch },
  remote: { label: 'Remote', icon: GitFork },
  tag: { label: 'Tags', icon: Tag }
};

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

interface RefsPanelProps {
  busyLoad: boolean;
  busyRef: string;
  currentHead: string;
  filter: FilterType;
  query: string;
  repoPath: string;
  refsCount: number;
  statusMessage: string;
  statusTone: Tone;
  visibleRefs: GitRef[];
  onCheckout: (refName: string) => Promise<void>;
  onFilterChange: (value: FilterType) => void;
  onQueryChange: (value: string) => void;
}

export function RefsPanel({
  busyLoad,
  busyRef,
  currentHead,
  filter,
  query,
  repoPath,
  refsCount,
  statusMessage,
  statusTone,
  visibleRefs,
  onCheckout,
  onFilterChange,
  onQueryChange
}: RefsPanelProps) {
  return (
    <Card className="flex min-h-0 w-full flex-col">
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
        <div className="grid grid-cols-[minmax(220px,1fr)_auto] gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              disabled={!repoPath || busyLoad}
              placeholder="Search branches and tags"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
          <Tabs value={filter} onValueChange={(value) => onFilterChange(value as FilterType)}>
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
              ? `${visibleRefs.length} result${visibleRefs.length === 1 ? '' : 's'} across ${refsCount} refs`
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
                  onCheckout={onCheckout}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
