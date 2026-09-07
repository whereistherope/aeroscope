import { spawn } from 'node:child_process';

const children = [];

function start(label, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (code && code !== 0) console.error(`${label} exited with code ${code}${signal ? ` (${signal})` : ''}`);
  });
  return child;
}

start('base preview', process.execPath, ['preview-server.mjs'], { PORT: '8081' });
setTimeout(() => start('preview gateway', process.execPath, ['preview-router.mjs'], { PORT: '8080', AEROSCOPE_UPSTREAM_PORT: '8081' }), 300);

function shutdown() {
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 250);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
