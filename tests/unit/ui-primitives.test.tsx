// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from '../../src/components/ui/badge';
import { Button } from '../../src/components/ui/button';

afterEach(cleanup);

describe('shared UI primitives', () => {
  it('uses the accessible dark brand surface for primary buttons', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('bg-brand-dark');
    expect(button.className).toContain('focus-visible:ring-offset-2');
    expect(button.className).toContain('disabled:cursor-not-allowed');
  });

  it('provides consistent semantic badge variants', () => {
    render(
      <>
        <Badge variant="success">Assigned</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="danger">Unresolved</Badge>
      </>,
    );

    expect(screen.getByText('Assigned').className).toContain('text-brand-dark');
    expect(screen.getByText('Warning').className).toContain(
      'text-warning-dark',
    );
    expect(screen.getByText('Unresolved').className).toContain(
      'text-danger-dark',
    );
  });
});
