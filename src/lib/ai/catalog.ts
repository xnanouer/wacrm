import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildPrivateMediaUrl } from '@/lib/storage/private-media-reference';
import { sendMessageToConversation } from '@/lib/whatsapp/send-message';
import type { ChatMessage } from './types';

const FUEL_LABELS: Record<string, string> = {
  gasoline: 'Bencina',
  diesel: 'Diésel',
  hybrid: 'Híbrido',
  electric: 'Eléctrico',
  gas: 'Gas',
  other: 'Otro',
};

const TRANSMISSION_LABELS: Record<string, string> = {
  automatic: 'Automática',
  manual: 'Mecánica',
  cvt: 'CVT',
  dual_clutch: 'Doble embrague',
  other: 'Otra',
};

const DRIVETRAIN_LABELS: Record<string, string> = {
  '4x2': '4x2',
  '4x4': '4x4',
  awd: 'AWD',
  fwd: 'FWD',
  rwd: 'RWD',
  other: 'Otra',
};

interface CatalogDetailRow {
  license_plate: string | null;
  license_plate_visible: boolean;
  make: string;
  model: string;
  version: string;
  model_year: number;
  color: string;
  engine: string;
  fuel: string;
  transmission: string;
  drivetrain: string;
  mileage_km: number | string;
  list_price: number | string;
  offer_price: number | string | null;
  minimum_down_payment: number | string | null;
  financing_text: string;
  current_location: string;
}

interface CatalogImageRow {
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
}

interface CatalogItemRow {
  id: string;
  title: string;
  description: string;
  updated_at: string;
  catalog_vehicle_details: CatalogDetailRow | CatalogDetailRow[];
  catalog_item_images: CatalogImageRow[] | null;
}

const CATALOG_CANDIDATE_SELECT = `
  id,
  title,
  description,
  updated_at,
  catalog_vehicle_details!inner(
    license_plate,
    license_plate_visible,
    make,
    model,
    version,
    model_year,
    color,
    engine,
    fuel,
    transmission,
    drivetrain,
    mileage_km,
    list_price,
    offer_price,
    minimum_down_payment,
    financing_text,
    current_location
  ),
  catalog_item_images(storage_path, is_primary, sort_order)
`;

export interface AiCatalogCandidate {
  id: string;
  title: string;
  description: string;
  make: string;
  model: string;
  version: string;
  year: number;
  color: string;
  engine: string;
  fuel: string;
  transmission: string;
  drivetrain: string;
  mileage: number;
  listPrice: number;
  offerPrice: number | null;
  displayedPrice: number;
  minimumDownPayment: number | null;
  financingText: string;
  location: string;
  licensePlate: string | null;
  licensePlateVisible: boolean;
  primaryImagePath: string | null;
  imagePaths: string[];
  updatedAt: string;
}

export interface CatalogLookup {
  requested: boolean;
  candidates: AiCatalogCandidate[];
}

function relationOne<T>(value: T | T[]): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function numberValue(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCatalogCandidate(item: CatalogItemRow): AiCatalogCandidate | null {
  const detail = relationOne(item.catalog_vehicle_details);
  if (!detail) return null;
  const listPrice = numberValue(detail.list_price) ?? 0;
  const offerPrice = numberValue(detail.offer_price);
  const orderedImages = (item.catalog_item_images ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const primaryImagePath =
    orderedImages.find((image) => image.is_primary)?.storage_path ??
    orderedImages[0]?.storage_path ??
    null;
  const imagePaths = primaryImagePath
    ? [
        primaryImagePath,
        ...orderedImages
          .map((image) => image.storage_path)
          .filter((path) => path !== primaryImagePath),
      ]
    : [];

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    make: detail.make,
    model: detail.model,
    version: detail.version,
    year: detail.model_year,
    color: detail.color,
    engine: detail.engine,
    fuel: FUEL_LABELS[detail.fuel] ?? 'Otro',
    transmission: TRANSMISSION_LABELS[detail.transmission] ?? 'Otra',
    drivetrain: DRIVETRAIN_LABELS[detail.drivetrain] ?? 'Otra',
    mileage: numberValue(detail.mileage_km) ?? 0,
    listPrice,
    offerPrice,
    displayedPrice: offerPrice ?? listPrice,
    minimumDownPayment: numberValue(detail.minimum_down_payment),
    financingText: detail.financing_text,
    location: detail.current_location,
    licensePlate: detail.license_plate,
    licensePlateVisible: detail.license_plate_visible,
    primaryImagePath,
    imagePaths,
    updatedAt: item.updated_at,
  };
}

export function normalizeCatalogSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}$]+/gu, ' ')
    .trim();
}

