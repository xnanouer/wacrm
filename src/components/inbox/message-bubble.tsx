'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Message, MessageReaction } from '@/types';
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Download,
  ExternalLink,
  ZoomIn,
  ReceiptText,
  ArrowUpRight,
  Camera,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ReplyQuote } from './reply-quote';
import { MessageReactions } from './message-reactions';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { privateMediaViewUrl } from '@/lib/storage/private-media-reference';
import { visibleMediaText } from '@/lib/inbox/media-text';
import {
  instagramPermalink,
  instagramShareTitle,
  visibleSocialMessageText,
} from '@/lib/meta/social-share';

interface MessageBubbleProps {
  message: Message;
  /** Visible author name, resolved by the thread from contact/team data. */
  senderLabel?: string;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
}

function StatusIcon({ status }: { status: Message['status'] }) {
  let label: string;
  let icon: React.ReactNode;

  switch (status) {
    case 'sending':
      label = 'Enviando';
      icon = (
        <Clock className="text-primary-foreground/75 h-3.5 w-3.5 stroke-[2.25]" />
      );
      break;
    case 'sent':
      label = 'Enviado';
      icon = (
        <Check className="text-primary-foreground/85 h-3.5 w-3.5 stroke-[2.5]" />
      );
      break;
    case 'delivered':
      label = 'Entregado';
      icon = (
        <CheckCheck className="text-primary-foreground/85 h-3.5 w-3.5 stroke-[2.5]" />
      );
      break;
    case 'read':
      label = 'Visto';
      icon = <CheckCheck className="h-3.5 w-3.5 stroke-[2.5] text-cyan-300" />;
      break;
    case 'failed':
      label = 'No enviado';
      icon = <XCircle className="h-3.5 w-3.5 text-red-300" />;
      break;
    default:
      return null;
  }

  return (
    <span className="inline-flex" title={label} aria-label={label}>
      {icon}
    </span>
  );
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
      <ImageOff className="text-muted-foreground h-4 w-4 shrink-0" />
      <span>No se pudo mostrar {label.toLowerCase()}</span>
    </div>
  );
}

function InstagramShareCard({
  url,
  contentText,
}: {
  url: string;
  contentText?: string | null;
}) {
  const title = instagramShareTitle(url, contentText);
  const visibleText = visibleSocialMessageText(contentText);
  const caption = visibleText && visibleText !== title ? visibleText : null;

  return (
    <div className="max-w-72 overflow-hidden rounded-xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/15 via-purple-500/10 to-orange-400/10">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-purple-500 to-orange-400 text-white shadow-sm">
          <Camera className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs opacity-75">
            El cliente compartió este contenido
          </span>
        </span>
      </div>
      {caption ? (
        <p className="border-t border-fuchsia-400/20 px-3 py-2 text-sm leading-5 break-words whitespace-pre-wrap">
          {caption}
        </p>
      ) : null}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        data-message-interactive="true"
        onDoubleClick={(event) => event.stopPropagation()}
        className="flex items-center justify-between gap-2 border-t border-fuchsia-400/20 px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-fuchsia-500/10"
      >
        Abrir en Instagram
        <ExternalLink className="size-4 shrink-0" />
      </a>
    </div>
  );
}

