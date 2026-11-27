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
    return `${f.replace(/ /g, '+')}:wght@300..700`;
  };
  return `https://fonts.googleapis.com/css2?${fams.map((f) => 'family=' + spec(f)).join('&')}&display=swap`;
}

export function themeCss(t: SiteSettings['theme']): string {
  return `:root{--paper:${t.paper};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--on-accent:${t.onAccent || t.paper};--line:${t.line};--radius:${Number(t.radius) || 0}px;--f-display:'${t.fontDisplay}',system-ui,sans-serif;--f-body:'${t.fontBody}',system-ui,sans-serif;--f-mono:'${t.fontMono}',ui-monospace,monospace;}`;
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
