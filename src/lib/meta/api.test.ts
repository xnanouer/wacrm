import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildMetaAuthorizationUrl,
  sendSocialText,
  subscribePageWebhooks,
} from './api';

describe('Meta social API', () => {
  beforeEach(() => {
    process.env.META_APP_ID = 'app-test';
    process.env.META_APP_SECRET = 'secret-test';
    process.env.META_GRAPH_API_VERSION = 'v24.0';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    delete process.env.META_GRAPH_API_VERSION;
  });

  it('requests only the permissions needed by the selected channel', () => {
    const facebook = new URL(
      buildMetaAuthorizationUrl({
        redirectUri: 'https://nexora.test/api/meta/oauth/callback',
        state: 'state',
        channel: 'facebook',
      })
    );
    const instagram = new URL(
      buildMetaAuthorizationUrl({
        redirectUri: 'https://nexora.test/api/meta/oauth/callback',
        state: 'state',
        channel: 'instagram',
      })
    );

    expect(facebook.searchParams.get('scope')).toContain('pages_messaging');
    expect(facebook.searchParams.get('scope')).not.toContain(
      'instagram_manage_messages'
    );
    expect(instagram.searchParams.get('scope')).toContain(
      'instagram_manage_messages'
    );
    expect(instagram.searchParams.get('scope')).not.toContain(
      'pages_messaging'
    );
  });

  it('adds Messenger messaging_type only for Facebook replies', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ message_id: 'mid-1' }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    await sendSocialText({
      channel: 'facebook',
      channelAccountId: 'page-1',
      participantId: 'psid-1',
      accessToken: 'page-token',
      text: 'Hola',
    });
    const facebookInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(facebookInit.body))).toMatchObject({
      messaging_type: 'RESPONSE',
    });

    await sendSocialText({
      channel: 'instagram',
      channelAccountId: 'ig-1',
      participantId: 'igsid-1',
      accessToken: 'page-token',
      text: 'Hola',
    });
    const instagramInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'https://graph.facebook.com/v24.0/ig-1/messages'
    );
    expect(JSON.parse(String(instagramInit.body))).not.toHaveProperty(
      'messaging_type'
    );
  });

  it('subscribes pages only to supported Messenger message events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      subscribePageWebhooks({
        pageId: 'page-1',
        pageAccessToken: 'page-token',
      })
    ).resolves.toBe(true);

    const subscriptionUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(subscriptionUrl.searchParams.get('subscribed_fields')).toBe(
      'messages'
    );
  });
});
