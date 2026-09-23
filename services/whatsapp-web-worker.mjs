import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import nextEnv from '@next/env';
import qrcode from 'qrcode';
import whatsappWeb from 'whatsapp-web.js';
import { createClient } from '@supabase/supabase-js';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { Client, LocalAuth, Message, MessageMedia } = whatsappWeb;
const port = Number(process.env.WHATSAPP_WEB_SERVICE_PORT || 3001);
const bridgeSecret =
  process.env.WHATSAPP_WEB_BRIDGE_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? process.env.ENCRYPTION_KEY
    : undefined);
const nexoraUrl = (
  process.env.WHATSAPP_WEB_NEXORA_URL || 'http://127.0.0.1:3000'
).replace(/\/$/, '');
const sessionPath = path.resolve(
  process.env.WHATSAPP_WEB_SESSION_PATH || '.wwebjs_auth'
);

if (!bridgeSecret) {
  throw new Error(
    'Set an independent WHATSAPP_WEB_BRIDGE_SECRET before starting the QR service.'
  );
}

const sessions = new Map();
const PROFILE_PICTURE_CACHE_MS = 6 * 60 * 60 * 1000;
const HIDDEN_PROFILE_PICTURE_CACHE_MS = 30 * 60 * 1000;
const MAX_OUTBOUND_MEDIA_BYTES = 25 * 1024 * 1024;
let databaseClient = null;

function isPrivateOrReservedAddress(address) {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;

  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    const mapped = normalized.match(
      /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
    );
    if (mapped) return isPrivateOrReservedAddress(mapped[1]);
    return (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }

  return true;
}

async function isAllowedOutboundMediaUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.username || url.password || url.protocol !== 'https:') return false;

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  return (
    addresses.length > 0 &&
    addresses.every(({ address }) => !isPrivateOrReservedAddress(address))
  );
}

async function fetchOutboundMedia(rawUrl, requestedFilename) {
  if (!(await isAllowedOutboundMediaUrl(rawUrl))) {
    throw new Error('Media URL is not an allowed public HTTPS destination.');
  }

  const response = await fetch(rawUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Media download failed with HTTP ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_OUTBOUND_MEDIA_BYTES) {
    throw new Error('Media file exceeds the 25 MB QR delivery limit.');
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_OUTBOUND_MEDIA_BYTES) {
    throw new Error(
      'Media file is empty or exceeds the 25 MB QR delivery limit.'
    );
  }

  const mimeType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!mimeType || !mimeType.includes('/')) {
    throw new Error('Media server did not return a valid content type.');
  }

  const sourceUrl = new URL(rawUrl);
  const inferredFilename = decodeURIComponent(
    path.basename(sourceUrl.pathname) || 'media'
  );
  return new MessageMedia(
    mimeType,
    bytes.toString('base64'),
    requestedFilename || inferredFilename,
    bytes.length
  );
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function database() {
  if (databaseClient) return databaseClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  databaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return databaseClient;
}

function initialState() {
  return {
    status: 'idle',
    qrDataUrl: null,
    phone: null,
    displayName: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
}

function updateState(session, patch) {
  Object.assign(session.state, patch, { updatedAt: new Date().toISOString() });
}

function safeEqual(actual, expected) {
  const a = Buffer.from(actual || '');
  const b = Buffer.from(expected || '');
  return a.length === b.length && timingSafeEqual(a, b);
}

function chromeExecutable() {
  const configured = process.env.WHATSAPP_WEB_CHROME_PATH;
  if (configured && existsSync(configured)) return configured;

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          process.env.LOCALAPPDATA
            ? path.join(
                process.env.LOCALAPPDATA,
                'Google',
                'Chrome',
                'Application',
                'chrome.exe'
              )
            : null,
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];

  return candidates.find((candidate) => candidate && existsSync(candidate));
}

function sessionKey(accountId, connectionId) {
  return `${accountId}:${connectionId}`;
}

