'use client';

import { Eye } from 'lucide-react';

import type {
  CompanyContractSnapshot,
  ContractInput,
  ContractRecord,
  ContractTemplateKey,
} from '@/lib/contracts/types';
import { ContractDocument } from './contract-document';

export function ContractLivePreview({
  templateKey,
  input,
  company,
}: {
  templateKey: ContractTemplateKey;
  input: ContractInput;
  company: CompanyContractSnapshot;
}) {
  const isPayment = templateKey === 'payment_commitment_v1';
  const partyName =
    'declarantName' in input
      ? input.declarantName
      : 'buyerName' in input
        ? input.buyerName
        : isPayment
          ? 'providerName' in input
            ? input.providerName
            : ''
          : 'consignorName' in input
            ? input.consignorName
            : '';
  const previewVehicle = 'vehicles' in input ? input.vehicles[0] : null;
  const vehicleLabel = [
    previewVehicle?.make ?? ('vehicleMake' in input ? input.vehicleMake : ''),
    previewVehicle?.model ??
      ('vehicleModel' in input ? input.vehicleModel : ''),
    previewVehicle?.year ?? ('vehicleYear' in input ? input.vehicleYear : null),
  ]
    .filter(Boolean)
    .join(' ');
  const now = new Date().toISOString();
  const contract: ContractRecord = {
    id: 'preview',
    accountId: company.accountId,
    contractNumber: 'BORRADOR',
    sequenceNumber: 0,
    templateKey,
    templateVersion: 1,
    status: 'draft',
    contactId: input.contactId,
    conversationId: input.conversationId,
    catalogItemId: 'catalogItemId' in input ? input.catalogItemId : null,
    executiveUserId: input.executiveUserId,
    consignorName: partyName || 'Nombre del cliente',
    vehicleLabel: vehicleLabel || 'Vehículo por completar',
    issueDate: input.issueDate,
    input,
    currentVersion: 0,
    generatedAt: null,
    createdByUserId: '',
    createdByName: input.executiveName || 'Ejecutivo Nexora',
    updatedByUserId: '',
    createdAt: now,
    updatedAt: now,
  };

  return (
    <aside className="xl:sticky xl:top-5 xl:self-start">
      <div className="border-border bg-card overflow-hidden rounded-3xl border shadow-lg">
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
              <Eye className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Vista previa en vivo</p>
              <p className="text-muted-foreground text-xs">
                Se actualiza mientras escribes
              </p>
            </div>
          </div>
          <span className="border-primary/20 bg-primary/8 text-primary rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase">
            Borrador
          </span>
        </div>
        <div className="bg-muted/35 relative h-[700px] overflow-auto 2xl:h-[750px]">
          <div className="absolute top-5 left-1/2 origin-top -translate-x-1/2 scale-[0.58] 2xl:scale-[0.62]">
            <div className="overflow-hidden rounded-md shadow-2xl">
              <ContractDocument
                data={{ contract, company, generatedAt: now }}
              />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground border-border border-t px-5 py-3 text-center text-xs">
          El PDF final mantendrá este contenido con su número oficial.
        </p>
      </div>
    </aside>
  );
}
