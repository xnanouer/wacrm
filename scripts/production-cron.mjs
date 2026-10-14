const baseUrl = (process.env.SCHEDULER_BASE_URL || 'http://web:3000').replace(
  /\/$/,
  ''
);
const secret =
  process.env.AUTOMATION_CRON_SECRET || process.env.CRON_SECRET || '';

if (!secret) {
  throw new Error(
    'Set AUTOMATION_CRON_SECRET or CRON_SECRET before starting the scheduler.'
  );
}

const jobs = [
  {
    name: 'automations',
    path: '/api/automations/cron',
    due: () => true,
  },
  {
    name: 'flows',
    path: '/api/flows/cron',
    due: (now) => now.getUTCMinutes() % 5 === 0,
  },
  {
    name: 'follow-up-agent',
    path: '/api/ai/follow-up/cron',
    due: () => true,
  },
  {
    name: 'quotation-retention',
    path: '/api/quotes/retention',
    due: (now) => now.getUTCHours() === 5 && now.getUTCMinutes() === 30,
  },
  {
    name: 'storage-monitor',
    path: '/api/platform/storage/monitor',
    due: (now) => now.getUTCHours() === 6 && now.getUTCMinutes() === 15,
  },
];

const activeJobs = new Set();
let lastMinute = null;
let interval = null;
let alignmentTimer = null;

async function run(job) {
  if (activeJobs.has(job.name)) {
    console.warn(`[scheduler] ${job.name} skipped because it is still running`);
    return;
  }

  activeJobs.add(job.name);
  try {
    const response = await fetch(`${baseUrl}${job.path}`, {
      headers: { 'x-cron-secret': secret },
      signal: AbortSignal.timeout(55_000),
    });
    const body = (await response.text()).slice(0, 500);
    const log = response.ok ? console.log : console.error;
    log(
      `[scheduler] ${job.name} completed with HTTP ${response.status}${body ? `: ${body}` : ''}`
    );
  } catch (error) {
    console.error(
      `[scheduler] ${job.name} failed:`,
      error instanceof Error ? error.message : error
    );
  } finally {
    activeJobs.delete(job.name);
  }
}

function tick() {
  const now = new Date();
  const minute = Math.floor(now.getTime() / 60_000);
  if (minute === lastMinute) return;
  lastMinute = minute;

  for (const job of jobs) {
    if (job.due(now)) void run(job);
  }
}

function start() {
  const waitForNextMinute = 60_000 - (Date.now() % 60_000) + 250;
  console.log(
    `[scheduler] ready; first tick in ${Math.ceil(waitForNextMinute / 1000)}s`
  );
  alignmentTimer = setTimeout(() => {
    tick();
    interval = setInterval(tick, 60_000);
  }, waitForNextMinute);
}

function shutdown() {
  if (alignmentTimer) clearTimeout(alignmentTimer);
  if (interval) clearInterval(interval);
  console.log('[scheduler] stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
