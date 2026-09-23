import type { Metadata } from 'next';

import { LandingPage } from '@/components/marketing/landing-page';

export const metadata: Metadata = {
  title: 'Nexora | CRM, comunicación e Inteligencia Artificial',
  description:
    'Centraliza tus conversaciones, organiza tus clientes y automatiza tu operación comercial con Nexora.',
  keywords: [
    'Nexora',
    'CRM',
    'WhatsApp',
    'Instagram',
    'Facebook',
    'automatizaciones',
    'Inteligencia Artificial',
    'atención al cliente',
    'ventas',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'Nexora CRM',
    title: 'Nexora | CRM, comunicación e Inteligencia Artificial',
    description:
      'Centraliza tus conversaciones, organiza tus clientes y automatiza tu operación comercial con Nexora.',
  },
  twitter: {
    card: 'summary',
    title: 'Nexora | CRM, comunicación e Inteligencia Artificial',
    description:
      'Centraliza tus conversaciones, organiza tus clientes y automatiza tu operación comercial con Nexora.',
  },
};

export default function HomePage() {
  return <LandingPage />;
}
