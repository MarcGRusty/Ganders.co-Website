import type { Env } from './env';

/**
 * Modules are reusable blocks (built by hand or by AI) that can be dropped into
 * any page, post, or home section with a shortcode: [[module:slug]].
 * Scripts run inside the module's own wrapper so they can find their elements.
 */
export async function renderContent(env: Env, html: string): Promise<string> {
  if (!html || !html.includes('[[module:')) return html;
  const slugs = [...new Set([...html.matchAll(/\[\[module:([a-z0-9-]+)\]\]/g)].map((m) => m[1]))];
  if (!slugs.length) return html;
  const rows = await env.DB.prepare(`SELECT slug, html, css, js FROM modules WHERE enabled = 1 AND slug IN (${slugs.map(() => '?').join(',')})`)
    .bind(...slugs)
    .all<{ slug: string; html: string; css: string; js: string }>();
  const map = new Map(rows.results.map((r) => [r.slug, r]));
  return html.replace(/(?:<p>\s*)?\[\[module:([a-z0-9-]+)\]\](?:\s*<\/p>)?/g, (_m, slug: string) => {
    const r = map.get(slug);
    if (!r) return '';
    const id = `mod-${slug}`;
    const css = r.css ? `<style>${scopeCss(r.css, `#${id}`)}</style>` : '';
    const js = r.js ? `<script>(function(root){${r.js}\n})(document.getElementById(${JSON.stringify(id)}));</script>` : '';
    return `<div class="module" id="${id}">${css}${r.html}${js}</div>`;
  });
}

/** Prefix every selector so a module's CSS cannot leak into the rest of the site. */
export function scopeCss(css: string, scope: string): string {
  return css.replace(/(^|})\s*([^{}@]+)\s*{/g, (_m, brace: string, sel: string) => {
    const scoped = sel
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (x === ':root' || x === 'body' || x === 'html' ? scope : x.startsWith(':scope') ? x.replace(':scope', scope) : `${scope} ${x}`))
      .join(', ');
    return `${brace} ${scoped} {`;
  });
}
