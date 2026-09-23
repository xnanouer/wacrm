import 'server-only';

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer';

declare global {
  var __nexoraContractBrowser: Promise<Browser> | undefined;
}

function executable(): string | undefined {
  const configured =
    process.env.CONTRACT_CHROME_PATH ||
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
        ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function browser(): Promise<Browser> {
  if (!globalThis.__nexoraContractBrowser) {
    const executablePath = executable();
    globalThis.__nexoraContractBrowser = puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
    globalThis.__nexoraContractBrowser.catch(() => {
      globalThis.__nexoraContractBrowser = undefined;
    });
  }
  return globalThis.__nexoraContractBrowser;
}

export async function renderContractPdf(source: {
  url: string;
  cookieHeader: string;
}): Promise<{ pdf: Buffer; sha256: string }> {
  const instance = await browser();
  const page = await instance.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    if (source.cookieHeader)
      await page.setExtraHTTPHeaders({ cookie: source.cookieHeader });
    const response = await page.goto(source.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    if (!response?.ok())
      throw new Error(`contract_render_page_${response?.status() ?? 'failed'}`);
    await page.waitForSelector('.contract-document', { timeout: 15_000 });
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
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const pdf = Buffer.from(bytes);
    return {
      pdf,
      sha256: createHash('sha256').update(pdf).digest('hex'),
    };
  } finally {
    await page.close();
  }
}