function clientId(connectionId) {
  return connectionId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function serializedMessageId(message) {
  return message?.id?.id || message?.id?._serialized || message?.id?.$1 || null;
}

async function downloadMessageMedia(message) {
  try {
    const media = await message.downloadMedia();
    if (media?.data) return media;
  } catch {
    // Recent WhatsApp Web builds can fail inside downloadAndMaybeDecrypt even
    // after the decrypted blob was placed in the browser cache. The fallback
    // below reads that cache first and only decrypts directly when necessary.
  }

  const messageId = serializedMessageId(message);
  if (!messageId) return null;

  return message.client.pupPage.evaluate(async (msgId) => {
    const { Msg } = window.require('WAWebCollections');
    const msg =
      Msg.get(msgId) ||
      (await Msg.getMessagesById([msgId]))?.messages?.[0] ||
      null;
    if (!msg || !msg.mediaData) return null;

    let resolutionError = null;
    if (msg.mediaData.mediaStage !== 'REUPLOADING') {
      try {
        await msg.downloadMedia({
          downloadEvenIfExpensive: true,
          rmrReason: 1,
          isUserInitiated: true,
        });
      } catch (error) {
        resolutionError = error;
      }
    }

    const cache = window.require(
      'WAWebMediaInMemoryBlobCache'
    )?.InMemoryMediaBlobCache;
    const cached = cache?.get(msg.mediaObject?.filehash);
    let blob = null;
    if (cached instanceof Blob) {
      blob = cached;
    } else if (cached?.forceToBlob) {
      blob = cached.forceToBlob();
    } else if (cached?.blob instanceof Blob) {
      blob = cached.blob;
    } else if (msg.mediaObject?.mediaBlob?.forceToBlob) {
      blob = msg.mediaObject.mediaBlob.forceToBlob();
    }

    const expectedSize = Number(msg.size || 0);
    const incomplete =
      blob && expectedSize > 0 && blob.size < expectedSize * 0.5;
    if (!blob || incomplete) {
      try {
        const mockQpl = {
          addAnnotations() {
            return this;
          },
          addPoint() {
            return this;
          },
        };
        const decrypted = await window
          .require('WAWebDownloadManager')
          .downloadManager.downloadAndMaybeDecrypt({
            directPath: msg.directPath,
            encFilehash: msg.encFilehash,
            filehash: msg.filehash,
            mediaKey: msg.mediaKey,
            mediaKeyTimestamp: msg.mediaKeyTimestamp,
            type: msg.type,
            signal: new AbortController().signal,
            downloadQpl: mockQpl,
          });
        if (decrypted) {
          blob = new Blob([decrypted], {
            type: msg.mimetype || 'application/octet-stream',
          });
        }
      } catch (error) {
        if (!resolutionError) resolutionError = error;
      }
    }

    if (!blob) {
      if (resolutionError) throw resolutionError;
      return null;
    }

    const data = await window.WWebJS.arrayBufferToBase64Async(
      await blob.arrayBuffer()
    );
    return {
      data,
      mimetype: msg.mimetype || blob.type || 'application/octet-stream',
      filename: msg.filename || null,
      filesize: msg.size || blob.size,
    };
  }, messageId);
}

function messagePeerJid(message, deviceOutbound) {
  const direct = deviceOutbound ? message?.to : message?.from;
  const remote =
    message?.id?.remote?._serialized ||
    message?.id?.remote?.$1 ||
    message?.id?.remote ||
    message?._data?.id?.remote?._serialized ||
    message?._data?.id?.remote?.$1 ||
    message?._data?.id?.remote;
  return String(direct || remote || '');
}

async function resolveContactAvatarUrl(session, contact, peerJid) {
  if (!session || !peerJid) return undefined;

  const cacheKey = contact?.id?._serialized || peerJid;
  const cached = session.profilePictureCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) session.profilePictureCache.delete(cacheKey);

  try {
    const rawUrl = contact
      ? await contact.getProfilePicUrl()
      : await session.client.getProfilePicUrl(peerJid);
    const url =
      typeof rawUrl === 'string' && /^https:\/\//i.test(rawUrl) ? rawUrl : null;
    session.profilePictureCache.set(cacheKey, {
      url,
      expiresAt:
        Date.now() +
        (url ? PROFILE_PICTURE_CACHE_MS : HIDDEN_PROFILE_PICTURE_CACHE_MS),
    });
    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message === 'r' ||
      /No LID for user|ServerStatusCodeError|profile picture not available/i.test(
        message
      )
    ) {
      session.profilePictureCache.set(cacheKey, {
        url: null,
        expiresAt: Date.now() + HIDDEN_PROFILE_PICTURE_CACHE_MS,
      });
      return null;
    }

    // A transient WhatsApp/CDN failure must not erase a previously stored
    // avatar. Privacy-restricted photos resolve as `undefined` above and are
    // intentionally represented as null so Nexora falls back to initials.
    console.warn(
      `[whatsapp-web] Could not refresh profile picture for ${peerJid}:`,
      message
    );
    return undefined;
  }
}

