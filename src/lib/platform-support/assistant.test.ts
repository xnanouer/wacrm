import { describe, expect, it } from 'vitest';

import { shouldForceEscalation } from './assistant';

describe('support escalation', () => {
  it('escalates human, security and repeated-problem requests', () => {
    expect(shouldForceEscalation('Quiero hablar con una persona', false)).toBe(
      true
    );
    expect(shouldForceEscalation('Tengo un problema de seguridad', false)).toBe(
      true
    );
    expect(shouldForceEscalation('sigue igual', true)).toBe(true);
  });
});
