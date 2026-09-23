import { describe, expect, it } from 'vitest';

import { parseMetaMessagingEvents } from './webhook-events';

describe('parseMetaMessagingEvents', () => {
  it('normalizes a Facebook Messenger text', () => {
    const events = parseMetaMessagingEvents({
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'psid-1' },
              recipient: { id: 'page-1' },
              timestamp: 1_721_390_400_000,
              message: { mid: 'mid-facebook', text: 'Hola desde Facebook' },
            },
          ],
        },
      ],
    });

    expect(events).toEqual([
      expect.objectContaining({
        channel: 'facebook',
        channelAccountId: 'page-1',
        participantId: 'psid-1',
        messageId: 'mid-facebook',
        contentType: 'text',
        text: 'Hola desde Facebook',
      }),
    ]);
  });

  it('normalizes an Instagram attachment', () => {
    const events = parseMetaMessagingEvents({
      object: 'instagram',
      entry: [
        {
          id: 'ig-business-1',
          messaging: [
            {
              sender: { id: 'ig-scoped-user-1' },
              message: {
                mid: 'mid-instagram',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://cdn.test/image.jpg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(events[0]).toMatchObject({
      channel: 'instagram',
      channelAccountId: 'ig-business-1',
      participantId: 'ig-scoped-user-1',
      contentType: 'image',
      mediaUrl: 'https://cdn.test/image.jpg',
    });
  });

  it('ignores echoes, self-tests and non-messaging payloads', () => {
    expect(
      parseMetaMessagingEvents({
        object: 'instagram',
        entry: [
          {
            id: 'ig-1',
            messaging: [
              {
                sender: { id: 'ig-1' },
                message: { mid: 'echo', is_echo: true, text: 'echo' },
              },
              {
                sender: { id: 'ig-1' },
                message: { mid: 'self', is_self: true, text: 'self' },
              },
            ],
          },
        ],
      })
    ).toEqual([]);
    expect(parseMetaMessagingEvents({ object: 'unknown' })).toEqual([]);
  });
});
