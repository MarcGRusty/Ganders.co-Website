import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { createLoginLink, useLoginLink, login, logout, currentUser, requireAuth, need, can, hashPassword, validPassword, effectivePermissions, timingSafeEqual } from './auth';
import { PERMISSIONS } from './permissions';
import { getSettings, saveSettings, THEME_PRESETS, DEFAULT_SETTINGS } from './settings';
import { availableProviders, generate, PROVIDERS, type ProviderId } from './llm';
import { deepNoEmDash, noEmDash, slugify, excerptFrom, extractJson, cleanSvg, stripTags } from './util';
import { publishToNetworks, socialStatus } from './social';
import { sendMail, mailReady, textToHtml } from './mail';

export const api = new Hono<AppEnv>();

/* ---------- Auth ---------- */
api.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>().catch(() => ({ email: '', password: '' }));
  const err = await login(c, email, password);
  if (err) return c.json({ error: err }, 401);
  return c.json({ ok: true });
});
api.post('/login/link', async (c) => {
  const { email } = await c.req.json<{ email: string }>().catch(() => ({ email: '' }));
  if (!mailReady(c.env)) return c.json({ error: 'Email is not set up yet, so sign in links cannot be sent. Use your password for now.' }, 400);
  const link = await createLoginLink(c, email);
  if (link) {
    const s = await getSettings(c.env);
    await sendMail(c.env, {
      kind: 'login', to: link.user.email, subject: `Your sign in link for ${s.site.name}`,
      text: `Hi ${link.user.name || 'there'},\n\nTap the link below to sign in to Studio. It works once and expires in 15 minutes.\n\n${link.url}\n\nIf you did not ask for this, you can ignore this email.`,
      html: textToHtml(`Hi ${link.user.name || 'there'},\n\nTap the button below to sign in to Studio. It works once and expires in 15 minutes.`) + `<p><a href="${link.url}" style="display:inline-block;background:#111A22;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:sans-serif;font-weight:600">Sign in to Studio</a></p><p style="font-family:sans-serif;color:#5B6670;font-size:13px">If you did not ask for this, you can ignore this email.</p>`,
    }, s.site.name);
  }
  // Same answer either way, so the form does not reveal who has an account
  return c.json({ ok: true, message: 'If that email has access, a sign in link is on its way. Check your inbox.' });
});
api.get('/login/verify', async (c) => {
  const ok = await useLoginLink(c, c.req.query('t') || '');
  const home = /^(admin|studio)\./.test(new URL(c.req.url).hostname) ? '/' : '/admin/';
  return c.redirect(ok ? home : `${home}#/?link=expired`, 302);
});
api.post('/logout', (c) => { logout(c); return c.json({ ok: true }); });
api.get('/me', async (c) => {
  const user = await currentUser(c);
  const first = !user && !(await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())?.n;
  return c.json({ authed: !!user, user, firstRun: first, emailReady: mailReady(c.env) });
});

api.use('/admin/*', requireAuth);
const a = api; // admin routes below all live under /api/admin

/* ---------- Generic CRUD ---------- */
type Table = { name: string; cols: string[]; order: string; prepare?: (row: any, env: Env) => any | Promise<any> };

const TABLES: Record<string, Table> = {
  pages: {
    name: 'pages', order: 'updated_at DESC',
    cols: ['slug', 'title', 'summary', 'content_html', 'content_json', 'status', 'template', 'seo_title', 'seo_description'],
    prepare: (r) => ({ ...r, ...slugOf(r), updated_at: now() }),
  },
  posts: {
    name: 'posts', order: "CASE status WHEN 'review' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC",
    cols: ['slug', 'title', 'excerpt', 'content_html', 'content_json', 'cover', 'tags', 'status', 'source', 'ai_provider', 'social_caption', 'published_at'],
    prepare: (r) => ({
      ...r,
      ...slugOf(r),
      ...(r.excerpt || r.content_html ? { excerpt: r.excerpt || excerptFrom(r.content_html) } : {}),
      ...(r.status === 'published' && !r.published_at ? { published_at: now() } : {}),
      updated_at: now(),
    }),
  },
  businesses: { name: 'businesses', order: 'sort, id', cols: ['name', 'url', 'tagline', 'description', 'role', 'since', 'logo', 'accent', 'sort', 'active'] },
  kb: { name: 'kb_entries', order: 'kind, updated_at DESC', cols: ['title', 'body', 'kind', 'tags', 'use_for_ideas'], prepare: (r) => ({ ...r, updated_at: now() }) },
  modules: { name: 'modules', order: 'updated_at DESC', cols: ['slug', 'name', 'description', 'html', 'css', 'js', 'enabled'], prepare: (r) => ({ ...r, ...slugOf({ slug: r.slug, title: r.name }), updated_at: now() }) },
  integrations: { name: 'integrations', order: 'name', cols: ['name', 'kind', 'base_url', 'auth_header', 'secret_name', 'notes', 'enabled'] },
  messages: { name: 'messages', order: "CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, created_at DESC", cols: ['status', 'notes', 'handled_by'] },
  ideas: { name: 'ideas', order: "CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at DESC", cols: ['title', 'angle', 'outline', 'channel', 'status', 'provider', 'post_id'] },
};
/** Only touch the slug when the request includes a slug or a title, so partial updates keep it. */
const slugOf = (r: any) => (r.slug || r.title ? { slug: slugify(r.slug || r.title) } : {});
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function pick(t: Table, body: any, extra: string[] = []) {
  const out: Record<string, any> = {};
  for (const k of [...t.cols, ...extra]) if (k in body) out[k] = typeof body[k] === 'string' && !k.endsWith('_json') && k !== 'js' && k !== 'css' ? noEmDash(body[k]) : body[k];
  return out;
}

