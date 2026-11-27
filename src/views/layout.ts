import type { SiteSettings } from '../settings';
import { esc, safeUrl } from '../util';

export function mediaUrl(v: string): string {
  if (!v) return '';
  if (/^(https?:)?\/\//.test(v) || v.startsWith('/') || v.startsWith('data:')) return v;
  return `/media/${v}`;
}

function fontsHref(t: SiteSettings['theme']): string {
  const fams = [t.fontDisplay, t.fontBody, t.fontMono].filter((f, i, a) => f && a.indexOf(f) === i);
  const spec = (f: string) => {
    if (f === 'Bricolage Grotesque') return 'Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800';
    if (f === 'Space Mono') return 'Space+Mono:wght@400;700';
    if (f === 'DM Mono') return 'DM+Mono:wght@400;500';
    if (f.includes('Mono')) return `${f.replace(/ /g, '+')}:wght@400;500`;
    return `${f.replace(/ /g, '+')}:wght@400;500;600;700`;
  };
  return `https://fonts.googleapis.com/css2?${fams.map((f) => 'family=' + spec(f)).join('&')}&display=swap`;
}

const pal = (p: any) => `--paper:${p.paper};--ink:${p.ink};--muted:${p.muted};--accent:${p.accent};--on-accent:${p.onAccent || p.paper};--line:${p.line};`;

/** Light palette on :root, dark palette for [data-theme=dark] and for devices set to dark when the visitor has not chosen. */
export function themeCss(t: SiteSettings['theme']): string {
  const light = t.light || (t as any);
  const dark = t.dark || light;
  const base = `--radius:${Number(t.radius) || 0}px;--f-display:'${t.fontDisplay}',system-ui,sans-serif;--f-body:'${t.fontBody}',system-ui,sans-serif;--f-mono:'${t.fontMono}',ui-monospace,monospace;`;
  const first = t.mode === 'dark' ? dark : light;
  const auto = t.mode === 'auto' ? `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${pal(dark)}color-scheme:dark}}` : '';
  return `:root{${base}${pal(first)}color-scheme:${t.mode === 'dark' ? 'dark' : 'light'}}${auto}:root[data-theme=light]{${pal(light)}color-scheme:light}:root[data-theme=dark]{${pal(dark)}color-scheme:dark}`;
}

/** Runs before paint so a visitor's saved choice never flashes the wrong theme. */
export const THEME_BOOT = `<script>try{var m=localStorage.getItem('gco-theme');if(m==='light'||m==='dark')document.documentElement.dataset.theme=m}catch(e){}</script>`;

export function themeToggle(t: SiteSettings['theme']): string {
  if (t.toggle === false) return '';
  return `<button class="theme-toggle" type="button" aria-label="Switch between light and dark" data-mode="${t.mode}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path class="sun" d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path class="moon" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button>`;
}

export interface LayoutOpts {
  title?: string;
  description?: string;
  path: string;
  body: string;
  image?: string;
  bodyClass?: string;
  extraHead?: string;
}

export function layout(s: SiteSettings, o: LayoutOpts, siteUrl: string): string {
  const title = o.title ? `${o.title} | ${s.seo.title || s.site.name}` : s.seo.title || s.site.name;
  const desc = o.description || s.seo.description;
  const fav = mediaUrl(s.site.favicon) || '/favicon.svg';
  const og = mediaUrl(o.image || s.site.ogImage);
  const logo = mediaUrl(s.site.logo);
  const nav = s.nav
    .map((n) => {
      const href = safeUrl(n.href);
      const active = (href === '/' ? o.path === '/' : o.path.startsWith(href)) ? ' aria-current="page"' : '';
      const ext = n.external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${esc(href)}"${active}${ext}>${esc(n.label)}</a>`;
    })
    .join('');
  const socials = s.social.filter((x) => x.url).map((x) => `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.network)}</a>`).join('');
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en-NZ">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${THEME_BOOT}
<meta name="theme-color" content="${esc((s.theme.light || (s.theme as any)).paper)}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${esc((s.theme.dark || (s.theme as any)).paper)}" media="(prefers-color-scheme: dark)">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${esc(fav)}">
<link rel="canonical" href="${esc(siteUrl + o.path)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
${og ? `<meta property="og:image" content="${esc(og.startsWith('/') ? siteUrl + og : og)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsHref(s.theme)}">
<link rel="stylesheet" href="/site.css">
<style>${themeCss(s.theme)}${s.theme.customCss || ''}</style>
${o.extraHead || ''}
</head>
<body class="${esc(o.bodyClass || '')}">
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="brand" href="/" aria-label="${esc(s.site.name)} home">
    ${logo ? `<img src="${esc(logo)}" alt="${esc(s.site.name)}">` : `<span class="brand-mark">${esc(initials(s.site.name))}</span><span class="brand-name">${esc(s.site.name)}</span>`}
  </a>
  <nav class="nav" aria-label="Main">${nav}</nav>
  ${themeToggle(s.theme)}
  <button class="nav-toggle" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')"><span></span><span></span></button>
</header>
<main id="main">${o.body}</main>
<footer class="foot">
  <div class="foot-inner">
    <div class="foot-sign">
      <span class="brand-mark sm">${esc(initials(s.site.name))}</span>
      <p>${esc(s.site.tagline)}</p>
    </div>
    <div class="foot-links">${socials}${s.site.email ? `<a href="mailto:${esc(s.site.email)}">${esc(s.site.email)}</a>` : ''}</div>
    <p class="foot-meta mono">&copy; ${year} ${esc(s.site.name)}${s.site.location ? ` · ${esc(s.site.location)}` : ''}</p>
  </div>
</footer>
<script src="/site.js" defer></script>
</body>
</html>`;
}

export function initials(name: string): string {
  return (name || 'G').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}
