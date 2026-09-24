import type { Nodes } from 'mdast';

/** Comments are removed by the Markdown parser layer, not by text heuristics. */
export function textOf(node: Nodes): string {
  if (node.type === 'html' || node.type === 'code' || node.type === 'definition') return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  if ('children' in node) {
    const separator = ['paragraph', 'heading', 'emphasis', 'strong', 'link', 'delete', 'linkReference'].includes(node.type) ? '' : '\n';
    return node.children.map(textOf).join(separator);
  }
  return '';
}

export function ownText(text: string): string {
  return text
    .replace(/\.{3}\s*Ihr Text\s*\.{3}/giu, '')
    .replace(/(?:Erstes Arbeitspaket|Viertes AP)/giu, '')
    .replace(/(?:Heute habe ich|In dieser Lernperiode habe ich)\s*\.{3}/giu, '')
    .replace(/\.{3}|…/gu, '')
    .trim();
}

export function countWords(text: string): number {
  return ownText(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function isoDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function germanDate(value: string): string | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  return match ? isoDate(`${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`) : null;
}
