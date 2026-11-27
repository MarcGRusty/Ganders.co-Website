/**
 * House rule: no em dashes anywhere on the site. This runs on every save,
 * every AI response, and again at render time as a safety net.
 */
export function noEmDash(input: string): string {
  if (!input) return input;
  return input
    .replace(/\s*—\s*/g, ', ')     // em dash
    .replace(/\s+–\s+/g, ', ')     // spaced en dash used as a dash
    .replace(/&mdash;/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*([.!?])/g, '$1');
}

export function deepNoEmDash<T>(v: T): T {
  if (typeof v === 'string') return noEmDash(v) as T;
  if (Array.isArray(v)) return v.map(deepNoEmDash) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = deepNoEmDash(val);
    return out as T;
  }
  return v;
}

export function slugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function excerptFrom(html: string, n = 180): string {
  const t = stripTags(html);
  if (t.length <= n) return t;
  return t.slice(0, n).replace(/\s+\S*$/, '') + '...';
}

export function safeUrl(u: string): string {
  const s = (u || '').trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s;
  return '#';
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pull the first JSON object or array out of an LLM response. */
export function extractJson<T = unknown>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const start = body.search(/[\[{]/);
  if (start < 0) throw new Error('No JSON found in model response');
  const open = body[start];
  const close = open === '[' ? ']' : '}';
  const end = body.lastIndexOf(close);
  return JSON.parse(body.slice(start, end + 1)) as T;
}

/** Light sanitising for AI generated SVG (logos, favicons). */
export function cleanSvg(svg: string): string {
  const m = svg.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) throw new Error('Model did not return an SVG');
  return m[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '');
}
