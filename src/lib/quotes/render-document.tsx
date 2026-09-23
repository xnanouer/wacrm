import 'server-only';

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';

declare global {
  var __nexoraQuotationBrowser: Promise<Browser> | undefined;
}

function chromeExecutable(): string | undefined {
  const configured =
    process.env.QUOTATION_CHROME_PATH ||
    process.env.WHATSAPP_WEB_CHROME_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH;
  if (configured && existsSync(configured)) return configured;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          process.env.LOCALAPPDATA
            ? path.join(
                process.env.LOCALAPPDATA,
                'Google',
                'Chrome',
                'Application',
                'chrome.exe'
              )
            : '',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function browser(): Promise<Browser> {
  if (!globalThis.__nexoraQuotationBrowser) {
    const executablePath = chromeExecutable();
    globalThis.__nexoraQuotationBrowser = puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    globalThis.__nexoraQuotationBrowser.catch(() => {
      globalThis.__nexoraQuotationBrowser = undefined;
    });
  }
  return globalThis.__nexoraQuotationBrowser;
}

export interface RenderedQuotationArtifacts {
  pdf: Buffer;
  png: Buffer;
  pdfSha256: string;
  pngSha256: string;
}

export interface QuotationRenderSource {
  url: string;
  cookieHeader: string;
}

export async function renderQuotationArtifacts(
  source: QuotationRenderSource
): Promise<RenderedQuotationArtifacts> {
  const instance = await browser();
  const page = await instance.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    if (source.cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: source.cookieHeader });
    }
    const response = await page.goto(source.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!response?.ok()) {
      throw new Error(
        `quotation_render_page_${response?.status() ?? 'failed'}`
      );
    }
    await page.waitForSelector('.quote-document', { timeout: 15_000 });
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(document.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), {
                  once: true,
                });
              })
        )
      );
      await document.fonts.ready;
    });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const documentElement = await page.$('.quote-document');
    if (!documentElement) throw new Error('quotation_document_missing');
    const pngBytes = await documentElement.screenshot({ type: 'png' });
    const pdf = Buffer.from(pdfBytes);
    const png = Buffer.from(pngBytes);
    return {
      pdf,
      png,
      pdfSha256: createHash('sha256').update(pdf).digest('hex'),
      pngSha256: createHash('sha256').update(png).digest('hex'),
    };
  } finally {
    await page.close();
  }
}