export function isCatalogSelection(message: string): boolean {
  const normalized = normalizeCatalogSearch(message);
  return /\b(me interesa|me interesan|elijo|elegiria|me quedo|prefiero|quiero (?:ese|esa|este|esta|el|la)|ese vehiculo|esa camioneta)\b/.test(
    normalized
  );
}

export function hasCatalogCardsInConversation(
  messages: ChatMessage[]
): boolean {
  return messages.some(
    (message) =>
      message.role === 'assistant' &&
      /\b(catalogo mostrado por nexora|valor vehiculo|precio lista|pie inicial|kilometraje)\b/.test(
        normalizeCatalogSearch(message.content)
      )
  );
}

export function isCatalogRequest(
  message: string,
  options: { allowSelection?: boolean } = {}
): boolean {
  const normalized = normalizeCatalogSearch(message);
  if (!normalized) return false;

  if (
    /\b(no me envies|no envies|no quiero recibir|no quiero ver|sin catalogo|todavia no|aun no)\b/.test(
      normalized
    )
  ) {
    return false;
  }

  const explicitlyRequestsCatalog = /\b(catalogo|inventario)\b/.test(
    normalized
  );
  const mentionsVehicle =
    /\b(vehiculo|vehiculos|auto|autos|automovil|automoviles|camioneta|camionetas|suv|sedan|hatchback|pickup|citycar|modelo|modelos)\b/.test(
      normalized
    );
  const mentionsBrand =
    /\b(baic|hyundai|toyota|kia|chevrolet|suzuki|nissan|mazda|ford|volkswagen|peugeot|citroen|renault|subaru|mitsubishi|honda|bmw|mercedes|audi|volvo|jeep|fiat|chery|jac|mg|maxus|great wall|haval)\b/.test(
      normalized
    );
  const explicitlyRequestsItems =
    /\b(envia|enviame|enviar|muestra|muestrame|mostrar|fotos|foto|imagenes|imagen|opciones|stock)\b/.test(
      normalized
    );
  const requestsVehicleDetails =
    /\b(precio|valor|cuesta|pie|financiamiento|cuota|kilometraje|motor|ficha|informacion|datos|caracteristicas|equipamiento|version)\b/.test(
      normalized
    );
  const requestsAvailability =
    /\b(tienen|tienes|hay|disponible|disponibles)\b/.test(normalized) &&
    (mentionsVehicle || mentionsBrand);
  const explicitlyWantsToSeeVehicles =
    /\b(ver)\b/.test(normalized) && (mentionsVehicle || mentionsBrand);

  return (
    explicitlyRequestsCatalog ||
    explicitlyRequestsItems ||
    requestsVehicleDetails ||
    requestsAvailability ||
    explicitlyWantsToSeeVehicles ||
    (options.allowSelection === true && isCatalogSelection(message))
  );
}

export function parseCatalogMaxPrice(message: string): number | null {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
  const match = normalized.match(
    /\b(?:hasta|maximo|menos de|menor a|bajo|presupuesto(?: de)?)\s*\$?\s*([\d.,]+)\s*(millones?|palos?|m)?\b/
  );
  if (!match) return null;

  const raw = match[1];
  const suffix = match[2];
  const digitsOnly = raw.replace(/[^\d]/g, '');
  if (!digitsOnly) return null;

  let amount = suffix
    ? Number(raw.replace(/\./g, '').replace(',', '.'))
    : Number(digitsOnly);
  if (!Number.isFinite(amount)) return null;
  if (suffix || amount < 1_000) amount *= 1_000_000;
  return amount > 0 ? amount : null;
}

