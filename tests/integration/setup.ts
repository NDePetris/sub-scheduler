import { applyD1Migrations, env, type D1Migration } from 'cloudflare:test';
import { beforeAll } from 'vitest';

interface TestEnv {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
  TEST_SEED_QUERIES: string[];
}

beforeAll(async () => {
  const testEnv = env as unknown as TestEnv;
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.batch(
    testEnv.TEST_SEED_QUERIES.map((query) => testEnv.DB.prepare(query)),
  );
});
