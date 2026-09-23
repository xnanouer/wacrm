'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';

export function NexoraBenefitNotifications() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const showNotification = (notification: Notification) => {
      if (
        notification.type !== 'nexora_points_gift' &&
        notification.type !== 'ai_coaching_ready'
      ) {
        return;
      }
      const storageKey = `nexora-benefit-shown:${notification.id}`;
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, 'true');

      toast(notification.title, {
        description: notification.body,
        duration: 12_000,
        icon:
          notification.type === 'ai_coaching_ready' ? (
            <BrainCircuit className="text-primary size-5" />
          ) : (
            <Sparkles className="text-primary size-5" />
          ),
        action: {
          label:
            notification.type === 'ai_coaching_ready'
              ? 'Ver recomendacion'
              : 'Ver puntos',
          onClick: () =>
            router.push(
              notification.type === 'ai_coaching_ready'
                ? notification.coaching_review_id
                  ? `/coach?review=${notification.coaching_review_id}`
                  : '/coach'
                : '/plans#nexora-points'
            ),
        },
      });
    };

    void supabase
      .from('notifications')
      .select('*')
      .in('type', ['nexora_points_gift', 'ai_coaching_ready'])
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        for (const notification of (data ?? []) as Notification[]) {
          showNotification(notification);
        }
      });

    const channel = supabase
      .channel('nexora-benefit-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const notification = payload.new as Notification;
          showNotification(notification);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
