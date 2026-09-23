export type ContractStatus = 'draft' | 'generated' | 'signed' | 'cancelled';

export interface CompanyLegalProfile {
  accountId: string;
  legalName: string;
  tradeName: string;
  taxId: string;
  businessActivity: string;
  legalAddress: string;
  commune: string;
  city: string;
  region: string;
  phone: string;
  email: string;
  legalRepresentativeName: string;
  legalRepresentativeTaxId: string;
  defaultBranchName: string;
  defaultBranchAddress: string;
}

export interface VehicleConsignmentInput {
  contactId: string | null;
  conversationId: string | null;
  catalogItemId: string | null;
  executiveUserId: string | null;
  executiveName: string;
  executivePhone: string;
  executiveEmail: string;
  issueDate: string;
  consignorName: string;
  consignorRut: string;
  consignorAddress: string;
  consignorCity: string;
  consignorPhone: string;
  consignorEmail: string;
  vehicleType: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleVersion: string;
  vehicleYear: number | null;
  vehicleColor: string;
  vehicleFuel: string;
  vehicleEngine: string;
  vehicleEngineNumber: string;
  vehicleChassisNumber: string;
  vehiclePlate: string;
  vehicleGrossWeightKg: number | null;
  vehicleMileageKm: number | null;
  keysReceived: number;
  keysAtBranch: number;
  documentsUpToDate: boolean;
  consignorCapacity: 'legal_owner' | 'authorized_representative';
  hasPowerOfAttorney: boolean;
  hasIdCopy: boolean;
  vehicleUse: string;
  hasLien: boolean;
  hasAnnotationsCertificate: boolean;
  hasAutofactReport: boolean;
  autofactPreparedBy: string;
  hasFines: boolean;
  hasPensionDebt: boolean;
  branchName: string;
  branchAddress: string;
  consignmentValue: number;
  cashPaymentTerms: string;
  financedPaymentTerms: string;
  internalNotes: string;
}

export interface PaymentCommitmentInput {
  contactId: string | null;
  conversationId: string | null;
  catalogItemId: string | null;
  executiveUserId: string | null;
  executiveName: string;
  executivePhone: string;
  executiveEmail: string;
  issueDate: string;
  providerName: string;
  providerRut: string;
  providerAddress: string;
  providerCommune: string;
  providerCity: string;
  providerRegion: string;
  providerPhone: string;
  providerEmail: string;
  vehicleType: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleColor: string;
  vehicleFuel: string;
  vehicleEngineNumber: string;
  vehicleChassisNumber: string;
  vehiclePlate: string;
  hasPensionDebt: boolean;
  branchName: string;
  branchAddress: string;
  takePrice: number;
  cashPaymentBusinessDays: number;
  financedPaymentBusinessDays: number;
  internalNotes: string;
}

export interface VehicleTransactionInput {
  contactId: string | null;
  conversationId: string | null;
  executiveUserId: string | null;
  executiveName: string;
  executivePhone: string;
  executiveEmail: string;
  issueDate: string;
  issuePlace: string;
  sellerName: string;
  sellerRut: string;
  sellerAddress: string;
  sellerCity: string;
  sellerPhone: string;
  sellerRepresentativeName: string;
  sellerRepresentativeRut: string;
  sellerRepresentativeAddress: string;
  sellerRepresentativeCity: string;
  sellerPowerDate: string;
  sellerPowerNotary: string;
  buyerName: string;
  buyerRut: string;
  buyerAddress: string;
  buyerCity: string;
  buyerPhone: string;
  buyerCivilStatus: string;
  secondBuyerName: string;
  secondBuyerRut: string;
  secondBuyerAddress: string;
  secondBuyerCity: string;
  buyerRepresentativeName: string;
  buyerRepresentativeRut: string;
  buyerRepresentativeAddress: string;
  buyerRepresentativeCity: string;
  buyerPowerDate: string;
  buyerPowerNotary: string;
  powerValidityDays: number;
  vehicleType: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehicleColor: string;
  vehicleFuel: string;
  vehicleEngineNumber: string;
  vehicleChassisNumber: string;
  vehicleSerialNumber: string;
  vehiclePlate: string;
  vehicleGrossWeightKg: number | null;
  totalPrice: number;
  cashAmount: number;
  financedAmount: number;
  reservationAmount: number;
  reservationPaymentMethod: string;
  reservationExpiresAt: string;
  reservationConditions: string;
  vehicleHasFines: boolean;
  sellerHasPensionDebt: boolean;
  buyerHasPensionDebt: boolean;
  amendmentAttorneyName: string;
  amendmentAttorneyRut: string;
  internalNotes: string;
}