async function refreshRecentContactAvatars(accountId, connectionId, session) {
  const db = database();
  if (!db) return;

  const { data: conversations, error } = await db
    .from('conversations')
    .select(
      'external_participant_id, last_message_at, contact:contacts(id, avatar_url, phone_normalized)'
    )
    .eq('account_id', accountId)
    .eq('whatsapp_config_id', connectionId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw error;

  const rows = Array.isArray(conversations) ? conversations : [];
  for (let index = 0; index < rows.length; index += 5) {
    await Promise.all(
      rows.slice(index, index + 5).map(async (row) => {
        const storedContact = Array.isArray(row.contact)
          ? row.contact[0]
          : row.contact;
        if (!storedContact?.id) return;

        const peerJid =
          typeof row.external_participant_id === 'string' &&
          row.external_participant_id
            ? row.external_participant_id
            : storedContact.phone_normalized
              ? `${storedContact.phone_normalized}@c.us`
              : null;
        if (!peerJid || peerJid.endsWith('@g.us')) return;

        const whatsappContact = await session.client
          .getContactById(peerJid)
          .catch(() => null);
        const avatarUrl = await resolveContactAvatarUrl(
          session,
          whatsappContact,
          peerJid
        );
        if (avatarUrl === undefined || storedContact.avatar_url === avatarUrl) {
          return;
        }

        const { error: updateError } = await db
          .from('contacts')
          .update({ avatar_url: avatarUrl })
          .eq('id', storedContact.id)
          .eq('account_id', accountId);
        if (updateError) throw updateError;
      })
    );
  }
}

async function forwardMessageToNexora(
  accountId,
  connectionId,
  message,
  direction = 'inbound'
) {
  const deviceOutbound = direction === 'outbound_device';
  if (deviceOutbound ? !message.fromMe : message.fromMe) return;

  const peerJid = messagePeerJid(message, deviceOutbound);
  if (!peerJid || peerJid === 'status@broadcast' || peerJid.endsWith('@g.us')) {
    return;
  }

  const session = sessions.get(sessionKey(accountId, connectionId));
  const contact = deviceOutbound
    ? await session?.client.getContactById(peerJid).catch(() => null)
    : await message.getContact().catch(() => null);
  const identities = session
    ? await session.client.getContactLidAndPhone([peerJid]).catch(() => [])
    : [];
  const [identity] = identities;
  const phone = String(
    identity?.pn?.split('@')[0] || contact?.number || peerJid.split('@')[0]
  ).replace(/\D/g, '');
  if (!phone) return;
  const avatarUrl = await resolveContactAvatarUrl(session, contact, peerJid);

  let contentType = message.type || 'text';
  if (contentType === 'chat') contentType = 'text';
  if (contentType === 'ptt') contentType = 'audio';
  const isSticker = contentType === 'sticker';
  if (isSticker) contentType = 'image';
  if (
    !['text', 'image', 'document', 'audio', 'video', 'location'].includes(
      contentType
    )
  ) {
    contentType = 'text';
  }

  let mediaUrl = null;
  let mediaType = null;
  let mediaFilename = null;
  if (
    message.hasMedia &&
    ['image', 'document', 'audio', 'video'].includes(contentType)
  ) {
    try {
      let media = null;
      let downloadError = null;
      // Outbound media created on another linked device can be announced
      // before WhatsApp has made its bytes available to this session.
      // A short retry prevents photos/stickers from becoming text-only rows.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          media = await downloadMessageMedia(message);
          if (media?.data) break;
        } catch (error) {
          downloadError = error;
        }
        if (attempt < 3) await delay(350 * (attempt + 1));
      }
      if (!media?.data) {
        throw (
          downloadError || new Error('WhatsApp returned an empty media file.')
        );
      }
      const bytes = Buffer.from(media.data, 'base64');
      const upload = await fetch(`${nexoraUrl}/api/whatsapp/web/media`, {
        method: 'POST',
        headers: {
          'content-type':
            media.mimetype ||
            (contentType === 'audio'
              ? 'audio/ogg'
              : 'application/octet-stream'),
          'content-length': String(bytes.byteLength),
          'x-nexora-bridge-secret': bridgeSecret,
          'x-nexora-account-id': accountId,
          'x-nexora-connection-id': connectionId,
          'x-nexora-media-kind': contentType,
        },
        body: bytes,
      });
      const uploaded = await upload.json().catch(() => null);
      if (!upload.ok || !uploaded?.mediaUrl) {
        throw new Error(
          uploaded?.error || `Nexora rejected inbound media (${upload.status}).`
        );
      }
      mediaUrl = uploaded.mediaUrl;
      mediaType = uploaded.mimeType || media.mimetype || null;
      mediaFilename =
        typeof media.filename === 'string' && media.filename.trim()
          ? media.filename.trim()
          : null;
    } catch (error) {
      // Keep the text event even if WhatsApp cannot download an expired
      // attachment or the MIME type is outside Nexora's safe allow-list.
      console.error(
        `[whatsapp-web] Could not preserve inbound ${contentType}:`,
        error
      );
    }
  }

  const fallbackText =
    mediaUrl && contentType === 'document'
      ? mediaFilename || 'Documento'
      : mediaUrl
        ? ''
        : message.hasMedia
          ? `[${contentType}]`
          : '';
  const payload = {
    accountId,
    connectionId,
    messageId: serializedMessageId(message),
    from: phone,
    participantJid: peerJid,
    contactName: contact?.pushname || contact?.name || phone,
    ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    direction,
    ack: Number.isInteger(message.ack) ? message.ack : null,
    contentType,
    text:
      contentType === 'audio'
        ? ''
        : message.body || mediaFilename || fallbackText,
    mediaUrl,
    mediaType,
    isSticker,
    durationMs: message.duration
      ? Math.max(1, Number(message.duration)) * 1000
      : null,
    timestamp: Number(message.timestamp || Math.floor(Date.now() / 1000)),
    quotedMessageId: message.hasQuotedMsg
      ? (await message.getQuotedMessage().catch(() => null))?.id?._serialized ||
        null
      : null,
  };

  const response = await fetch(`${nexoraUrl}/api/whatsapp/web/inbound`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nexora-bridge-secret': bridgeSecret,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Nexora rejected inbound message (${response.status}): ${body}`
    );
  }
}

