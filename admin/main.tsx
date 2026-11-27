import { h, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api } from './api';
import { Btn, Spinner, Toasts, toast } from './ui';
import { useRoute } from './router';
import { Dashboard, Posts, PostEdit, Ideas, Pages, PageEdit } from './views/content';
import { Ventures, Design, Media } from './views/site';
import { Inbox } from './views/inbox';
import { Knowledge, AiSettings, Modules, Integrations, Social } from './views/system';

const NAV: { group: string; items: [string, string][] }[] = [
  { group: 'Content', items: [['dashboard', 'Home'], ['inbox', 'Inbox'], ['posts', 'Posts'], ['ideas', 'Ideas'], ['pages', 'Pages'], ['ventures', 'Ventures']] },
  { group: 'Brain', items: [['knowledge', 'Knowledge base'], ['ai', 'AI']] },
  { group: 'Site', items: [['design', 'Design'], ['media', 'Media'], ['modules', 'Modules']] },
  { group: 'Reach', items: [['social', 'Social'], ['connections', 'Connections']] },
];
// Bottom bar on phones: the four things Marc does most, plus the full menu
const TABS: [string, string][] = [['dashboard', 'Home'], ['posts', 'Posts'], ['ideas', 'Ideas'], ['inbox', 'Inbox']];

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api('/login', { body: { password: pw } }); onDone(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div class="login">
      <form onSubmit={submit} class="login-card">
        <span class="mark">MG</span>
        <h1>Studio</h1>
        <p class="muted">Sign in to manage ganders.co</p>
        <div class="field"><label for="pw">Password</label><input id="pw" type="password" autoComplete="current-password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} autoFocus /></div>
        {err && <p class="err">{err}</p>}
        <Btn type="submit" busy={busy}>Sign in</Btn>
      </form>
    </div>
  );
}

function Shell() {
  const [route] = [useRoute()];
  const [section, id] = route;
  const go = (k: string) => `#/${k}`;
  const view = (() => {
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
            {g.items.map(([k, l]) => <a href={go(k)} class={section === k || (k === 'dashboard' && !section) ? 'on' : ''}>{l}</a>)}
          </div>
        ))}
        <button class="side-out" onClick={signOut}>Sign out</button>
      </nav>
      <div class="scrim" onClick={() => document.body.classList.remove('menu-open')} />
      <main class="content">{view}</main>
      <nav class="tabbar" aria-label="Quick">
        {TABS.map(([k, l]) => <a href={go(k)} class={section === k ? 'on' : ''}>{l}</a>)}
        <button onClick={() => document.body.classList.toggle('menu-open')}>More</button>
      </nav>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    api('/me').then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
    const out = () => { setAuthed(false); toast.err('Your session ended. Please sign in again.'); };
    addEventListener('gco:logout', out);
    return () => removeEventListener('gco:logout', out);
  }, []);
  return <>{authed === null ? <div class="boot"><Spinner /></div> : authed ? <Shell /> : <Login onDone={() => setAuthed(true)} />}<Toasts /></>;
}

render(<App />, document.getElementById('app')!);
