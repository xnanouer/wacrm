import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/agents/',
        '/automations/',
        '/billing/',
        '/broadcasts/',
        '/catalogo/',
        '/contacts/',
        '/dashboard/',
        '/flows/',
        '/forgot-password',
        '/inbox/',
        '/join/',
        '/login',
        '/notifications/',
        '/pipelines/',
        '/plans/',
        '/platform/',
        '/settings/',
        '/signup',
      ],
    },
  };
}
