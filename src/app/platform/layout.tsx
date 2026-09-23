import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Administracion de plataforma | Nexora',
  robots: { index: false, follow: false, nocache: true },
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
