import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, adm } from '../api';
import { Area, Btn, Card, ConfirmBtn, Empty, Field, Head, ProviderPicker, Select, Sheet, Spinner, Toggle, fmt, toast, useLoad, useProviders } from '../ui';

/* ---------- Knowledge base ---------- */
const KINDS: [string, string][] = [['story', 'My story'], ['belief', 'Beliefs and opinions'], ['business', 'Business details'], ['voice', 'How I sound'], ['audience', 'Who I talk to'], ['note', 'Notes and facts']];

export function Knowledge() {
  const { data, loading, reload } = useLoad<any[]>(() => adm.list('kb'));
  const [edit, setEdit] = useState<any | null>(null);
  const [kind, setKind] = useState('all');
  const list = (data || []).filter((k) => kind === 'all' || k.kind === kind);
  return (
    <div class="view">
      <Head title="Knowledge base" sub="What the AI knows about you. It reads this before suggesting ideas or writing drafts, so be specific.">
        <Btn onClick={() => setEdit({ title: '', body: '', kind: 'note', tags: '', use_for_ideas: 1 })}>Add entry</Btn>
      </Head>
      <div class="tabs scroll">{[['all', 'All'], ...KINDS].map(([k, l]) => <button class={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      {loading ? <Spinner /> : list.length ? (
        <div class="kb-grid">
          {list.map((k) => (
            <button class="kb" onClick={() => setEdit(k)}>
              <span class="mono muted">{KINDS.find(([v]) => v === k.kind)?.[1]}</span>
              <strong>{k.title}</strong>
              <span class="kb-body">{k.body.slice(0, 180)}{k.body.length > 180 ? '...' : ''}</span>
              {!k.use_for_ideas && <small class="muted">Not used for ideas</small>}
            </button>
          ))}
        </div>
      ) : <Empty title="Nothing here yet">Start with your story. Paste in an old bio, a talk transcript, or notes. Rough is fine.</Empty>}
      {edit && (
        <KbSheet entry={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      )}
    </div>
  );
}

function KbSheet({ entry, onClose, onSaved }: { entry: any; onClose: () => void; onSaved: () => void }) {
  const [k, setK] = useState({ ...entry });
  const [busy, setBusy] = useState(false);
  const set = (f: string) => (v: any) => setK((x: any) => ({ ...x, [f]: v }));
  async function save() {
    if (!k.title.trim()) return toast.err('Add a title.');
    setBusy(true);
    try { k.id ? await adm.update('kb', k.id, k) : await adm.create('kb', k); toast.ok('Saved'); onSaved(); } catch (e) { toast.err(e); setBusy(false); }
  }
  return (
    <Sheet title={k.id ? 'Edit entry' : 'New entry'} onClose={onClose} wide>
      <div class="stack">
        <Field label="Title" value={k.title} onInput={set('title')} />
        <Select label="Type" value={k.kind} onChange={set('kind')} options={KINDS} />
        <Area label="Content" rows={12} value={k.body} onInput={set('body')} hint="Plain text is perfect. Paste as much as you like." />
        <Field label="Tags" value={k.tags} onInput={set('tags')} />
        <Toggle label="Use when creating ideas and drafts" checked={!!k.use_for_ideas} onChange={(v) => set('use_for_ideas')(v ? 1 : 0)} />
        <div class="row wrap"><Btn busy={busy} onClick={save}>Save</Btn>{k.id && <ConfirmBtn onConfirm={async () => { await adm.remove('kb', k.id); onSaved(); }} />}</div>
      </div>
    </Sheet>
  );
}

/* ---------- AI settings ---------- */
export function AiSettings() {
  const { data, setData } = useLoad<any>(() => api('/admin/settings'));
  const providers = useProviders();
  const [busy, setBusy] = useState(false);
  if (!data) return <Spinner />;
  const ai = data.settings.ai;
  const upd = (k: string) => (v: any) => setData({ ...data, settings: { ...data.settings, ai: { ...ai, [k]: v } } });
  async function save() {
    setBusy(true);
    try { await api('/admin/settings', { method: 'PUT', body: { ai } }); toast.ok('Saved'); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  return (
    <div class="view">
      <Head title="AI" sub="Choose how the site picks a model. Auto uses the best connected one for each job and falls back if one fails."><Btn busy={busy} onClick={save}>Save</Btn></Head>
      <div class="grid2">
        <Card title="Mode">
          <Select label="Default" value={ai.mode} onChange={upd('mode')} options={[['auto', 'Auto (recommended)'], ...providers.map((p) => [p.id, p.label] as [string, string])]} hint="You can still pick a specific model each time you use AI." />
          <Area label="Your voice" rows={5} value={ai.voice} onInput={upd('voice')} hint="Every AI request includes this. The no em dash rule is always added on top." />
        </Card>
        <Card title="Providers">
          <ul class="prov">
            {providers.map((p) => (
              <li>
                <div><span class={`led ${p.connected ? 'on' : ''}`} /><strong>{p.label}</strong></div>
                <Field label="Model" mono value={ai.models[p.id] || ''} onInput={(v) => upd('models')({ ...ai.models, [p.id]: v })} />
                {!p.connected && <code class="cmd">npx wrangler secret put {p.secret}</code>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Modules ---------- */
export function Modules() {
  const { data, loading, reload } = useLoad<any[]>(() => adm.list('modules'));
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <div class="view">
      <Head title="Modules" sub="Reusable blocks you can drop into any page or post. Describe one and the AI builds it, or write the code yourself.">
        <Btn onClick={() => setEdit({ name: '', slug: '', description: '', html: '', css: '', js: '', enabled: 0 })}>New module</Btn>
      </Head>
      {loading ? <Spinner /> : data?.length ? (
        <ul class="rows">{data.map((m) => <li><button class="row-link" onClick={() => setEdit(m)}><span class="row-main"><strong>{m.name}</strong><span class="muted">{m.description}</span><code class="mono small">[[module:{m.slug}]]</code></span><span class="row-meta"><span class={`pill ${m.enabled ? 'published' : 'draft'}`}>{m.enabled ? 'On' : 'Off'}</span></span></button></li>)}</ul>
      ) : <Empty title="No modules yet">Try describing one, like "a testimonial slider" or "a booking call to action with my calendar link".</Empty>}
      {edit && <ModuleSheet mod={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function ModuleSheet({ mod, onClose, onSaved }: { mod: any; onClose: () => void; onSaved: () => void }) {
  const [m, setM] = useState({ ...mod });
  const [desc, setDesc] = useState('');
  const [provider, setProvider] = useState('auto');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState(mod.id ? 'preview' : 'describe');
  const set = (f: string) => (v: any) => setM((x: any) => ({ ...x, [f]: v }));
  const [css, setCss] = useState('');
  useEffect(() => { fetch('/site.css').then((r) => r.text()).then(setCss).catch(() => {}); }, []);

  async function build() {
    setBusy('ai');
    try {
      const r = await api('/admin/ai/module', { body: { description: desc, provider, moduleId: m.id } });
      setM((x: any) => ({ ...x, ...r.module, id: x.id, slug: x.slug || r.module.slug, name: x.name || r.module.name }));
      setTab('preview');
      toast.ok(`Built by ${r.provider}. Check the preview.`);
    } catch (e) { toast.err(e); } finally { setBusy(''); }
  }
  async function save() {
    if (!m.name.trim()) return toast.err('Give it a name.');
    setBusy('save');
    try { m.id ? await adm.update('modules', m.id, m) : await adm.create('modules', m); toast.ok('Saved'); onSaved(); } catch (e) { toast.err(e); setBusy(''); }
  }
  const doc = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>:root{--paper:#ECEEEA;--ink:#111A22;--muted:#5B6670;--accent:#F2B825;--on-accent:#111A22;--line:#CDD3CF;--radius:3px;--f-display:system-ui;--f-body:system-ui;--f-mono:monospace}${css}body{padding:16px}${m.css}</style></head><body><div id="root">${m.html}</div><script>(function(root){${m.js}\n})(document.getElementById('root'))<\/script></body></html>`;
  return (
    <Sheet title={m.id ? m.name : 'New module'} onClose={onClose} wide>
      <div class="tabs">{[['describe', 'Describe'], ['preview', 'Preview'], ['code', 'Code']].map(([k, l]) => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'describe' && (
        <div class="stack">
          <Area label={m.id ? 'What should change?' : 'What should this module do?'} rows={5} value={desc} onInput={setDesc} placeholder="A row of three numbers that count up when scrolled into view: years in business, customers served, ventures started" />
          <ProviderPicker value={provider} onChange={setProvider} />
          <Btn kind="accent" busy={busy === 'ai'} disabled={!desc.trim()} onClick={build}>{m.id || m.html ? 'Update with AI' : 'Build it'}</Btn>
        </div>
      )}
      {tab === 'preview' && (m.html ? <iframe class="mod-frame" sandbox="allow-scripts" srcdoc={doc} title="Module preview" /> : <Empty title="Nothing to preview yet" />)}
      {tab === 'code' && (
        <div class="stack">
          <Area label="HTML" mono rows={8} value={m.html} onInput={set('html')} />
          <Area label="CSS" mono rows={6} value={m.css} onInput={set('css')} />
          <Area label="JavaScript" mono rows={6} value={m.js} onInput={set('js')} hint="Use root to find elements inside this module." />
        </div>
      )}
      <div class="stack top">
        <div class="two"><Field label="Name" value={m.name} onInput={set('name')} /><Field label="Shortcode name" mono value={m.slug} onInput={set('slug')} hint={`Use [[module:${m.slug || 'name'}]] in any page`} /></div>
        <Toggle label="Turned on" checked={!!m.enabled} onChange={(v) => set('enabled')(v ? 1 : 0)} hint="Only modules that are on appear on the live site." />
        <div class="row wrap"><Btn busy={busy === 'save'} onClick={save}>Save module</Btn>{m.id && <ConfirmBtn onConfirm={async () => { await adm.remove('modules', m.id); onSaved(); }} />}</div>
      </div>
    </Sheet>
  );
}

/* ---------- Integrations ---------- */
export function Integrations() {
  const { data, loading, reload } = useLoad<any[]>(() => adm.list('integrations'));
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <div class="view">
      <Head title="Connections" sub="Link outside systems by their API. Tokens stay in Cloudflare as secrets, never in the database.">
        <Btn onClick={() => setEdit({ name: '', kind: 'rest', base_url: '', auth_header: 'Authorization', secret_name: '', notes: '', enabled: 1 })}>Add connection</Btn>
      </Head>
      {loading ? <Spinner /> : data?.length ? (
        <ul class="rows">{data.map((i) => <li><button class="row-link" onClick={() => setEdit(i)}><span class="row-main"><strong>{i.name}</strong><span class="muted mono">{i.base_url}</span></span><span class="row-meta"><span class={`pill ${i.enabled ? 'published' : 'draft'}`}>{i.enabled ? 'On' : 'Off'}</span></span></button></li>)}</ul>
      ) : <Empty title="No connections yet">Add a CRM, a booking tool, a store, or anything with an API.</Empty>}
      {edit && <IntegrationSheet item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function IntegrationSheet({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const [i, setI] = useState({ ...item });
  const [path, setPath] = useState('');
  const [method, setMethod] = useState('GET');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState('');
  const set = (f: string) => (v: any) => setI((x: any) => ({ ...x, [f]: v }));
  async function save() {
    setBusy('save');
    try { i.id ? await adm.update('integrations', i.id, i) : await adm.create('integrations', i); toast.ok('Saved'); onSaved(); } catch (e) { toast.err(e); setBusy(''); }
  }
  async function test() {
    setBusy('test');
    try { const r = await api(`/admin/integrations/${i.id}/call`, { body: { method, path } }); setOut(`${r.status} in ${r.ms}ms\n\n${JSON.stringify(r.data, null, 2)}`); } catch (e: any) { setOut(e.message); } finally { setBusy(''); }
  }
  return (
    <Sheet title={i.id ? i.name : 'Add connection'} onClose={onClose} wide>
      <div class="stack">
        <Field label="Name" value={i.name} onInput={set('name')} />
        <Field label="Base address" mono value={i.base_url} onInput={set('base_url')} placeholder="https://api.example.com/v1" />
        <div class="two">
          <Field label="Auth header" mono value={i.auth_header} onInput={set('auth_header')} />
          <Field label="Secret name" mono value={i.secret_name} onInput={(v) => set('secret_name')(v.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} hint="Set the token with: npx wrangler secret put THIS_NAME" />
        </div>
        <Area label="Notes" rows={2} value={i.notes} onInput={set('notes')} />
        <Toggle label="Turned on" checked={!!i.enabled} onChange={(v) => set('enabled')(v ? 1 : 0)} />
        <div class="row wrap"><Btn busy={busy === 'save'} onClick={save}>Save</Btn>{i.id && <ConfirmBtn onConfirm={async () => { await adm.remove('integrations', i.id); onSaved(); }} />}</div>
        {i.id && (
          <Card title="Try a request">
            <div class="row"><select aria-label="Method" value={method} onChange={(e) => setMethod((e.target as HTMLSelectElement).value)}><option>GET</option><option>POST</option></select><input aria-label="Path" class="mono grow" value={path} onInput={(e) => setPath((e.target as HTMLInputElement).value)} placeholder="/contacts" /><Btn small busy={busy === 'test'} onClick={test}>Send</Btn></div>
            {out && <pre class="out">{out}</pre>}
          </Card>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Social ---------- */
export function Social() {
  const { data } = useLoad<any[]>(() => api('/admin/social/status'));
  const { data: log } = useLoad<any[]>(() => api('/admin/social/log'));
  return (
    <div class="view">
      <Head title="Social" sub="Share posts to your accounts from any post's Details panel." />
      <div class="grid2">
        <Card title="Accounts">
          <ul class="prov">
            {(data || []).map((s) => (
              <li><div><span class={`led ${s.connected ? 'on' : ''}`} /><strong>{s.label}</strong></div>
                {!s.connected && <div class="cmds">{s.needs.map((n: string) => <code class="cmd">npx wrangler secret put {n}</code>)}</div>}
              </li>
            ))}
          </ul>
          <p class="muted small">Facebook and Instagram use a Meta Page access token. X, Threads, TikTok and others work through a webhook to Zapier, Make, or Buffer. The setup guide in the repository walks through each one.</p>
        </Card>
        <Card title="Recent posts to social">
          {log?.length ? <ul class="log">{log.map((l) => <li><span class={`led ${l.status === 'sent' ? 'on' : 'bad'}`} /><b>{l.network}</b> {l.title || 'Custom post'} <small class="muted">{fmt(l.created_at)} · {l.detail}</small></li>)}</ul> : <p class="muted">Nothing shared yet.</p>}
        </Card>
      </div>
    </div>
  );
}