async function repairMissingMediaMessages(accountId, connectionId, session) {
  const db = database();
  if (!db || session.state.status !== 'connected') return;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('messages')
    .select(
      'message_id, conversation:conversations!inner(account_id, whatsapp_config_id)'
    )
    .is('media_url', null)
    .in('content_type', ['image', 'video', 'document', 'audio'])
    .eq('conversation.account_id', accountId)
    .eq('conversation.whatsapp_config_id', connectionId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const messageIds = [...new Set((data ?? []).map((row) => row.message_id))]
    .filter(Boolean)
    .slice(0, 100);
  if (!messageIds.length) return;

  const models = await session.client.pupPage.evaluate((ids) => {
    const wanted = new Set(ids);
    const collection = window.require('WAWebCollections').Msg.getModelsArray();
    const matches = collection.filter((model) => {
      const id = model.id || {};
      return (
        wanted.has(id.id) || wanted.has(id._serialized) || wanted.has(id.$1)
      );
    });

    const serialized = [];
    for (const model of matches) {
      try {
        serialized.push(window.WWebJS.getMessageModel(model));
      } catch {
        // A malformed service message should not block media recovery.
      }
    }
    return serialized;
  }, messageIds);

  for (const model of models) {
    const message = new Message(session.client, model);
    if (!message.hasMedia) continue;
    await forwardMessageToNexora(
      accountId,
      connectionId,
      message,
      message.fromMe ? 'outbound_device' : 'inbound'
    );
  }
}

async function forwardMessageAck(accountId, connectionId, message, ack) {
  if (!message?.fromMe) return;
  const messageId = serializedMessageId(message);
  if (!messageId || !Number.isInteger(ack)) return;

  const url = `${nexoraUrl}/api/whatsapp/web/status`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-nexora-bridge-secret': bridgeSecret,
      },
      body: JSON.stringify({ accountId, connectionId, messageId, ack }),
    });

    if (response.ok) return;
    lastStatus = response.status;
    if (response.status !== 404 && response.status < 500) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Nexora rejected message status (${response.status}): ${body}`
      );
    }
    if (attempt < 5) await delay(250 * (attempt + 1));
  }

  // WhatsApp can replay receipts from before this CRM conversation was
  // created when a linked-device session is restored. They have no local
  // message row to update and are safe to ignore after the retry window.
  if (lastStatus === 404) return;
  throw new Error('Nexora could not persist the WhatsApp message status.');
}

function waitForOutgoingMessage(session, expected, timeoutMs = 8_000) {
  let settled = false;
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const pending = {
    ...expected,
    resolve(message) {
      if (settled) return;
      settled = true;
      clearTimeout(pending.timer);
      session.pendingSends.delete(pending);
      resolvePromise(message);
    },
    timer: null,
  };
  pending.timer = setTimeout(() => pending.resolve(null), timeoutMs);
  pending.timer.unref?.();
  session.pendingSends.add(pending);

  return {
    promise,
    cancel() {
      pending.resolve(null);
    },
  };
}

async function installMediaSendCompatibility(client) {
  await client.pupPage.evaluate(() => {
    if (window.WWebJS.__nexoraMediaIdFixInstalled) return;

    const originalProcessMediaData = window.WWebJS.processMediaData;
    if (typeof originalProcessMediaData !== 'function') {
      throw new Error('WhatsApp media processor is unavailable.');
    }

    window.WWebJS.processMediaData = async function (...args) {
      const mediaData = await originalProcessMediaData.apply(this, args);
      // Current WhatsApp Web exposes MediaData.__x_id as enumerable. The
      // whatsapp-web.js sender spreads that private field over Msg.id and the
      // outgoing media model then initializes without a valid MsgKey.
      if (
        mediaData &&
        Object.prototype.hasOwnProperty.call(mediaData, '__x_id')
      ) {
        delete mediaData.__x_id;
      }
      return mediaData;
    };
    window.WWebJS.__nexoraMediaIdFixInstalled = true;
  });
}

function resolvePendingOutgoingMessage(session, message) {
  if (!message?.fromMe || session.pendingSends.size === 0) return false;

  const messageTimestamp = Number(message.timestamp || 0);
  const messageText = String(message.body || '');
  const messageDestination = String(message.to || '');
  const candidates = [...session.pendingSends].filter((pending) => {
    if (
      messageTimestamp &&
      messageTimestamp < Number(pending.startedAt || 0) - 5
    ) {
      return false;
    }

    const sameDestination =
      !pending.destinationJid ||
      !messageDestination ||
      messageDestination === pending.destinationJid;
    const sameText =
      pending.hasMedia && !pending.expectedText
        ? true
        : messageText === pending.expectedText;
    return sameDestination && sameText;
  });

  // A PN and its opaque LID can identify the same chat. If WhatsApp changed
  // the destination representation, fall back to the unique body/media
  // match among sends that started in the same short window.
  const pending =
    candidates[0] ||
    [...session.pendingSends].find((candidate) => {
      if (
        messageTimestamp &&
        messageTimestamp < Number(candidate.startedAt || 0) - 5
      ) {
        return false;
      }
      return candidate.hasMedia && !candidate.expectedText
        ? message.hasMedia
        : messageText === candidate.expectedText;
    });
  pending?.resolve(message);
  return Boolean(pending);
}

function rememberPlatformMessage(session, messageId) {
  if (!messageId || messageId.startsWith('qr-local-')) return;
  const now = Date.now();
  for (const [id, expiresAt] of session.platformMessageIds) {
    if (expiresAt <= now) session.platformMessageIds.delete(id);
  }
  session.platformMessageIds.set(messageId, now + 2 * 60 * 1000);
}

function isRecentPlatformMessage(session, messageId) {
  if (!messageId) return false;
  const expiresAt = session.platformMessageIds.get(messageId);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    session.platformMessageIds.delete(messageId);
    return false;
  }
  return true;
}

function rememberSyncedDeviceMessage(session, messageId) {
  if (!messageId) return;
  const now = Date.now();
  for (const [id, expiresAt] of session.syncedDeviceMessageIds) {
    if (expiresAt <= now) session.syncedDeviceMessageIds.delete(id);
  }
  session.syncedDeviceMessageIds.set(messageId, now + 30 * 60 * 1000);
}

function isRecentlySyncedDeviceMessage(session, messageId) {
  if (!messageId) return false;
  const expiresAt = session.syncedDeviceMessageIds.get(messageId);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    session.syncedDeviceMessageIds.delete(messageId);
    return false;
  }
  return true;
}

async function forwardDeviceMessage(accountId, connectionId, session, message) {
  if (!message?.fromMe) return;
  const messageId = serializedMessageId(message);
  if (
    !messageId ||
    isRecentPlatformMessage(session, messageId) ||
    isRecentlySyncedDeviceMessage(session, messageId) ||
    session.forwardingDeviceMessageIds.has(messageId)
  ) {
    return;
  }

  session.forwardingDeviceMessageIds.add(messageId);
  try {
    await forwardMessageToNexora(
      accountId,
      connectionId,
      message,
      'outbound_device'
    );
    rememberSyncedDeviceMessage(session, messageId);
  } finally {
    session.forwardingDeviceMessageIds.delete(messageId);
  }
}

async function syncRecentDeviceMessages(accountId, connectionId, session) {
  if (session.deviceSyncInProgress || session.state.status !== 'connected') {
    return;
  }

  session.deviceSyncInProgress = true;
  const scanStartedAt = Math.floor(Date.now() / 1000);
  const lowerBound = Math.max(0, session.deviceSyncCursor - 10);
  try {
    const models = await session.client.pupPage.evaluate((since) => {
      const collection = window
        .require('WAWebCollections')
        .Msg.getModelsArray();
      const recent = collection
        .filter((model) => {
          const remote =
            model.id?.remote?._serialized || String(model.id?.remote || '');
          return (
            model.id?.fromMe === true &&
            Number(model.t || 0) >= since &&
            remote !== 'status@broadcast' &&
            !remote.endsWith('@g.us')
          );
        })
        .sort((left, right) => Number(left.t || 0) - Number(right.t || 0))
        .slice(-500);

      const serialized = [];
      for (const model of recent) {
        try {
          serialized.push(window.WWebJS.getMessageModel(model));
        } catch {
          // A malformed service notification must not block the remaining
          // linked-device messages.
        }
      }
      return serialized;
    }, lowerBound);

    for (const model of models) {
      await forwardDeviceMessage(
        accountId,
        connectionId,
        session,
        new Message(session.client, model)
      );
    }
    session.deviceSyncCursor = scanStartedAt;
  } finally {
    session.deviceSyncInProgress = false;
  }
}

function startDeviceMessageSync(accountId, connectionId, session) {
  if (session.deviceSyncTimer) clearInterval(session.deviceSyncTimer);
  session.deviceSyncCursor = Math.floor(Date.now() / 1000) - 15 * 60;
  void syncRecentDeviceMessages(accountId, connectionId, session).catch(
    (error) => {
      console.error(
        `[whatsapp-web:${accountId}:${connectionId}] initial linked-device sync failed:`,
        error
      );
    }
  );
  session.deviceSyncTimer = setInterval(() => {
    void syncRecentDeviceMessages(accountId, connectionId, session).catch(
      (error) => {
        console.error(
          `[whatsapp-web:${accountId}:${connectionId}] linked-device sync failed:`,
          error
        );
      }
    );
  }, 5_000);
  session.deviceSyncTimer.unref?.();
}

function stopDeviceMessageSync(session) {
  if (session.deviceSyncTimer) clearInterval(session.deviceSyncTimer);
  session.deviceSyncTimer = null;
  if (session.mediaRepairTimer) clearInterval(session.mediaRepairTimer);
  session.mediaRepairTimer = null;
}

function createSession(accountId, connectionId, useLegacyClientId = false) {
  const state = initialState();
  const executablePath = chromeExecutable();
  const client = new Client({
    authStrategy: new LocalAuth({
      // Before multi-number support the persisted profile used accountId.
      // Keep that identifier for the first/default connection so an existing
      // linked device is restored without forcing the company to scan again.
      clientId: clientId(useLegacyClientId ? accountId : connectionId),
      dataPath: sessionPath,
    }),
    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  });
  const session = {
    client,
    state,
    initialization: null,
    recovery: null,
    useLegacyClientId,
    pendingSends: new Set(),
    platformMessageIds: new Map(),
    syncedDeviceMessageIds: new Map(),
    profilePictureCache: new Map(),
    forwardingDeviceMessageIds: new Set(),
    deviceSyncCursor: Math.floor(Date.now() / 1000) - 15 * 60,
    deviceSyncInProgress: false,
    deviceSyncTimer: null,
    mediaRepairTimer: null,
  };

  client.on('qr', async (rawQr) => {
    try {
      const qrDataUrl = await qrcode.toDataURL(rawQr, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      updateState(session, {
        status: 'qr_ready',
        qrDataUrl,
        lastError: null,
      });
    } catch (error) {
      updateState(session, {
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  });

  client.on('authenticated', () => {
    updateState(session, {
      status: 'authenticated',
      qrDataUrl: null,
      lastError: null,
    });
  });

  client.on('ready', async () => {
    try {
      await installMediaSendCompatibility(client);
    } catch (error) {
      updateState(session, {
        status: 'error',
        lastError:
          error instanceof Error
            ? `No se pudo preparar el envío de archivos: ${error.message}`
            : 'No se pudo preparar el envío de archivos.',
      });
      return;
    }

    const phone = client.info?.wid?.user || null;
    const displayName = client.info?.pushname || phone;
    updateState(session, {
      status: 'connected',
      qrDataUrl: null,
      phone,
      displayName,
      lastError: null,
    });
    const db = database();
    if (db) {
      void db
        .from('whatsapp_config')
        .update({
          status: 'connected',
          display_phone: phone,
          display_name: displayName,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId)
        .eq('account_id', accountId)
        .eq('provider', 'whatsapp_web')
        .then(({ error }) => {
          if (error) {
            console.error(
              `[whatsapp-web:${accountId}:${connectionId}] could not persist connected state:`,
              error.message
            );
          }
        });
    }
    startDeviceMessageSync(accountId, connectionId, session);
    const initialMediaRepair = setTimeout(() => {
      void repairMissingMediaMessages(accountId, connectionId, session).catch(
        (error) => {
          console.error(
            `[whatsapp-web:${accountId}:${connectionId}] media repair failed:`,
            error
          );
        }
      );
    }, 5_000);
    initialMediaRepair.unref?.();
    session.mediaRepairTimer = setInterval(
      () => {
        void repairMissingMediaMessages(accountId, connectionId, session).catch(
          (error) => {
            console.error(
              `[whatsapp-web:${accountId}:${connectionId}] media repair failed:`,
              error
            );
          }
        );
      },
      2 * 60 * 1000
    );
    session.mediaRepairTimer.unref?.();
    void refreshRecentContactAvatars(accountId, connectionId, session).catch(
      (error) => {
        console.error(
          `[whatsapp-web:${accountId}:${connectionId}] profile picture refresh failed:`,
          error instanceof Error ? error.message : error
        );
      }
    );
  });

  client.on('auth_failure', (message) => {
    updateState(session, {
      status: 'error',
      qrDataUrl: null,
      lastError: `No se pudo recuperar la sesión: ${message}`,
    });
  });

  client.on('disconnected', (reason) => {
    stopDeviceMessageSync(session);
    updateState(session, {
      status: 'disconnected',
      qrDataUrl: null,
      lastError: reason ? String(reason) : null,
    });
  });

  client.on('message', (message) => {
    void forwardMessageToNexora(
      accountId,
      connectionId,
      message,
      'inbound'
    ).catch((error) => {
      console.error(
        `[whatsapp-web:${accountId}:${connectionId}] inbound failed:`,
        error
      );
    });
  });

  client.on('message_create', (message) => {
    if (!message?.fromMe) return;
    const messageId = serializedMessageId(message);
    const originatedInNexora =
      resolvePendingOutgoingMessage(session, message) ||
      isRecentPlatformMessage(session, messageId);
    void (async () => {
      if (!originatedInNexora) {
        await forwardDeviceMessage(accountId, connectionId, session, message);
      }
      if (Number.isInteger(message.ack)) {
        await forwardMessageAck(accountId, connectionId, message, message.ack);
      }
    })().catch((error) => {
      console.error(
        `[whatsapp-web:${accountId}:${connectionId}] linked-device message processing failed:`,
        error
      );
    });
  });

  client.on('message_ack', (message, ack) => {
    void (async () => {
      if (
        message?.fromMe &&
        !isRecentPlatformMessage(session, serializedMessageId(message))
      ) {
        await forwardDeviceMessage(accountId, connectionId, session, message);
      }
      await forwardMessageAck(accountId, connectionId, message, ack);
    })().catch((error) => {
      console.error(
        `[whatsapp-web:${accountId}:${connectionId}] status update failed:`,
        error
      );
    });
  });

  return session;
}

async function ensureSession(
  accountId,
  connectionId,
  useLegacyClientId = false
) {
  const key = sessionKey(accountId, connectionId);
  let session = sessions.get(key);
  if (!session) {
    session = createSession(accountId, connectionId, useLegacyClientId);
    sessions.set(key, session);
  }
  if (!session.initialization) {
    updateState(session, { status: 'starting', lastError: null });
    session.initialization = session.client.initialize().catch((error) => {
      updateState(session, {
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
      session.initialization = null;
    });
  }
  return session;
}

function hasUsableBrowserPage(session) {
  try {
    return Boolean(
      session?.client?.pupPage &&
      !session.client.pupPage.isClosed() &&
      !session.client.pupPage.mainFrame().detached
    );
  } catch {
    return false;
  }
}

async function waitForConnectedSession(session, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (session.state.status === 'connected' && hasUsableBrowserPage(session)) {
      return session;
    }
    if (session.state.status === 'qr_ready') {
      throw new Error('WhatsApp requiere volver a escanear el código QR.');
    }
    if (session.state.status === 'error') {
      throw new Error(
        session.state.lastError || 'WhatsApp no pudo reconectarse.'
      );
    }
    await delay(500);
  }
  throw new Error('WhatsApp tardó demasiado en restaurar la sesión.');
}

async function recoverDetachedSession(accountId, connectionId, staleSession) {
  if (staleSession.recovery) return staleSession.recovery;

  const key = sessionKey(accountId, connectionId);
  staleSession.recovery = (async () => {
    stopDeviceMessageSync(staleSession);
    updateState(staleSession, {
      status: 'starting',
      lastError: 'Restaurando la sesión del navegador…',
    });
    if (sessions.get(key) === staleSession) sessions.delete(key);

    await Promise.race([
      staleSession.client.destroy().catch(() => undefined),
      delay(5_000),
    ]);

    const replacement = await ensureSession(
      accountId,
      connectionId,
      staleSession.useLegacyClientId
    );
    return waitForConnectedSession(replacement);
  })();

  try {
    return await staleSession.recovery;
  } finally {
    staleSession.recovery = null;
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  try {
    if (!safeEqual(request.headers['x-nexora-bridge-secret'], bridgeSecret)) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return;
    }

    if (request.url === '/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true });
      return;
    }

    const url = new URL(request.url || '/', `http://127.0.0.1:${port}`);
    const match = url.pathname.match(
      /^\/sessions\/([^/]+)\/([^/]+)(?:\/(send|resolve|logout))?$/
    );
    if (!match) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    const accountId = decodeURIComponent(match[1]);
    const connectionId = decodeURIComponent(match[2]);
    const action = match[3] || null;
    if (
      !/^[0-9a-f-]{36}$/i.test(accountId) ||
      !/^[0-9a-f-]{36}$/i.test(connectionId)
    ) {
      sendJson(response, 400, {
        error: 'Invalid account or connection id.',
      });
      return;
    }
    const key = sessionKey(accountId, connectionId);

    if (request.method === 'GET' && !action) {
      const session = sessions.get(key);
      sendJson(response, 200, session?.state || initialState());
      return;
    }

    if (request.method === 'POST' && !action) {
      const body = await readJson(request);
      const session = await ensureSession(
        accountId,
        connectionId,
        body.useLegacyClientId === true
      );
      sendJson(response, 202, session.state);
      return;
    }

    if (request.method === 'POST' && action === 'send') {
      let session = sessions.get(key);
      if (!session || session.state.status !== 'connected') {
        sendJson(response, 409, { error: 'WhatsApp is not connected by QR.' });
        return;
      }
      if (!hasUsableBrowserPage(session)) {
        session = await recoverDetachedSession(
          accountId,
          connectionId,
          session
        );
      }
      const body = await readJson(request);
      const phone = String(body.to || '').replace(/\D/g, '');
      if (!phone) {
        sendJson(response, 400, { error: 'Destination phone is required.' });
        return;
      }
      const suppliedJid =
        typeof body.participantJid === 'string' &&
        /^[^@\s]+@(c\.us|lid)$/i.test(body.participantJid)
          ? body.participantJid
          : null;
      let destinationJid = suppliedJid;

      if (!destinationJid) {
        const registered = await session.client.getNumberId(phone);
        destinationJid = registered?._serialized || null;
      }

      // Newer WhatsApp accounts can expose an opaque @lid identifier.
      // Recover the exact chat that delivered the inbound message when
      // an older CRM row still contains those LID digits as its phone.
      if (!destinationJid) {
        const chats = await session.client.getChats();
        const existingChat = chats.find(
          (chat) => String(chat.id?.user || '').replace(/\D/g, '') === phone
        );
        destinationJid = existingChat?.id?._serialized || null;
      }

      if (!destinationJid) {
        sendJson(response, 400, {
          error: 'The destination is not registered on WhatsApp.',
        });
        return;
      }

      const options = {
        // WhatsApp Web can enqueue the message before its model is available
        // in the local collection. Waiting avoids an undefined return value.
        waitUntilMsgSent: true,
        ...(body.caption ? { caption: body.caption } : {}),
        ...(body.quotedMessageId
          ? { quotedMessageId: body.quotedMessageId, ignoreQuoteErrors: true }
          : {}),
        ...(body.messageType === 'audio' ? { sendAudioAsVoice: true } : {}),
        ...(body.messageType === 'document'
          ? { sendMediaAsDocument: true }
          : {}),
      };
      const sendStartedAt = Math.floor(Date.now() / 1000);
      const expectedText = String(body.text || body.caption || '');
      const pendingMessage = waitForOutgoingMessage(session, {
        destinationJid,
        expectedText,
        hasMedia: Boolean(body.mediaUrl),
        startedAt: sendStartedAt,
      });
      let sent;
      try {
        if (body.mediaUrl) {
          const media = await fetchOutboundMedia(
            body.mediaUrl,
            body.filename || undefined
          );
          sent = await session.client.sendMessage(
            destinationJid,
            media,
            options
          );
        } else {
          sent = await session.client.sendMessage(
            destinationJid,
            String(body.text || ''),
            options
          );
        }
      } catch (error) {
        pendingMessage.cancel();
        throw error;
      }

      let resolvedMessage = sent;
      let messageId =
        resolvedMessage?.id?._serialized || resolvedMessage?.id?.id || null;
      if (!messageId) {
        // Current WhatsApp Web builds can return undefined even with
        // waitUntilMsgSent. The message_create event carries the real model
        // as soon as WhatsApp adds it to the local collection.
        resolvedMessage = await pendingMessage.promise;
        messageId =
          resolvedMessage?.id?._serialized || resolvedMessage?.id?.id || null;
      } else {
        pendingMessage.cancel();
      }
      if (!messageId) {
        // Event delivery can be missed during a WhatsApp Web reinjection.
        // Keep a final collection lookup as a recovery path.
        const chat = await session.client
          .getChatById(destinationJid)
          .catch(() => null);
        const recent = await chat?.fetchMessages({ limit: 20 }).catch(() => []);
        const recovered = [...(recent || [])].reverse().find((candidate) => {
          if (!candidate.fromMe || candidate.timestamp < sendStartedAt - 5) {
            return false;
          }
          return body.mediaUrl || candidate.body === expectedText;
        });
        resolvedMessage = recovered || resolvedMessage;
        messageId = recovered?.id?._serialized || recovered?.id?.id || null;
      }
      messageId ||= `qr-local-${randomUUID()}`;
      rememberPlatformMessage(session, messageId);
      sendJson(response, 200, {
        messageId,
        ack: Number.isInteger(resolvedMessage?.ack)
          ? resolvedMessage.ack
          : null,
      });
      return;
    }

    if (request.method === 'POST' && action === 'resolve') {
      const session = sessions.get(key);
      if (!session || session.state.status !== 'connected') {
        sendJson(response, 409, { error: 'WhatsApp is not connected by QR.' });
        return;
      }

      const body = await readJson(request);
      const digits = String(body.phone || '').replace(/\D/g, '');
      const suppliedJid =
        typeof body.participantJid === 'string' &&
        /^[^@\s]+@(c\.us|lid)$/i.test(body.participantJid)
          ? body.participantJid
          : null;
      const lookupJid = suppliedJid || (digits ? `${digits}@lid` : null);
      if (!lookupJid) {
        sendJson(response, 400, {
          error: 'A participant id or phone is required.',
        });
        return;
      }

      const [identity] = await session.client.getContactLidAndPhone([
        lookupJid,
      ]);
      const phone = String(identity?.pn || '').replace(/\D/g, '');
      if (!phone) {
        sendJson(response, 404, {
          error: 'The real phone number could not be resolved.',
        });
        return;
      }

      sendJson(response, 200, {
        phone,
        participantJid: identity?.lid || suppliedJid || lookupJid,
      });
      return;
    }

    if (request.method === 'POST' && action === 'logout') {
      const session = sessions.get(key);
      if (session) {
        stopDeviceMessageSync(session);
        await session.client.logout().catch(() => undefined);
        await session.client.destroy().catch(() => undefined);
        sessions.delete(key);
      }
      sendJson(response, 200, initialState());
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('[whatsapp-web] request failed:', error);
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Internal service error',
    });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Nexora WhatsApp QR service ready on http://127.0.0.1:${port}`);
  void restorePersistedSessions();
});

