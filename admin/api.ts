export class ApiError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && path !== '/login') window.dispatchEvent(new Event('gco:logout'));
    throw new ApiError(data.error || `Request failed (${r.status})`, r.status);
  }
  return data as T;
}

export const adm = {
  list: <T = any>(t: string) => api<T[]>(`/admin/${t}`),
  get: <T = any>(t: string, id: number | string) => api<T>(`/admin/${t}/${id}`),
  create: <T = any>(t: string, body: any) => api<T>(`/admin/${t}`, { body }),
  update: <T = any>(t: string, id: number | string, body: any) => api<T>(`/admin/${t}/${id}`, { method: 'PUT', body }),
  remove: (t: string, id: number | string) => api(`/admin/${t}/${id}`, { method: 'DELETE' }),
};

export async function upload(file: File, alt = ''): Promise<{ key: string; url: string }> {
  const f = new FormData();
  f.append('file', file);
  f.append('alt', alt);
  if (file.type.startsWith('image/') && !file.type.includes('svg')) {
    const info = await faceFocus(file).catch(() => null);
    if (info) {
      f.append('w', String(info.w));
      f.append('h', String(info.h));
      if (info.fx !== undefined) { f.append('fx', String(info.fx)); f.append('fy', String(info.fy)); f.append('fsource', 'auto-face'); }
    }
  }
  return api('/admin/media', { form: f });
}

/**
 * Reads the photo size and, where the browser can (Chrome on Android and Mac),
 * finds faces on the device. The server falls back to Cloudflare AI otherwise.
 */
async function faceFocus(file: File): Promise<{ w: number; h: number; fx?: number; fy?: number }> {
  const bmp = await createImageBitmap(file);
  const out: { w: number; h: number; fx?: number; fy?: number } = { w: bmp.width, h: bmp.height };
  const FD = (window as any).FaceDetector;
  if (FD) {
    try {
      const faces: any[] = await new FD({ fastMode: false, maxDetectedFaces: 10 }).detect(bmp);
      if (faces.length) {
        const area = (f: any) => f.boundingBox.width * f.boundingBox.height;
        faces.sort((a, b) => area(b) - area(a));
        const group = faces.filter((f) => area(f) > area(faces[0]) * 0.35);
        out.fx = group.reduce((s, f) => s + f.boundingBox.x + f.boundingBox.width / 2, 0) / group.length / bmp.width;
        out.fy = group.reduce((s, f) => s + f.boundingBox.y + f.boundingBox.height / 2, 0) / group.length / bmp.height;
      }
    } catch { /* not supported on this device */ }
  }
  bmp.close();
  return out;
}

/** CSS object-position for a media row's focal point. */
export function focalPos(m: { focal_x?: number | null; focal_y?: number | null } | null | undefined): string | undefined {
  return m && m.focal_x != null && m.focal_y != null ? `${(m.focal_x * 100).toFixed(1)}% ${(m.focal_y * 100).toFixed(1)}%` : undefined;
}

export function mediaUrl(v: string) {
  if (!v) return '';
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('data:')) return v;
  return `/media/${v}`;
}
