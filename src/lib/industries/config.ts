export const ACTIVE_INDUSTRIES = [
  'automotive',
  'real_estate_construction',
] as const;

export type ActiveIndustry = (typeof ACTIVE_INDUSTRIES)[number];
export type IndustryId =
  | ActiveIndustry
  | 'restaurant'
  | 'healthcare'
  | 'retail'
  | 'hospitality'
  | 'services'
  | 'professional_services';

export type BusinessSubtype =
  | 'construction_company'
  | 'real_estate_agency'
  | 'construction_and_real_estate';

export type OnboardingAnswer = string | string[];
export type OnboardingAnswers = Record<string, OnboardingAnswer>;

export interface IndustryOption {
  value: string;
  label: string;
}

export interface IndustryQuestion {
  id: string;
  title: string;
  type: 'single' | 'multiple';
  options: readonly IndustryOption[];
  required: true;
  group: 'business' | 'operation';
}

export interface IndustryConfig {
  id: IndustryId;
  label: string;
  shortLabel: string;
  description: string;
  icon:
    | 'car'
    | 'building'
    | 'utensils'
    | 'health'
    | 'store'
    | 'hotel'
    | 'tools'
    | 'briefcase';
  enabled: boolean;
  questions: readonly IndustryQuestion[];
}

const channels = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'website', label: 'Sitio web' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'google', label: 'Google' },
  { value: 'calls', label: 'Llamadas' },
  { value: 'in_person', label: 'Presencial' },
  { value: 'other', label: 'Otros' },
] as const;

const teamSizes = [
  { value: 'solo', label: 'Solo yo' },
  { value: '2_5', label: '2–5' },
  { value: '6_10', label: '6–10' },
  { value: '11_25', label: '11–25' },
  { value: '26_plus', label: 'Más de 25' },
] as const;

