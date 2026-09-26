import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const baseUrl = process.env.RESPONSIVE_BASE_URL ?? 'http://localhost:3000';
const widths = [320, 360, 375, 390, 414, 430, 768];
const routes = [
  '/',
  '/login',
  '/dashboard',
  '/inbox',
  '/pipelines',
  '/contacts',
  '/contacts/base',
  '/catalogo',
  '/quotes',
  '/settings',
  '/privacidad',
  '/eliminacion-de-datos',
];

const requestedExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
const windowsBrowsers = [
  join(
    process.env.PROGRAMFILES ?? 'C:\\Program Files',
    'Google',
    'Chrome',
    'Application',
    'chrome.exe'
  ),
  join(
    process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft',
    'Edge',
    'Application',
    'msedge.exe'
  ),
  join(
    process.env.PROGRAMFILES ?? 'C:\\Program Files',
    'BraveSoftware',
    'Brave-Browser',
    'Application',
    'brave.exe'
  ),
  join(
    homedir(),
    '.cache',
    'puppeteer',
    'chrome-headless-shell',
    'win64-146.0.7680.31',
    'chrome-headless-shell-win64',
    'chrome-headless-shell.exe'
  ),
];
const executablePath =
  requestedExecutable ??
  (process.platform === 'win32'
    ? windowsBrowsers.find((candidate) => existsSync(candidate))
    : undefined);

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: ['--disable-gpu', '--disable-gpu-compositing'],
});
const failures = [];
const navigationFailures = [];
const redirects = new Map();

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);

  for (const width of widths) {
    await page.setViewport({
      width,
      height: 844,
      deviceScaleFactor: 1,
      isMobile: width < 768,
      hasTouch: width < 768,
    });

    for (const route of routes) {
      console.error(`[responsive] ${width}px ${route}`);
      try {
        await page.goto(new URL(route, baseUrl).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
      } catch (error) {
        navigationFailures.push({
          width,
          route,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));

      let result;
      try {
        result = await page.evaluate(() => {
          const viewportWidth = document.documentElement.clientWidth;
          const overflow = [];
          for (const element of document.body.querySelectorAll('*')) {
            const style = getComputedStyle(element);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number(style.opacity) === 0 ||
              style.position === 'fixed'
            ) {
              continue;
            }
            const rect = element.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            if (rect.left < -1 || rect.right > viewportWidth + 1) {
              overflow.push({
                tag: element.tagName.toLowerCase(),
                className:
                  typeof element.className === 'string'
                    ? element.className.slice(0, 120)
                    : '',
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              });
            }
            if (overflow.length >= 5) break;
          }

          return {
            title: document.title,
            viewportWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            overflow,
          };
        });
      } catch (error) {
        navigationFailures.push({
          width,
          route,
          error: `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      const finalPath = new URL(page.url()).pathname;
      if (finalPath !== route) redirects.set(route, finalPath);
      if (
        result.documentWidth > result.viewportWidth + 1 ||
        result.bodyWidth > result.viewportWidth + 1
      ) {
        failures.push({ width, route, finalPath, ...result });
      }
    }
  }

  const manifestResponse = await fetch(
    new URL('/manifest.webmanifest', baseUrl)
  );
  const manifest = await manifestResponse.json();
  const iconChecks = [];
  for (const icon of manifest.icons ?? []) {
    const response = await fetch(new URL(icon.src, baseUrl));
    iconChecks.push({
      src: icon.src,
      sizes: icon.sizes,
      status: response.status,
      contentType: response.headers.get('content-type'),
    });
  }

  console.log(
    JSON.stringify(
      {
        widths,
        routes,
        redirects: Object.fromEntries(redirects),
        overflowFailures: failures,
        navigationFailures,
        manifest: {
          status: manifestResponse.status,
          display: manifest.display,
          iconChecks,
        },
      },
      null,
      2
    )
  );

  if (
    failures.length > 0 ||
    navigationFailures.length > 0 ||
    iconChecks.some((icon) => icon.status !== 200)
  ) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
