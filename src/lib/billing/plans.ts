import { CATALOG_ADDON, CATALOG_PLAN_LIMITS } from '@/lib/catalog/config';

export const EXTRA_USER_PRICE = 12_990;
export const EXTRA_CONNECTION_PRICE = 18_990;
export const FOLLOW_UP_AGENT_ADDON = {
  code: 'follow_up_agent',
  name: 'Agente de Seguimiento Pro',
  monthlyPrice: 29_990,
  includedPoints: 2_000,
} as const;
export const TRIAL_DAYS = 3;
export const POINT_PLAN_RECOMMENDATION_TOLERANCE = 0.05;

export const PLAN_CODES = ['starter', 'professional', 'enterprise'] as const;

export type CommercialPlanCode = (typeof PLAN_CODES)[number];

export const POINT_PACKAGE_IDS = [
  'points_1000',
  'points_5000',
  'points_15000',
  'points_40000',
] as const;

export type PointPackageId = (typeof POINT_PACKAGE_IDS)[number];

export interface PointPackage {
  id: PointPackageId;
  points: number;
  price: number;
  label: string;
  description: string;
  featured?: boolean;
}

export const POINT_PACKAGES: readonly PointPackage[] = [
  {
    id: 'points_1000',
    points: 1_000,
    price: 7_990,
    label: 'Recarga rápida',
    description:
      'Una recarga rápida para continuar utilizando las funciones de Inteligencia Artificial de Nexora.',
  },
  {
    id: 'points_5000',
    points: 5_000,
    price: 29_990,
    label: '5.000 Puntos',
    description: 'Capacidad adicional para períodos con mayor actividad.',
  },
  {
    id: 'points_15000',
    points: 15_000,
    price: 79_990,
    label: '15.000 Puntos',
    description:
      'Ideal para empresas que necesitan aumentar considerablemente su capacidad de Inteligencia Artificial.',
    featured: true,
  },
  {
    id: 'points_40000',
    points: 40_000,
    price: 199_990,
    label: '40.000 Puntos',
    description: 'Mayor capacidad para operaciones de alto volumen.',
  },
] as const;

export interface CommercialPlan {
  code: CommercialPlanCode;
  name: 'STARTER' | 'PRO' | 'BUSINESS';
  price: number;
  includedUsers: number;
  includedConnections: number;
  includedCatalogItems: number;
  nexoraPoints: number;
  description: string;
  benefits: readonly string[];
  recommended?: boolean;
}

export const COMMERCIAL_PLANS: readonly CommercialPlan[] = [
  {
    code: 'starter',
    name: 'STARTER',
    price: 79_990,
    includedUsers: 3,
    includedConnections: 1,
    includedCatalogItems: CATALOG_PLAN_LIMITS.starter,
    nexoraPoints: 3_500,
    description:
      'Ideal para pequeños negocios y equipos que quieren centralizar su atención y comenzar a automatizar sus conversaciones.',
    benefits: [
      'Bandeja de atención compartida',
      'WhatsApp, Instagram y Facebook',
      'Agente IA Nexora incluido',
    ],
  },
  {
    code: 'professional',
    name: 'PRO',
    price: 159_990,
    includedUsers: 10,
    includedConnections: 3,
    includedCatalogItems: CATALOG_PLAN_LIMITS.professional,
    nexoraPoints: 15_000,
    description:
      'Ideal para equipos comerciales, automotoras y empresas que atienden clientes desde múltiples canales.',
    benefits: [
      'Más capacidad para tu equipo',
      'Atención multicanal',
      'Agente IA Nexora incluido',
    ],
    recommended: true,
  },
  {
    code: 'enterprise',
    name: 'BUSINESS',
    price: 349_990,
    includedUsers: 25,
    includedConnections: 10,
    includedCatalogItems: CATALOG_PLAN_LIMITS.enterprise,
    nexoraPoints: 40_000,
    description:
      'Ideal para empresas con alto volumen de atención, múltiples equipos y una operación comercial más avanzada.',
    benefits: [
      'Operación de alto volumen',
      'Múltiples equipos y conexiones',
      'Agente IA Nexora incluido',
    ],
  },
] as const;

export interface PlanCalculation {
  plan: CommercialPlan;
  users: number;
  connections: number;
  extraUsers: number;
  extraConnections: number;
  catalogItems: number;
  extraCatalogBlocks: number;
  extraUsersTotal: number;
  extraConnectionsTotal: number;
  extraCatalogTotal: number;
  monthlyTotal: number;
}

export interface PlanRecommendation {
  current: PlanCalculation;
  recommended: PlanCalculation;
  monthlySavings: number;
}

export interface PointPackagePlanRecommendation {
  currentPlan: CommercialPlan;
  pointPackage: PointPackage;
  combinedPrice: number;
  recommendedPlan: CommercialPlan;
  priceDifference: number;
  recommendedPlanIsCheaper: boolean;
}

export function getCommercialPlan(code: string): CommercialPlan | null {
  return COMMERCIAL_PLANS.find((plan) => plan.code === code) ?? null;
}