export const INDUSTRY_CONFIGS: readonly IndustryConfig[] = [
  {
    id: 'automotive',
    label: 'Automotora / Concesionario',
    shortLabel: 'Automotora',
    description:
      'Venta de vehículos, financiamiento, cotizaciones, seguimiento de leads y gestión comercial.',
    icon: 'car',
    enabled: true,
    questions: [
      {
        id: 'vehicle_types',
        title: '¿Qué tipo de vehículos comercializan?',
        type: 'single',
        required: true,
        group: 'business',
        options: [
          { value: 'new', label: 'Nuevos' },
          { value: 'used', label: 'Usados' },
          { value: 'new_and_used', label: 'Nuevos y usados' },
        ],
      },
      {
        id: 'offers_financing',
        title: '¿Ofrecen financiamiento?',
        type: 'single',
        required: true,
        group: 'business',
        options: [
          { value: 'yes', label: 'Sí' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'lead_channels',
        title: '¿Cómo llegan principalmente sus clientes?',
        type: 'multiple',
        required: true,
        group: 'operation',
        options: channels,
      },
      {
        id: 'team_size',
        title: '¿Cuántas personas atenderán clientes en Nexora?',
        type: 'single',
        required: true,
        group: 'operation',
        options: teamSizes,
      },
      {
        id: 'goals',
        title: '¿Qué quieres que Nexora te ayude a hacer?',
        type: 'multiple',
        required: true,
        group: 'operation',
        options: [
          { value: 'answer_questions', label: 'Responder consultas' },
          { value: 'organize_leads', label: 'Captar y organizar leads' },
          { value: 'qualify_clients', label: 'Perfilar clientes' },
          { value: 'manage_financing', label: 'Gestionar financiamiento' },
          { value: 'create_quotes', label: 'Crear cotizaciones' },
          { value: 'schedule_visits', label: 'Agendar visitas' },
          { value: 'follow_up', label: 'Hacer seguimiento' },
          { value: 'assign_agents', label: 'Derivar clientes a ejecutivos' },
          { value: 'ai_attention', label: 'Automatizar atención con IA' },
        ],
      },
    ],
  },
  {
    id: 'real_estate_construction',
    label: 'Construcción e Inmobiliario',
    shortLabel: 'Construcción e Inmobiliario',
    description:
      'Gestión de interesados, proyectos, propiedades, visitas y seguimiento comercial.',
    icon: 'building',
    enabled: true,
    questions: [
      {
        id: 'business_subtype',
        title: '¿Qué describe mejor a tu empresa?',
        type: 'single',
        required: true,
        group: 'business',
        options: [
          { value: 'construction_company', label: 'Constructora' },
          { value: 'real_estate_agency', label: 'Inmobiliaria' },
          {
            value: 'construction_and_real_estate',
            label: 'Constructora e inmobiliaria',
          },
        ],
      },
      {
        id: 'property_types',
        title: '¿Qué comercializan principalmente?',
        type: 'multiple',
        required: true,
        group: 'business',
        options: [
          { value: 'houses', label: 'Casas' },
          { value: 'apartments', label: 'Departamentos' },
          { value: 'land', label: 'Terrenos' },
          { value: 'plots', label: 'Parcelas' },
          { value: 'offices', label: 'Oficinas' },
          { value: 'commercial_spaces', label: 'Locales comerciales' },
          { value: 'projects', label: 'Proyectos inmobiliarios' },
          { value: 'other', label: 'Otros' },
        ],
      },
      {
        id: 'financing',
        title: '¿Trabajan con financiamiento?',
        type: 'single',
        required: true,
        group: 'business',
        options: [
          { value: 'yes', label: 'Sí' },
          { value: 'no', label: 'No' },
          { value: 'depends', label: 'Depende del proyecto' },
        ],
      },
      {
        id: 'visits_enabled',
        title: '¿Los clientes pueden agendar visitas?',
        type: 'single',
        required: true,
        group: 'operation',
        options: [
          { value: 'yes', label: 'Sí' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'lead_channels',
        title: '¿Cómo llegan principalmente sus clientes?',
        type: 'multiple',
        required: true,
        group: 'operation',
        options: [
          ...channels.slice(0, 6),
          { value: 'property_portals', label: 'Portales inmobiliarios' },
          ...channels.slice(6),
        ],
      },
      {
        id: 'team_size',
        title: '¿Cuántas personas atenderán clientes en Nexora?',
        type: 'single',
        required: true,
        group: 'operation',
        options: teamSizes,
      },
      {
        id: 'goals',
        title: '¿Qué quieres que Nexora te ayude a hacer?',
        type: 'multiple',
        required: true,
        group: 'operation',
        options: [
          { value: 'answer_questions', label: 'Responder consultas' },
          { value: 'capture_leads', label: 'Captar leads' },
          { value: 'qualify_clients', label: 'Perfilar interesados' },
          { value: 'show_inventory', label: 'Mostrar proyectos o propiedades' },
          { value: 'schedule_visits', label: 'Agendar visitas' },
          { value: 'create_quotes', label: 'Crear cotizaciones' },
          { value: 'follow_up', label: 'Hacer seguimiento' },
          { value: 'assign_agents', label: 'Derivar a ejecutivos' },
          { value: 'ai_attention', label: 'Automatizar atención con IA' },
        ],
      },
    ],
  },
  {
    id: 'restaurant',
    label: 'Restaurantes',
    shortLabel: 'Restaurantes',
    description: 'Reservas, pedidos y atención de clientes.',
    icon: 'utensils',
    enabled: false,
    questions: [],
  },
  {
    id: 'healthcare',
    label: 'Salud',
    shortLabel: 'Salud',
    description: 'Atención, horas y seguimiento de pacientes.',
    icon: 'health',
    enabled: false,
    questions: [],
  },
  {
    id: 'retail',
    label: 'Retail / Comercio',
    shortLabel: 'Retail',
    description: 'Ventas, consultas y seguimiento comercial.',
    icon: 'store',
    enabled: false,
    questions: [],
  },
  {
    id: 'hospitality',
    label: 'Hoteles y turismo',
    shortLabel: 'Turismo',
    description: 'Reservas, consultas y experiencia del huésped.',
    icon: 'hotel',
    enabled: false,
    questions: [],
  },
  {
    id: 'services',
    label: 'Servicios',
    shortLabel: 'Servicios',
    description: 'Solicitudes, agenda y atención comercial.',
    icon: 'tools',
    enabled: false,
    questions: [],
  },
  {
    id: 'professional_services',
    label: 'Servicios profesionales',
    shortLabel: 'Servicios profesionales',
    description: 'Prospectos, asesorías y seguimiento.',
    icon: 'briefcase',
    enabled: false,
    questions: [],
  },
] as const;

export function isActiveIndustry(value: unknown): value is ActiveIndustry {
  return (
    typeof value === 'string' &&
    (ACTIVE_INDUSTRIES as readonly string[]).includes(value)
  );
}

export function getIndustryConfig(industry: ActiveIndustry) {
  return INDUSTRY_CONFIGS.find((item) => item.id === industry)!;
}

export function sanitizeOnboardingAnswers(
  industry: ActiveIndustry,
  raw: unknown
): OnboardingAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const result: OnboardingAnswers = {};
  for (const question of getIndustryConfig(industry).questions) {
    const allowed = new Set(question.options.map((option) => option.value));
    const value = input[question.id];
    if (question.type === 'multiple') {
      if (Array.isArray(value)) {
        const clean = [
          ...new Set(
            value.filter(
              (item): item is string =>
                typeof item === 'string' && allowed.has(item)
            )
          ),
        ];
        if (clean.length) result[question.id] = clean;
      }
    } else if (typeof value === 'string' && allowed.has(value)) {
      result[question.id] = value;
    }
  }
  return result;
}

export function validateOnboardingAnswers(
  industry: ActiveIndustry,
  answers: OnboardingAnswers
): { valid: boolean; missing: string[] } {
  const missing = getIndustryConfig(industry)
    .questions.filter((question) => {
      const answer = answers[question.id];
      return question.type === 'multiple'
        ? !Array.isArray(answer) || answer.length === 0
        : typeof answer !== 'string' || answer.length === 0;
    })
    .map((question) => question.id);
  return { valid: missing.length === 0, missing };
}

export function industryLabel(industry: ActiveIndustry | null | undefined) {
  return industry ? getIndustryConfig(industry).label : 'Sin configurar';
}
