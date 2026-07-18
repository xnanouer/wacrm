'use client';

import { useEffect, useState } from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';

import type { QuickReply } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function QuickReplyPicker({
  departmentId,
  onSelect,
}: {
  departmentId?: string;
  onSelect: (reply: QuickReply) => void;
}) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = departmentId
      ? `?departmentId=${encodeURIComponent(departmentId)}`
      : '';
    fetch(`/api/quick-replies${params}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return { quickReplies: [] };
        return (await response.json()) as { quickReplies: QuickReply[] };
      })
      .then((payload) => {
        if (!cancelled) setReplies(payload.quickReplies ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted hover:text-foreground hidden h-8 items-center gap-1.5 rounded-md px-2 text-xs sm:inline-flex">
        <Sparkles className="size-3.5" />
        Respuestas rápidas
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border-border bg-popover w-80"
      >
        {loading ? (
          <DropdownMenuItem disabled>Cargando respuestas…</DropdownMenuItem>
        ) : replies.length === 0 ? (
          <DropdownMenuItem disabled>
            No hay respuestas rápidas configuradas
          </DropdownMenuItem>
        ) : (
          replies.map((reply) => (
            <DropdownMenuItem
              key={reply.id}
              onClick={() => onSelect(reply)}
              className="text-popover-foreground items-start gap-2 py-2"
            >
              <MessageSquareText className="text-primary mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {reply.title}
                  {reply.shortcut ? ` · ${reply.shortcut}` : ''}
                </span>
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {reply.body}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
