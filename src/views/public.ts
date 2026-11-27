import type { SiteSettings } from '../settings';
import { esc, fmtDate, safeUrl, noEmDash } from '../util';
import { mediaUrl } from './layout';

export interface Business { id: number; name: string; url: string; tagline: string; description: string; role: string; since: string; logo: string; accent: string }
export interface PostRow { id: number; slug: string; title: string; excerpt: string; content_html: string; cover: string; tags: string; published_at: string }
export interface PageRow { slug: string; title: string; summary: string; content_html: string; template: string }

const pad = (n: number) => String(n).padStart(2, '0');

function hostOf(u: string): string {
  try { return new URL(safeUrl(u)).host.replace(/^www\./, ''); } catch { return ''; }
}

export function ventureList(list: Business[], compact = false): string {
  if (!list.length) return `<p class="empty">Ventures will appear here once they are added in the admin area.</p>`;
  return `<ol class="ventures${compact ? ' compact' : ''}">${list
    .map((b, i) => {
      const href = safeUrl(b.url);
      const logo = mediaUrl(b.logo);
      return `<li class="venture" style="${b.accent ? `--v-accent:${esc(b.accent)}` : ''}">
  <a href="${esc(href)}" target="_blank" rel="noopener" aria-label="${esc(b.name)}, opens in a new tab">
    <span class="v-mark" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="">` : esc(b.name.slice(0, 1))}</span>
    <span class="v-main">
      <span class="v-name">${esc(b.name)}</span>
      <span class="v-tag">${esc(b.tagline)}</span>
      ${!compact && b.description ? `<span class="v-desc">${esc(b.description)}</span>` : ''}
    </span>
    <span class="v-meta mono">${b.role ? `<span>${esc(b.role)}</span>` : ''}${b.since ? `<span>Since ${esc(b.since)}</span>` : ''}<span class="v-host">${esc(hostOf(b.url))}</span></span>
    <span class="v-arrow" aria-hidden="true">&#8599;</span>
  </a>
</li>`;
    })
    .join('')}</ol>`;
}

function postList(posts: PostRow[]): string {
  if (!posts.length) return `<p class="empty">New writing is on the way.</p>`;
  return `<ul class="posts">${posts
    .map(
      (p) => `<li><a href="/writing/${esc(p.slug)}">
  <span class="p-date mono">${esc(fmtDate(p.published_at))}</span>
  <span class="p-title">${esc(p.title)}</span>
  <span class="p-ex">${esc(p.excerpt)}</span>
</a></li>`,
    )
    .join('')}</ul>`;
}

function sectionHead(num: number, title: string, intro = '', link?: { href: string; label: string }): string {
  return `<div class="s-head">
  <h2 class="s-title">${esc(title)}</h2>
  ${intro ? `<p class="s-intro">${esc(intro)}</p>` : ''}
  ${link ? `<a class="s-link mono" href="${esc(link.href)}">${esc(link.label)} &rarr;</a>` : ''}
</div>`;
}

export function homeView(s: SiteSettings, ventures: Business[], posts: PostRow[]): string {
  const h = s.home;
  const portrait = mediaUrl(s.site.portrait);
  let n = 0;
  const blocks: Record<string, () => string> = {
    hero: () => `<section class="hero reveal">
  <p class="kicker mono"><span class="dot"></span>${esc(h.kicker)}</p>
  <h1 class="display">${esc(h.headline)} <mark>${esc(h.headlineEmphasis)}</mark></h1>
  <div class="hero-foot">
    <p class="lede">${esc(h.intro)}</p>
    <div class="ctas">
      <a class="btn" href="${esc(safeUrl(h.primaryCta.href))}">${esc(h.primaryCta.label)}</a>
      <a class="btn ghost" href="${esc(safeUrl(h.secondaryCta.href))}">${esc(h.secondaryCta.label)}</a>
    </div>
  </div>
  ${portrait ? `<figure class="portrait"><img src="${esc(portrait)}" alt="${esc(s.site.name)}"></figure>` : ''}
