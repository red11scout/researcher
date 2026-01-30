// tests/narrative.test.ts
import { describe, it, expect } from 'vitest';
import { containsDigits, assertNoDigits } from '../src/lib/validators';
import { renderPlaceholders } from '../server/assumptions';

describe('narrative validator', () => {
  it('detects digits in text', () => {
    expect(containsDigits('Value is 100')).toBe(true);
    expect(containsDigits('Value is $5M')).toBe(true);
    expect(containsDigits('Value is {totals.totalAnnualValue}')).toBe(false);
    expect(containsDigits('The company should invest in AI initiatives.')).toBe(false);
  });

  it('throws error when narrative contains digits', () => {
    expect(() => assertNoDigits('Total value: $5M')).toThrow('Narrative contains digits');
    expect(() => assertNoDigits('Total value: {totalValue}')).not.toThrow();
  });
});

describe('placeholder rendering', () => {
  it('replaces placeholders with values', () => {
    const template = 'Total value opportunity: {totalAnnualValue}';
    const values = { totalAnnualValue: 7786125 };
    const result = renderPlaceholders(template, values);
    expect(result).toBe('Total value opportunity: $7.8M');
  });

  it('handles multiple placeholders', () => {
    const template = '{companyName} should invest {totalAnnualValue} in {initiativeCount} initiatives.';
    const values = { 
      companyName: 'OneTrust',
      totalAnnualValue: 44800000,
      initiativeCount: '10'
    };
    const result = renderPlaceholders(template, values);
    expect(result).toBe('OneTrust should invest $44.8M in 10 initiatives.');
  });
});
