import type { Env } from './env';

export interface Focal { x: number; y: number; source: string }

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Reads width and height from PNG, JPEG, GIF and WebP headers without decoding the image. */
export function imageSize(buf: ArrayBuffer): { w: number; h: number } | null {
  const b = new Uint8Array(buf);
  const dv = new DataView(buf);
  if (b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };
  if (b[0] === 0x47 && b[1] === 0x49) return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  if (b[0] === 0x52 && b[8] === 0x57 && b[9] === 0x45) {
    const fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fmt === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (fmt === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
    if (fmt === 'VP8L') { const v = dv.getUint32(21, true); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const len = dv.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Finds where the subject is with Cloudflare Workers AI object detection.
 * A person gets the focal point on their face (the top part of the body box);
 * anything else gets the centre of the most prominent object.
 */
export async function detectFocal(env: Env, data: ArrayBuffer, size: { w: number; h: number } | null): Promise<Focal | null> {
  if (!env.AI || !size?.w || !size?.h) return null;
  try {
    const out = (await env.AI.run('@cf/facebook/detr-resnet-50' as any, { image: [...new Uint8Array(data)] })) as any;
    const items: any[] = (Array.isArray(out) ? out : out?.result || []).filter((d: any) => d?.box && d.score >= 0.6);
    if (!items.length) return null;
    const area = (d: any) => (d.box.xmax - d.box.xmin) * (d.box.ymax - d.box.ymin);
    const people = items.filter((d) => d.label === 'person').sort((a, b) => area(b) - area(a));
    if (people.length) {
      // Frame the biggest face, and pull towards others if a few people share the shot
      const main = people[0].box;
      const group = people.filter((p) => area(p) > area(people[0]) * 0.35).map((p) => p.box);
      const cx = group.reduce((s, b) => s + (b.xmin + b.xmax) / 2, 0) / group.length;
      const faceY = main.ymin + (main.ymax - main.ymin) * 0.16;
      return { x: clamp(cx / size.w), y: clamp(faceY / size.h), source: 'auto-person' };
    }
    const top = items.sort((a, b) => area(b) * b.score - area(a) * a.score)[0].box;
    return { x: clamp((top.xmin + top.xmax) / 2 / size.w), y: clamp((top.ymin + top.ymax) / 2 / size.h), source: 'auto-object' };
  } catch (e) {
    console.error('focal detection failed', e);
    return null;
  }
}

/** Adds object-position to every <img src="/media/..."> that has a focal point, so crops stay on the subject. */
export async function withFocal(env: Env, res: Response): Promise<Response> {
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  let map: Map<string, string>;
  try {
    const rows = (await env.DB.prepare('SELECT key, focal_x, focal_y FROM media WHERE focal_x IS NOT NULL').all<{ key: string; focal_x: number; focal_y: number }>()).results;
    if (!rows.length) return res;
    map = new Map(rows.map((r) => [r.key, `${(r.focal_x * 100).toFixed(1)}% ${(r.focal_y * 100).toFixed(1)}%`]));
  } catch { return res; }
  return new HTMLRewriter()
    .on('img', {
      element(el) {
        const src = el.getAttribute('src') || '';
        const m = src.match(/^(?:https?:\/\/[^/]+)?\/media\/([^?#]+)/);
        const pos = m && map.get(decodeURIComponent(m[1]));
        if (!pos) return;
        const style = el.getAttribute('style');
        el.setAttribute('style', `${style ? style.replace(/;?\s*$/, ';') : ''}object-position:${pos}`);
      },
    })
    .transform(res);
}