async function restorePersistedSessions(attempt = 0) {
  const db = database();
  if (!db) {
    console.warn(
      '[whatsapp-web] Automatic session restore skipped: Supabase service credentials are missing.'
    );
    return;
  }

  try {
    const { data: connections, error } = await db
      .from('whatsapp_config')
      .select('id, account_id, is_default')
      .eq('provider', 'whatsapp_web')
      .eq('status', 'connected');
    if (error) throw error;

    for (const connection of connections ?? []) {
      await ensureSession(
        connection.account_id,
        connection.id,
        connection.is_default === true
      );
    }
    if (connections?.length) {
      console.log(
        `[whatsapp-web] Restoring ${connections.length} persisted QR session${connections.length === 1 ? '' : 's'}.`
      );
    }
  } catch (error) {
    console.error(
      '[whatsapp-web] Could not restore persisted sessions:',
      error instanceof Error ? error.message : error
    );
    if (attempt < 3) {
      const retry = setTimeout(
        () => void restorePersistedSessions(attempt + 1),
        5_000 * (attempt + 1)
      );
      retry.unref?.();
    }
  }
}

async function shutdown() {
  server.close();
  for (const session of sessions.values()) stopDeviceMessageSync(session);
  await Promise.allSettled(
    [...sessions.values()].map((session) => session.client.destroy())
  );
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
