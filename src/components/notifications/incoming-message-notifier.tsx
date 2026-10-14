'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Volume2 } from 'lucide-react';

import {
  incomingNotificationKey,
  rememberIncomingNotification,
} from '@/lib/inbox/incoming-notification';
import { createClient } from '@/lib/supabase/client';

const SOUND_CONFIRMED_STORAGE_KEY = 'wacrm:incoming-sound-confirmed';
const FALLBACK_POLL_INTERVAL_MS = 12_000;

interface IncomingMessageNotifierProps {
  userId: string;
}

interface IncomingMessageIdentity {
  conversationId: string;
  occurredAt?: string | null;
  fallbackId?: string | null;
}

export function IncomingMessageNotifier({
  userId,
}: IncomingMessageNotifierProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenIncomingRef = useRef<Set<string>>(new Set());
  const [showActivation, setShowActivation] = useState(false);
  const [activationFailed, setActivationFailed] = useState(false);

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (
      audioContextRef.current &&
      audioContextRef.current.state !== 'closed'
    ) {
      return audioContextRef.current;
    }

    type AudioContextConstructor = new () => AudioContext;
    const AudioContextClass: AudioContextConstructor | undefined =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: AudioContextConstructor;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) return null;

    audioContextRef.current = new AudioContextClass();
    return audioContextRef.current;
  }, []);

  const ensureAudioReady = useCallback(async () => {
    const context = getAudioContext();
    if (!context) return null;
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        return null;
      }
    }
    return context.state === 'running' ? context : null;
  }, [getAudioContext]);

  const playChime = useCallback(async () => {
    const context = await ensureAudioReady();
    if (!context) return false;

    const now = context.currentTime;
    const notes = [
      { frequency: 783.99, start: 0, duration: 0.16, volume: 0.2 },
      { frequency: 1046.5, start: 0.18, duration: 0.24, volume: 0.17 },
    ];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, now + note.start);
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(
        note.volume,
        now + note.start + 0.012
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.start + note.duration
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.03);
    }
    return true;
  }, [ensureAudioReady]);

  const notifyIncoming = useCallback(
    (identity: IncomingMessageIdentity) => {
      const key = incomingNotificationKey(identity);
      if (!rememberIncomingNotification(seenIncomingRef.current, key)) {
        return;
      }

      void playChime().then((played) => {
        if (!played) setShowActivation(true);
      });
    },
    [playChime]
  );

  useEffect(() => {
    try {
      setShowActivation(
        localStorage.getItem(SOUND_CONFIRMED_STORAGE_KEY) !== 'true'
      );
    } catch {
      setShowActivation(true);
    }

    const unlockAudio = () => {
      void ensureAudioReady();
    };
    document.addEventListener('pointerdown', unlockAudio, { capture: true });
    document.addEventListener('keydown', unlockAudio, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== 'closed') void context.close();
    };
  }, [ensureAudioReady]);

  useEffect(() => {
    let stopped = false;
    let initialized = false;
    let polling = false;
    const supabase = createClient();

    const channel = supabase
      .channel(`incoming-sound-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const message = payload.new as {
            id?: string;
            conversation_id?: string;
            sender_type?: string;
            created_at?: string;
          };
          if (
            message.sender_type !== 'customer' ||
            !message.conversation_id
          ) {
            return;
          }
          notifyIncoming({
            conversationId: message.conversation_id,
            occurredAt: message.created_at,
            fallbackId: message.id,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        (payload) => {
          const conversation = payload.new as {
            id?: string;
            last_message_at?: string | null;
            last_message_sender_type?: string | null;
          };
          if (
            conversation.last_message_sender_type !== 'customer' ||
            !conversation.id ||
            !conversation.last_message_at
          ) {
            return;
          }
          notifyIncoming({
            conversationId: conversation.id,
            occurredAt: conversation.last_message_at,
          });
        }
      )
      .subscribe();

    const pollRecentIncoming = async () => {
      if (stopped || polling || document.visibilityState === 'hidden') return;
      polling = true;
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_type, created_at')
          .eq('sender_type', 'customer')
          .order('created_at', { ascending: false })
          .limit(25);
        if (error) throw error;

        const recent = (data ?? []).slice().reverse();
        if (!initialized) {
          for (const message of recent) {
            rememberIncomingNotification(
              seenIncomingRef.current,
              incomingNotificationKey({
                conversationId: message.conversation_id,
                occurredAt: message.created_at,
                fallbackId: message.id,
              })
            );
          }
          initialized = true;
          return;
        }

        for (const message of recent) {
          notifyIncoming({
            conversationId: message.conversation_id,
            occurredAt: message.created_at,
            fallbackId: message.id,
          });
        }
      } catch (error) {
        console.warn('[incoming sound] Fallback sync failed:', error);
      } finally {
        polling = false;
      }
    };

    void pollRecentIncoming();
    const interval = window.setInterval(
      () => void pollRecentIncoming(),
      FALLBACK_POLL_INTERVAL_MS
    );
    const pollWhenVisible = () => {
      if (document.visibilityState === 'visible') void pollRecentIncoming();
    };
    document.addEventListener('visibilitychange', pollWhenVisible);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', pollWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [notifyIncoming, userId]);

  const activateAndTest = async () => {
    setActivationFailed(false);
    const played = await playChime();
    if (!played) {
      setActivationFailed(true);
      setShowActivation(true);
      return;
    }

    try {
      localStorage.setItem(SOUND_CONFIRMED_STORAGE_KEY, 'true');
    } catch {
      // The current session remains enabled even if persistence is blocked.
    }
    setShowActivation(false);
  };

  if (!showActivation) return null;

  return (
    <button
      type="button"
      onClick={() => void activateAndTest()}
      className="border-primary/25 bg-background/95 text-foreground hover:bg-primary/8 fixed top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 z-[80] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur transition-colors sm:right-5"
      aria-label="Activar y probar las notificaciones sonoras"
    >
      {activationFailed ? (
        <BellRing className="size-4 text-amber-500" />
      ) : (
        <Volume2 className="text-primary size-4" />
      )}
      {activationFailed ? 'Reintentar sonido' : 'Activar sonido'}
    </button>
  );
}
