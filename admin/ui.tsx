import { h, type ComponentChildren } from 'preact';
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { api, upload, mediaUrl } from './api';

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; kind: 'ok' | 'err' };
let push: (t: Omit<Toast, 'id'>) => void = () => {};
export const toast = {
  ok: (text: string) => push({ text, kind: 'ok' }),
  err: (e: unknown) => push({ text: e instanceof Error ? e.message : String(e), kind: 'err' }),
};
export function Toasts() {
  const [items, set] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      set((x) => [...x, { ...t, id }]);
      setTimeout(() => set((x) => x.filter((i) => i.id !== id)), t.kind === 'err' ? 7000 : 3000);
    };
  }, []);
  return <div class="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} class={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}

/* ---------- Data hook ---------- */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    return fn().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, error, loading, reload };
}

/* ---------- Layout bits ---------- */
export function Head({ title, sub, children }: { title: string; sub?: string; children?: ComponentChildren }) {
  return (
    <header class="vhead">
      <div><h1>{title}</h1>{sub && <p class="sub">{sub}</p>}</div>
      {children && <div class="vhead-actions">{children}</div>}
    </header>
  );
}
export function Card({ title, children, actions, class: cls }: { title?: string; children: ComponentChildren; actions?: ComponentChildren; class?: string }) {
  return (
    <section class={`card ${cls || ''}`}>
      {(title || actions) && <div class="card-head">{title && <h2>{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}
export function Empty({ title, children }: { title: string; children?: ComponentChildren }) {
  return <div class="empty"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}
export function Spinner() { return <div class="spin" aria-label="Loading" />; }

export function Btn({ children, onClick, kind = 'primary', busy, disabled, type = 'button', small, title }: { children: ComponentChildren; onClick?: (e: Event) => any; kind?: 'primary' | 'ghost' | 'danger' | 'accent' | 'plain'; busy?: boolean; disabled?: boolean; type?: 'button' | 'submit'; small?: boolean; title?: string }) {
  return (
    <button type={type} title={title} class={`btn ${kind}${small ? ' small' : ''}${busy ? ' busy' : ''}`} disabled={disabled || busy} onClick={onClick}>
      {busy && <span class="spin sm" />}{children}
    </button>
  );
}

/* ---------- Form fields ---------- */
let uid = 0;
const useId = () => useRef(`f${++uid}`).current;

export function Field({ label, value, onInput, hint, type = 'text', placeholder, required, mono }: { label: string; value: string | number; onInput: (v: string) => void; hint?: string; type?: string; placeholder?: string; required?: boolean; mono?: boolean }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <input id={id} class={mono ? "mono" : ""} type={type as any} value={value ?? ''} placeholder={placeholder} required={required} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Area({ label, value, onInput, hint, rows = 4, placeholder, mono }: { label: string; value: string; onInput: (v: string) => void; hint?: string; rows?: number; placeholder?: string; mono?: boolean }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <textarea id={id} class={mono ? 'mono' : ''} rows={rows} value={value ?? ''} placeholder={placeholder} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Select({ label, value, onChange, options, hint }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; hint?: string }) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        {options.map(([v, l]) => <option value={v}>{l}</option>)}
      </select>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div class="toggle">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <label for={id}><span>{label}</span>{hint && <small>{hint}</small>}</label>
    </div>
  );
}
export function ColorField({ label, value, onInput }: { label: string; value: string; onInput: (v: string) => void }) {
  const id = useId();
  return (
    <div class="field color">
      <label for={id}>{label}</label>
      <div class="color-row">
        <input type="color" aria-label={`${label} picker`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
        <input id={id} class="mono" value={value} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
      </div>
    </div>
  );
}

/* ---------- Sheet (modal, bottom sheet on phones) ---------- */
export function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    document.body.classList.add('locked');
    return () => { removeEventListener('keydown', k); document.body.classList.remove('locked'); };
  }, []);
  return (
    <div class="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head"><h2>{title}</h2><button class="x" onClick={onClose} aria-label="Close">&times;</button></div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Confirm button (two taps, no browser dialogs) ---------- */
export function ConfirmBtn({ label = 'Delete', confirm = 'Tap again to confirm', onConfirm, small = true }: { label?: string; confirm?: string; onConfirm: () => any; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (armed) { const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); } }, [armed]);
  return <Btn kind="danger" small={small} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? confirm : label}</Btn>;
}

