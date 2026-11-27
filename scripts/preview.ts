// Builds a single-file preview of the public home page with example content.
import { DEFAULT_SETTINGS } from '../src/settings';
import { homeView, venturesView, writingView, postView, pageView, contactView } from '../src/views/public';
import { themeCss } from '../src/views/layout';
import { readFileSync, writeFileSync } from 'node:fs';

const s = structuredClone(DEFAULT_SETTINGS);
s.nav = s.nav.map((n) => ({ ...n, href: n.href === '/' ? '#home' : '#' + n.href.replace(/^\//, '') }));
s.social = [{ network: 'LinkedIn', url: 'https://linkedin.com' }, { network: 'Instagram', url: 'https://instagram.com' }];
const ventures = [
  { id: 1, name: 'Example Venture', url: 'https://ganders.co', tagline: 'Your first business goes here, with one line on what it does.', description: 'A short description that tells a visitor why this company exists and who it helps.', role: 'Founder', since: '2019', logo: '', accent: '' },
  { id: 2, name: 'Second Company', url: 'https://ganders.co', tagline: 'Each venture gets its own colour when someone hovers over it.', description: 'Clicking any of these opens the business in a new tab.', role: 'Co-founder', since: '2022', logo: '', accent: '#9FD3C7' },
  { id: 3, name: 'Side Project', url: 'https://ganders.co', tagline: 'Logos, roles, and dates are all set from the admin area.', description: '', role: 'Investor', since: '2024', logo: '', accent: '#E9A0B4' },
];
const posts = [
  { id: 1, slug: 'a', title: 'What I wish I knew before my first hire', excerpt: 'Example post. Drafts from Create Ideas land here after you review and publish them.', content_html: '', cover: '', tags: '', published_at: '2026-11-20' },
  { id: 2, slug: 'b', title: 'The boring systems that keep a small company alive', excerpt: 'Example post written by hand in the editor.', content_html: '', cover: '', tags: '', published_at: '2026-11-08' },
  { id: 3, slug: 'c', title: 'Why I build in New Zealand', excerpt: 'Example post. Your knowledge base shapes the ideas the AI suggests.', content_html: '', cover: '', tags: '', published_at: '2026-10-29' },
];
const aboutHtml = `<p>This is your About page, a full page of its own. It tells the longer story that the home page only hints at.</p><h2>Where I started</h2><p>Example text. The first job, the first business, and the moment it clicked. Your real story replaces this once you send it through.</p><blockquote>The best businesses I have built started as a problem I was tired of living with.</blockquote><h2>What I am building now</h2><p>Example text. A short tour of the ventures and why each one exists, with links across to the Ventures page.</p><h2>What I care about</h2><ul><li>Building things that last longer than the hype cycle</li><li>Backing people who do the work</li><li>Staying close to customers</li></ul>`;
const samplePost = `<p>Example post body. Everything here is written in the editor, either by you or as an AI draft you review first.</p><h2>The trap</h2><p>Most founders hire for the thing they hate doing. That is usually sales. The first hire that actually changed things for me was an operator.</p><blockquote>Hire for the work that keeps you up at night, not the work you avoid.</blockquote><h2>What I do now</h2><p>Example text continues here.</p>`;
const fix = (html: string) => html
  .replace(/href="\/writing\/[^"]*"/g, 'href="#post"')
  .replace(/href="\/(ventures|writing|about|contact)"/g, 'href="#$1"')
  .replace(/href="\/writing\?tag=[^"]*"/g, 'href="#writing"')
  .replace(/href="#(ventures|contact)"/g, 'href="#$1"')
  .replace(/href="\/"/g, 'href="#home"');
const views: Record<string, string> = {
  home: homeView(s, ventures as any, posts as any),
  about: pageView({ slug: 'about', title: 'About', summary: 'The longer version of who I am and why I build.', content_html: aboutHtml, template: 'standard' }, aboutHtml),
  ventures: venturesView(s, ventures as any),
  writing: writingView(s, posts as any),
  post: postView({ ...(posts[0] as any), tags: 'hiring, operations' }, samplePost),
  contact: contactView(s),
};
const body = Object.entries(views).map(([k, v]) => `<div class="pv-view" data-view="${k}"${k === 'home' ? '' : ' hidden'}>${fix(v)}</div>`).join('\n');
const css = readFileSync('public/site.css', 'utf8');
const js = readFileSync('public/site.js', 'utf8');
const progress = JSON.parse(readFileSync('scripts/progress.json', 'utf8')) as { done: string[]; doing: string[]; next: string[]; updated: string };
const li = (cls: string, items: string[]) => items.map((x) => `<li class="${cls}">${x}</li>`).join('');
const fams = 'family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&family=Schibsted+Grotesk:wght@400..700&family=Martian+Mono:wght@400;500';

const html = `<title>Ganders.co Preview</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fams}&display=swap">
<style>${themeCss(s.theme)}
${css}
:root{color-scheme:light}
body{padding-left:0;padding-right:0}
main,.masthead,.foot-inner{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
@media (min-width:640px){main,.masthead,.foot-inner{padding-left:max(32px,env(safe-area-inset-left,0px));padding-right:max(32px,env(safe-area-inset-right,0px))}}
@media (min-width:900px){main,.masthead,.foot-inner{padding-left:max(48px,env(safe-area-inset-left,0px));padding-right:max(48px,env(safe-area-inset-right,0px))}}
.masthead{top:env(safe-area-inset-top,0px)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:30;background:var(--paper)}
.pv-bar{background:var(--ink);color:var(--paper);font-family:var(--f-mono);font-size:.7rem;letter-spacing:.05em;text-transform:uppercase;padding:10px max(16px,env(safe-area-inset-left,0px));display:flex;gap:12px;flex-wrap:wrap;justify-content:center;text-align:center}
.pv-bar b{color:var(--accent);font-weight:500}
.pv{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:40;font-family:var(--f-body);max-width:min(360px,calc(100vw - 32px))}
.pv summary{list-style:none;cursor:pointer;background:var(--ink);color:var(--paper);padding:12px 16px;border-radius:999px;font-weight:600;font-size:.9rem;display:flex;gap:10px;align-items:center;box-shadow:4px 4px 0 var(--accent);margin-left:auto;width:max-content}
.pv summary::-webkit-details-marker{display:none}
.pv summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.pv-card{margin-top:10px;background:var(--paper);border:1.5px solid var(--ink);border-radius:var(--radius);padding:18px 18px 12px;box-shadow:6px 6px 0 var(--ink);max-height:60vh;overflow:auto}
.pv-card h3{margin:0 0 4px;font-family:var(--f-display);font-size:1.3rem;letter-spacing:-.03em}
.pv-card p{margin:0 0 12px;color:var(--muted);font-size:.85rem}
.pv-card h4{margin:14px 0 6px;font-family:var(--f-mono);font-size:.68rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500}
.pv-card ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:.9rem}
.pv-card li{display:flex;gap:10px;align-items:baseline}
.pv-card li::before{flex:none;font-family:var(--f-mono);font-size:.8rem;width:1em}
.pv-card li.done::before{content:"\\2713"}
.pv-card li.doing::before{content:"\\25CF";color:#B8860B}
.pv-card li.next::before{content:"\\25CB";color:var(--muted)}
.pv-card li.next{color:var(--muted)}
</style>
<div class="pv-bar"><span><b>Preview</b> with example content</span><span>Tap the menu to move between pages</span></div>
<header class="masthead">
  <a class="brand" href="#home"><span class="brand-mark">MG</span><span class="brand-name">${s.site.name}</span></a>
  <nav class="nav" aria-label="Main">${s.nav.map((n) => `<a href="${n.href}">${n.label}</a>`).join('')}</nav>
  <button class="nav-toggle" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')"><span></span><span></span></button>
</header>
<main id="main">${body}</main>
<footer class="foot"><div class="foot-inner">
  <div class="foot-sign"><span class="brand-mark sm">MG</span><p>${s.site.tagline}</p></div>
  <div class="foot-links"><span>LinkedIn</span><span>Instagram</span><span>${s.site.email}</span></div>
  <p class="foot-meta mono">&copy; 2026 ${s.site.name} · ${s.site.location}</p>
</div></footer>
<details class="pv">
  <summary>Build progress</summary>
  <div class="pv-card">
    <h3>Where things are</h3>
    <p>Updated ${progress.updated}</p>
    <h4>Done</h4><ul>${li('done', progress.done)}</ul>
    <h4>In progress</h4><ul>${li('doing', progress.doing)}</ul>
    <h4>Coming next</h4><ul>${li('next', progress.next)}</ul>
  </div>
</details>
<script>${js}</script>
<script>
(function(){
  var views=[].slice.call(document.querySelectorAll('.pv-view'));
  var map={home:'home',about:'about',ventures:'ventures',writing:'writing',post:'writing',contact:'contact'};
  function show(){
    var k=(location.hash||'#home').slice(1);if(!views.some(function(v){return v.dataset.view===k}))k='home';
    views.forEach(function(v){v.hidden=v.dataset.view!==k});
    document.querySelectorAll('.nav a').forEach(function(a){a.toggleAttribute('aria-current',a.getAttribute('href')==='#'+map[k])});
    window.scrollTo(0,0);document.body.classList.remove('nav-open');
  }
  addEventListener('hashchange',show);show();
  var f=document.querySelector('form[data-contact]');
  if(f){
    var nf=f.cloneNode(true);f.parentNode.replaceChild(nf,f);
    nf.addEventListener('submit',function(e){e.preventDefault();var st=nf.querySelector('.cf-status');st.className='cf-status ok';st.textContent='Preview only: on the live site this lands in your Inbox in the admin area.';nf.reset();});
  }
})();
</script>`;
writeFileSync(process.argv[2] || 'preview.html', html.replace(/mailto:[^"]*/g, '#contact'));
console.log('ok', html.length);