</section>`,
    now: () =>
      h.now.length
        ? `<section class="now reveal" aria-label="Right now"><span class="now-label mono">Now</span><ul>${h.now.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`
        : '',
    ventures: () => `<section class="block reveal" id="ventures">${sectionHead(++n, h.venturesTitle, h.venturesIntro, { href: '/ventures', label: 'All ventures' })}${ventureList(ventures)}</section>`,
    story: () => `<section class="block story reveal" id="story">${sectionHead(++n, h.storyTitle)}
  <div class="story-grid">
    ${h.storyQuote ? `<blockquote class="pull"><span>${esc(h.storyQuote)}</span><cite class="mono">${esc(s.site.name)}</cite></blockquote>` : '<div></div>'}
    <div class="prose">${h.storyBody}<p><a class="s-link mono" href="/about">The full story &rarr;</a></p></div>
  </div>
</section>`,
    writing: () => `<section class="block reveal" id="writing">${sectionHead(++n, h.writingTitle, '', { href: '/writing', label: 'Everything I have written' })}${postList(posts)}</section>`,
    contact: () => `<section class="contact reveal" id="contact">
  <h2 class="display sm">${esc(h.contactTitle)}</h2>
  <p class="lede">${esc(h.contactBody)}</p>
  <a class="mail" href="/contact">Send me a message<span aria-hidden="true">&rarr;</span></a>
</section>`,
  };
  return noEmDash(h.sections.map((k) => blocks[k]?.() ?? '').join('\n'));
}

export function venturesView(s: SiteSettings, ventures: Business[]): string {
  return `<section class="page-head reveal"><p class="kicker mono">${esc(s.site.name)}</p><h1 class="display md">${esc(s.home.venturesTitle)}</h1><p class="lede">${esc(s.home.venturesIntro)}</p></section>
<section class="block reveal">${ventureList(ventures)}</section>`;
}

export function writingView(s: SiteSettings, posts: PostRow[], tag?: string): string {
  return `<section class="page-head reveal"><p class="kicker mono">${tag ? `Tagged ${esc(tag)}` : 'Notes and essays'}</p><h1 class="display md">${esc(s.home.writingTitle)}</h1></section>
<section class="block reveal">${postList(posts)}</section>`;
}

export function postView(p: PostRow, html: string): string {
  const tags = (p.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  return `<article class="article">
  <header class="a-head reveal">
    <p class="kicker mono"><a href="/writing">Writing</a> · ${esc(fmtDate(p.published_at))}</p>
    <h1 class="display md">${esc(p.title)}</h1>
    ${p.excerpt ? `<p class="lede">${esc(p.excerpt)}</p>` : ''}
  </header>
  ${p.cover ? `<figure class="a-cover"><img src="${esc(mediaUrl(p.cover))}" alt=""></figure>` : ''}
  <div class="prose a-body">${html}</div>
  ${tags.length ? `<p class="a-tags mono">${tags.map((t) => `<a href="/writing?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join(' ')}</p>` : ''}
  <p class="a-back"><a class="s-link mono" href="/writing">&larr; More writing</a></p>
</article>`;
}

export function pageView(p: PageRow, html: string): string {
  if (p.template === 'bare') return html;
  return `<article class="article ${p.template === 'wide' ? 'wide' : ''}">
  <header class="a-head reveal"><h1 class="display md">${esc(p.title)}</h1>${p.summary ? `<p class="lede">${esc(p.summary)}</p>` : ''}</header>
  <div class="prose a-body">${html}</div>
</article>`;
}

export function notFoundView(): string {
  return `<section class="page-head center"><p class="kicker mono">404</p><h1 class="display md">This page wandered off.</h1><p class="lede">It might have moved, or it never existed. Start again from <a href="/">the home page</a>.</p></section>`;
}

export function contactView(s: SiteSettings, sent = false): string {
  const c = s.contact;
  return `<section class="contact-page">
  <header class="page-head">
    <p class="kicker mono"><span class="dot"></span>Contact</p>
    <h1 class="display md">${esc(c.title)}</h1>
    <p class="lede">${esc(c.intro)}</p>
  </header>
  <div class="contact-grid">
    <form class="cform" method="post" action="/contact" data-contact>
      <div class="cf-row">
        <label class="cf"><span>Your name</span><input name="name" required autocomplete="name" maxlength="120"></label>
        <label class="cf"><span>Email</span><input name="email" type="email" required autocomplete="email" maxlength="200"></label>
      </div>
      <label class="cf"><span>Company <em>(optional)</em></span><input name="company" autocomplete="organization" maxlength="160"></label>
      ${c.topics.length ? `<fieldset class="cf topics"><legend>What is it about?</legend><div class="chips">${c.topics.map((t, i) => `<label class="chip"><input type="radio" name="topic" value="${esc(t)}"${i === 0 ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></fieldset>` : ''}
      <label class="cf"><span>Message</span><textarea name="body" rows="6" required maxlength="5000"></textarea></label>
      <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn" type="submit">Send message</button>
      <p class="cf-status" role="status" aria-live="polite">${sent ? esc(c.success) : ''}</p>
    </form>
    <aside class="contact-side">
      ${c.showEmail && s.site.email ? `<div class="cs-block"><span class="mono">Email</span><a href="mailto:${esc(s.site.email)}">${esc(s.site.email)}</a></div>` : ''}
      ${s.site.location ? `<div class="cs-block"><span class="mono">Based in</span><p>${esc(s.site.location)}</p></div>` : ''}
      ${s.social.filter((x) => x.url).length ? `<div class="cs-block"><span class="mono">Elsewhere</span><ul>${s.social.filter((x) => x.url).map((x) => `<li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.network)} &#8599;</a></li>`).join('')}</ul></div>` : ''}
      ${c.notes.length ? `<div class="cs-block notes">${c.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
    </aside>
  </div>
</section>`;
}