/* ---------- AI provider picker ---------- */
export type ProviderStatus = { id: string; label: string; connected: boolean; secret: string };
let providerCache: Promise<ProviderStatus[]> | null = null;
export function useProviders() {
  const [list, set] = useState<ProviderStatus[]>([]);
  useEffect(() => { (providerCache ||= api('/admin/ai/status')).then(set).catch(() => {}); }, []);
  return list;
}
export function ProviderPicker({ value, onChange, compact }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const list = useProviders();
  const id = useId();
  return (
    <div class={`provider${compact ? ' compact' : ''}`}>
      {!compact && <label for={id}>AI model</label>}
      <select id={id} aria-label="AI model" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="auto">Auto (best available)</option>
        {list.map((p) => <option value={p.id} disabled={!p.connected}>{p.label}{p.connected ? '' : ' (no key yet)'}</option>)}
      </select>
    </div>
  );
}

/* ---------- Media ---------- */
export function MediaPicker({ onPick, onClose, accept = 'image/*' }: { onPick: (key: string) => void; onClose: () => void; accept?: string }) {
  const { data, reload, loading } = useLoad<any[]>(() => api('/admin/media'));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      let last = '';
      for (const f of Array.from(files)) last = (await upload(f)).key;
      await reload();
      if (files.length === 1) onPick(last);
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  return (
    <Sheet title="Choose an image" onClose={onClose} wide>
      <div class="drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer?.files || null); }}>
        <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => onFiles((e.target as HTMLInputElement).files)} />
        <Btn kind="accent" busy={busy} onClick={() => input.current?.click()}>Upload from device</Btn>
        <span class="muted">or drop files here</span>
      </div>
      {loading ? <Spinner /> : (
        <div class="media-grid">
          {(data || []).filter((m) => m.type.startsWith('image/')).map((m) => (
            <button class="media-item" onClick={() => onPick(m.key)} title={m.name}>
              <img src={mediaUrl(m.key)} alt={m.alt || m.name} loading="lazy" />
            </button>
          ))}
          {!data?.length && <Empty title="No images yet">Upload your first one above.</Empty>}
        </div>
      )}
    </Sheet>
  );
}

export function ImageField({ label, value, onChange, hint, extra }: { label: string; value: string; onChange: (v: string) => void; hint?: string; extra?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="field image-field">
      <span class="label">{label}</span>
      <div class="image-row">
        <div class="thumb">{value ? <img src={mediaUrl(value)} alt="" /> : <span>None</span>}</div>
        <div class="image-actions">
          <Btn kind="ghost" small onClick={() => setOpen(true)}>{value ? 'Change' : 'Choose'}</Btn>
          {value && <Btn kind="plain" small onClick={() => onChange('')}>Remove</Btn>}
          {extra}
        </div>
      </div>
      {hint && <small>{hint}</small>}
      {open && <MediaPicker onClose={() => setOpen(false)} onPick={(k) => { onChange(k); setOpen(false); }} />}
    </div>
  );
}

export function fmt(d?: string | null) {
  if (!d) return '';
  const x = new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z');
  return x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function Pill({ s }: { s: string }) {
  const label: Record<string, string> = { published: 'Live', draft: 'Draft', review: 'Needs review', idea: 'Idea', new: 'New', drafted: 'Drafted', dismissed: 'Dismissed' };
  return <span class={`pill ${s}`}>{label[s] || s}</span>;
}
