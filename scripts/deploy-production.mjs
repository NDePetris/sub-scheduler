import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = localCli('vite/bin/vite.js');
const wranglerCli = localCli('wrangler/bin/wrangler.js');

const requiredVariables = [
  'CLOUDFLARE_ACCESS_TEAM_DOMAIN',
  'CLOUDFLARE_ACCESS_AUD',
];
const dryRun = process.argv.slice(2).includes('--dry-run');
const accessVariables = requiredVariables.map((name) => {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('REPLACE_WITH_')) {
    throw new Error(
      `${name} is required. Set it in the environment before running npm run deploy:production.`,
    );
  }
  return [name, value];
});

await run(process.execPath, [viteCli, 'build'], {
  ...process.env,
  CLOUDFLARE_ENV: 'production',
});

const deployArguments = [
  'deploy',
  '--config',
  'dist/school_sub_planning/wrangler.json',
  '--keep-vars',
  ...accessVariables.flatMap(([name, value]) => ['--var', `${name}:${value}`]),
];
if (dryRun) deployArguments.push('--dry-run');

await run(process.execPath, [wranglerCli, ...deployArguments], process.env);

function run(command, arguments_, environment) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: environment,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${command} ${arguments_.join(' ')} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`,
        ),
      );
    });
  });
}

function localCli(relativePath) {
  return resolve(projectRoot, 'node_modules', relativePath);
}
