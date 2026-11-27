import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { login, logout, isAuthed, requireAuth } from './auth';
import { getSettings, saveSettings, THEME_PRESETS, DEFAULT_SETTINGS } from './settings';
import { availableProviders, generate, PROVIDERS, type ProviderId } from './llm';
import { deepNoEmDash, noEmDash, slugify, excerptFrom, extractJson, cleanSvg, stripTags } from './util';
import { publishToNetworks, socialStatus } from './social';

export const api = new Hono<AppEnv>();

/* ---------- Auth ---------- */
api.post('/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>().catch(() => ({ password: '' }));
  if (!c.env.ADMIN_PASSWORD) return c.json({ error: 'ADMIN_PASSWORD is not set. Add it as a Worker secret first.' }, 400);
  if (!(await login(c, password || ''))) return c.json({ error: 'That password did not match.' }, 401);
  return c.json({ ok: true });
});
api.post('/logout', (c) => { logout(c); return c.json({ ok: true }); });
api.get('/me', async (c) => c.json({ authed: await isAuthed(c) }));

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
  messages: { name: 'messages', order: "CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END, created_at DESC", cols: ['status'] },
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
  const light = t.name === 'posts' || t.name === 'pages' ? 'id, slug, title, status, updated_at' + (t.name === 'posts' ? ', source, excerpt, published_at, ai_provider' : '') : '*';
  const rows = await c.env.DB.prepare(`SELECT ${light} FROM ${t.name} ORDER BY ${t.order}`).all();
  return c.json(rows.results);
});

a.get('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}/:id{[0-9]+}', async (c) => {
  const t = TABLES[c.req.param('t')];
  const row = await c.env.DB.prepare(`SELECT * FROM ${t.name} WHERE id = ?`).bind(c.req.param('id')).first();
  return row ? c.json(row) : c.json({ error: 'Not found' }, 404);
});

a.post('/admin/:t{pages|posts|businesses|kb|modules|integrations|ideas|messages}', async (c) => {
  const t = TABLES[c.req.param('t')];
  let body = await c.req.json();
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
  await c.env.DB.prepare(`DELETE FROM ${t.name} WHERE id = ?`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

a.post('/admin/businesses/reorder', async (c) => {
  const { ids } = await c.req.json<{ ids: number[] }>();
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE businesses SET sort = ? WHERE id = ?').bind(i, id)));
  return c.json({ ok: true });
});

async function uniqueSlug(env: Env, table: string, slug: string, id?: number): Promise<string> {
  let s = slug, n = 2;
  while (await env.DB.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).bind(s, id ?? -1).first()) s = `${slug}-${n++}`;
  return s;
}

/* ---------- Settings ---------- */
a.get('/admin/settings', async (c) => c.json({ settings: await getSettings(c.env), presets: THEME_PRESETS, defaults: DEFAULT_SETTINGS }));
a.put('/admin/settings', async (c) => {
  const patch = await c.req.json();
  const clean = deepNoEmDash(patch);
  if (patch.theme?.customCss !== undefined) clean.theme.customCss = patch.theme.customCss;
  await saveSettings(c.env, clean);
  return c.json({ settings: await getSettings(c.env) });
});

/* ---------- Dashboard ---------- */
a.get('/admin/overview', async (c) => {
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
a.get('/admin/media', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC').all()).results));
a.post('/admin/media', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file') as unknown as File | null;
  if (!file || typeof file === 'string') return c.json({ error: 'No file received' }, 400);
  if (file.size > 25 * 1024 * 1024) return c.json({ error: 'Files must be under 25 MB' }, 400);
  const key = await storeMedia(c.env, file.name, file.type || 'application/octet-stream', await file.arrayBuffer(), String(form.get('alt') || ''));
  return c.json({ key, url: `/media/${key}` });
});
a.delete('/admin/media/:key{.+}', async (c) => {
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
  const { kind = 'logo', brief = '', provider } = await c.req.json<any>();
  const s = await getSettings(c.env);
  const fav = kind === 'favicon';
  const res = await generate(c.env, s, {
    task: 'design', provider, maxTokens: 4000,
    system: 'You are a senior identity designer who hand-crafts SVG. You produce clean, minimal, geometric marks that look designed by a person, never clip art, never gradients unless asked, no text effects.',
    prompt: `Design a ${fav ? 'favicon (square, 64x64 viewBox, legible at 16px, bold simple monogram or symbol)' : 'wordmark or combination logo (viewBox around 320x80, horizontal)'} for ${s.site.name}. ${s.site.tagline}.\nBrand colours: ink ${s.theme.ink}, paper ${s.theme.paper}, accent ${s.theme.accent}.\nDisplay typeface on the site: ${s.theme.fontDisplay} (do not rely on it being installed; convert letterforms to paths or use a generic font-family fallback with font-weight).\n${brief ? `Brief from the owner: ${brief}\n` : ''}Return only the SVG markup, starting with <svg and ending with </svg>. Include xmlns. No scripts, no external references.`,
  });
  const svg = cleanSvg(res.text);
  const key = await storeMedia(c.env, `${kind}-ai.svg`, 'image/svg+xml', svg);
  return c.json({ key, url: `/media/${key}`, svg, provider: res.provider });
});

a.post('/admin/ai/module', async (c) => {
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
a.get('/admin/social/log', async (c) => c.json((await c.env.DB.prepare('SELECT l.*, p.title FROM social_log l LEFT JOIN posts p ON p.id = l.post_id ORDER BY l.id DESC LIMIT 50').all()).results));
a.post('/admin/social/publish', async (c) => {
  const { postId, networks, caption, imageUrl } = await c.req.json<any>();
  const results = await publishToNetworks(c.env, { postId, networks, caption: noEmDash(caption || ''), imageUrl });
  return c.json({ results });
});

/* ---------- Integrations: call an external API through the Worker ---------- */
a.post('/admin/integrations/:id{[0-9]+}/call', async (c) => {
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

/* ---------- Public helper endpoints usable by modules ---------- */
api.get('/public/ventures', async (c) => c.json((await c.env.DB.prepare('SELECT name, url, tagline, logo, accent FROM businesses WHERE active = 1 ORDER BY sort').all()).results));
api.get('/public/posts', async (c) => c.json((await c.env.DB.prepare("SELECT slug, title, excerpt, published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 20").all()).results));