export interface VehicleLegalVehicle {
  id: string;
  type: string;
  make: string;
  model: string;
  year: number | null;
  color: string;
  fuel: string;
  engineNumber: string;
  chassisNumber: string;
  serialNumber: string;
  plate: string;
  grossWeightKg: number | null;
  vin: string;
  entryDate: string;
}

export interface VehicleLegalInput {
  contactId: string | null;
  conversationId: string | null;
  executiveUserId: string | null;
  executiveName: string;
  executivePhone: string;
  executiveEmail: string;
  issueDate: string;
  issuePlace: string;
  declarantName: string;
  declarantRut: string;
  declarantAddress: string;
  declarantCity: string;
  declarantPhone: string;
  representativeName: string;
  representativeRut: string;
  representativeAddress: string;
  representativeCity: string;
  powerValidityMonths: number;
  vehicles: VehicleLegalVehicle[];
  internalNotes: string;
}

export type ContractTemplateKey =
  | 'vehicle_consignment_v1'
  | 'payment_commitment_v1'
  | 'vehicle_sale_direct_v1'
  | 'vehicle_sale_civil_union_v1'
  | 'vehicle_sale_company_v1'
  | 'vehicle_sale_seller_power_v1'
  | 'vehicle_sale_purchase_power_v1'
  | 'vehicle_reservation_v1'
  | 'vehicle_sale_power_v1'
  | 'vehicle_responsibility_declaration_v1';
export type ContractInput =
  | VehicleConsignmentInput
  | PaymentCommitmentInput
  | VehicleTransactionInput
  | VehicleLegalInput;

