import 'server-only';

const DEFAULT_RENDER_PORT = '3000';

export function internalRenderUrl(pathname: string): URL {
  const configured = process.env.DOCUMENT_RENDER_BASE_URL?.trim();
  const port = process.env.PORT?.trim() || DEFAULT_RENDER_PORT;
  const base = configured || `http://127.0.0.1:${port}`;

  let url: URL;
  try {
    url = new URL(pathname, `${base.replace(/\/+$/, '')}/`);
  } catch {
    throw new Error('document_render_base_url_invalid');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('document_render_base_url_invalid');
  }
  return url;
}