a.get('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}', async (c) => {
  const t = TABLES[c.req.param('t')];
  guard(c, t.name, 'view');
  const light = t.name === 'posts' || t.name === 'pages' ? 'id, slug, title, status, updated_at' + (t.name === 'posts' ? ', source, excerpt, published_at, ai_provider' : '') : '*';
  const rows = await c.env.DB.prepare(`SELECT ${light} FROM ${t.name} ORDER BY ${t.order}`).all();
  return c.json(rows.results);
});

a.get('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}/:id{[0-9]+}', async (c) => {
  const t = TABLES[c.req.param('t')];
  guard(c, t.name, 'view');
  const row = await c.env.DB.prepare(`SELECT * FROM ${t.name} WHERE id = ?`).bind(c.req.param('id')).first();
  return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
});

a.post('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}', async (c) => {
  const t = TABLES[c.req.param('t')];
  let body = await c.req.json();
  guard(c, t.name, 'create', body);
  if (t.prepare) body = await t.prepare(body, c.env);
  const row = pick(t, body, t.cols.includes('slug') || t.name === 'kb_entries' || t.name === 'modules' ? ['updated_at'] : []);
  if (row.slug) row.slug = await uniqueSlug(c.env, t.name, row.slug);
  const keys = Object.keys(row);
  const res = await c.env.DB.prepare(`INSERT INTO ${t.name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING *`).bind(...keys.map((k) => row[k])).first();
  return c.json(res);
});

a.put('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}/:id{[0-9]+}', async (c) => {
  const t = TABLES[c.req.param('t')];
  const id = Number(c.req.param('id'));
  let body = await c.req.json();
  guard(c, t.name, 'update', body);
  if ((t.name === 'posts' || t.name === 'pages') && !can(c, `${t.name}.publish`)) {
    // Someone without publish rights cannot edit a live item or unpublish it
    const cur = await c.env.DB.prepare(`SELECT status FROM ${t.name} WHERE id = ?`).bind(id).first<{ status: string }>();
    if (cur?.status === 'published') need(c, `${t.name}.publish`);
  }
  if (t.prepare) body = await t.prepare(body, c.env);
  const row = pick(t, body, ['updated_at']);
  if (!t.cols.includes('updated_at') && !['pages', 'posts', 'kb_entries', 'modules'].includes(t.name)) delete row.updated_at;
  if (row.slug) row.slug = await uniqueSlug(c.env, t.name, row.slug, id);
  const keys = Object.keys(row);
  if (!keys.length) return c.json({ error: 'Nothing to save' }, 400);
  const res = await c.env.DB.prepare(`UPDATE ${t.name} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? RETURNING *`).bind(...keys.map((k) => row[k]), id).first();
  return c.json(res);
});

