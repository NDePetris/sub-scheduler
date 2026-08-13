import path from 'node:path';

import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const projectRoot = import.meta.dirname;
      const seedFiles = await readD1Migrations(path.join(projectRoot, 'seed'));
      return {
        wrangler: { configPath: path.join(projectRoot, 'wrangler.jsonc') },
        miniflare: {
          bindings: {
            APP_ENV: 'test',
            DEV_USER_EMAIL: 'admin@sub-planning.test',
            TEST_MIGRATIONS: await readD1Migrations(
              path.join(projectRoot, 'migrations'),
            ),
            TEST_SEED_QUERIES: seedFiles.flatMap((file) => file.queries),
          },
        },
      };
    }),
  ],
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
  },
});
