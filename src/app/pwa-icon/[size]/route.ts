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

  return Response.redirect(
    new URL(`/pwa/nexora-neon-icon-${requestedSize}.png`, request.url),
    307
  );
}
