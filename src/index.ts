import { Hono } from 'hono';
import type { AppEnv } from './env';
import { getSettings } from './settings';
import { layout } from './views/layout';
import { homeView, venturesView, writingView, postView, pageView, notFoundView, contactView, type Business, type PostRow, type PageRow } from './views/public';
import { renderContent } from './modules';
import { api } from './api';
import { noEmDash, esc } from './util';
import { sendMail, notifyAddress } from './mail';
import { withFocal } from './focal';

const app = new Hono<AppEnv>();

/**
 * Studio lives on its own subdomains: admin.ganders.co and studio.ganders.co.
 * On those hosts every page path serves the Studio app; /api and /media work as normal.
 * On the main site, /admin sends people to the Studio subdomain once it is set up.
 */
const isStudioHost = (host: string) => /^(admin|studio)\./i.test(host);
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (isStudioHost(url.hostname)) {
    const p = url.pathname;
    if (p.startsWith('/api/') || p.startsWith('/media/') || p === '/favicon.svg') return next();
    const res = await c.env.ASSETS.fetch(new Request(new URL('/admin/', url)));
    return new Response(res.body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
  }
  if ((url.pathname === '/admin' || url.pathname === '/admin/') && c.env.STUDIO_URL && url.hostname === new URL(c.env.SITE_URL).hostname) {
    return c.redirect(c.env.STUDIO_URL, 302);
  }
  await next();
});

// Public pages: point every cropped photo at its face or subject
app.use('*', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && !c.req.path.startsWith('/api/') && !c.req.path.startsWith('/media/')) c.res = await withFocal(c.env, c.res);
});

app.route('/api', api);

// Media from R2
app.get('/media/:key{.+}', async (c) => {
  if (!c.env.MEDIA) return c.notFound();
  const obj = await c.env.MEDIA.get(c.req.param('key'));
  if (!obj) return c.notFound();
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'public, max-age=31536000, immutable');
  if (h.get('content-type')?.includes('svg')) h.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
  return new Response(obj.body, { headers: h });
});

app.get('/admin', (c) => c.redirect('/admin/'));

async function ventures(c: any): Promise<Business[]> {
  return (await c.env.DB.prepare('SELECT * FROM businesses WHERE active = 1 ORDER BY sort, id').all()).results as Business[];
}

function html(c: any, body: string, status = 200) {
  return c.html(noEmDash(body), status, { 'cache-control': 'public, max-age=0, s-maxage=60' });
}

app.get('/', async (c) => {
  const s = await getSettings(c.env);
  const [v, p] = await Promise.all([
    ventures(c),
    c.env.DB.prepare("SELECT id, slug, title, excerpt, cover, tags, published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 4").all(),
  ]);
  const body = await renderContent(c.env, homeView(s, v, p.results as unknown as PostRow[]));
  return html(c, layout(s, { path: '/', body, bodyClass: 'home' }, c.env.SITE_URL));
});

app.get('/ventures', async (c) => {
  const s = await getSettings(c.env);
  return html(c, layout(s, { path: '/ventures', title: s.home.venturesTitle, body: venturesView(s, await ventures(c)) }, c.env.SITE_URL));
});

app.get('/writing', async (c) => {
  const s = await getSettings(c.env);
  const tag = c.req.query('tag');
  const q = tag
    ? c.env.DB.prepare("SELECT * FROM posts WHERE status = 'published' AND (',' || REPLACE(tags, ', ', ',') || ',') LIKE ? ORDER BY published_at DESC").bind(`%,${tag},%`)
    : c.env.DB.prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC");
  const posts = (await q.all()).results as unknown as PostRow[];
  return html(c, layout(s, { path: '/writing', title: s.home.writingTitle, body: writingView(s, posts, tag) }, c.env.SITE_URL));
});

app.get('/writing/:slug', async (c) => {
  const s = await getSettings(c.env);
  const p = await c.env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").bind(c.req.param('slug')).first<PostRow>();
  if (!p) return notFound(c);
  const body = postView(p, await renderContent(c.env, p.content_html));
  return html(c, layout(s, { path: `/writing/${p.slug}`, title: p.title, description: p.excerpt, image: p.cover, body }, c.env.SITE_URL));
});

/* ---------- Contact ---------- */
app.get('/contact', async (c) => {
  const s = await getSettings(c.env);
  return html(c, layout(s, { path: '/contact', title: 'Contact', description: s.contact.intro, body: contactView(s, c.req.query('sent') === '1') }, c.env.SITE_URL));
});

