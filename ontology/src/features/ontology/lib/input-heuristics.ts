// Heuristics to decide whether an AI-assistant input is really a "document"
// that should go through the parse (가져오기) flow instead of the incremental
// edit assistant. Keeps the heavy bulk-generation off the assist endpoint.

const BULK_CHAR_THRESHOLD = 600;

export function isBulkInput(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;

  // Long free-form text → treat as a document.
  if (t.length > BULK_CHAR_THRESHOLD) return true;

  const lines = t.split('\n').filter((l) => l.trim().length > 0);
  const pipeCount = (t.match(/\|/g) ?? []).length;

  // Markdown table (several pipe characters).
  if (pipeCount >= 6) return true;

  // Many lines that also look tabular/list-like.
  if (lines.length >= 8 && pipeCount >= 4) return true;

  return false;
}
