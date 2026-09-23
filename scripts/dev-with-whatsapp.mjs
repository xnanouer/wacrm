import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    'Start this script through npm so npm_execpath is available.'
  );
}
const children = [
  spawn(process.execPath, [npmCli, 'run', 'dev:web'], { stdio: 'inherit' }),
  spawn(process.execPath, [npmCli, 'run', 'dev:next'], { stdio: 'inherit' }),
];

let shuttingDown = false;
function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown && code && code !== 0) stop(code);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