a.delete('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}/:id{[0-9]+}', async (c) => {
  const t = TABLES[c.req.param('t')];
  guard(c, t.name, 'delete');
  await c.env.DB.prepare(`DELETE FROM ${t.name} WHERE id = ?`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

a.post('/admin/businesses/reorder', async (c) => {
  need(c, 'ventures.manage');
  const { ids } = await c.req.json<{ ids: number[] }>();
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE businesses SET sort = ? WHERE id = ?').bind(i, id)));
  return c.json({ ok: true });
});

/** Which permission each table action needs. */
function guard(c: any, table: string, action: 'view' | 'create' | 'update' | 'delete', body?: any) {
  const P: Record<string, Partial<Record<typeof action, string[]>>> = {
    posts: { view: ['posts.view'], create: ['posts.edit'], update: ['posts.edit'], delete: ['posts.delete'] },
    pages: { view: ['pages.view'], create: ['pages.edit'], update: ['pages.edit'], delete: ['pages.delete'] },
    businesses: { view: ['dashboard.view'], create: ['ventures.manage'], update: ['ventures.manage'], delete: ['ventures.manage'] },
    kb_entries: { view: ['knowledge.manage', 'ideas.use'], create: ['knowledge.manage'], update: ['knowledge.manage'], delete: ['knowledge.manage'] },
    modules: { view: ['modules.manage', 'pages.edit', 'posts.edit'], create: ['modules.manage'], update: ['modules.manage'], delete: ['modules.manage'] },
    integrations: { view: ['integrations.manage'], create: ['integrations.manage'], update: ['integrations.manage'], delete: ['integrations.manage'] },
    ideas: { view: ['ideas.use'], create: ['ideas.use'], update: ['ideas.use'], delete: ['ideas.use'] },
    messages: { view: ['inbox.view'], create: ['inbox.manage'], update: ['inbox.manage'], delete: ['inbox.manage'] },
  };
  need(c, ...(P[table]?.[action] || ['users.manage']));
  // Publishing needs its own permission
  if ((table === 'posts' || table === 'pages') && body?.status === 'published' && action !== 'view') need(c, `${table}.publish`);
}

async function uniqueSlug(env: Env, table: string, slug: string, id?: number): Promise<string> {
  let s = slug, n = 2;
  while (await env.DB.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).bind(s, id ?? -1).first()) s = `${slug}-${n++}`;
  return s;
}

/* ---------- Settings ---------- */
a.get('/admin/settings', async (c) => (need(c, 'design.manage', 'ai.settings'), c.json({ settings: await getSettings(c.env), presets: THEME_PRESETS, defaults: DEFAULT_SETTINGS })));
a.put('/admin/settings', async (c) => {
  const patch = await c.req.json();
  for (const k of Object.keys(patch)) need(c, k === 'ai' ? 'ai.settings' : 'design.manage');
  const clean = deepNoEmDash(patch);
  if (patch.theme?.customCss !== undefined) clean.theme.customCss = patch.theme.customCss;
  await saveSettings(c.env, clean);
  return c.json({ settings: await getSettings(c.env) });
});

/* ---------- Dashboard ---------- */
a.get('/admin/overview', async (c) => {
  need(c, 'dashboard.view');
  const db = c.env.DB;
  const [counts, recentAi] = await Promise.all([
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM posts WHERE status='published') AS published,
      (SELECT COUNT(*) FROM posts WHERE status IN ('draft','review')) AS drafts,
      (SELECT COUNT(*) FROM ideas WHERE status='new') AS ideas,
      (SELECT COUNT(*) FROM pages) AS pages,
      (SELECT COUNT(*) FROM businesses WHERE active=1) AS ventures,
      (SELECT COUNT(*) FROM kb_entries) AS kb,
      (SELECT COUNT(*) FROM media) AS media,
      (SELECT COUNT(*) FROM messages WHERE status='new') AS messages`).first(),
    db.prepare('SELECT task, provider, model, ok, ms, error, created_at FROM ai_log ORDER BY id DESC LIMIT 8').all(),
  ]);
  return c.json({ counts, ai: aiStatus(c.env), social: socialStatus(c.env), recentAi: recentAi.results });
});

function aiStatus(env: Env) {
  const have = availableProviders(env);
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({ id, label: PROVIDERS[id].label, connected: have.includes(id), secret: PROVIDERS[id].secret }));
}
a.get('/admin/ai/status', (c) => c.json(aiStatus(c.env)));

/* ---------- Media (R2) ---------- */
a.get('/admin/media', async (c) => (need(c, 'media.upload', 'media.delete', 'posts.edit', 'pages.edit', 'design.manage'), c.json((await c.env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all()).results)));
a.post('/admin/media', async (c) => {
  need(c, 'media.upload');
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') return c.json({ error: 'No file received' }, 400);
  if (file.size > 25 * 1024 * 1024) return c.json({ error: 'Files must be under 25 MB' }, 400);
  const key = await storeMedia(c.env, file.name, file.type || 'application/octet-stream', await file.arrayBuffer(), String(form.get('alt') || ''));
  return c.json({ key, url: `/media/${key}` });
});
a.delete('/admin/media/:key{.+}', async (c) => {
  need(c, 'media.delete');
  const key = c.req.param('key');
  await c.env.MEDIA.delete(key);
  await c.env.DB.prepare('DELETE FROM media WHERE key = ?').bind(key).run();
  return c.json({ ok: true });
});

async function storeMedia(env: Env, name: string, type: string, data: ArrayBuffer | string, alt = ''): Promise<string> {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || type.split('/')[1] || 'bin').toLowerCase().replace('svg+xml', 'svg');
  const base = slugify(name.replace(/\.[^.]+$/, '')).slice(0, 40);
  const key = `${new Date().toISOString().slice(0, 7)}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const size = typeof data === 'string' ? new TextEncoder().encode(data).length : data.byteLength;
  await env.MEDIA.put(key, data, { httpMetadata: { contentType: type } });
  await env.DB.prepare('INSERT INTO media (key, name, type, size, alt) VALUES (?, ?, ?, ?, ?)').bind(key, name, type, size, alt).run();
  return key;
}

/* ---------- AI ---------- */
async function kbContext(env: Env, limit = 14000): Promise<string> {
  const rows = (await env.DB.prepare('SELECT title, body, kind FROM kb_entries WHERE use_for_ideas = 1 ORDER BY kind, updated_at DESC').all<{ title: string; body: string; kind: string }>()).results;
  let out = '';
  for (const r of rows) {
    const chunk = `## ${r.title} (${r.kind})\n${stripTags(r.body)}\n\n`;
    if (out.length + chunk.length > limit) break;
    out += chunk;
  }
  return out || '(The knowledge base is empty so far.)';
}

async function aboutOwner(env: Env): Promise<string> {
  const s = await getSettings(env);
  const biz = (await env.DB.prepare('SELECT name, tagline, description, role FROM businesses WHERE active = 1 ORDER BY sort').all<any>()).results;
  return `Site owner: ${s.site.name}. ${s.site.tagline}. Based in ${s.site.location}.\nBusinesses:\n${biz.map((b) => `- ${b.name} (${b.role}): ${b.tagline} ${b.description}`).join('\n') || '- none listed yet'}`;
}

a.post('/admin/ai/assist', async (c) => {
  need(c, 'ai.use');
  const { action, text, instruction, provider, context } = await c.req.json<any>();
  const s = await getSettings(c.env);
  const actions: Record<string, string> = {
    improve: 'Improve the clarity and flow of this text while keeping the meaning and the author\'s voice.',
    shorten: 'Make this text about half as long without losing the point.',
    expand: 'Expand this text with more depth, a concrete example, and a clear takeaway.',
    tone: `Rewrite this in the author's voice: ${s.ai.voice}`,
    headline: 'Write 5 strong headline options for this text, one per line, no numbering.',
    continue: 'Continue writing from where this text ends, in the same voice, for 2 to 3 paragraphs.',
    custom: instruction || 'Improve this text.',
  };
  const res = await generate(c.env, s, {
    task: 'writing',
    provider,
    system: 'You edit and write for a personal website. Return only the resulting text as clean HTML using <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>. No preamble, no code fences.',
    prompt: `${actions[action] || actions.custom}\n\n${context ? `Context about the piece: ${context}\n\n` : ''}Text:\n${text}`,
  });
  return c.json({ html: res.text.replace(/^```(?:html)?|```$/g, '').trim(), provider: res.provider, model: res.model });
});

a.post('/admin/ai/ideas', async (c) => {
  need(c, 'ideas.use');
  const { count = 6, focus = '', provider, channel = 'blog' } = await c.req.json<any>().catch(() => ({}));
  const s = await getSettings(c.env);
  const recent = (await c.env.DB.prepare('SELECT title FROM posts ORDER BY id DESC LIMIT 40').all<{ title: string }>()).results.map((r) => r.title);
  const prior = (await c.env.DB.prepare('SELECT title FROM ideas ORDER BY id DESC LIMIT 40').all<{ title: string }>()).results.map((r) => r.title);
  const res = await generate(c.env, s, {
    task: 'ideas',
    provider,
    json: true,
    maxTokens: 3000,
    system: 'You are a content strategist who knows this person well. You suggest specific, opinionated post ideas grounded in their real experience. Never generic listicles.',
    prompt: `${await aboutOwner(c.env)}\n\nKnowledge base:\n${await kbContext(c.env)}\n\nAlready written or suggested (do not repeat): ${[...recent, ...prior].join('; ') || 'nothing yet'}\n\n${focus ? `Focus for this batch: ${focus}\n\n` : ''}Suggest ${Math.min(Number(count) || 6, 12)} post ideas for the ${channel} channel. Return JSON: {"ideas":[{"title":"...","angle":"one sentence on the specific take and why it is worth reading","outline":"3 to 5 short bullet points separated by newlines"}]}`,
  });
  const data = extractJson<{ ideas: { title: string; angle: string; outline: string }[] }>(res.text);
  const list = (Array.isArray(data) ? data : data.ideas || []).slice(0, 12);
  const rows = await c.env.DB.batch(
    list.map((i) => c.env.DB.prepare('INSERT INTO ideas (title, angle, outline, channel, provider) VALUES (?, ?, ?, ?, ?) RETURNING *').bind(noEmDash(i.title), noEmDash(i.angle || ''), noEmDash(Array.isArray(i.outline) ? i.outline.join('\n') : i.outline || ''), channel, res.provider)),
  );
  return c.json({ ideas: rows.map((r) => r.results[0]), provider: res.provider, model: res.model });
});

a.post('/admin/ai/draft', async (c) => {
  need(c, 'ideas.use');
  const { ideaId, provider } = await c.req.json<any>();
  const idea = await c.env.DB.prepare('SELECT * FROM ideas WHERE id = ?').bind(ideaId).first<any>();
  if (!idea) return c.json({ error: 'Idea not found' }, 404);
  const s = await getSettings(c.env);
  const res = await generate(c.env, s, {
    task: 'writing',
    provider,
    json: true,
    maxTokens: 4000,
    system: 'You ghostwrite blog posts for this person in first person. Grounded, specific, useful. Use details from the knowledge base where they fit, and never invent facts about the person or their companies. Where a personal detail is needed but unknown, write [add detail] so they can fill it in.',
    prompt: `${await aboutOwner(c.env)}\n\nKnowledge base:\n${await kbContext(c.env)}\n\nWrite a post.\nTitle: ${idea.title}\nAngle: ${idea.angle}\nOutline:\n${idea.outline}\n\nReturn JSON: {"title":"...","excerpt":"one or two sentence summary","html":"the post body as clean HTML using p, h2, h3, ul, ol, li, blockquote, strong, em. 600 to 1000 words.","tags":"comma separated, 2 to 4 tags","social":"a short social media caption to promote the post, under 280 characters, no hashtag spam"}`,
  });
  const d = extractJson<{ title: string; excerpt: string; html: string; tags: string; social: string }>(res.text);
  const slug = await uniqueSlug(c.env, 'posts', slugify(d.title || idea.title));
  const post = await c.env.DB.prepare(
    "INSERT INTO posts (slug, title, excerpt, content_html, tags, status, source, ai_provider, social_caption) VALUES (?, ?, ?, ?, ?, 'review', 'ai', ?, ?) RETURNING id",
  ).bind(slug, noEmDash(d.title || idea.title), noEmDash(d.excerpt || ''), noEmDash(d.html || ''), d.tags || '', `${res.provider}:${res.model}`, noEmDash(d.social || '')).first<{ id: number }>();
  await c.env.DB.prepare("UPDATE ideas SET status = 'drafted', post_id = ? WHERE id = ?").bind(post!.id, ideaId).run();
  return c.json({ postId: post!.id, provider: res.provider });
});

a.post('/admin/ai/social', async (c) => {
  need(c, 'social.publish', 'ai.use');
  const { postId, network = 'Facebook', provider } = await c.req.json<any>();
  const p = await c.env.DB.prepare('SELECT title, excerpt, content_html FROM posts WHERE id = ?').bind(postId).first<any>();
  if (!p) return c.json({ error: 'Post not found' }, 404);
  const s = await getSettings(c.env);
  const res = await generate(c.env, s, {
    task: 'social', provider,
    prompt: `Write one ${network} caption to share this post. Sound like a person, not a brand. Under 300 characters for X, under 600 for others. At most 3 relevant hashtags at the end for Instagram, none otherwise. Return only the caption.\n\nTitle: ${p.title}\nSummary: ${p.excerpt}\nBody: ${stripTags(p.content_html).slice(0, 3000)}`,
  });
  return c.json({ caption: res.text.trim(), provider: res.provider });
});

a.post('/admin/ai/logo', async (c) => {
  need(c, 'design.manage');
  const { kind = 'logo', brief = '', provider } = await c.req.json<any>();
  const s = await getSettings(c.env);
  const fav = kind === 'favicon';
  const res = await generate(c.env, s, {
    task: 'design', provider, maxTokens: 4000,
    system: 'You are a senior identity designer who hand-crafts SVG. You produce clean, minimal, geometric marks that look designed by a person, never clip art, never gradients unless asked, no text effects.',
    prompt: `Design a ${fav ? 'favicon (square, 64x64 viewBox, legible at 16px, bold simple monogram or symbol)' : 'wordmark or combination logo (viewBox around 320x80, horizontal)'} for ${s.site.name}. ${s.site.tagline}.\nBrand colours: ink ${s.theme.light.ink}, paper ${s.theme.light.paper}, accent ${s.theme.light.accent}.\nDisplay typeface on the site: ${s.theme.fontDisplay} (do not rely on it being installed; convert letterforms to paths or use a generic font-family fallback with font-weight).\n${brief ? `Brief from the owner: ${brief}\n` : ''}Return only the SVG markup, starting with <svg and ending with </svg>. Include xmlns. No scripts, no external references.`,
  });
  const svg = cleanSvg(res.text);
  const key = await storeMedia(c.env, `${kind}-ai.svg`, 'image/svg+xml', svg);
  return c.json({ key, url: `/media/${key}`, svg, provider: res.provider });
});

a.post('/admin/ai/module', async (c) => {
  need(c, 'modules.manage');
  const { description, provider, moduleId } = await c.req.json<any>();
  const s = await getSettings(c.env);
  const existing = moduleId ? await c.env.DB.prepare('SELECT * FROM modules WHERE id = ?').bind(moduleId).first<any>() : null;
  const res = await generate(c.env, s, {
    task: 'code', provider, json: true, maxTokens: 6000,
    system: `You build small, self-contained website modules (blocks) for a personal site. Output semantic, accessible HTML, CSS, and optional vanilla JS.
Rules: CSS is automatically scoped to the module wrapper, so write plain selectors. Use the site's CSS variables: --paper, --ink, --muted, --accent, --on-accent, --line, --radius, --f-display, --f-body, --f-mono. The JS receives a variable named root (the module wrapper element); query inside it with root.querySelector. No external libraries, no network calls except to same-origin /api/public/* endpoints. Responsive down to 360px wide. Never use em dashes in any copy.`,
    prompt: `${existing ? `Current module:\nHTML:\n${existing.html}\nCSS:\n${existing.css}\nJS:\n${existing.js}\n\nChange request: ` : 'Build this module: '}${description}\n\nReturn JSON: {"name":"short name","slug":"kebab-case","description":"one sentence","html":"...","css":"...","js":"..."}`,
  });
  const d = extractJson<any>(res.text);
  return c.json({ module: { name: d.name, slug: slugify(d.slug || d.name), description: noEmDash(d.description || description), html: noEmDash(d.html || ''), css: d.css || '', js: d.js || '' }, provider: res.provider });
});

a.post('/admin/ai/page', async (c) => {
  need(c, 'pages.edit');
  const { description, provider } = await c.req.json<any>();
  const s = await getSettings(c.env);
  const res = await generate(c.env, s, {
    task: 'writing', provider, json: true, maxTokens: 4000,
    prompt: `${await aboutOwner(c.env)}\n\nKnowledge base:\n${await kbContext(c.env, 8000)}\n\nDraft a website page: ${description}\nReturn JSON: {"title":"...","summary":"one sentence","html":"page body as clean HTML (p, h2, h3, ul, li, blockquote, strong, em)"}. Mark unknown personal facts as [add detail].`,
  });
  return c.json({ page: extractJson(res.text), provider: res.provider });
});

/* ---------- Social ---------- */
a.get('/admin/social/status', (c) => c.json(socialStatus(c.env)));
a.get('/admin/social/log', async (c) => (need(c, 'social.publish'), c.json((await c.env.DB.prepare('SELECT l.*, p.title FROM social_log l LEFT JOIN posts p ON p.id = l.post_id ORDER BY l.id DESC LIMIT 50').all()).results)));
a.post('/admin/social/publish', async (c) => {
  need(c, 'social.publish');
  const { postId, networks, caption, imageUrl } = await c.req.json<any>();
  const results = await publishToNetworks(c.env, { postId, networks, caption: noEmDash(caption || ''), imageUrl });
  return c.json({ results });
});

/* ---------- Integrations: call an external API through the Worker ---------- */
a.post('/admin/integrations/:id{[0-9]+}/call', async (c) => {
  need(c, 'integrations.manage');
  const row = await c.env.DB.prepare('SELECT * FROM integrations WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!row) return c.json({ error: 'Integration not found' }, 404);
  const { method = 'GET', path = '', body } = await c.req.json<any>();
  const url = new URL(path.replace(/^\//, ''), row.base_url.endsWith('/') ? row.base_url : row.base_url + '/');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (row.secret_name) {
    const token = c.env[row.secret_name];
    if (!token) return c.json({ error: `Secret ${row.secret_name} is not set. Add it with: npx wrangler secret put ${row.secret_name}` }, 400);
    headers[row.auth_header || 'Authorization'] = String(token).startsWith('Bearer ') || row.auth_header !== 'Authorization' ? String(token) : `Bearer ${token}`;
  }
  if (body) headers['content-type'] = 'application/json';
  const t0 = Date.now();
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return c.json({ status: r.status, ms: Date.now() - t0, data });
});

/* ---------- Inbox actions ---------- */
a.post('/admin/messages/:id{[0-9]+}/reply', async (c) => {
  need(c, 'inbox.manage');
  const id = Number(c.req.param('id'));
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: 'Write a reply first.' }, 400);
  const m = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<any>();
  if (!m) return c.json({ error: 'Message not found' }, 404);
  const s = await getSettings(c.env);
  const me = c.get('user')!;
  const body = noEmDash(text.trim());
  const quoted = `\n\n---\nOn ${m.created_at} UTC, ${m.name} wrote:\n${m.body.split('\n').map((l: string) => '> ' + l).join('\n')}`;
  const r = await sendMail(c.env, { kind: 'reply', to: m.email, subject: `Re: ${m.topic || 'your message'}`, text: body + quoted, replyTo: s.site.email || undefined }, s.site.name);
  if (!r.ok) return c.json({ error: `The reply was not sent: ${r.detail}` }, 400);
  const note = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${me.name || me.email} replied:\n${body}`;
  await c.env.DB.prepare("UPDATE messages SET status = 'read', replied_at = datetime('now'), handled_by = ?, notes = TRIM(COALESCE(notes, '') || char(10) || char(10) || ?) WHERE id = ?").bind(me.email, note, id).run();
  return c.json({ ok: true });
});
a.get('/admin/email/log', async (c) => {
  need(c, 'inbox.view', 'users.manage');
  return c.json({ ready: mailReady(c.env), log: (await c.env.DB.prepare('SELECT * FROM email_log ORDER BY id DESC LIMIT 30').all()).results });
});
a.post('/admin/email/test', async (c) => {
  need(c, 'users.manage', 'design.manage');
  const me = c.get('user')!;
  const s = await getSettings(c.env);
  const r = await sendMail(c.env, { kind: 'test', to: me.email, subject: 'Test email from your website', text: `This is a test from ${s.site.name}. If you are reading this, email is working.` }, s.site.name);
  return r.ok ? c.json({ ok: true, message: `Sent to ${me.email}` }) : c.json({ error: r.detail }, 400);
});

/* ---------- People, roles, groups, permissions ---------- */
a.post('/admin/account/password', async (c) => {
  const me = c.get('user')!;
  const { current, next } = await c.req.json<any>();
  const bad = validPassword(next);
  if (bad) return c.json({ error: bad }, 400);
  const u = await c.env.DB.prepare('SELECT password_hash, salt FROM users WHERE id = ?').bind(me.id).first<any>();
  if (!(await timingSafeEqual((await hashPassword(current || '', u.salt)).hash, u.password_hash))) return c.json({ error: 'Your current password did not match.' }, 400);
  const { hash, salt } = await hashPassword(next);
  // Bumping session_version signs out every other device
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, must_change = 0, session_version = session_version + 1 WHERE id = ?').bind(hash, salt, me.id).run();
  logout(c);
  return c.json({ ok: true });
});

a.get('/admin/team', async (c) => {
  need(c, 'users.manage');
  const db = c.env.DB;
  const [users, roles, groups, ur, ug, gr, custom] = await Promise.all([
    db.prepare('SELECT id, email, name, active, must_change, last_login, created_at FROM users ORDER BY created_at').all(),
    db.prepare('SELECT * FROM roles ORDER BY system DESC, id').all(),
    db.prepare('SELECT * FROM groups ORDER BY name').all(),
    db.prepare('SELECT * FROM user_roles').all(),
    db.prepare('SELECT * FROM user_groups').all(),
    db.prepare('SELECT * FROM group_roles').all(),
    db.prepare('SELECT * FROM custom_permissions ORDER BY key').all(),
  ]);
  const parse = (r: any) => ({ ...r, permissions: JSON.parse(r.permissions || '[]') });
  return c.json({
    users: users.results.map((u: any) => ({ ...u, roleIds: ur.results.filter((x: any) => x.user_id === u.id).map((x: any) => x.role_id), groupIds: ug.results.filter((x: any) => x.user_id === u.id).map((x: any) => x.group_id) })),
    roles: roles.results.map(parse),
    groups: groups.results.map((g: any) => ({ ...parse(g), roleIds: gr.results.filter((x: any) => x.group_id === g.id).map((x: any) => x.role_id), memberIds: ug.results.filter((x: any) => x.group_id === g.id).map((x: any) => x.user_id) })),
    permissions: PERMISSIONS,
    custom: custom.results,
  });
});

async function ownerCount(env: Env, excludeUser?: number): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(DISTINCT u.id) AS n FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN user_groups ug ON ug.user_id = u.id LEFT JOIN group_roles gr ON gr.group_id = ug.group_id
    JOIN roles r ON r.id IN (ur.role_id, gr.role_id) AND r.key = 'owner' WHERE u.active = 1 AND u.id != ?`).bind(excludeUser ?? -1).first<{ n: number }>();
  return r?.n ?? 0;
}
async function isOwner(env: Env, userId: number) { return (await effectivePermissions(env, userId)).roles.includes('owner'); }
async function guardOwnerRoles(c: any, roleIds: number[]) {
  // Only owners can hand out the Owner role
  const owner = await c.env.DB.prepare("SELECT id FROM roles WHERE key = 'owner'").first();
  if (owner && roleIds.includes(owner.id) && !c.get('user').roles.includes('owner')) need(c, '*');
}

function tempPassword() {
  const words = 'harbour kowhai summit tide fern ridge ember stone river cedar orbit lantern'.split(' ');
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000}`;
}

a.post('/admin/team/users', async (c) => {
  need(c, 'users.manage');
  const { email, name, roleIds = [], groupIds = [], password } = await c.req.json<any>();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return c.json({ error: 'Enter a valid email.' }, 400);
  await guardOwnerRoles(c, roleIds);
  const pw = password || tempPassword();
  const bad = validPassword(pw);
  if (bad) return c.json({ error: bad }, 400);
  const { hash, salt } = await hashPassword(pw);
  const u = await c.env.DB.prepare('INSERT INTO users (email, name, password_hash, salt, must_change) VALUES (?, ?, ?, ?, 1) RETURNING id').bind(email.trim().toLowerCase(), name || '', hash, salt).first<{ id: number }>().catch(() => null);
  if (!u) return c.json({ error: 'Someone with that email already exists.' }, 400);
  await setLinks(c.env, u.id, roleIds, groupIds);
  return c.json({ id: u.id, tempPassword: pw });
});

a.put('/admin/team/users/:id{[0-9]+}', async (c) => {
  need(c, 'users.manage');
  const id = Number(c.req.param('id'));
  const { name, active, roleIds, groupIds, resetPassword } = await c.req.json<any>();
  if (roleIds) await guardOwnerRoles(c, roleIds);
  const wasOwner = await isOwner(c.env, id);
  if (wasOwner && !c.get('user')!.roles.includes('owner')) return c.json({ error: 'Only an owner can change another owner.' }, 403);
  if (name !== undefined || active !== undefined)
    await c.env.DB.prepare('UPDATE users SET name = COALESCE(?, name), active = COALESCE(?, active), session_version = session_version + CASE WHEN ? = 0 THEN 1 ELSE 0 END WHERE id = ?').bind(name ?? null, active ?? null, active ?? 1, id).run();
  if (roleIds || groupIds) await setLinks(c.env, id, roleIds, groupIds);
  if (wasOwner && (await ownerCount(c.env)) === 0) {
    // Roll back: there must always be at least one active owner
    await c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = 'owner'").bind(id).run();
    await c.env.DB.prepare('UPDATE users SET active = 1 WHERE id = ?').bind(id).run();
    return c.json({ error: 'There must always be at least one active owner, so the Owner role was kept.' }, 400);
  }
  let temp: string | undefined;
  if (resetPassword) {
    temp = tempPassword();
    const { hash, salt } = await hashPassword(temp);
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, must_change = 1, session_version = session_version + 1 WHERE id = ?').bind(hash, salt, id).run();
  }
  return c.json({ ok: true, tempPassword: temp });
});

a.delete('/admin/team/users/:id{[0-9]+}', async (c) => {
  need(c, 'users.manage');
  const id = Number(c.req.param('id'));
  if (id === c.get('user')!.id) return c.json({ error: 'You cannot delete your own account.' }, 400);
  if (await isOwner(c.env, id)) {
    if (!c.get('user')!.roles.includes('owner')) return c.json({ error: 'Only an owner can remove another owner.' }, 403);
    if ((await ownerCount(c.env, id)) === 0) return c.json({ error: 'There must always be at least one owner.' }, 400);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM user_groups WHERE user_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

async function setLinks(env: Env, userId: number, roleIds?: number[], groupIds?: number[]) {
  const s: D1PreparedStatement[] = [];
  if (roleIds) {
    s.push(env.DB.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId));
    for (const r of roleIds) s.push(env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').bind(userId, r));
  }
  if (groupIds) {
    s.push(env.DB.prepare('DELETE FROM user_groups WHERE user_id = ?').bind(userId));
    for (const g of groupIds) s.push(env.DB.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').bind(userId, g));
  }
  if (s.length) await env.DB.batch(s);
}

const permList = (p: unknown) => JSON.stringify(Array.isArray(p) ? p.filter((x) => typeof x === 'string' && x !== '*').slice(0, 200) : []);

a.post('/admin/team/roles', async (c) => {
  need(c, 'users.manage');
  const { name, description = '', permissions = [], colour = '' } = await c.req.json<any>();
  if (!name?.trim()) return c.json({ error: 'Give the role a name.' }, 400);
  const key = `${slugify(name)}-${crypto.randomUUID().slice(0, 4)}`;
  const r = await c.env.DB.prepare('INSERT INTO roles (key, name, description, permissions, colour) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(key, noEmDash(name), noEmDash(description), permList(permissions), colour).first();
  return c.json(r);
});
a.put('/admin/team/roles/:id{[0-9]+}', async (c) => {
  need(c, 'users.manage');
  const id = Number(c.req.param('id'));
  const role = await c.env.DB.prepare('SELECT * FROM roles WHERE id = ?').bind(id).first<any>();
  if (!role) return c.json({ error: 'Role not found' }, 404);
  if (role.key === 'owner') return c.json({ error: 'The Owner role always has every permission and cannot be changed.' }, 400);
  const { name, description, permissions, colour } = await c.req.json<any>();
  await c.env.DB.prepare('UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description), permissions = COALESCE(?, permissions), colour = COALESCE(?, colour) WHERE id = ?')
    .bind(name ? noEmDash(name) : null, description !== undefined ? noEmDash(description) : null, permissions ? permList(permissions) : null, colour ?? null, id).run();
  return c.json({ ok: true });
});
a.delete('/admin/team/roles/:id{[0-9]+}', async (c) => {
  need(c, 'users.manage');
  const id = Number(c.req.param('id'));
  const role = await c.env.DB.prepare('SELECT system FROM roles WHERE id = ?').bind(id).first<any>();
  if (role?.system) return c.json({ error: 'Built in roles cannot be deleted. You can edit their permissions instead.' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM user_roles WHERE role_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM group_roles WHERE role_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

a.post('/admin/team/groups', async (c) => {
  need(c, 'users.manage');
  const { name, description = '', permissions = [], roleIds = [], memberIds = [] } = await c.req.json<any>();
  if (!name?.trim()) return c.json({ error: 'Give the group a name.' }, 400);
  await guardOwnerRoles(c, roleIds);
  const g = await c.env.DB.prepare('INSERT INTO groups (name, description, permissions) VALUES (?, ?, ?) RETURNING id').bind(noEmDash(name), noEmDash(description), permList(permissions)).first<{ id: number }>().catch(() => null);
  if (!g) return c.json({ error: 'A group with that name already exists.' }, 400);
  await setGroup(c.env, g.id, roleIds, memberIds);
  return c.json(g);
});
a.put('/admin/team/groups/:id{[0-9]+}', async (c) => {
  need(c, 'users.manage');
  const id = Number(c.req.param('id'));
  const { name, description, permissions, roleIds, memberIds } = await c.req.json<any>();
  if (roleIds) await guardOwnerRoles(c, roleIds);
  await c.env.DB.prepare('UPDATE groups SET name = COALESCE(?, name), description = COALESCE(?, description), permissions = COALESCE(?, permissions) WHERE id = ?')
    .bind(name ? noEmDash(name) : null, description !== undefined ? noEmDash(description) : null, permissions ? permList(permissions) : null, id).run();
  await setGroup(c.env, id, roleIds, memberIds);
  return c.json({ ok: true });
});
a.delete('/admin/team/groups/:id{[0-9]+}', async (c) => {
  need(c, 'users.manage');
  const id = Number(c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM user_groups WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM group_roles WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});
async function setGroup(env: Env, id: number, roleIds?: number[], memberIds?: number[]) {
  const s: D1PreparedStatement[] = [];
  if (roleIds) { s.push(env.DB.prepare('DELETE FROM group_roles WHERE group_id = ?').bind(id)); for (const r of roleIds) s.push(env.DB.prepare('INSERT INTO group_roles (group_id, role_id) VALUES (?, ?)').bind(id, r)); }
  if (memberIds) { s.push(env.DB.prepare('DELETE FROM user_groups WHERE group_id = ?').bind(id)); for (const u of memberIds) s.push(env.DB.prepare('INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)').bind(u, id)); }
  if (s.length) await env.DB.batch(s);
}

a.post('/admin/team/permissions', async (c) => {
  need(c, 'users.manage');
  const { key, label, description = '' } = await c.req.json<any>();
  const k = `custom.${slugify(key || label).replace(/-/g, '_')}`;
  if (!label?.trim()) return c.json({ error: 'Give the permission a name.' }, 400);
  await c.env.DB.prepare('INSERT OR REPLACE INTO custom_permissions (key, label, description) VALUES (?, ?, ?)').bind(k, noEmDash(label), noEmDash(description)).run();
  return c.json({ key: k });
});
a.delete('/admin/team/permissions/:key', async (c) => {
  need(c, 'users.manage');
  await c.env.DB.prepare('DELETE FROM custom_permissions WHERE key = ?').bind(c.req.param('key')).run();
  return c.json({ ok: true });
});

/* ---------- Public helper endpoints usable by modules ---------- */
api.get('/public/ventures', async (c) => c.json((await c.env.DB.prepare('SELECT name, url, tagline, logo, accent FROM businesses WHERE active = 1 ORDER BY sort').all()).results));
api.get('/public/posts', async (c) => c.json((await c.env.DB.prepare("SELECT slug, title, excerpt, published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 20").all()).results));
