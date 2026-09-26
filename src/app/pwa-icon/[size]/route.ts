import { createElement } from 'react';
import { ImageResponse } from 'next/og';

const ALLOWED_SIZES = new Set([192, 512]);

export async function GET(
  request: Request,
  context: { params: Promise<{ size: string }> }
) {
  const params = await context.params;
  const requestedSize = Number(params.size);

  if (!ALLOWED_SIZES.has(requestedSize)) {
    return new Response('Icon size not found', { status: 404 });
  }

  const markUrl = new URL('/brand/nexora-transparent-mark.png', request.url);
  const markSize = Math.round(requestedSize * 0.72);

  return new ImageResponse(
    createElement(
      'div',
      {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Math.round(requestedSize * 0.2),
          background:
            'linear-gradient(145deg, rgb(21, 16, 42), rgb(10, 14, 28))',
        },
      },
      createElement('img', {
        src: markUrl.toString(),
        width: markSize,
        height: markSize,
        alt: '',
      })
    ),
    {
      width: requestedSize,
      height: requestedSize,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }
  );
}