export interface ContractRecord {
  id: string;
  accountId: string;
  contractNumber: string;
  sequenceNumber: number;
  templateKey: ContractTemplateKey;
  templateVersion: number;
  status: ContractStatus;
  contactId: string | null;
  conversationId: string | null;
  catalogItemId: string | null;
  executiveUserId: string | null;
  consignorName: string;
  vehicleLabel: string;
  issueDate: string;
  input: ContractInput;
  currentVersion: number;
  generatedAt: string | null;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractCreatorOption {
  userId: string;
  name: string;
  email: string;
}

export interface CompanyContractSnapshot extends CompanyLegalProfile {
  displayName: string;
  logoUrl: string | null;
}

export interface VehicleConsignmentDocumentData {
  contract: ContractRecord;
  company: CompanyContractSnapshot;
  generatedAt: string;
}

export type ContractDocumentData = VehicleConsignmentDocumentData;
export type PaymentCommitmentDocumentData = ContractDocumentData;

export interface ContractVersion {
  id: string;
  contractId: string;
  versionNumber: number;
  snapshot: ContractDocumentData;
  generationStatus: 'pending' | 'ready' | 'failed';
  generationError: string | null;
  pdfStoragePath: string | null;
  createdAt: string;
}

export interface ContractEvent {
  id: string;
  eventType: 'created' | 'updated' | 'generated' | 'signed' | 'cancelled';
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: 'Borrador',
  generated: 'Generado',
  signed: 'Firmado',
  cancelled: 'Cancelado',
};

export const VEHICLE_CONSIGNMENT_TEMPLATE = {
  key: 'vehicle_consignment_v1' as const,
  version: 1,
  name: 'Recepción y consignación de vehículo',
  description:
    'Registra la recepción del vehículo, sus antecedentes, documentación y condiciones de consignación.',
  sourceHash:
    'c765f70de6e9d60cb5cdf0b0beffc6b66b17aa22eb5cf8c9ca8061585404da9c',
};

export const PAYMENT_COMMITMENT_TEMPLATE = {
  key: 'payment_commitment_v1' as const,
  version: 1,
  name: 'Compromiso de pago',
  description:
    'Formaliza los datos del proveedor, el vehículo, el valor acordado y los plazos de pago.',
  sourceHash:
    'c30ed99317050794fcfd70ce3b50b0bfa66f989f6d57440cd1fd3c9aa07e086f',
};

export const VEHICLE_TRANSACTION_TEMPLATES = [
  {
    key: 'vehicle_sale_direct_v1' as const,
    version: 1,
    name: 'Compraventa directa',
    shortName: 'Venta directa',
    description: 'Compraventa entre una persona vendedora y una compradora.',
    sourceHash:
      '6ef04c3fe818ba36cf019e8a3b14ce2763bc96fa552faf7ead6e40c8a8f53c46',
  },
  {
    key: 'vehicle_sale_civil_union_v1' as const,
    version: 1,
    name: 'Compraventa con dos compradores',
    shortName: 'Dos compradores / AUC',
    description: 'Registra dos compradores en una adquisición conjunta.',
    sourceHash:
      '94e3f2528782c1ef2c9c2fab8bb87e8cf605104472fed8dbf8ee49663b86335f',
  },
  {
    key: 'vehicle_sale_company_v1' as const,
    version: 1,
    name: 'Compraventa por empresa',
    shortName: 'Empresa vendedora',
    description: 'La empresa configurada en Nexora vende el vehículo.',
    sourceHash:
      'ac6a5705d03af6d9b323e68c87f765eba25ef60208066027005ef4941a861bf6',
  },
  {
    key: 'vehicle_sale_seller_power_v1' as const,
    version: 1,
    name: 'Compraventa con carta poder',
    shortName: 'Carta poder',
    description: 'Una persona representante comparece por la parte vendedora.',
    sourceHash:
      '2fb1db0a72c2b523aa03b0b069102cd787e77b6994a5dededfa8d2d4d2e80bb6',
  },
  {
    key: 'vehicle_sale_purchase_power_v1' as const,
    version: 1,
    name: 'Poder para compra y compraventa',
    shortName: 'Compra con poder',
    description: 'Genera el poder para comprar y la compraventa asociada.',
    sourceHash:
      'b4bc6448e3b1885dbb033015ef26ca060136c74637ea2e2cc056f3d1eca06fc7',
  },
  {
    key: 'vehicle_reservation_v1' as const,
    version: 1,
    name: 'Reserva de vehículo',
    shortName: 'Reserva',
    description: 'Formaliza una reserva, su garantía, vigencia y condiciones.',
    sourceHash:
      'ddd07f4de3ecda06de306c895cc15bd4b6fb992fe51c6ea82eda054e8186dabd',
  },
] satisfies ReadonlyArray<{
  key: ContractTemplateKey;
  version: number;
  name: string;
  shortName: string;
  description: string;
  sourceHash: string;
}>;

export type VehicleTransactionTemplateKey =
  (typeof VEHICLE_TRANSACTION_TEMPLATES)[number]['key'];

export const VEHICLE_LEGAL_TEMPLATES = [
  {
    key: 'vehicle_sale_power_v1' as const,
    version: 1,
    name: 'Poder especial de venta',
    shortName: 'Poder de venta',
    description:
      'Autoriza a una persona mandataria para vender, ceder y transferir un vehículo determinado.',
    sourceHash:
      '6667aee831c378b688dc48c29e89e98cd35533d6664a690038f7a4bd3ad73bdd',
  },
  {
    key: 'vehicle_responsibility_declaration_v1' as const,
    version: 1,
    name: 'Declaración de compromiso y responsabilidad',
    shortName: 'Declaración de responsabilidad',
    description:
      'Registra la responsabilidad de la parte vendedora por multas e infracciones anteriores a la venta.',
    sourceHash:
      '3af1f055b891b6acf2edcc5becdfbd21955af53b76ee94bd8e6bcd890c483ce1',
  },
] satisfies ReadonlyArray<{
  key: ContractTemplateKey;
  version: number;
  name: string;
  shortName: string;
  description: string;
  sourceHash: string;
}>;

export type VehicleLegalTemplateKey =
  (typeof VEHICLE_LEGAL_TEMPLATES)[number]['key'];
