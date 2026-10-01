'use client';

import { useMemo, useState } from 'react';
import { Bot, Search, UserRound } from 'lucide-react';

import { Input } from '@/components/ui/input';
import type {
  ContractContactOption,
  ContractContactPrefill,
} from '@/lib/contracts/prefill';

export function ContactPrefillPicker({
  contacts,
  value,
  onChange,
  placeholder = 'Buscar por nombre, RUT, teléfono o correo',
}: {
  contacts: ContractContactOption[];
  value: string | null;
  onChange: (contactId: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLocaleLowerCase('es-CL');
  const filtered = useMemo(
    () =>
      contacts.filter((contact) =>
        [contact.name, contact.rut, contact.phone, contact.email]
          .filter(Boolean)
          .some((part) =>
            String(part).toLocaleLowerCase('es-CL').includes(normalized)
          )
      ),
    [contacts, normalized]
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background h-11 w-full rounded-xl border px-3 text-sm"
      >
        <option value="">Seleccionar contacto</option>
        {filtered.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {[contact.name || 'Sin nombre', contact.rut, contact.phone]
              .filter(Boolean)
              .join(' · ')}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ContractPrefillNotice({
  prefill,
}: {
  prefill: ContractContactPrefill | null;
}) {
  if (!prefill) return null;
  const values = Object.values(prefill.sources);
  const ai = values.filter((source) => source === 'ai').length;
  const contact = values.filter((source) => source === 'contact').length;

  return (
    <div className="border-primary/20 bg-primary/5 text-muted-foreground rounded-xl border px-3 py-2 text-xs leading-5 sm:col-span-2">
      <div className="text-foreground flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
        {contact > 0 ? (
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3.5" /> {contact} desde el contacto
          </span>
        ) : null}
        {ai > 0 ? (
          <span className="text-primary inline-flex items-center gap-1">
            <Bot className="size-3.5" /> {ai} recopilados por IA
          </span>
        ) : null}
      </div>
      Revisa y corrige los datos antes de generar. Nexora nunca firma ni genera
      el documento automáticamente.
      {prefill.conflicts.length > 0 ? (
        <span className="mt-1 block font-medium text-amber-700 dark:text-amber-300">
          Hay {prefill.conflicts.length}{' '}
          {prefill.conflicts.length === 1
            ? 'dato diferente'
            : 'datos diferentes'}{' '}
          entre la ficha y el chat. Confírmalos con el cliente.
        </span>
      ) : null}
    </div>
  );
}
