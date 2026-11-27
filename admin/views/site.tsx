import { h } from 'preact';
import { useState } from 'preact/hooks';
import { api, adm, mediaUrl, upload } from '../api';
import { ThemesTab, FONTS as THEME_FONTS } from './themes';
import { Area, Btn, Card, ColorField, ConfirmBtn, Empty, Field, Head, ImageField, ProviderPicker, Select, Sheet, Spinner, Toggle, toast, useLoad, Pending, fmt } from '../ui';

/* ---------- Ventures ---------- */
const blankBiz = { name: '', url: '', tagline: '', description: '', role: 'Founder', since: '', logo: '', accent: '', active: 1 };

export function Ventures() {
  const { data, setData, loading, reload } = useLoad<any[]>(() => adm.list('businesses'));
  const [edit, setEdit] = useState<any | null>(null);
  async function move(i: number, d: number) {
    const list = [...(data || [])];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setData(list);
    await api('/admin/businesses/reorder', { body: { ids: list.map((b) => b.id) } }).catch(toast.err);
  }
  return (
    <div class="view">
      <Head title="Ventures" sub="Your businesses. Each one links out to its own site in a new tab.">
        <Btn onClick={() => setEdit({ ...blankBiz })}>Add a venture</Btn>
      </Head>
      {loading ? <Spinner /> : data?.length ? (
        <ul class="biz-list">
          {data.map((b, i) => (
            <li class={b.active ? '' : 'off'}>
              <div class="biz-mark" style={b.accent ? `background:${b.accent}` : ''}>{b.logo ? <img src={mediaUrl(b.logo)} alt="" /> : b.name.slice(0, 1)}</div>
              <div class="biz-main"><strong>{b.name}</strong><span class="muted">{b.tagline}</span><small class="mono">{b.url}</small></div>
              <div class="biz-actions">
                <button class="icon" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>&uarr;</button>
                <button class="icon" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === data.length - 1}>&darr;</button>
                <Btn small kind="ghost" onClick={() => setEdit(b)}>Edit</Btn>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty title="No ventures yet">Add your first business. You only need a name and a web address to start.</Empty>}
      {edit && <VentureSheet biz={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function VentureSheet({ biz, onClose, onSaved }: { biz: any; onClose: () => void; onSaved: () => void }) {
  const [b, setB] = useState({ ...biz });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: any) => setB((x: any) => ({ ...x, [k]: v }));
  async function save() {
    if (!b.name.trim()) return toast.err('Add a name first.');
    setBusy(true);
    try {
      b.id ? await adm.update('businesses', b.id, b) : await adm.create('businesses', { ...b, sort: 999 });
      toast.ok('Saved');
      onSaved();
    } catch (e) { toast.err(e); setBusy(false); }
  }
  return (
    <Sheet title={b.id ? `Edit ${biz.name}` : 'Add a venture'} onClose={onClose}>
      <div class="stack">
        <Field label="Name" value={b.name} onInput={set('name')} required />
        <Field label="Website" type="url" value={b.url} onInput={set('url')} placeholder="https://" hint="Opens in a new tab for visitors." />
        <Field label="One line on what it does" value={b.tagline} onInput={set('tagline')} />
        <Area label="Longer description (optional)" rows={3} value={b.description} onInput={set('description')} />
        <div class="two"><Field label="Your role" value={b.role} onInput={set('role')} /><Field label="Since" value={b.since} onInput={set('since')} placeholder="2021" /></div>
        <ImageField label="Logo" value={b.logo} onChange={set('logo')} />
        <ColorField label="Hover colour (optional)" value={b.accent} onInput={set('accent')} />
        <Toggle label="Show on the site" checked={!!b.active} onChange={(v) => set('active')(v ? 1 : 0)} />
        <div class="row wrap">
          <Btn busy={busy} onClick={save}>Save venture</Btn>
          {b.id && <ConfirmBtn label="Delete" onConfirm={async () => { await adm.remove('businesses', b.id); onSaved(); }} />}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- Design ---------- */
const _FONTS_UNUSED = ['Bricolage Grotesque', 'Schibsted Grotesk', 'Syne', 'Unbounded', 'Space Grotesk', 'Hanken Grotesk', 'Figtree', 'Manrope', 'Geist', 'Inter Tight', 'DM Sans', 'Newsreader', 'Literata', 'Martian Mono', 'DM Mono', 'Space Mono', 'IBM Plex Mono', 'JetBrains Mono'];
const SECTION_LABELS: Record<string, string> = { hero: 'Intro', now: 'Now strip', ventures: 'Ventures', story: 'Story', writing: 'Writing', contact: 'Contact' };

export function Design() {
  const { data, setData, error, reload } = useLoad<any>(() => api('/admin/settings'));
  const [tab, setTab] = useState('identity');
  const [busy, setBusy] = useState(false);
  if (!data) return <Pending error={error} retry={reload} />;
  const s = data.settings;
  const upd = (group: string, key: string) => (v: any) => setData({ ...data, settings: { ...s, [group]: { ...s[group], [key]: v } } });
  const setGroup = (group: string, v: any) => setData({ ...data, settings: { ...s, [group]: v } });
  async function save() {
    setBusy(true);
    try {
      const r = await api('/admin/settings', { method: 'PUT', body: { site: s.site, theme: s.theme, themes: s.themes, home: s.home, contact: s.contact, mail: s.mail, nav: s.nav, social: s.social, seo: s.seo } });
      setData({ ...data, settings: r.settings });
      toast.ok('Saved. Changes are live.');
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  const tabs: [string, string][] = [['identity', 'Identity'], ['theme', 'Themes and dark mode'], ['home', 'Home page'], ['contact', 'Contact page'], ['email', 'Email'], ['menu', 'Menu and links'], ['seo', 'Search']];
  return (
    <div class="view">
      <Head title="Design" sub="Everything visitors see. Save, then refresh the site to check it.">
        <a class="btn ghost" href="/" target="_blank" rel="noopener">View site &#8599;</a>
        <Btn busy={busy} onClick={save}>Save changes</Btn>
      </Head>
      <div class="tabs scroll">{tabs.map(([k, l]) => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'identity' && (
        <div class="grid2">
          <Card title="Who you are">
            <Field label="Name" value={s.site.name} onInput={upd('site', 'name')} />
            <Field label="Tagline" value={s.site.tagline} onInput={upd('site', 'tagline')} />
            <Field label="Email" type="email" value={s.site.email} onInput={upd('site', 'email')} />
            <Field label="Location" value={s.site.location} onInput={upd('site', 'location')} />
            <ImageField label="Portrait photo" value={s.site.portrait} onChange={upd('site', 'portrait')} hint="Shown in the intro. Portrait shape works best." />
          </Card>
          <Card title="Logo and icon">
            <ImageField label="Logo" value={s.site.logo} onChange={upd('site', 'logo')} hint="Leave empty to use your initials." extra={<AiLogoBtn kind="logo" onDone={upd('site', 'logo')} />} />
            <ImageField label="Website icon (favicon)" value={s.site.favicon} onChange={upd('site', 'favicon')} hint="Square image. SVG or PNG at 512px is ideal." extra={<AiLogoBtn kind="favicon" onDone={upd('site', 'favicon')} />} />
            <ImageField label="Sharing image" value={s.site.ogImage} onChange={upd('site', 'ogImage')} hint="Shown when someone shares your site. 1200 by 630 works best." />
          </Card>
        </div>
      )}

      {tab === 'theme' && (
        <>
          <ThemesTab s={s} presets={data.presets} setTheme={(t) => setGroup('theme', t)} setThemes={(list) => setData({ ...data, settings: { ...s, themes: list } })} />
          <Card title="Custom CSS">
            <Area label="Extra styles (advanced)" mono rows={8} value={s.theme.customCss} onInput={upd('theme', 'customCss')} hint="Applied on every page after the theme." />
          </Card>
        </>
      )}

      {tab === 'home' && (
        <div class="grid2">
          <Card title="Intro">
            <Field label="Small line above the headline" value={s.home.kicker} onInput={upd('home', 'kicker')} />
            <Field label="Headline" value={s.home.headline} onInput={upd('home', 'headline')} />
            <Field label="Highlighted end of headline" value={s.home.headlineEmphasis} onInput={upd('home', 'headlineEmphasis')} />
            <Area label="Intro paragraph" value={s.home.intro} onInput={upd('home', 'intro')} />
            <div class="two">
              <Field label="Main button" value={s.home.primaryCta.label} onInput={(v) => upd('home', 'primaryCta')({ ...s.home.primaryCta, label: v })} />
              <Field label="Main button link" value={s.home.primaryCta.href} onInput={(v) => upd('home', 'primaryCta')({ ...s.home.primaryCta, href: v })} />
              <Field label="Second button" value={s.home.secondaryCta.label} onInput={(v) => upd('home', 'secondaryCta')({ ...s.home.secondaryCta, label: v })} />
              <Field label="Second button link" value={s.home.secondaryCta.href} onInput={(v) => upd('home', 'secondaryCta')({ ...s.home.secondaryCta, href: v })} />
            </div>
            <Area label="Now strip (one item per line)" rows={3} value={s.home.now.join('\n')} onInput={(v) => upd('home', 'now')(v.split('\n'))} />
          </Card>
          <Card title="Sections">
            <p class="muted small">Turn sections on or off and change their order.</p>
            <ul class="order">
              {Object.keys(SECTION_LABELS).sort((a, b) => idx(s.home.sections, a) - idx(s.home.sections, b)).map((k) => {
                const on = s.home.sections.includes(k);
                const i = s.home.sections.indexOf(k);
                const mv = (d: number) => { const arr = [...s.home.sections]; const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; upd('home', 'sections')(arr); };
                return (
                  <li class={on ? '' : 'off'}>
                    <Toggle label={SECTION_LABELS[k]} checked={on} onChange={(v) => upd('home', 'sections')(v ? [...s.home.sections, k] : s.home.sections.filter((x: string) => x !== k))} />
                    {on && <span><button class="icon" aria-label="Move up" onClick={() => mv(-1)}>&uarr;</button><button class="icon" aria-label="Move down" onClick={() => mv(1)}>&darr;</button></span>}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="Story">
            <Field label="Title" value={s.home.storyTitle} onInput={upd('home', 'storyTitle')} />
            <Area label="Quote" rows={2} value={s.home.storyQuote} onInput={upd('home', 'storyQuote')} />
            <Area label="Story text (HTML allowed)" rows={6} value={s.home.storyBody} onInput={upd('home', 'storyBody')} />
          </Card>
          <Card title="Other sections">
            <Field label="Ventures title" value={s.home.venturesTitle} onInput={upd('home', 'venturesTitle')} />
            <Area label="Ventures intro" rows={2} value={s.home.venturesIntro} onInput={upd('home', 'venturesIntro')} />
            <Field label="Writing title" value={s.home.writingTitle} onInput={upd('home', 'writingTitle')} />
            <Field label="Contact title" value={s.home.contactTitle} onInput={upd('home', 'contactTitle')} />
            <Area label="Contact text" rows={2} value={s.home.contactBody} onInput={upd('home', 'contactBody')} />
          </Card>
        </div>
      )}

      {tab === 'contact' && (
        <div class="grid2">
          <Card title="Contact page">
            <Field label="Headline" value={s.contact.title} onInput={upd('contact', 'title')} />
            <Area label="Intro" rows={3} value={s.contact.intro} onInput={upd('contact', 'intro')} />
            <Area label="Topics people can pick (one per line)" rows={5} value={s.contact.topics.join('\n')} onInput={(v) => upd('contact', 'topics')(v.split('\n').filter((x) => x.trim()))} />
            <Area label="Message after sending" rows={2} value={s.contact.success} onInput={upd('contact', 'success')} />
          </Card>
          <Card title="Side panel">
            <Toggle label="Show my email address" checked={s.contact.showEmail} onChange={upd('contact', 'showEmail')} />
            <Area label="Notes (one per line)" rows={4} value={s.contact.notes.join('\n')} onInput={(v) => upd('contact', 'notes')(v.split('\n').filter((x) => x.trim()))} />
            <p class="muted small">Messages land in your Inbox. To also get them by email or Slack, set CONTACT_WEBHOOK_URL (see the README).</p>
          </Card>
        </div>
      )}

      {tab === 'email' && <EmailTab s={s} upd={upd} />}

      {tab === 'menu' && (
        <div class="grid2">
          <Card title="Main menu">
            <LinkList items={s.nav} onChange={(v) => setGroup('nav', v)} labelKey="label" urlKey="href" />
          </Card>
          <Card title="Social profiles">
            <LinkList items={s.social} onChange={(v) => setGroup('social', v)} labelKey="network" urlKey="url" />
          </Card>
        </div>
      )}

      {tab === 'seo' && (
        <Card title="Search engines">
          <Field label="Site title" value={s.seo.title} onInput={upd('seo', 'title')} />
          <Area label="Site description" rows={3} value={s.seo.description} onInput={upd('seo', 'description')} />
        </Card>
      )}
    </div>
  );
}
const idx = (arr: string[], k: string) => (arr.includes(k) ? arr.indexOf(k) : 99);

function LinkList({ items, onChange, labelKey, urlKey }: { items: any[]; onChange: (v: any[]) => void; labelKey: string; urlKey: string }) {
  const set = (i: number, k: string, v: string) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div class="links">
      {items.map((it, i) => (
        <div class="link-row">
          <input aria-label="Label" value={it[labelKey]} onInput={(e) => set(i, labelKey, (e.target as HTMLInputElement).value)} placeholder="Label" />
          <input aria-label="Link" class="mono" value={it[urlKey]} onInput={(e) => set(i, urlKey, (e.target as HTMLInputElement).value)} placeholder="/about or https://" />
          <button class="icon" aria-label="Move up" onClick={() => { if (!i) return; const a = [...items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; onChange(a); }}>&uarr;</button>
          <button class="icon" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>&times;</button>
        </div>
      ))}
      <Btn kind="ghost" small onClick={() => onChange([...items, { [labelKey]: '', [urlKey]: '' }])}>Add link</Btn>
    </div>
  );
}

function AiLogoBtn({ kind, onDone }: { kind: 'logo' | 'favicon'; onDone: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [provider, setProvider] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ key: string; url: string; provider: string }[]>([]);
  async function run() {
    setBusy(true);
    try { const r = await api('/admin/ai/logo', { body: { kind, brief, provider } }); setResults((x) => [r, ...x]); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  return (
    <>
      <Btn kind="plain" small onClick={() => setOpen(true)}>Create with AI</Btn>
      {open && (
        <Sheet title={kind === 'logo' ? 'Create a logo with AI' : 'Create a favicon with AI'} onClose={() => setOpen(false)}>
          <Area label="Describe what you want (optional)" rows={3} value={brief} onInput={setBrief} placeholder="A clean monogram of MG, bold, with a small yellow detail" />
          <ProviderPicker value={provider} onChange={setProvider} />
          <Btn kind="accent" busy={busy} onClick={run}>{results.length ? 'Try another' : 'Create'}</Btn>
          <div class="logo-results">
            {results.map((r) => (
              <div class={`logo-res ${kind}`}>
                <img src={r.url} alt="AI logo option" />
                <Btn small onClick={() => { onDone(r.key); setOpen(false); toast.ok('Set. Save changes to make it live.'); }}>Use this</Btn>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ---------- Media library ---------- */
export function Media() {
  const { data, loading, reload } = useLoad<any[]>(() => api('/admin/media'));
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<any | null>(null);
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try { for (const f of Array.from(files)) await upload(f); toast.ok('Uploaded'); reload(); } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  return (
    <div class="view">
      <Head title="Media" sub="Images and files stored on Cloudflare R2.">
        <label class={`btn${busy ? ' busy' : ''}`}><input type="file" multiple hidden onChange={(e) => onFiles((e.target as HTMLInputElement).files)} />Upload</label>
      </Head>
      {loading ? <Spinner /> : data?.length ? (
        <div class="media-grid big">
          {data.map((m) => (
            <button class="media-item" onClick={() => setSel(m)}>
              {m.type.startsWith('image/') ? <img src={mediaUrl(m.key)} alt={m.alt || m.name} loading="lazy" /> : <span class="file mono">{m.name}</span>}
            </button>
          ))}
        </div>
      ) : <Empty title="No media yet">Upload photos, logos, and documents here.</Empty>}
      {sel && (
        <Sheet title={sel.name} onClose={() => setSel(null)}>
          {sel.type.startsWith('image/') && <img class="media-big" src={mediaUrl(sel.key)} alt="" />}
          <Field label="Link" mono value={`${location.origin}${mediaUrl(sel.key)}`} onInput={() => {}} />
          <p class="muted small">{(sel.size / 1024).toFixed(0)} KB · {sel.type}</p>
          <ConfirmBtn label="Delete file" onConfirm={async () => { await api(`/admin/media/${sel.key}`, { method: 'DELETE' }); setSel(null); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

/* ---------- Email sender, test and log ---------- */
function EmailTab({ s, upd }: { s: any; upd: (g: string, k: string) => (v: any) => void }) {
  const { data, reload } = useLoad<any>(() => api('/admin/email/log'));
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    try { const r = await api('/admin/email/test', { method: 'POST', body: {} }); toast.ok(r.message); } catch (e) { toast.err(e); } finally { setTesting(false); reload(); }
  }
  return (
    <div class="grid2">
      <Card title="Sender">
        <Field label="From name" value={s.mail.fromName} onInput={upd('mail', 'fromName')} hint={`Leave empty to use "${s.site.name}".`} />
        <Field label="From address" type="email" value={s.mail.fromAddress} onInput={upd('mail', 'fromAddress')} hint="Must be on a domain verified in Resend." />
        <Field label="Replies go to" type="email" value={s.mail.replyTo} onInput={upd('mail', 'replyTo')} hint={`Leave empty to use ${s.site.email || 'the email on the Identity tab'}.`} />
        <p class="muted small">Save changes first, then send a test.</p>
      </Card>
      <Card title="Status">
        <p>{data ? (data.ready ? 'Email is connected.' : 'Email is not connected yet. Add RESEND_API_KEY as a GitHub secret and redeploy.') : 'Checking...'}</p>
        <Btn kind="ghost" busy={testing} disabled={!data?.ready} onClick={test}>Send me a test email</Btn>
        {data?.log?.length ? (
          <ul class="list small">
            {data.log.slice(0, 10).map((l: any) => <li><span class={l.ok ? '' : 'err'}>{l.ok ? 'Sent' : 'Failed'}</span> {l.kind} to {l.to_addr}, {fmt(l.created_at)}{l.ok ? '' : `: ${l.detail}`}</li>)}
          </ul>
        ) : <p class="muted small">Nothing sent yet.</p>}
      </Card>
    </div>
  );
}
