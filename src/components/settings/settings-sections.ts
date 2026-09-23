import {
  Building2,
  Coins,
  FileText,
  KeyRound,
  LayoutGrid,
  MessageSquareText,
  Palette,
  PlugZap,
  Waypoints,
  Shield,
  Share2,
  Tags,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { hasMinRole, type AccountRole } from '@/lib/auth/roles';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'quick-replies',
  'company',
  'whatsapp',
  'channels',
  'ticketing',
  'templates',
  'fields',
  'deals',
  'members',
  'api',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

export const PERSONAL_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'profile',
  'security',
  'appearance',
  'quick-replies',
] as const;

const VIEWER_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'profile',
  'security',
  'appearance',
] as const;

export function settingsSectionsForRole(
  role: AccountRole | null
): readonly SettingsSection[] {
  return role && hasMinRole(role, 'admin')
    ? SETTINGS_SECTIONS
    : role === 'viewer'
      ? VIEWER_SETTINGS_SECTIONS
      : PERSONAL_SETTINGS_SECTIONS;
}

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    group: 'top',
  },
  profile: {
    id: 'profile',
    label: 'Your profile',
    icon: User,
    group: 'account',
  },
  security: {
    id: 'security',
    label: 'Login & security',
    icon: Shield,
    group: 'account',
  },
  appearance: {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    group: 'account',
  },
  'quick-replies': {
    id: 'quick-replies',
    label: 'Respuestas rápidas',
    icon: MessageSquareText,
    group: 'account',
  },
  company: {
    id: 'company',
    label: 'Empresa',
    icon: Building2,
    group: 'workspace',
  },
  whatsapp: {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: PlugZap,
    group: 'workspace',
  },
  channels: {
    id: 'channels',
    label: 'Facebook & Instagram',
    icon: Share2,
    group: 'workspace',
  },
  ticketing: {
    id: 'ticketing',
    label: 'Tickets & departments',
    icon: Waypoints,
    group: 'workspace',
  },
  templates: {
    id: 'templates',
    label: 'Templates',
    icon: FileText,
    group: 'workspace',
  },
  fields: {
    id: 'fields',
    label: 'Fields & tags',
    icon: Tags,
    group: 'workspace',
  },
  deals: {
    id: 'deals',
    label: 'Deals & currency',
    icon: Coins,
    group: 'workspace',
  },
  members: {
    id: 'members',
    label: 'Usuarios del equipo',
    icon: UsersRound,
    group: 'workspace',
  },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
};

export const RAIL_GROUPS: {
  label: string | null;
  group: SectionMeta['group'];
}[] = [
  { label: null, group: 'top' },
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
