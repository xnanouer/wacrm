const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|rk|pk)-[a-z0-9_-]{12,}\b/gi,
  /\b(?:APP_USR|TEST)-[a-z0-9_-]{12,}\b/gi,
  /\bBearer\s+[a-z0-9._~+/=-]{12,}\b/gi,
  /\b(?:access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret|password|contraseña)\s*[:=]\s*[^\s,;]+/gi,
  /\b[a-f0-9]{64}\b/gi,
];

export const SUPPORT_ROUTE_ALLOWLIST = [
  '/dashboard',
  '/inbox',
  '/notifications',
  '/contacts',
  '/contacts/base',
  '/catalogo',
  '/quotes',
  '/pipelines',
  '/broadcasts',
  '/automations',
  '/flows',
  '/agents',
  '/plans',
  '/settings',
] as const;

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (safe, pattern) => safe.replace(pattern, '[SECRETO REDACTADO]'),
    value
  ).slice(0, 20_000);
}

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.split('?')[0];
  return (
    SUPPORT_ROUTE_ALLOWLIST.find(
      (allowed) => path === allowed || path.startsWith(`${allowed}/`)
    ) ?? null
  );
}

export function stripUntrustedLinks(text: string): string {
  return text
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, (_all, label: string, href: string) => {
      const safe = safeInternalPath(href);
      return safe ? `[${label}](${safe})` : label;
    })
    .replace(/https?:\/\/[^\s)]+/gi, '[enlace externo omitido]');
}

export function supportRouteForMessage(message: string): string | null {
  const value = message.toLowerCase();
  if (/whatsapp|facebook|instagram|conexi[oó]n/.test(value)) return '/settings';
  if (/plan|pago|cobro|factur/.test(value)) return '/plans';
  if (/agente|inteligencia artificial|\bia\b/.test(value)) return '/agents';
  if (/automat/.test(value)) return '/automations';
  if (/flujo/.test(value)) return '/flows';
  if (/contact/.test(value)) return '/contacts';
  if (/cat[aá]logo|veh[ií]culo/.test(value)) return '/catalogo';
  if (/cotiza/.test(value)) return '/quotes';
  if (/mensaje|bandeja|chat/.test(value)) return '/inbox';
  return null;
}