function requestedYear(message: string): number | null {
  const match = normalizeCatalogSearch(message).match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function requestedFuel(message: string): string | null {
  const value = normalizeCatalogSearch(message);
  if (/\bdiesel\b/.test(value)) return 'diesel';
  if (/\b(bencina|gasolina)\b/.test(value)) return 'gasoline';
  if (/\bhibrid[oa]\b/.test(value)) return 'hybrid';
  if (/\belectric[oa]\b/.test(value)) return 'electric';
  return null;
}

function requestedTransmission(message: string): string | null {
  const value = normalizeCatalogSearch(message);
  if (/\b(automatic[oa]|automaticos|automaticas)\b/.test(value)) {
    return 'automatic';
  }
  if (/\b(manual|mecanic[oa]|manuales)\b/.test(value)) return 'manual';
  return null;
}

const GENERIC_TOKENS = new Set([
  'catalogo',
  'inventario',
  'vehiculo',
  'vehiculos',
  'auto',
  'autos',
  'automovil',
  'automoviles',
  'quiero',
  'busco',
  'tienen',
  'tienes',
  'mostrar',
  'muestrame',
  'enviar',
  'envia',
  'opciones',
  'opcion',
  'necesito',
  'hasta',
  'maximo',
  'precio',
]);

export function rankCatalogCandidates(
  candidates: AiCatalogCandidate[],
  message: string,
  maxItems: number
): AiCatalogCandidate[] {
  const maxPrice = parseCatalogMaxPrice(message);
  const year = requestedYear(message);
  const fuel = requestedFuel(message);
  const transmission = requestedTransmission(message);
  const normalized = normalizeCatalogSearch(message);
  const allowsGeneralCatalog =
    /\b(catalogo|inventario|opciones|stock)\b/.test(normalized) ||
    (/\b(envia|enviame|enviar|muestra|muestrame|mostrar|ver)\b/.test(
      normalized
    ) &&
      /\b(vehiculo|vehiculos|auto|autos|automovil|automoviles|camioneta|camionetas|suv|sedan|hatchback|pickup|citycar|modelo|modelos)\b/.test(
        normalized
      ));
  const hasStructuredPreference =
    maxPrice !== null ||
    year !== null ||
    fuel !== null ||
    transmission !== null;
  const tokens = normalized
    .split(' ')
    .filter((token) => token.length >= 2 && !GENERIC_TOKENS.has(token));

  const scored = candidates
    .filter((candidate) => {
      if (maxPrice !== null && candidate.displayedPrice > maxPrice)
        return false;
      if (year !== null && candidate.year !== year) return false;
      if (
        fuel !== null &&
        normalizeCatalogSearch(candidate.fuel) !==
          normalizeCatalogSearch(FUEL_LABELS[fuel] ?? fuel)
      ) {
        return false;
      }
      if (
        transmission !== null &&
        normalizeCatalogSearch(candidate.transmission) !==
          normalizeCatalogSearch(
            TRANSMISSION_LABELS[transmission] ?? transmission
          )
      ) {
        return false;
      }
      return true;
    })
    .map((candidate) => {
      const haystack = normalizeCatalogSearch(
        [
          candidate.make,
          candidate.model,
          candidate.version,
          candidate.year,
          candidate.color,
          candidate.fuel,
          candidate.transmission,
          candidate.drivetrain,
          candidate.location,
        ].join(' ')
      );
      const score = tokens.reduce(
        (total, token) => total + (haystack.includes(token) ? 3 : 0),
        0
      );
      return { candidate, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.candidate.updatedAt) - Date.parse(a.candidate.updatedAt)
    );

  return (
    allowsGeneralCatalog || hasStructuredPreference
      ? scored
      : scored.filter((row) => row.score > 0)
  )
    .slice(0, Math.min(5, Math.max(1, maxItems)))
    .map((row) => row.candidate);
}

export function selectPreviouslyShownCandidate(
  candidates: AiCatalogCandidate[],
  messages: ChatMessage[],
  customerMessage: string
): AiCatalogCandidate | null {
  const shown: Array<{
    candidate: AiCatalogCandidate;
    messageIndex: number;
    textIndex: number;
  }> = [];

  messages.forEach((message, messageIndex) => {
    if (message.role !== 'assistant') return;
    const content = normalizeCatalogSearch(message.content);
    if (
      !/\b(catalogo mostrado por nexora|valor vehiculo|precio lista|pie inicial|kilometraje)\b/.test(
        content
      )
    ) {
      return;
    }
    for (const candidate of candidates) {
      const label = normalizeCatalogSearch(
        `${candidate.make} ${candidate.model}`
      );
      const textIndex = content.indexOf(label);
      if (textIndex >= 0) {
        shown.push({ candidate, messageIndex, textIndex });
      }
    }
  });

  const ordered = shown
    .sort(
      (left, right) =>
        left.messageIndex - right.messageIndex ||
        left.textIndex - right.textIndex
    )
    .filter(
      (entry, index, all) =>
        all.findIndex((other) => other.candidate.id === entry.candidate.id) ===
        index
    )
    .map((entry) => entry.candidate);
  if (ordered.length === 0) return null;

  const normalized = normalizeCatalogSearch(customerMessage);
  const named = ordered.filter((candidate) => {
    const make = normalizeCatalogSearch(candidate.make);
    const model = normalizeCatalogSearch(candidate.model);
    const fullName = normalizeCatalogSearch(
      `${candidate.make} ${candidate.model}`
    );
    return (
      normalized.includes(fullName) ||
      (make.length >= 2 && normalized.includes(make)) ||
      (model.length >= 2 && normalized.includes(model))
    );
  });
  if (named.length === 1) return named[0];

  const ordinal = /\b(primero|primera|1)\b/.test(normalized)
    ? 0
    : /\b(segundo|segunda|2)\b/.test(normalized)
      ? 1
      : /\b(tercero|tercera|3)\b/.test(normalized)
        ? 2
        : /\b(cuarto|cuarta|4)\b/.test(normalized)
          ? 3
          : /\b(quinto|quinta|5)\b/.test(normalized)
            ? 4
            : null;
  if (ordinal !== null) return ordered[ordinal] ?? null;

  if (
    ordered.length === 1 &&
    /\b(ese|esa|este|esta|ese vehiculo|esa camioneta)\b/.test(normalized)
  ) {
    return ordered[0];
  }
  return null;
}

export async function findCatalogCandidates(
  db: SupabaseClient,
  accountId: string,
  message: string,
  maxItems: number,
  options: {
    allowSelection?: boolean;
    previousMessages?: ChatMessage[];
  } = {}
): Promise<CatalogLookup> {
  if (
    !isCatalogRequest(message, {
      allowSelection: options.allowSelection,
    })
  ) {
    return { requested: false, candidates: [] };
  }

  const { data, error } = await db
    .from('catalog_items')
    .select(CATALOG_CANDIDATE_SELECT)
    .eq('account_id', accountId)
    .eq('status', 'available')
    .eq('visibility', 'shareable')
    .not('approved_at', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[ai catalog] lookup failed:', error.message);
    return { requested: true, candidates: [] };
  }

  const candidates = ((data ?? []) as unknown as CatalogItemRow[])
    .map(toCatalogCandidate)
    .filter((candidate): candidate is AiCatalogCandidate => candidate !== null);

  if (options.allowSelection && options.previousMessages?.length) {
    const selected = selectPreviouslyShownCandidate(
      candidates,
      options.previousMessages,
      message
    );
    if (selected) {
      return { requested: true, candidates: [selected] };
    }

    // Una elección ambigua debe generar una pregunta aclaratoria del agente.
    // Nunca volvemos a adjuntar el catálogo completo después de que el cliente
    // indicó que eligió o prefiere una alternativa.
    if (isCatalogSelection(message)) {
      return { requested: true, candidates: [] };
    }
  }

  return {
    requested: true,
    candidates: rankCatalogCandidates(candidates, message, maxItems),
  };
}

export async function loadCatalogCandidatesByIds(
  db: SupabaseClient,
  accountId: string,
  itemIds: string[]
): Promise<AiCatalogCandidate[]> {
  const orderedIds = [...new Set(itemIds)].slice(0, 5);
  if (orderedIds.length === 0) return [];

  const { data, error } = await db
    .from('catalog_items')
    .select(CATALOG_CANDIDATE_SELECT)
    .eq('account_id', accountId)
    .eq('status', 'available')
    .eq('visibility', 'shareable')
    .not('approved_at', 'is', null)
    .in('id', orderedIds);
  if (error) {
    throw new Error(`catalog_items_load_failed:${error.message}`);
  }

  const byId = new Map(
    ((data ?? []) as unknown as CatalogItemRow[])
      .map(toCatalogCandidate)
      .filter(
        (candidate): candidate is AiCatalogCandidate => candidate !== null
      )
      .map((candidate) => [candidate.id, candidate])
  );
  return orderedIds
    .map((id) => byId.get(id))
    .filter(
      (candidate): candidate is AiCatalogCandidate => candidate !== undefined
    );
}

function clp(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildCatalogContext(candidates: AiCatalogCandidate[]): string {
  if (candidates.length === 0) {
    return 'No approved, available and shareable catalog item matched the customer request.';
  }

  return candidates
    .map((candidate, index) => {
      const facts = [
        `Item ${index + 1}: ${candidate.make} ${candidate.model} ${candidate.version}`.trim(),
        'Disponibilidad: disponible',
        `Año: ${candidate.year}`,
        candidate.offerPrice !== null
          ? `Precio lista: ${clp(candidate.listPrice)}`
          : null,
        candidate.offerPrice !== null
          ? `Precio oferta vigente: ${clp(candidate.offerPrice)}`
          : `Valor del vehículo: ${clp(candidate.listPrice)}`,
        `Kilometraje: ${candidate.mileage.toLocaleString('es-CL')} km`,
        candidate.color ? `Color: ${candidate.color}` : null,
        candidate.engine ? `Motor: ${candidate.engine}` : null,
        `Combustible: ${candidate.fuel}`,
        `Transmisión: ${candidate.transmission}`,
        `Tracción: ${candidate.drivetrain}`,
        candidate.location ? `Ubicación: ${candidate.location}` : null,
        candidate.minimumDownPayment !== null
          ? `Pie mínimo: ${clp(candidate.minimumDownPayment)}`
          : null,
        candidate.financingText
          ? `Financiamiento: ${candidate.financingText}`
          : null,
        candidate.description ? `Descripción: ${candidate.description}` : null,
        candidate.licensePlateVisible && candidate.licensePlate
          ? `Patente pública: ${candidate.licensePlate}`
          : null,
      ].filter(Boolean);
      return facts.join('\n');
    })
    .join('\n\n---\n\n');
}

export function buildCatalogCaption(candidate: AiCatalogCandidate): string {
  const rows = [
    `🚘 *${candidate.make} ${candidate.model} ${candidate.version}*`.trim(),
    '✅ Disponible',
    `📅 Año: ${candidate.year}`,
    candidate.color ? `🎨 Color: ${candidate.color}` : null,
    candidate.engine ? `🔧 Motor: ${candidate.engine}` : null,
    `🛣️ Kilometraje: ${candidate.mileage.toLocaleString('es-CL')} km`,
    `⚙️ Transmisión: ${candidate.transmission}`,
    `⛽ Combustible: ${candidate.fuel}`,
    `🧭 Tracción: ${candidate.drivetrain}`,
    candidate.offerPrice !== null
      ? `🏷️ Precio lista: ${clp(candidate.listPrice)}`
      : null,
    `💰 *Valor vehículo: ${clp(candidate.displayedPrice)}*`,
    candidate.minimumDownPayment !== null
      ? `💳 *Pie inicial desde: ${clp(candidate.minimumDownPayment)}*`
      : null,
    candidate.location ? `📍 Ubicación: ${candidate.location}` : null,
    candidate.financingText
      ? `🏦 Financiamiento: ${candidate.financingText}`
      : null,
    candidate.description ? `📝 ${candidate.description.slice(0, 240)}` : null,
    candidate.licensePlateVisible && candidate.licensePlate
      ? `Patente: ${candidate.licensePlate}`
      : null,
  ].filter(Boolean);

  return rows.join('\n').slice(0, 1024);
}

function commercialSnapshot(candidate: AiCatalogCandidate) {
  return {
    title: candidate.title,
    make: candidate.make,
    model: candidate.model,
    version: candidate.version,
    year: candidate.year,
    color: candidate.color,
    engine: candidate.engine,
    fuel: candidate.fuel,
    transmission: candidate.transmission,
    drivetrain: candidate.drivetrain,
    mileage_km: candidate.mileage,
    list_price: candidate.listPrice,
    offer_price: candidate.offerPrice,
    displayed_price: candidate.displayedPrice,
    minimum_down_payment: candidate.minimumDownPayment,
    financing_text: candidate.financingText,
    location: candidate.location,
    license_plate:
      candidate.licensePlateVisible && candidate.licensePlate
        ? candidate.licensePlate
        : null,
  };
}

export async function sendCatalogCandidates(args: {
  db: SupabaseClient;
  accountId: string;
  conversationId: string;
  contactId: string;
  actorUserId: string;
  whatsappConfigId: string;
  introductionText: string;
  introMessageId: string;
  candidates: AiCatalogCandidate[];
  senderType?: 'agent' | 'bot';
  source?: 'manual' | 'nexora_ai';
}): Promise<{
  batchId: string;
  status: 'sent' | 'partial' | 'failed';
  sent: number;
  failed: number;
  imagesSent: number;
}> {
  const {
    db,
    accountId,
    conversationId,
    contactId,
    actorUserId,
    whatsappConfigId,
    introductionText,
    introMessageId,
    candidates,
    senderType = 'bot',
    source = 'nexora_ai',
  } = args;
  if (candidates.length === 0) {
    throw new Error('catalog_candidates_required');
  }

  const { data: batch, error: batchError } = await db
    .from('catalog_share_batches')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      actor_user_id: actorUserId,
      channel: 'whatsapp',
      whatsapp_config_id: whatsappConfigId,
      channel_connection_id: null,
      introduction_text: introductionText.slice(0, 2000),
      intro_message_id: introMessageId,
      status: 'sending',
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    throw new Error(
      `catalog_share_batch_create_failed:${batchError?.message ?? 'unknown'}`
    );
  }

  let sent = 0;
  let failed = 0;
  let imagesSent = 0;

  for (const [index, candidate] of candidates.slice(0, 5).entries()) {
    const caption = buildCatalogCaption(candidate);
    const { data: share, error: shareError } = await db
      .from('catalog_item_shares')
      .insert({
        account_id: accountId,
        share_batch_id: batch.id,
        catalog_item_id: candidate.id,
        position: index + 1,
        commercial_snapshot: commercialSnapshot(candidate),
        displayed_price: candidate.displayedPrice,
        item_status_snapshot: 'available',
        sent_text: caption,
        result: 'pending',
      })
      .select('id')
      .single();

    if (shareError || !share) {
      failed += 1;
      console.error('[ai catalog] share row failed:', shareError?.message);
      continue;
    }

    try {
      const { data: current } = await db
        .from('catalog_items')
        .select('status, visibility, approved_at')
        .eq('id', candidate.id)
        .eq('account_id', accountId)
        .maybeSingle();
      if (
        !current ||
        current.status !== 'available' ||
        current.visibility !== 'shareable' ||
        !current.approved_at
      ) {
        throw new Error('catalog_item_no_longer_available');
      }

      const imagePaths = candidate.imagePaths.length
        ? candidate.imagePaths
        : candidate.primaryImagePath
          ? [candidate.primaryImagePath]
          : [];
      if (imagePaths.length === 0) {
        throw new Error('catalog_primary_image_missing');
      }

      let firstResult: Awaited<
        ReturnType<typeof sendMessageToConversation>
      > | null = null;
      for (const [imageIndex, imagePath] of imagePaths.entries()) {
        const result = await sendMessageToConversation(db, accountId, {
          conversationId,
          messageType: 'image',
          mediaUrl: buildPrivateMediaUrl('catalog-media', imagePath),
          contentText: imageIndex === 0 ? caption : null,
          senderType,
          senderId: senderType === 'agent' ? actorUserId : null,
          pauseFlows: false,
        });
        firstResult ??= result;
        imagesSent += 1;
      }

      if (!firstResult) throw new Error('catalog_images_not_sent');

      await db
        .from('catalog_item_shares')
        .update({
          message_id: firstResult.messageId,
          external_message_id: firstResult.whatsappMessageId,
          result: 'sent',
          completed_at: new Date().toISOString(),
        })
        .eq('id', share.id);
      await db.from('catalog_item_activity').insert({
        account_id: accountId,
        catalog_item_id: candidate.id,
        action: 'shared',
        actor_user_id: actorUserId,
        metadata: {
          source,
          conversation_id: conversationId,
          share_batch_id: batch.id,
        },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from('catalog_item_shares')
        .update({
          result: 'failed',
          error_code: 'catalog_send_failed',
          error_message: message.slice(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq('id', share.id);
    }
  }

  const status =
    sent > 0 && failed === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed';
  await db
    .from('catalog_share_batches')
    .update({
      status,
      error_code: failed > 0 ? 'catalog_item_send_failed' : null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', batch.id);

  return { batchId: batch.id, status, sent, failed, imagesSent };
}
