import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { api, adm } from '../api';
import { Btn, Card, ConfirmBtn, Empty, Field, Area, Head, ImageField, Pill, ProviderPicker, Select, Sheet, Spinner, fmt, toast, useLoad } from '../ui';
import { RichEditor } from '../editor';
import { go } from '../router';

/* ---------- Dashboard ---------- */
export function Dashboard() {
  const { data } = useLoad<any>(() => api('/admin/overview'));
  if (!data) return <Spinner />;
  const c = data.counts;
  const noAi = !data.ai.some((p: any) => p.connected);
  return (
    <div class="view">
      <Head title="Kia ora, Marc" sub="Here is where the site stands today." />
      <div class="stats">
        <a class="stat" href="#/posts"><span>{c.published}</span>Live posts</a>
        <a class="stat" href="#/posts"><span>{c.drafts}</span>Drafts to review</a>
        <a class="stat" href="#/ideas"><span>{c.ideas}</span>Fresh ideas</a>
        <a class={`stat${c.messages ? ' hot' : ''}`} href="#/inbox"><span>{c.messages}</span>New messages</a>
      </div>
      <div class="grid2">
        <Card title="Quick actions">
          <div class="quick">
            <Btn onClick={() => go('/posts/new')}>Write a post</Btn>
            <Btn kind="accent" onClick={() => go('/ideas')}>Create ideas</Btn>
            <Btn kind="ghost" onClick={() => go('/ventures')}>Add a venture</Btn>
            <Btn kind="ghost" onClick={() => go('/design')}>Change the look</Btn>
            <a class="btn plain" href="/" target="_blank" rel="noopener">View the site &#8599;</a>
          </div>
        </Card>
        <Card title="Connections">
          <ul class="conn">
            {data.ai.map((p: any) => <li><span class={`led ${p.connected ? 'on' : ''}`} />{p.label}<small>{p.connected ? 'Connected' : `Needs ${p.secret}`}</small></li>)}
            {data.social.map((p: any) => <li><span class={`led ${p.connected ? 'on' : ''}`} />{p.label}<small>{p.connected ? 'Connected' : 'Not set up'}</small></li>)}
          </ul>
          {noAi && <p class="note">No AI provider is connected yet. Add at least one key (see Settings, AI) and Create Ideas starts working.</p>}
        </Card>
      </div>
      {data.recentAi?.length > 0 && (
        <Card title="Recent AI activity">
          <ul class="log">{data.recentAi.map((r: any) => <li><span class={`led ${r.ok ? 'on' : 'bad'}`} /><b>{r.task}</b> {r.provider} <span class="muted">{r.model} · {(r.ms / 1000).toFixed(1)}s</span>{r.error && <small class="err">{r.error}</small>}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

/* ---------- Posts ---------- */
export function Posts() {
  const { data, loading } = useLoad<any[]>(() => adm.list('posts'));
  const [filter, setFilter] = useState('all');
  const list = (data || []).filter((p) => filter === 'all' || (filter === 'review' ? p.status === 'review' || p.status === 'draft' : p.status === filter));
  return (
    <div class="view">
      <Head title="Posts" sub="Write your own, or review drafts the AI prepared from your ideas.">
        <Btn kind="ghost" onClick={() => go('/ideas')}>Create ideas</Btn>
        <Btn onClick={() => go('/posts/new')}>New post</Btn>
      </Head>
      <div class="tabs" role="tablist">
        {[['all', 'All'], ['review', 'Drafts and review'], ['published', 'Live']].map(([k, l]) => <button role="tab" aria-selected={filter === k} class={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {loading ? <Spinner /> : list.length ? (
        <ul class="rows">
          {list.map((p) => (
            <li><a href={`#/posts/${p.id}`} class="row-link">
              <span class="row-main"><strong>{p.title}</strong><span class="muted">{p.excerpt}</span></span>
              <span class="row-meta"><Pill s={p.status} />{p.source === 'ai' && <span class="pill ai">AI draft</span>}<small>{fmt(p.published_at || p.updated_at)}</small></span>
            </a></li>
          ))}
        </ul>
      ) : <Empty title="Nothing here yet">Start with a post of your own, or let Create Ideas suggest a few.</Empty>}
    </div>
  );
}

const blankPost = { title: '', slug: '', excerpt: '', content_html: '', content_json: '', cover: '', tags: '', status: 'draft', source: 'manual', social_caption: '', published_at: '' };

export function PostEdit({ id }: { id: string }) {
  const isNew = id === 'new';
  const [p, setP] = useState<any>(() => {
    if (!isNew) return null;
    let idea: any = null;
    try { idea = JSON.parse(sessionStorage.getItem('gco:idea') || 'null'); sessionStorage.removeItem('gco:idea'); } catch { /* storage blocked */ }
    if (!idea) return { ...blankPost };
    const outline = String(idea.outline || '').split('\n').filter(Boolean).map((l: string) => `<h2>${l.replace(/^[-*\u2022]\s*/, '')}</h2><p></p>`).join('');
    return { ...blankPost, title: idea.title, excerpt: idea.angle, content_html: outline };
  });
  const [saving, setSaving] = useState('');
  const [dirty, setDirty] = useState(false);
  const [share, setShare] = useState(false);
  const [panel, setPanel] = useState(false);
  const pid = useRef<number | null>(isNew ? null : Number(id));

  useEffect(() => { if (!isNew) adm.get('posts', id).then(setP).catch(toast.err); }, [id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);
  if (!p) return <Spinner />;
  const set = (k: string) => (v: any) => { setP((x: any) => ({ ...x, [k]: v })); setDirty(true); };

  async function save(status?: string) {
    if (!p.title.trim()) return toast.err('Give the post a title first.');
    setSaving(status || 'save');
    try {
      const body = { ...p, status: status || p.status };
      const r = pid.current ? await adm.update('posts', pid.current, body) : await adm.create('posts', body);
      setP(r); setDirty(false);
      if (!pid.current) { pid.current = r.id; history.replaceState(null, '', `#/posts/${r.id}`); }
      toast.ok(status === 'published' ? 'Published. It is live on the site.' : status === 'draft' && p.status === 'published' ? 'Moved back to draft.' : 'Saved');
    } catch (e) { toast.err(e); } finally { setSaving(''); }
  }

  return (
    <div class="view edit">
      <div class="edit-bar">
        <a href="#/posts" class="back">&larr; Posts</a>
        <div class="edit-actions">
          {dirty && <span class="dirty">Unsaved</span>}
          <Btn kind="ghost" small onClick={() => setPanel(!panel)}>{panel ? 'Hide details' : 'Details'}</Btn>
          <Btn kind="ghost" small busy={saving === 'save'} onClick={() => save()}>Save</Btn>
          {p.status === 'published'
            ? <Btn small busy={saving === 'published'} onClick={() => save('published')}>Update live post</Btn>
            : <Btn small kind="accent" busy={saving === 'published'} onClick={() => save('published')}>Publish</Btn>}
        </div>
      </div>
      {p.source === 'ai' && p.status !== 'published' && <div class="banner">This draft was written by AI ({p.ai_provider}). Read it through and fix anything marked [add detail] before you publish.</div>}
      <div class={`edit-grid${panel ? ' with-panel' : ''}`}>
        <div class="edit-main">
          <input class="title-input" placeholder="Post title" value={p.title} onInput={(e) => set('title')((e.target as HTMLInputElement).value)} aria-label="Title" />
          <textarea class="excerpt-input" rows={2} placeholder="A one or two sentence summary (optional)" value={p.excerpt} onInput={(e) => set('excerpt')((e.target as HTMLTextAreaElement).value)} aria-label="Summary" />
          <RichEditor key={p.id || 'new'} html={p.content_html} context={p.title} onChange={(html, json) => { setP((x: any) => ({ ...x, content_html: html, content_json: json })); setDirty(true); }} />
        </div>
        {panel && (
          <aside class="edit-panel">
            <Card title="Publishing">
              <Select label="Status" value={p.status} onChange={set('status')} options={[['draft', 'Draft'], ['review', 'Needs review'], ['published', 'Live']]} />
              <Field label="Web address" mono value={p.slug} onInput={set('slug')} hint={`ganders.co/writing/${p.slug || 'auto-from-title'}`} />
              <Field label="Publish date" type="datetime-local" value={(p.published_at || '').replace(' ', 'T').slice(0, 16)} onInput={(v) => set('published_at')(v.replace('T', ' ') + ':00')} />
              <Field label="Tags" value={p.tags} onInput={set('tags')} hint="Separate with commas" />
              <ImageField label="Cover image" value={p.cover} onChange={set('cover')} hint="Also used when you share to Instagram." />
            </Card>
            <Card title="Share to social">
              <Area label="Caption" rows={4} value={p.social_caption} onInput={set('social_caption')} />
              <Btn kind="accent" disabled={!pid.current} onClick={() => setShare(true)}>Share this post</Btn>
              {!pid.current && <small class="muted">Save the post first.</small>}
            </Card>
            {pid.current && <Card title="Danger zone"><ConfirmBtn label="Delete this post" onConfirm={async () => { await adm.remove('posts', pid.current!); setDirty(false); toast.ok('Deleted'); go('/posts'); }} /></Card>}
          </aside>
        )}
      </div>
      {share && <ShareSheet post={p} onClose={() => setShare(false)} onCaption={set('social_caption')} />}
    </div>
  );
}

export function ShareSheet({ post, onClose, onCaption }: { post: any; onClose: () => void; onCaption: (v: string) => void }) {
  const { data: status } = useLoad<any[]>(() => api('/admin/social/status'));
  const [nets, setNets] = useState<string[]>([]);
  const [caption, setCaption] = useState(post.social_caption || '');
  const [provider, setProvider] = useState('auto');
  const [busy, setBusy] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  async function write() {
    setBusy('ai');
    try { const r = await api('/admin/ai/social', { body: { postId: post.id, network: nets[0] || 'Facebook', provider } }); setCaption(r.caption); onCaption(r.caption); } catch (e) { toast.err(e); } finally { setBusy(''); }
  }
  async function send() {
    setBusy('send');
    try { const r = await api('/admin/social/publish', { body: { postId: post.id, networks: nets, caption } }); setResults(r.results); } catch (e) { toast.err(e); } finally { setBusy(''); }
  }
  return (
    <Sheet title="Share to social" onClose={onClose}>
      {post.status !== 'published' && <p class="note">This post is not live yet, so the link will not work until you publish it.</p>}
      <div class="checks">
        {(status || []).map((s) => (
          <label class={`check${s.connected ? '' : ' off'}`}>
            <input type="checkbox" disabled={!s.connected} checked={nets.includes(s.id)} onChange={(e) => setNets((x) => (e.target as HTMLInputElement).checked ? [...x, s.id] : x.filter((n) => n !== s.id))} />
            <span>{s.label}{!s.connected && <small>Not connected</small>}</span>
          </label>
        ))}
      </div>
      <Area label="Caption" rows={5} value={caption} onInput={(v) => { setCaption(v); onCaption(v); }} />
      <div class="row wrap"><ProviderPicker compact value={provider} onChange={setProvider} /><Btn kind="ghost" small busy={busy === 'ai'} onClick={write}>Write caption with AI</Btn></div>
      <Btn kind="accent" busy={busy === 'send'} disabled={!nets.length || !caption.trim()} onClick={send}>Post now</Btn>
      {results && <ul class="log">{results.map((r) => <li><span class={`led ${r.ok ? 'on' : 'bad'}`} /><b>{r.network}</b> {r.detail}</li>)}</ul>}
    </Sheet>
  );
}

/* ---------- Ideas ---------- */
export function Ideas() {
  const { data, setData, loading, reload } = useLoad<any[]>(() => adm.list('ideas'));
  const [provider, setProvider] = useState('auto');
  const [focus, setFocus] = useState('');
  const [count, setCount] = useState('6');
  const [busy, setBusy] = useState<string | number>('');
  const [show, setShow] = useState('new');

  async function create() {
    setBusy('create');
    try {
      const r = await api('/admin/ai/ideas', { body: { count: Number(count), focus, provider } });
      setData([...(r.ideas || []), ...(data || [])]);
      toast.ok(`${r.ideas.length} new ideas from ${r.provider}`);
    } catch (e) { toast.err(e); } finally { setBusy(''); }
  }
  async function draft(i: any) {
    setBusy(i.id);
    try {
      const r = await api('/admin/ai/draft', { body: { ideaId: i.id, provider } });
      toast.ok('Draft ready for review');
      go(`/posts/${r.postId}`);
    } catch (e) { toast.err(e); setBusy(''); }
  }
  async function dismiss(i: any) {
    await adm.update('ideas', i.id, { status: 'dismissed' });
    reload();
  }
  const list = (data || []).filter((i) => show === 'all' || i.status === show);
  return (
    <div class="view">
      <Head title="Ideas" sub="Ideas come from your knowledge base, so the more you add there, the more they sound like you." />
      <Card class="ideas-gen">
        <div class="gen-grid">
          <Field label="Focus (optional)" value={focus} onInput={setFocus} placeholder="Lessons from hiring, or something about one of my businesses" />
          <Select label="How many" value={count} onChange={setCount} options={[['3', '3'], ['6', '6'], ['10', '10']]} />
          <ProviderPicker value={provider} onChange={setProvider} />
        </div>
        <Btn kind="accent" busy={busy === 'create'} onClick={create}>Create ideas</Btn>
      </Card>
      <div class="tabs">{[['new', 'New'], ['drafted', 'Drafted'], ['all', 'All']].map(([k, l]) => <button class={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
      {loading ? <Spinner /> : list.length ? (
        <div class="idea-list">
          {list.map((i) => (
            <article class="idea">
              <div class="idea-top"><Pill s={i.status} /><small class="muted">{i.provider} · {fmt(i.created_at)}</small></div>
              <h3>{i.title}</h3>
              <p>{i.angle}</p>
              {i.outline && <ul>{i.outline.split('\n').filter(Boolean).map((l: string) => <li>{l.replace(/^[-*•]\s*/, '')}</li>)}</ul>}
              <div class="row wrap">
                {i.status === 'drafted' && i.post_id
                  ? <Btn small kind="ghost" onClick={() => go(`/posts/${i.post_id}`)}>Open draft</Btn>
                  : <Btn small busy={busy === i.id} disabled={!!busy} onClick={() => draft(i)}>Write it as a draft</Btn>}
                <Btn small kind="plain" onClick={() => { sessionStorage.setItem('gco:idea', JSON.stringify(i)); go('/posts/new'); }}>Write it myself</Btn>
                {i.status === 'new' && <Btn small kind="plain" onClick={() => dismiss(i)}>Dismiss</Btn>}
              </div>
            </article>
          ))}
        </div>
      ) : <Empty title="No ideas yet">Tap Create ideas. If it says no AI is connected, add a key under Settings first.</Empty>}
    </div>
  );
}

/* ---------- Pages ---------- */
export function Pages() {
  const { data, loading } = useLoad<any[]>(() => adm.list('pages'));
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <div class="view">
      <Head title="Pages" sub="Home, Contact, Ventures and Writing are built in. Add as many other pages as you like (About, Speaking, Press) and put them in the menu under Design.">
        <Btn kind="ghost" onClick={() => setAiOpen(true)}>Draft a page with AI</Btn>
        <Btn onClick={() => go('/pages/new')}>New page</Btn>
      </Head>
      {loading ? <Spinner /> : data?.length ? (
        <ul class="rows">{data.map((p) => <li><a class="row-link" href={`#/pages/${p.id}`}><span class="row-main"><strong>{p.title}</strong><span class="muted mono">/{p.slug}</span></span><span class="row-meta"><Pill s={p.status} /><small>{fmt(p.updated_at)}</small></span></a></li>)}</ul>
      ) : <Empty title="No pages yet" />}
      {aiOpen && <AiPage onClose={() => setAiOpen(false)} />}
    </div>
  );
}

function AiPage({ onClose }: { onClose: () => void }) {
  const [desc, setDesc] = useState('');
  const [provider, setProvider] = useState('auto');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api('/admin/ai/page', { body: { description: desc, provider } });
      const page = await adm.create('pages', { title: r.page.title, summary: r.page.summary, content_html: r.page.html, status: 'draft' });
      toast.ok('Draft page created');
      go(`/pages/${page.id}`);
    } catch (e) { toast.err(e); setBusy(false); }
  }
  return (
    <Sheet title="Draft a page with AI" onClose={onClose}>
      <Area label="What should this page be?" rows={4} value={desc} onInput={setDesc} placeholder="A speaking page listing the topics I talk about and how to book me" />
      <ProviderPicker value={provider} onChange={setProvider} />
      <Btn kind="accent" busy={busy} disabled={!desc.trim()} onClick={run}>Create draft</Btn>
    </Sheet>
  );
}

export function PageEdit({ id }: { id: string }) {
  const isNew = id === 'new';
  const [p, setP] = useState<any>(isNew ? { title: '', slug: '', summary: '', content_html: '', status: 'draft', template: 'standard', seo_title: '', seo_description: '' } : null);
  const [saving, setSaving] = useState('');
  const [panel, setPanel] = useState(isNew);
  const pid = useRef<number | null>(isNew ? null : Number(id));
  useEffect(() => { if (!isNew) adm.get('pages', id).then(setP).catch(toast.err); }, [id]);
  if (!p) return <Spinner />;
  const set = (k: string) => (v: any) => setP((x: any) => ({ ...x, [k]: v }));
  async function save(status?: string) {
    if (!p.title.trim()) return toast.err('Give the page a title first.');
    setSaving(status || 'save');
    try {
      const body = { ...p, status: status || p.status };
      const r = pid.current ? await adm.update('pages', pid.current, body) : await adm.create('pages', body);
      setP(r);
      if (!pid.current) { pid.current = r.id; history.replaceState(null, '', `#/pages/${r.id}`); }
      toast.ok(status === 'published' ? 'Published' : 'Saved');
    } catch (e) { toast.err(e); } finally { setSaving(''); }
  }
  return (
    <div class="view edit">
      <div class="edit-bar">
        <a href="#/pages" class="back">&larr; Pages</a>
        <div class="edit-actions">
          <Btn kind="ghost" small onClick={() => setPanel(!panel)}>{panel ? 'Hide details' : 'Details'}</Btn>
          {p.status === 'published' && p.slug && <a class="btn plain small" href={`/${p.slug}`} target="_blank" rel="noopener">View &#8599;</a>}
          <Btn kind="ghost" small busy={saving === 'save'} onClick={() => save()}>Save</Btn>
          <Btn kind="accent" small busy={saving === 'published'} onClick={() => save('published')}>{p.status === 'published' ? 'Update' : 'Publish'}</Btn>
        </div>
      </div>
      <div class={`edit-grid${panel ? ' with-panel' : ''}`}>
        <div class="edit-main">
          <input class="title-input" placeholder="Page title" value={p.title} onInput={(e) => set('title')((e.target as HTMLInputElement).value)} aria-label="Title" />
          <textarea class="excerpt-input" rows={2} placeholder="Intro line under the title (optional)" value={p.summary} onInput={(e) => set('summary')((e.target as HTMLTextAreaElement).value)} aria-label="Intro" />
          <RichEditor key={p.id || 'new'} html={p.content_html} context={p.title} onChange={(html, json) => setP((x: any) => ({ ...x, content_html: html, content_json: json }))} />
        </div>
        {panel && (
          <aside class="edit-panel">
            <Card title="Page settings">
              <Select label="Status" value={p.status} onChange={set('status')} options={[['draft', 'Draft'], ['published', 'Live']]} />
              <Field label="Web address" mono value={p.slug} onInput={set('slug')} hint={`ganders.co/${p.slug || 'auto-from-title'}`} />
              <Select label="Layout" value={p.template} onChange={set('template')} options={[['standard', 'Standard (reading width)'], ['wide', 'Wide'], ['bare', 'Bare (no title, for module pages)']]} />
            </Card>
            <Card title="Search and sharing">
              <Field label="Title for Google" value={p.seo_title} onInput={set('seo_title')} />
              <Area label="Description for Google" rows={3} value={p.seo_description} onInput={set('seo_description')} />
            </Card>
            {pid.current && <Card title="Danger zone"><ConfirmBtn label="Delete this page" onConfirm={async () => { await adm.remove('pages', pid.current!); toast.ok('Deleted'); go('/pages'); }} /></Card>}
          </aside>
        )}
      </div>
    </div>
  );
}
