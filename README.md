# Ganders.co

The personal and entrepreneurial site for Marc Gander, with its own CMS ("Studio") built in. It runs entirely on Cloudflare Workers: pages are rendered live from the database on every request, so nothing is a static export.

- **Public site**: separate pages for Home, About, Ventures (each business opens in a new tab), Writing, and Contact (a form that lands in the Studio Inbox), plus any number of extra CMS pages, an RSS feed, and a sitemap.
- **Studio** at `/admin`: WYSIWYG editor for posts and pages, ventures, design (logo, favicon, colours, fonts, home page layout, menu), media library, knowledge base, AI ideas and drafts, modules, social sharing, and API connections.
- **Mobile first**: both the site and Studio are designed for phones first and scale up to tablet and desktop.
- **House rule**: no em dashes anywhere. They are converted on save, in the editor as you type or paste, in every AI response, and again when pages render.

## Stack

| Piece | What it does |
| --- | --- |
| Cloudflare Workers + [Hono](https://hono.dev) | Server, routing, rendering |
| D1 | Pages, posts, ventures, settings, knowledge base, ideas, modules |
| R2 | Images, logos, favicons, uploads |
| Workers static assets | Studio app (Preact + TipTap), site CSS |

## AI

Studio talks to Claude (Anthropic), ChatGPT (OpenAI), Grok (xAI), Gemini (Google), and anything on OpenRouter. Any OpenAI compatible endpoint also works by setting `OPENAI_BASE_URL`.

- **Auto mode** picks the best connected provider for each job (writing, ideas, social captions, code, design) and falls back to the next one if a call fails.
- **Manual choice** is available on every AI button.
- **Create Ideas** reads the knowledge base, your ventures, and what you have already written, then suggests specific post ideas. Each idea can become an AI draft (status "Needs review") or a blank post you write yourself.
- **Write with AI** in the editor improves, shortens, expands, or rewrites selected text, or follows your own instruction.
- **Logo and favicon** can be uploaded or generated as SVG.
- **Modules**: describe a block ("a row of stats that count up") and the AI builds the HTML, CSS, and JS. Preview it, then drop it into any page with `[[module:name]]`.

## Setup

You need Node 20 or newer and a Cloudflare account.

```bash
npm install

# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the database and media bucket
npx wrangler d1 create ganders-co        # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create ganders-co-media

# 3. Create the tables
npm run db:migrate

# 4. Set secrets (you will be prompted for each value; nothing is stored in the repo)
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET      # any long random string
npx wrangler secret put ANTHROPIC_API_KEY   # add whichever AI keys you have
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put XAI_API_KEY
npx wrangler secret put GEMINI_API_KEY

# 5. Deploy
npm run deploy
```

Then open `https://<your-worker>.workers.dev/admin` and sign in. To use ganders.co, add it as a Custom Domain on the Worker in the Cloudflare dashboard (Workers and Pages, ganders-co, Settings, Domains and Routes).

### Local development

```bash
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD and any keys
npm run db:migrate:local
npm run dev                      # http://127.0.0.1:8787 and /admin
```

### Social accounts

| Network | Secrets |
| --- | --- |
| Facebook Page | `META_PAGE_ID`, `META_PAGE_TOKEN` (a long lived Page access token with `pages_manage_posts`) |
| Instagram Business | `META_IG_USER_ID`, `META_PAGE_TOKEN` (needs `instagram_content_publish`; posts need a cover image) |
| LinkedIn | `LINKEDIN_TOKEN`, `LINKEDIN_AUTHOR_URN` (for example `urn:li:person:abc123`) |
| X, Threads, TikTok, anything else | `SOCIAL_WEBHOOK_URL`, a Zapier, Make, or Buffer webhook that receives `{ network, caption, link, image }` |

### Contact messages

Messages from the Contact page are stored in D1 and shown in the Studio Inbox. To also forward them to email, Slack, or a CRM, set `CONTACT_WEBHOOK_URL` to a Zapier or Make webhook.

### API connections

Add a connection in Studio with its base address, the header to send, and the **name** of a secret. Then set the token with `npx wrangler secret put THAT_NAME`. Studio can send test requests through the Worker, and modules can read public data from `/api/public/ventures` and `/api/public/posts`.

## Project layout

```
src/            Worker: routes, rendering, AI layer, social, auth
  views/        Public site HTML
migrations/     D1 schema and starter content
admin/          Studio source (Preact + TipTap), bundled by scripts/build-admin.mjs
public/         Static files: site.css, Studio shell and styles
scripts/        Build and preview helpers
```
