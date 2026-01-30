// src/calc/engine.ts
import { HyperFormula, Sheet, RawCellContent } from 'hyperformula';

export type NamedInputMap = Record<string, number>;

export type CalcOutput = {
  outputs: Record<string, number>;
  trace: {
    formulas: Record<string, string>;
    inputs: Record<string, number>;
    outputs: Record<string, number>;
  };
};

// Minimal deterministic workbook builder using named expressions.
// In production: use per-report sheets and a formula registry.
export function evaluateWithHyperFormula(inputs: NamedInputMap, formulas: Record<string, string>): CalcOutput {
  const hf = HyperFormula.buildEmpty({
    licenseKey: 'gpl-v3',
  });

  const sheetName = hf.addSheet('Model');
  const sheetId = hf.getSheetId(sheetName) as number;

  // Place inputs starting from A1, name them, and set values.
  let row = 0;
  const inputCellAddress: Record<string, { col: number; row: number }> = {};

  Object.entries(inputs).forEach(([key, value], idx) => {
    const col = 0; // column A
    const r = row + idx;
    hf.setCellContents({ sheet: sheetId, col, row: r }, value as RawCellContent);
    inputCellAddress[key] = { col, row: r };
    hf.addNamedExpression(key, `Model!$A$${r + 1}`);
  });

  // Put outputs in column B with formulas and name them.
  const formulasOut: Record<string, string> = {};
  const outputs: Record<string, number> = {};
  let outIdx = 0;

  Object.entries(formulas).forEach(([outKey, formula]) => {
    const col = 1; // column B
    const r = outIdx;
    hf.setCellContents({ sheet: sheetId, col, row: r }, formula as RawCellContent);
    hf.addNamedExpression(outKey, `Model!$B$${r + 1}`);
    formulasOut[outKey] = formula;
    outIdx += 1;
  });

  // Read outputs from cells directly since named expressions may have scope issues
  Object.entries(formulas).forEach(([outKey, _formula], idx) => {
    const cellValue = hf.getCellValue({ sheet: sheetId, col: 1, row: idx });
    outputs[outKey] = typeof cellValue === 'number' ? cellValue : (parseFloat(String(cellValue)) || 0);
  });

  return {
    outputs,
    trace: { formulas: formulasOut, inputs, outputs },
  };
}
