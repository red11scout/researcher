// tests/calc.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateWithHyperFormula } from '../src/calc/engine';

describe('calculation engine', () => {
  it('computes cost benefit deterministically', () => {
    const inputs = {
      HoursSaved: 34000,
      LoadedHourlyRate: 150,
      CostRealization: 0.90,
      DataMaturity: 0.75
    };
    const formulas = {
      CostBenefit: '=HoursSaved*LoadedHourlyRate*CostRealization*DataMaturity'
    };
    const res = evaluateWithHyperFormula(inputs, formulas);
    expect(res.outputs.CostBenefit).toBeCloseTo(3442500, 5);
  });
});
