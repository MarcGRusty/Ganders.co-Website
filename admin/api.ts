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
  return api('/admin/media', { form: f });
}

export function mediaUrl(v: string) {
  if (!v) return '';
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('data:')) return v;
  return `/media/${v}`;
}
