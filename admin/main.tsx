import { h, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from './api';
import { Btn, Spinner, Toasts, toast } from './ui';
import { useRoute } from './router';
import { Dashboard, Posts, PostEdit, Ideas, Pages, PageEdit } from './views/content';
import { Ventures, Design, Media } from './views/site';
import { Inbox } from './views/inbox';
import { TeamView, AccountSheet } from './views/team';
import { session, can, type Me } from './session';
import { Knowledge, AiSettings, Modules, Integrations, Social } from './views/system';

// Each screen and the permissions that unlock it
const PERM: Record<string, string[]> = {
  dashboard: ['dashboard.view'], inbox: ['inbox.view'], posts: ['posts.view'], ideas: ['ideas.use'], pages: ['pages.view'], ventures: ['ventures.manage'],
  knowledge: ['knowledge.manage'], ai: ['ai.settings'], design: ['design.manage'], media: ['media.upload', 'media.delete'], modules: ['modules.manage'],
  social: ['social.publish'], connections: ['integrations.manage'], team: ['users.manage'],
};
const NAV: { group: string; items: [string, string][] }[] = [
  { group: 'Content', items: [['dashboard', 'Home'], ['inbox', 'Inbox'], ['posts', 'Posts'], ['ideas', 'Ideas'], ['pages', 'Pages'], ['ventures', 'Ventures']] },
  { group: 'Brain', items: [['knowledge', 'Knowledge base'], ['ai', 'AI']] },
  { group: 'Site', items: [['design', 'Design'], ['media', 'Media'], ['modules', 'Modules']] },
  { group: 'Reach', items: [['social', 'Social'], ['connections', 'Connections']] },
  { group: 'Admin', items: [['team', 'People and roles']] },
];
const allowed = (k: string) => can(...(PERM[k] || []));
// Bottom bar on phones: the four things Marc does most, plus the full menu
const TABS: [string, string][] = [['dashboard', 'Home'], ['posts', 'Posts'], ['ideas', 'Ideas'], ['inbox', 'Inbox']];

function Login({ onDone, firstRun, emailReady }: { onDone: () => void; firstRun: boolean; emailReady: boolean }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(location.hash.includes('link=expired') ? 'That sign in link has expired or was already used. Ask for a new one.' : '');
  const [info, setInfo] = useState('');
  async function submit(e: Event) {
    e.preventDefault();
    setBusy('pw'); setErr(''); setInfo('');
    try { await api('/login', { body: { email, password: pw } }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }
  async function link() {
    if (!email.includes('@')) return setErr('Enter your email first.');
    setBusy('link'); setErr(''); setInfo('');
    try { const r = await api('/login/link', { body: { email } }); setInfo(r.message); } catch (x: any) { setErr(x.message); } finally { setBusy(''); }
  }
  return (
    <div class="login">
      <form onSubmit={submit} class="login-card">
        <span class="mark">MG</span>
        <h1>Studio</h1>
        <p class="muted">{firstRun ? 'Welcome. Sign in with your email and the admin password to create your owner account.' : 'Sign in to manage ganders.co'}</p>
        <div class="field"><label for="em">Email</label><input id="em" type="email" autoComplete="username" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} autoFocus /></div>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} /></div>
        {err && <p class="err">{err}</p>}
        {info && <p class="note">{info}</p>}
        <Btn type="submit" busy={busy === 'pw'}>Sign in</Btn>
        {emailReady && <><div class="or"><span>or</span></div><Btn kind="ghost" busy={busy === 'link'} onClick={link}>Email me a sign in link</Btn></>}
      </form>
    </div>
  );
}

function Shell() {
  const [route] = [useRoute()];
  const [section, id] = route;
  const [account, setAccount] = useState(!!session.me?.must_change);
  const go = (k: string) => `#/${k}`;
  const view = (() => {
    const key = section === 'posts' || section === 'pages' ? section : section || 'dashboard';
    if (PERM[key] && !allowed(key)) return <div class="view"><div class="empty"><strong>No access</strong>Your role does not include this area. Ask an owner if you need it.</div></div>;
    switch (section) {
      case 'posts': return id ? <PostEdit id={id} /> : <Posts />;
      case 'ideas': return <Ideas />;
      case 'inbox': return <Inbox />;
      case 'pages': return id ? <PageEdit id={id} /> : <Pages />;
      case 'ventures': return <Ventures />;
      case 'knowledge': return <Knowledge />;
      case 'ai': return <AiSettings />;
      case 'design': return <Design />;
      case 'media': return <Media />;
      case 'modules': return <Modules />;
      case 'social': return <Social />;
      case 'connections': return <Integrations />;
      case 'team': return <TeamView />;
      default: return <Dashboard />;
    }
  })();
  async function signOut() { await api('/logout', { body: {} }).catch(() => {}); location.reload(); }
  return (
    <div class="shell">
      <header class="topbar">
        <a class="logo" href="#/dashboard"><span class="mark">MG</span><span>Studio</span></a>
        <a class="site-link" href="/" target="_blank" rel="noopener">View site &#8599;</a>
        <button class="burger" aria-label="Menu" onClick={() => document.body.classList.toggle('menu-open')}><span /><span /></button>
      </header>
      <nav class="side" aria-label="Admin">
        {NAV.map((g) => (
          <div class="side-group">
            <span class="side-label">{g.group}</span>
            {g.items.filter(([k]) => allowed(k)).map(([k, l]) => <a href={go(k)} class={section === k || (k === 'dashboard' && !section) ? 'on' : ''}>{l}</a>)}
          </div>
        )).filter((_, i) => NAV[i].items.some(([k]) => allowed(k)))}
        <div class="side-me">
          <button class="side-acct" onClick={() => setAccount(true)}><strong>{session.me?.name || session.me?.email}</strong><small>{session.me?.roles.join(', ')}</small></button>
          <button class="side-out" onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <div class="scrim" onClick={() => document.body.classList.remove('menu-open')} />
      <main class="content">{view}</main>
      {account && <AccountSheet forced={!!session.me?.must_change} onClose={() => setAccount(false)} />}
      <nav class="tabbar" aria-label="Quick">
        {TABS.filter(([k]) => allowed(k)).map(([k, l]) => <a href={go(k)} class={section === k ? 'on' : ''}>{l}</a>)}
        <button onClick={() => document.body.classList.toggle('menu-open')}>More</button>
      </nav>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [meta, setMeta] = useState({ firstRun: false, emailReady: false });
  const load = () => api('/me').then((r) => { session.set(r.user as Me); setMeta({ firstRun: r.firstRun, emailReady: r.emailReady }); setAuthed(r.authed); }).catch(() => setAuthed(false));
  useEffect(() => {
    load();
    const out = () => { setAuthed(false); toast.err('Your session ended. Please sign in again.'); };
    addEventListener('gco:logout', out);
    return () => removeEventListener('gco:logout', out);
  }, []);
  return <>{authed === null ? <div class="boot"><Spinner /></div> : authed ? <Shell /> : <Login firstRun={meta.firstRun} emailReady={meta.emailReady} onDone={load} />}<Toasts /></>;
}

render(<App />, document.getElementById('app')!);
