import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexora CRM',
    short_name: 'Nexora',
    description:
      'Centro de operaciones omnicanal para equipos de atención y ventas.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0b0b14',
    theme_color: '#7c3aed',
    icons: [
      {
        src: '/pwa/nexora-app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/nexora-app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
