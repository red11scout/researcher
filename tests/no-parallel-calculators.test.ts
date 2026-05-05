import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, sep, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const SCAN_DIRS = ['server', 'src', 'client/src', 'shared'];

interface ParallelCalcMarker {
  name: string;
  pattern: RegExp;
  allowList: string[];
  guidance: string;
}

const MARKERS: ParallelCalcMarker[] = [
  {
    name: 'HyperFormula instance construction',
    pattern: /\bHyperFormula\.(?:buildEmpty|buildFromArray)\b/,
    allowList: ['src/calc/hyperformulaEngine.ts'],
    guidance:
      'There must be exactly one HyperFormula setup in the codebase: src/calc/hyperformulaEngine.ts. ' +
      'Task #25 deleted server/hyperformula-calc.ts because a parallel engine silently produced ' +
      'different numbers from the canonical one. If you genuinely need formula evaluation elsewhere, ' +
      'route it through src/calc/hyperformulaEngine.ts (or call server/calculation-postprocessor.ts) ' +
      'instead of building another HyperFormula instance.',
  },
  {
    name: 'Hardcoded riskReductionCapPct literal',
    pattern: /\briskReductionCapPct\s*[:=]\s*-?\d/,
    allowList: ['src/calc/formulas.ts'],
    guidance:
      'The 8% risk-reduction cap lives in DEFAULT_MULTIPLIERS in src/calc/formulas.ts. ' +
      'Read it from there (DEFAULT_MULTIPLIERS.riskReductionCapPct) instead of redefining the ' +
      'magic number. Task #25 / #35 removed parallel calculators precisely because they each ' +
      'shipped their own copy of this cap and they drifted out of sync.',
  },
  {
    name: 'calculatePriorityScore declaration',
    pattern:
      /^\s*(?:export\s+)?(?:async\s+)?function\s+calculatePriorityScore\b|^\s*(?:export\s+)?(?:const|let|var)\s+calculatePriorityScore\s*[:=]/,
    allowList: ['src/calc/formulas.ts'],
    guidance:
      'The canonical 5-criterion priority calculator is exported from src/calc/formulas.ts. ' +
      'Task #35 deleted src/calc/engine.ts and client/src/lib/calculationEngine.ts because they ' +
      'each redefined this function with a different weighting. Import calculatePriorityScore ' +
      'from src/calc/formulas.ts (or call it via server/calculation-postprocessor.ts) instead ' +
      'of declaring a parallel one.',
  },
];

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function toRelative(absPath: string): string {
  return relative(ROOT, absPath).split(sep).join('/');
}

function collectScannedFiles(): string[] {
  const all: string[] = [];
  for (const dir of SCAN_DIRS) {
    walk(join(ROOT, dir), all);
  }
  return all.map(toRelative).sort();
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

function findHits(files: string[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const contents = readFileSync(join(ROOT, file), 'utf8');
    const lines = contents.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        hits.push({ file, line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

describe('no parallel calculation engines (regression guard)', () => {
  const scannedFiles = collectScannedFiles();

  it('actually scans the production source trees', () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(scannedFiles).toContain('src/calc/hyperformulaEngine.ts');
    expect(scannedFiles).toContain('src/calc/formulas.ts');
    expect(scannedFiles).toContain('server/calculation-postprocessor.ts');
  });

  for (const marker of MARKERS) {
    describe(marker.name, () => {
      it('canonical allow-listed files still own this marker', () => {
        for (const allowed of marker.allowList) {
          expect(
            scannedFiles,
            `Allow-listed file ${allowed} is not in the scanned tree. ` +
              `Update tests/no-parallel-calculators.test.ts if the canonical file moved.`,
          ).toContain(allowed);

          const hits = findHits([allowed], marker.pattern);
          expect(
            hits.length,
            `Allow-listed file ${allowed} no longer contains the canonical marker for ` +
              `"${marker.name}". Either the canonical implementation moved (update the ` +
              `allow-list in tests/no-parallel-calculators.test.ts) or it was deleted ` +
              `(restore it — see ${marker.guidance}).`,
          ).toBeGreaterThan(0);
        }
      });

      it('no non-allow-listed file reintroduces this marker', () => {
        const candidates = scannedFiles.filter(
          (f) => !marker.allowList.includes(f),
        );
        const offenders = findHits(candidates, marker.pattern);

        if (offenders.length > 0) {
          const detail = offenders
            .map((o) => `  ${o.file}:${o.line}  ${o.text}`)
            .join('\n');
          throw new Error(
            `Parallel calculator marker reintroduced: ${marker.name}\n\n` +
              `${marker.guidance}\n\n` +
              `Offending location(s):\n${detail}\n\n` +
              `If this addition is intentional, add the file to the allow-list ` +
              `in tests/no-parallel-calculators.test.ts — but please prefer ` +
              `consolidating into the canonical engine.`,
          );
        }

        expect(offenders).toEqual([]);
      });
    });
  }
});
