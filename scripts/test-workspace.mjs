import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const env = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'TERM']
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
Object.assign(env, {
  PATH: `${dirname(process.execPath)}:${env.PATH ?? ''}`,
  CI: 'true',
  VITE_PRODUCT_DATA_SOURCE: 'api',
  VITE_DEPLOYMENT_MODE: 'development',
  VITE_API_BASE_URL: 'http://127.0.0.1:4311',
});
async function run(command, args, limit = 180000) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    detached: true,
  });
  const terminate = () => {
    if (child.pid && child.exitCode === null)
      process.kill(-child.pid, 'SIGTERM');
  };
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  const timer = setTimeout(terminate, limit);
  try {
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code, signal) =>
        code === 0
          ? resolve()
          : reject(new Error(`${command} exited ${code ?? signal}`)),
      );
    });
  } finally {
    clearTimeout(timer);
    process.off('SIGTERM', terminate);
    process.off('SIGINT', terminate);
  }
}
if (!process.version.startsWith('v24.'))
  throw new Error('Workspace verification requires Node 24.');
for (const name of [
  'config',
  'domain',
  'schemas',
  'api-client',
  'sources',
  'database',
  'intelligence',
]) {
  await run(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '-p',
    `packages/${name}/tsconfig.build.json`,
  ]);
}
await run(process.execPath, [
  'apps/web/node_modules/vite/bin/vite.js',
  'build',
  'apps/web',
  '--config',
  'apps/web/vite.workspace.config.ts',
]);
await run(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'playwright.workspace.config.ts',
    ...process.argv.slice(2),
  ],
  300000,
);
