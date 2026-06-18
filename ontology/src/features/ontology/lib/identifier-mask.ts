// Mask in-house identifiers before they leave the building via a web search (A-4
// security guard). PSK part numbers (KC…), equipment unit names (…호기), and
// generic internal alphanumeric codes must never appear in an external query.
// Only domain-neutral terms should be sent to the web.

interface MaskPattern {
  re: RegExp;
  label: string;
}

const PATTERNS: MaskPattern[] = [
  // Part numbers: KC followed by digits (e.g. KC0330655).
  { re: /\bKC\d{3,}\b/gi, label: '[부품번호]' },
  // Equipment unit names: digits + 호기 (e.g. 1호기, 12 호기).
  { re: /\d+\s*호기/g, label: '[호기]' },
  // Generic internal codes: 2+ letters followed by 4+ digits (e.g. AB12345).
  { re: /\b[A-Za-z]{2,}\d{4,}\b/g, label: '[코드]' },
];

export function hasMaskableIdentifiers(text: string): boolean {
  return PATTERNS.some((p) => {
    p.re.lastIndex = 0;
    return p.re.test(text);
  });
}

export function maskIdentifiers(text: string): string {
  let out = text;
  for (const p of PATTERNS) {
    out = out.replace(p.re, p.label);
  }
  return out;
}
