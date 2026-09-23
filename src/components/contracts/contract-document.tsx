import type { ContractDocumentData } from '@/lib/contracts/types';
import { PaymentCommitmentDocument } from './payment-commitment-document';
import { VehicleReservationDocument } from './vehicle-reservation-document';
import { VehicleTransactionDocument } from './vehicle-transaction-document';
import { VehicleConsignmentDocument } from './vehicle-consignment-document';
import { VehicleLegalDocument } from './vehicle-legal-document';

export function ContractDocument({ data }: { data: ContractDocumentData }) {
  if (data.contract.templateKey === 'payment_commitment_v1')
    return <PaymentCommitmentDocument data={data} />;
  if (data.contract.templateKey === 'vehicle_reservation_v1')
    return <VehicleReservationDocument data={data} />;
  if (
    data.contract.templateKey === 'vehicle_sale_power_v1' ||
    data.contract.templateKey === 'vehicle_responsibility_declaration_v1'
  )
    return <VehicleLegalDocument data={data} />;
  if (data.contract.templateKey.startsWith('vehicle_sale_'))
    return <VehicleTransactionDocument data={data} />;
  return <VehicleConsignmentDocument data={data} />;
}