async function takeMessage(c: any, d: Record<string, string>): Promise<string | null> {
  if (d.website) return null; // honeypot: quietly accept and drop
  const name = (d.name || '').trim().slice(0, 120);
  const email = (d.email || '').trim().slice(0, 200);
  const body = (d.body || '').trim().slice(0, 5000);
  if (!name || !body || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please add your name, a valid email, and a message.';
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const ipHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + (c.env.SESSION_SECRET || ''))))).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')").bind(ipHash).first();
  if ((recent?.n ?? 0) >= 5) return 'Thanks, I already have a few messages from you. Please try again a little later.';
  await c.env.DB.prepare('INSERT INTO messages (name, email, topic, company, body, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, email, (d.topic || '').slice(0, 80), (d.company || '').slice(0, 160), body, ipHash).run();
  // Email the owner straight away; the message is also in the Studio Inbox
  const s = await getSettings(c.env);
  const to = notifyAddress(c.env, s.site.email);
  if (to) {
    const studio = c.env.STUDIO_URL || `${new URL(c.req.url).origin}/admin/`;
    c.executionCtx.waitUntil(sendMail(c.env, {
      kind: 'contact', to, replyTo: email,
      subject: `New message from ${name}${d.topic ? ` (${d.topic})` : ''}`,
      text: `${name}${d.company ? `, ${d.company}` : ''} <${email}>\nTopic: ${d.topic || 'Not given'}\n\n${body}\n\nReply to this email to answer directly, or open the Inbox: ${studio}#/inbox`,
    }, s.site.name));
  }
  if (c.env.CONTACT_WEBHOOK_URL) {
    c.executionCtx.waitUntil(fetch(String(c.env.CONTACT_WEBHOOK_URL), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, topic: d.topic, company: d.company, message: body }) }).catch(() => {}));
  }
  return null;
}

app.post('/contact', async (c) => {
  const form = Object.fromEntries((await c.req.formData()).entries()) as Record<string, string>;
  const err = await takeMessage(c, form);
  if (err) return c.text(err, 400);
  return c.redirect('/contact?sent=1', 303);
});
app.post('/api/public/contact', async (c) => {
  const err = await takeMessage(c, await c.req.json().catch(() => ({})));
  if (err) return c.json({ error: err }, 400);
  const s = await getSettings(c.env);
  return c.json({ ok: true, message: s.contact.success });
});

app.get('/feed.xml', async (c) => {
  const s = await getSettings(c.env);
  const posts = (await c.env.DB.prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT 30").all()).results as unknown as PostRow[];
  const base = c.env.SITE_URL;
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${base}/writing/${p.slug}</link><guid>${base}/writing/${p.slug}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(s.site.name)}</title><link>${base}</link><description>${esc(s.seo.description)}</description>${items}</channel></rss>`, 200, { 'content-type': 'application/rss+xml; charset=utf-8' });
});

app.get('/sitemap.xml', async (c) => {
  const base = c.env.SITE_URL;
  const [pages, posts] = await Promise.all([
    c.env.DB.prepare("SELECT slug, updated_at FROM pages WHERE status = 'published'").all<{ slug: string; updated_at: string }>(),
    c.env.DB.prepare("SELECT slug, updated_at FROM posts WHERE status = 'published'").all<{ slug: string; updated_at: string }>(),
  ]);
  const urls = ['/', '/about', '/contact', '/ventures', '/writing', ...pages.results.map((p) => `/${p.slug}`), ...posts.results.map((p) => `/writing/${p.slug}`)];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`, 200, { 'content-type': 'application/xml' });
});

// CMS pages at /:slug (and nested slugs like /work/speaking)
app.get('/:slug{[a-z0-9][a-z0-9/-]*}', async (c) => {
  const s = await getSettings(c.env);
  const slug = c.req.param('slug').replace(/\/$/, '');
  const p = await c.env.DB.prepare("SELECT * FROM pages WHERE slug = ? AND status = 'published'").bind(slug).first<PageRow & { seo_title: string; seo_description: string }>();
  if (!p && slug === 'about') {
    // About is a core page: if it was deleted or unpublished, fall back to the home page story
    const body = pageView({ slug, title: s.home.storyTitle, summary: s.site.tagline, content_html: s.home.storyBody, template: 'standard' }, s.home.storyBody);
    return html(c, layout(s, { path: '/about', title: 'About', body }, c.env.SITE_URL));
  }
  if (!p) return notFound(c);
  const body = pageView(p, await renderContent(c.env, p.content_html));
  return html(c, layout(s, { path: `/${slug}`, title: p.seo_title || p.title, description: p.seo_description || p.summary, body }, c.env.SITE_URL));
});

async function notFound(c: any) {
  const s = await getSettings(c.env);
  return html(c, layout(s, { path: c.req.path, title: 'Not found', body: notFoundView() }, c.env.SITE_URL), 404);
}
app.notFound(notFound);

app.onError((err, c) => {
  if ((err as any).status === 403) return c.json({ error: err.message }, 403);
  console.error(err);
  if (c.req.path.startsWith('/api/')) return c.json({ error: err.message || 'Something went wrong' }, 500);
  return c.text('Something went wrong. Please try again shortly.', 500);
});

export default app;