export function getPointPackage(id: string): PointPackage | null {
  return POINT_PACKAGES.find((pointPackage) => pointPackage.id === id) ?? null;
}

export function pointPackagePricePerThousand(
  pointPackage: PointPackage
): number {
  return Math.round((pointPackage.price / pointPackage.points) * 1_000);
}

export function estimatePointBalance(
  currentBalance: number,
  pointPackage: PointPackage
): number {
  return Math.max(0, Math.floor(currentBalance)) + pointPackage.points;
}

export function recommendPlanForPointPackage(
  currentPlanCode: string,
  pointPackageId: PointPackageId
): PointPackagePlanRecommendation | null {
  const currentPlanIndex = COMMERCIAL_PLANS.findIndex(
    (plan) => plan.code === currentPlanCode
  );
  const pointPackage = getPointPackage(pointPackageId);
  if (
    currentPlanIndex < 0 ||
    currentPlanIndex === COMMERCIAL_PLANS.length - 1 ||
    !pointPackage
  ) {
    return null;
  }

  const currentPlan = COMMERCIAL_PLANS[currentPlanIndex];
  const combinedPrice = currentPlan.price + pointPackage.price;
  const maximumComparablePrice =
    combinedPrice * (1 + POINT_PLAN_RECOMMENDATION_TOLERANCE);

  const recommendedPlan = COMMERCIAL_PLANS.slice(currentPlanIndex + 1)
    .filter(
      (plan) =>
        plan.nexoraPoints >= pointPackage.points &&
        plan.price <= maximumComparablePrice
    )
    .sort((a, b) => a.price - b.price)[0];

  if (!recommendedPlan) return null;

  return {
    currentPlan,
    pointPackage,
    combinedPrice,
    recommendedPlan,
    priceDifference: Math.abs(recommendedPlan.price - combinedPrice),
    recommendedPlanIsCheaper: recommendedPlan.price < combinedPrice,
  };
}

export function calculatePlan(
  planCode: CommercialPlanCode,
  requestedUsers: number,
  requestedConnections: number,
  requestedCatalogItems = 0
): PlanCalculation {
  const plan = getCommercialPlan(planCode);
  if (!plan) throw new Error(`Unknown commercial plan: ${planCode}`);

  const users = Math.max(
    plan.includedUsers,
    Math.floor(Number.isFinite(requestedUsers) ? requestedUsers : 0)
  );
  const connections = Math.max(
    plan.includedConnections,
    Math.floor(Number.isFinite(requestedConnections) ? requestedConnections : 0)
  );
  const extraUsers = users - plan.includedUsers;
  const extraConnections = connections - plan.includedConnections;
  const requestedCatalogCapacity = Math.max(
    plan.includedCatalogItems,
    Math.floor(
      Number.isFinite(requestedCatalogItems) ? requestedCatalogItems : 0
    )
  );
  const extraCatalogBlocks = Math.ceil(
    (requestedCatalogCapacity - plan.includedCatalogItems) / CATALOG_ADDON.units
  );
  const catalogItems =
    plan.includedCatalogItems + extraCatalogBlocks * CATALOG_ADDON.units;
  const extraUsersTotal = extraUsers * EXTRA_USER_PRICE;
  const extraConnectionsTotal = extraConnections * EXTRA_CONNECTION_PRICE;
  const extraCatalogTotal = extraCatalogBlocks * CATALOG_ADDON.monthlyPrice;

  return {
    plan,
    users,
    connections,
    extraUsers,
    extraConnections,
    catalogItems,
    extraCatalogBlocks,
    extraUsersTotal,
    extraConnectionsTotal,
    extraCatalogTotal,
    monthlyTotal:
      plan.price + extraUsersTotal + extraConnectionsTotal + extraCatalogTotal,
  };
}

export function recommendHigherPlan(
  planCode: CommercialPlanCode,
  requestedUsers: number,
  requestedConnections: number,
  requestedCatalogItems = 0
): PlanRecommendation | null {
  const currentIndex = COMMERCIAL_PLANS.findIndex(
    (plan) => plan.code === planCode
  );
  if (currentIndex < 0 || currentIndex === COMMERCIAL_PLANS.length - 1) {
    return null;
  }

  const current = calculatePlan(
    planCode,
    requestedUsers,
    requestedConnections,
    requestedCatalogItems
  );
  const alternatives = COMMERCIAL_PLANS.slice(currentIndex + 1)
    .map((plan) =>
      calculatePlan(
        plan.code,
        requestedUsers,
        requestedConnections,
        requestedCatalogItems
      )
    )
    .filter((alternative) => alternative.monthlyTotal < current.monthlyTotal)
    .sort((a, b) => a.monthlyTotal - b.monthlyTotal);

  const recommended = alternatives[0];
  if (!recommended) return null;

  return {
    current,
    recommended,
    monthlySavings: current.monthlyTotal - recommended.monthlyTotal,
  };
}

export function formatClp(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('es-CL');
}