function QuotationAttachmentHeader({ message }: { message: Message }) {
  if (!message.quotation_id) return null;
  return (
    <Link
      href={`/quotes/${message.quotation_id}`}
      data-message-interactive="true"
      onDoubleClick={(event) => event.stopPropagation()}
      className="border-primary/25 bg-primary/10 text-primary hover:bg-primary/15 mb-2 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
    >
      <ReceiptText className="size-4" />
      <span className="min-w-0 flex-1 truncate">
        Cotización Nexora
        {message.quotation_version_id ? ' · versión guardada' : ''}
      </span>
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}

function safeFileName(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function imageFileName(messageId: string, mediaUrl: string): string {
  let extension = 'jpg';
  try {
    const parsed = new URL(mediaUrl, 'https://nexora.invalid');
    const path = parsed.searchParams.get('path') || parsed.pathname;
    const match = path.match(/\.(jpe?g|png|webp|gif|avif)$/i);
    if (match?.[1]) extension = match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    // The safe JPEG fallback is only a download name; it does not transform
    // or reinterpret the stored attachment.
  }
  return `imagen-${messageId.slice(0, 8)}.${extension}`;
}

async function downloadMedia(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeFileName(fileName, 'archivo');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    toast.error('No se pudo descargar el archivo.');
  }
}

function MediaImage({
  url,
  alt,
  fileName,
}: {
  url: string;
  alt: string;
  fileName: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    setError(false);
    setLoading(true);
    setSrc(null);

    const load = async () => {
      if (!url) return;

      // Both inbound Meta media and outbound private chat-media use
      // authenticated API routes. Loading them as blobs keeps cookies on the
      // first request, survives signed-URL redirects, and prevents an expired
      // storage URL from being left in the DOM.
      if (url.startsWith('/api/')) {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Failed to load media');
          const contentType = response.headers.get('content-type') ?? '';
          if (!contentType.toLowerCase().startsWith('image/')) {
            throw new Error('The response is not an image');
          }
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        } catch {
          setError(true);
        } finally {
          setLoading(false);
        }
      } else {
        setSrc(url);
        setLoading(false);
      }
    };

    void load();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reloadKey, url]);

  if (error) {
    return (
      <button
        type="button"
        data-message-interactive="true"
        onClick={() => setReloadKey((value) => value + 1)}
        className="bg-muted text-muted-foreground hover:bg-muted/80 flex h-40 w-60 flex-col items-center justify-center gap-2 rounded-xl text-xs transition-colors"
      >
        <ImageOff className="h-8 w-8" />
        <span>No se pudo cargar la imagen</span>
        <span className="text-primary font-semibold">Reintentar</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="bg-muted flex h-40 w-60 items-center justify-center rounded-lg">
        <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        data-message-interactive="true"
        onClick={() => setPreviewOpen(true)}
        onDoubleClick={(event) => event.stopPropagation()}
        className="group/media relative block max-w-full overflow-hidden rounded-xl text-left focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
        aria-label="Ver imagen completa"
      >
        {/* Private/blob chat media cannot use the public image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src ?? ''}
          alt={alt}
          className="h-auto max-h-96 max-w-full object-contain transition-transform duration-200 group-hover/media:scale-[1.02] sm:max-w-80"
          onError={() => setError(true)}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/media:bg-black/20">
          <ZoomIn className="h-7 w-7 scale-90 text-white opacity-0 drop-shadow transition-all group-hover/media:scale-100 group-hover/media:opacity-100" />
        </span>
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          data-message-interactive="true"
          className="grid h-[94vh] w-[94vw] max-w-[94vw] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden bg-black/95 p-3 text-white sm:max-w-[94vw]"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="flex min-w-0 items-center justify-between gap-3 pr-10">
            <DialogTitle className="min-w-0 flex-1 truncate text-sm text-white">
              Imagen compartida
            </DialogTitle>
            <button
              type="button"
              onClick={() => void downloadMedia(url, fileName)}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              <Download className="h-4 w-4" />
              Descargar
            </button>
          </div>
          <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src ?? ''}
              alt={alt}
              className="block h-full w-full object-contain"
              onError={() => {
                setPreviewOpen(false);
                setError(true);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessageContent({ message }: { message: Message }) {
  const mediaUrl = message.media_url
    ? privateMediaViewUrl(message.media_url)
    : null;
  const mediaText = visibleMediaText(
    message.content_text,
    message.content_type
  );

  switch (message.content_type) {
    case 'text': {
      const instagramUrl = instagramPermalink(message.media_url);
      if (instagramUrl) {
        return (
          <InstagramShareCard
            url={instagramUrl}
            contentText={message.content_text}
          />
        );
      }

      return (
        <p className="text-base leading-7 break-words whitespace-pre-wrap">
          {visibleSocialMessageText(message.content_text) ||
            'Mensaje sin contenido disponible'}
        </p>
      );
    }

    case 'image':
      return (
        <div>
          <QuotationAttachmentHeader message={message} />
          {mediaUrl ? (
            <MediaImage
              url={mediaUrl}
              alt="Imagen compartida"
              fileName={imageFileName(message.id, mediaUrl)}
            />
          ) : (
            <MediaUnavailable label="Image" />
          )}
          {mediaText && (
            <p className="mt-1 text-base leading-7 break-words whitespace-pre-wrap">
              {mediaText}
            </p>
          )}
        </div>
      );

    case 'video':
      return (
        <div>
          {mediaUrl ? (
            <video
              src={mediaUrl}
              controls
              className="max-h-64 max-w-60 rounded-lg"
            />
          ) : (
            <MediaUnavailable label="Video" />
          )}
          {mediaText && (
            <p className="mt-1 text-[15px] leading-6 break-words whitespace-pre-wrap">
              {mediaText}
            </p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div>
          {mediaUrl ? (
            <audio src={mediaUrl} controls className="max-w-60" />
          ) : (
            <MediaUnavailable label="Audio" />
          )}
          {mediaText && (
            <p className="text-muted-foreground mt-2 max-w-72 text-xs leading-5 break-words whitespace-pre-wrap">
              {message.sender_type === 'customer'
                ? 'Transcripción: '
                : 'Contenido: '}
              {mediaText}
            </p>
          )}
        </div>
      );

    case 'document':
      if (!mediaUrl) {
        return <MediaUnavailable label={mediaText || 'Document'} />;
      }
      {
        const documentName = safeFileName(
          mediaText || `documento-${message.id}`,
          `documento-${message.id}`
        );
        return (
          <div>
            <QuotationAttachmentHeader message={message} />
            <div
              data-message-interactive="true"
              className="bg-background/15 flex min-w-52 items-center gap-2 rounded-lg p-2"
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <FileText className="h-6 w-6 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {documentName}
              </span>
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-background/20 rounded-md p-1.5"
                aria-label="Abrir documento"
                title="Abrir documento"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => void downloadMedia(mediaUrl, documentName)}
                className="hover:bg-background/20 rounded-md p-1.5"
                aria-label="Descargar documento"
                title="Descargar documento"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      }

    case 'template':
      return (
        <div>
          <span className="bg-primary/20 text-primary mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
            <LayoutTemplate className="h-3 w-3" />
            Template
          </span>
          {message.content_text && (
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case 'location':
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="text-muted-foreground h-4 w-4 shrink-0" />
          <span>{message.content_text || 'Location shared'}</span>
        </div>
      );

    case 'interactive': {
      // Customer tapped a reply button or list row on a message the bot
      // sent. We show the tapped option's title (already in content_text,
      // set by parseMessageContent in the webhook) with a small affordance
      // so agents reading the inbox can tell at a glance that this is a
      // tap rather than the customer typing the same words.
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
            <CornerDownLeft className="h-3 w-3" />
            Button reply
          </span>
          <p className="text-base leading-7 break-words whitespace-pre-wrap">
            {message.content_text || '[Interactive reply]'}
          </p>
        </div>
      );
    }

    default:
      return (
        <p className="text-base leading-7 break-words whitespace-pre-wrap">
          {message.content_text || '[Unsupported message type]'}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  senderLabel,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const isAgent =
    message.sender_type === 'agent' || message.sender_type === 'bot';
  const time = format(new Date(message.created_at), 'HH:mm');
  const visibleSenderLabel =
    senderLabel?.trim() ||
    (message.sender_type === 'bot'
      ? 'Agente IA'
      : message.sender_type === 'customer'
        ? 'Cliente'
        : 'Ejecutivo');

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div className={cn('flex flex-col', isAgent ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'relative rounded-[20px] px-4 py-3 shadow-sm',
          isAgent
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted text-foreground rounded-bl-md'
        )}
      >
        <p
          className={cn(
            'mb-1 text-xs leading-4 font-semibold',
            isAgent ? 'text-primary-foreground/85' : 'text-primary'
          )}
        >
          {visibleSenderLabel}
        </p>
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        <MessageContent message={message} />
        <div
          className={cn(
            'mt-1 flex items-center gap-1',
            isAgent ? 'justify-end' : 'justify-start'
          )}
        >
          <span
            className={cn(
              'text-[10px]',
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
