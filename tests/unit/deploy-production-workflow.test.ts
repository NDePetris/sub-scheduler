import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/deploy-production.yml', import.meta.url),
  'utf8',
);

describe('production deployment health contract', () => {
  it('requires an exact deployment SHA and ready connected schema', () => {
    expect(workflow).toContain('body.data?.status !== "ok"');
    expect(workflow).toContain('body.data?.database !== "connected"');
    expect(workflow).toContain('body.data?.schema !== "ready"');
    expect(workflow).toContain('EXPECTED_DEPLOYMENT_VERSION');
    expect(workflow).toContain(
      '"$observed_version" = "$EXPECTED_DEPLOYMENT_VERSION"',
    );
  });

  it('does not apply D1 migrations from deployment automation', () => {
    expect(workflow).not.toContain('d1 migrations');
    expect(workflow).not.toContain('wrangler d1');
  });
});
