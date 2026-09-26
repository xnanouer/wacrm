import type { CatalogStatus } from './config';

export interface CatalogVehicleImage {
  id: string;
  url: string | null;
  altText: string;
  byteSize: number;
  sortOrder: number;
  isPrimary: boolean;
}

export interface CatalogVehicle {
  id: string;
  internalCode: string;
  licensePlate: string;
  licensePlateVisible: boolean;
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
  minimumDownPayment: number | null;
  financingText: string;
  description: string;
  location: string;
  status: CatalogStatus;
  createdBy: string;
  createdByCurrentUser: boolean;
  updatedAt: string;
  imageCount: number;
  photoTone: string;
  photoUrl?: string | null;
  images?: CatalogVehicleImage[];
}

export interface CatalogUsage {
  used: number;
  limit: number;
  remaining: number;
  planName: string;
  extraUnits: number;
}

export interface CatalogVehicleInput {
  internalCode: string;
  licensePlate: string;
  licensePlateVisible: boolean;
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
  minimumDownPayment: number | null;
  financingText: string;
  description: string;
  location: string;
}
