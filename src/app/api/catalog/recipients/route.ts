import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface EmbeddedContact {
  id: string;
  name: string | null;
  phone: string | null;
}

interface EmbeddedConnection {
  id: string;
  connection_name: string | null;
  display_name: string | null;
  display_phone: string | null;
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const { data, error } = await ctx.supabase
      .from('conversations')
      .select(
        'id, status, last_message_at, assigned_agent_id, contact:contacts!conversations_contact_id_fkey(id, name, phone), whatsapp_config:whatsapp_config!conversations_whatsapp_account_fkey(id, connection_name, display_name, display_phone)'
      )
      .eq('account_id', ctx.accountId)
      .eq('channel', 'whatsapp')
      .in('status', ['open', 'waiting'])
      .not('assigned_agent_id', 'is', null)
      .not('whatsapp_config_id', 'is', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(300);

    if (error) throw error;

    const conversations = (data ?? []).flatMap((row) => {
      const contact = unwrapRelation(
        row.contact as EmbeddedContact | EmbeddedContact[] | null
      );
      const connection = unwrapRelation(
        row.whatsapp_config as EmbeddedConnection | EmbeddedConnection[] | null
      );
      if (!contact?.phone || !connection) return [];

      return [
        {
          id: row.id,
          status: row.status,
          lastMessageAt: row.last_message_at,
          contact: {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
          },
          connection: {
            id: connection.id,
            name:
              connection.connection_name ||
              connection.display_name ||
              connection.display_phone ||
              'WhatsApp',
          },
        },
      ];
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    return toErrorResponse(error);
  }
}
