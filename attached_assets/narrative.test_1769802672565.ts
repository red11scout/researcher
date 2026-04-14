// tests/narrative.test.ts
import { describe, it, expect } from 'vitest';
import { containsDigits } from '../src/lib/validators';

describe('narrative validator', () => {
  it('detects digits', () => {
    expect(containsDigits('Value is 100')).toBe(true);
    expect(containsDigits('Value is {{totals.totalAnnualValue}}')).toBe(false);
  });
});
