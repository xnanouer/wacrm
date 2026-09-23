import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Building2,
  CarFront,
  HandCoins,
  KeyRound,
  Landmark,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';

import { ContractEditor } from '@/components/contracts/contract-editor';
import { PaymentCommitmentEditor } from '@/components/contracts/payment-commitment-editor';
import { VehicleTransactionEditor } from '@/components/contracts/vehicle-transaction-editor';
import { VehicleLegalEditor } from '@/components/contracts/vehicle-legal-editor';
import { buttonVariants } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/account';
import {
  PAYMENT_COMMITMENT_TEMPLATE,
  VEHICLE_CONSIGNMENT_TEMPLATE,
  VEHICLE_LEGAL_TEMPLATES,
  VEHICLE_TRANSACTION_TEMPLATES,
} from '@/lib/contracts/types';

export const metadata: Metadata = { title: 'Nuevo contrato | Nexora' };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  await requireRole('agent');
  const { template } = await searchParams;
  if (template === PAYMENT_COMMITMENT_TEMPLATE.key)
    return <PaymentCommitmentEditor />;
  if (template === VEHICLE_CONSIGNMENT_TEMPLATE.key) return <ContractEditor />;
  const transactionTemplate = VEHICLE_TRANSACTION_TEMPLATES.find(
    (item) => item.key === template
  );
  if (transactionTemplate)
    return <VehicleTransactionEditor templateKey={transactionTemplate.key} />;
  const legalTemplate = VEHICLE_LEGAL_TEMPLATES.find(
    (item) => item.key === template
  );
  if (legalTemplate)
    return <VehicleLegalEditor templateKey={legalTemplate.key} />;
  const transactionIcons = [
    Landmark,
    UsersRound,
    Building2,
    ScrollText,
    ShieldCheck,
    CarFront,
  ];
  const templates = [
    { ...VEHICLE_CONSIGNMENT_TEMPLATE, icon: CarFront },
    { ...PAYMENT_COMMITMENT_TEMPLATE, icon: HandCoins },
    ...VEHICLE_TRANSACTION_TEMPLATES.map((item, index) => ({
      ...item,
      icon: transactionIcons[index],
    })),
    { ...VEHICLE_LEGAL_TEMPLATES[0], icon: KeyRound },
    { ...VEHICLE_LEGAL_TEMPLATES[1], icon: ShieldAlert },
  ];
  return (
    <div className="nexora-page-stack">
      <div>
        <p className="nexora-kicker">Nuevo contrato</p>
        <h1 className="nexora-title mt-2">Elige un modelo</h1>
        <p className="nexora-description mt-3">
          Nexora adaptará el documento con los datos y el logo de tu empresa.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {templates.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.key}
              className="border-primary/20 from-primary/8 via-card to-card rounded-3xl border bg-gradient-to-br p-7 shadow-sm"
            >
              <span className="bg-primary text-primary-foreground shadow-primary/20 flex size-14 items-center justify-center rounded-2xl shadow-lg">
                <Icon className="size-7" />
              </span>
              <h2 className="mt-6 text-2xl font-semibold">{item.name}</h2>
              <p className="text-muted-foreground mt-3 min-h-12 text-sm leading-6">
                {item.description}
              </p>
              <Link
                href={`/contracts/new?template=${item.key}`}
                className={`${buttonVariants()} mt-6`}
              >
                Usar este modelo
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
