// src/lib/validators.ts
export function containsDigits(text: string): boolean {
  return /\d/.test(text);
}

export function assertNoDigits(text: string) {
  if (containsDigits(text)) {
    throw new Error('Narrative contains digits. Use placeholders only.');
  }
}
