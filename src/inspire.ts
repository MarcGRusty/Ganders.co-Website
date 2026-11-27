import type { Env } from './env';
import type { Attachment } from './llm';

/** What we could learn about a website's look from its HTML and CSS. */
export interface SiteSignals { url: string; ok: boolean; title?: string; description?: string; themeColor?: string; colors?: string[]; vars?: string[]; fonts?: string[]; radius?: string[]; note?: string; image?: Attachment }

const UA = 'Mozilla/5.0 (compatible; GandersStudio/1.0; design inspiration)';
const MAX_HTML = 1_500_000;
const MAX_CSS = 400_000;

async function fetchText(url: string, max: number): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/css,*/*' }, redirect: 'follow', cf: { cacheTtl: 3600 } } as RequestInit);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const t = await r.text();
  return t.slice(0, max);
}

function top(list: string[], n: number): string[] {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} (x${c})`);
}

const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)`, 'i'))?.[1] ||
  html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1];

/** Pulls colours, fonts and shapes from a public web page so AI can design from it. */
export async function readSite(raw: string): Promise<SiteSignals> {
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return { url: raw, ok: false, note: 'Not a valid web address' }; }
  if (!/^https?:$/.test(url.protocol)) return { url: raw, ok: false, note: 'Only http and https addresses work' };
  try {
    const html = await fetchText(url.href, MAX_HTML);
    const sheets = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
      .map((m) => m[0].match(/href=["']([^"']+)/i)?.[1])
      .filter((h): h is string => !!h)
      .map((h) => new URL(h, url).href);
    const googleFonts = sheets.filter((h) => h.includes('fonts.googleapis.com')).flatMap((h) => [...h.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' ')));
    const cssParts = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
    for (const h of sheets.filter((h) => !h.includes('fonts.googleapis.com')).slice(0, 4)) {
      try { cssParts.push(await fetchText(h, MAX_CSS)); } catch { /* skip blocked sheets */ }
    }
    const css = cssParts.join('\n') + '\n' + [...html.matchAll(/style=["']([^"']+)/gi)].map((m) => m[1]).join(';');
    const colors = [...css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)/gi)].map((m) => m[0].toLowerCase());
    const fonts = [...css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)].map((m) => m[1].split(',')[0].replace(/["']/g, '').trim()).filter((f) => f && !f.startsWith('var(') && !/^(inherit|initial|sans-serif|serif|monospace)$/i.test(f));
    const faces = [...css.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*["']?([^;"'}]+)/gi)].map((m) => m[1].trim());
    const vars = [...css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))/gi)].map((m) => `${m[1]}: ${m[2]}`);
    const radius = [...css.matchAll(/border-radius\s*:\s*([^;}{]+)/gi)].map((m) => m[1].trim());
    const sig: SiteSignals = {
      url: url.href, ok: true,
      title: html.match(/<title[^>]*>([^<]{0,160})/i)?.[1]?.trim(),
      description: meta(html, 'description')?.slice(0, 300),
      themeColor: meta(html, 'theme-color'),
      colors: top(colors, 16),
      vars: [...new Set(vars)].slice(0, 30),
      fonts: top([...googleFonts, ...faces, ...fonts], 8),
      radius: top(radius, 5),
    };
    // The sharing image is often the best single picture of a brand's look
    const og = meta(html, 'og:image');
    if (og) {
      try {
        const r = await fetch(new URL(og, url).href, { headers: { 'user-agent': UA } });
        const type = (r.headers.get('content-type') || '').split(';')[0];
        const buf = await r.arrayBuffer();
        if (r.ok && /^image\/(png|jpeg|gif|webp)$/.test(type) && buf.byteLength < 4_000_000) sig.image = { type, data: b64(buf), name: `${url.hostname} sharing image` };
      } catch { /* optional */ }
    }
    return sig;
  } catch (e: any) {
    return { url: url.href, ok: false, note: `Could not read the site (${String(e?.message || e)})` };
  }
}

export function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Loads uploaded inspiration files from R2 as attachments the AI can look at. */
export async function loadFiles(env: Env, keys: string[]): Promise<{ files: Attachment[]; skipped: string[] }> {
  const files: Attachment[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const key of keys.slice(0, 12)) {
    const obj = await env.MEDIA?.get(key);
    if (!obj) { skipped.push(`${key} (not found)`); continue; }
    const type = obj.httpMetadata?.contentType || '';
    if (!/^image\/(png|jpeg|gif|webp)$/.test(type) && type !== 'application/pdf') { skipped.push(`${key} (${type || 'unknown type'} is not an image or PDF)`); continue; }
    if (obj.size > 8_000_000 || total + obj.size > 24_000_000) { skipped.push(`${key} (too large)`); continue; }
    total += obj.size;
    files.push({ type, data: b64(await obj.arrayBuffer()), name: key.split('/').pop() });
  }
  return { files, skipped };
}
