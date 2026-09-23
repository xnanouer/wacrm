'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { SettingsRail } from '@/components/settings/settings-rail';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { ProfileForm } from '@/components/settings/profile-form';
import { SecurityPanel } from '@/components/settings/security-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { PersonalQuickReplies } from '@/components/settings/personal-quick-replies';
import { CompanySettings } from '@/components/settings/company-settings';
import { WhatsAppConfig } from '@/components/settings/whatsapp-config';
import { ChannelsSettings } from '@/components/settings/channels-settings';
import { TicketingSettings } from '@/components/settings/ticketing-settings';
import { TemplateManager } from '@/components/settings/template-manager';
import { FieldsAndTagsPanel } from '@/components/settings/fields-and-tags-panel';
import { DealsSettings } from '@/components/settings/deals-settings';
import { MembersTab } from '@/components/settings/members-tab';
import { ApiKeysSettings } from '@/components/settings/api-keys-settings';
import {
  resolveSection,
  settingsSectionsForRole,
  type SettingsSection,
} from '@/components/settings/settings-sections';

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { defaultCurrency, accountRole, profileLoading } = useAuth();
  const { mode } = useTheme();

  // The URL (`?tab=`) is the single source of truth for the active
  // section — deep-linkable, and it keeps the existing links in the
  // app sidebar/header working. Legacy tab values (tags, custom-fields)
  // resolve onto their new home; unknown/empty → the Overview landing.
  const allowedSections = settingsSectionsForRole(accountRole);
  const requestedSection = resolveSection(searchParams.get('tab'));
  const section = allowedSections.includes(requestedSection)
    ? requestedSection
    : allowedSections[0];

  const go = (next: SettingsSection) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // Cheap, fetch-free rail hints. The Overview landing carries the
  // full live status/counts; the rail just surfaces the two that are
  // already in context.
  const hints: Partial<Record<SettingsSection, ReactNode>> = useMemo(
    () => ({
      appearance: mode.charAt(0).toUpperCase() + mode.slice(1),
      deals: defaultCurrency,
    }),
    [mode, defaultCurrency]
  );

  const panel: Record<SettingsSection, ReactNode> = {
    overview: <SettingsOverview onSelect={go} />,
    profile: <ProfileForm />,
    security: <SecurityPanel />,
    appearance: <AppearancePanel />,
    'quick-replies': <PersonalQuickReplies />,
    company: <CompanySettings />,
    whatsapp: <WhatsAppConfig />,
    channels: <ChannelsSettings />,
    ticketing: <TicketingSettings />,
    templates: <TemplateManager />,
    fields: <FieldsAndTagsPanel />,
    deals: <DealsSettings />,
    members: <MembersTab />,
    api: <ApiKeysSettings />,
  };

  if (profileLoading) {
    return (
      <div className="text-muted-foreground py-12 text-sm">
        Cargando configuración…
      </div>
    );
  }

  return (
    <div className="nexora-page-stack">
      <div>
        <p className="nexora-kicker">Tu espacio de trabajo</p>
        <h1 className="nexora-title mt-2">Configuración</h1>
        <p className="nexora-description mt-3">
          Administra tu cuenta, equipo, canales y preferencias desde un solo
          lugar.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[292px_minmax(0,1fr)] lg:items-start">
        <SettingsRail
          active={section}
          onSelect={go}
          hints={hints}
          sections={allowedSections}
        />
        <div className="min-w-0">{panel[section]}</div>
      </div>
    </div>
  );
}
