import type { Env } from './env';

const GRAPH = 'https://graph.facebook.com/v21.0';

export type Network = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'webhook';

export function socialStatus(env: Env) {
  return [
    { id: 'facebook', label: 'Facebook Page', connected: !!(env.META_PAGE_ID && env.META_PAGE_TOKEN), needs: ['META_PAGE_ID', 'META_PAGE_TOKEN'] },
    { id: 'instagram', label: 'Instagram (Business)', connected: !!(env.META_IG_USER_ID && env.META_PAGE_TOKEN), needs: ['META_IG_USER_ID', 'META_PAGE_TOKEN'] },
    { id: 'linkedin', label: 'LinkedIn', connected: !!(env.LINKEDIN_TOKEN && env.LINKEDIN_AUTHOR_URN), needs: ['LINKEDIN_TOKEN', 'LINKEDIN_AUTHOR_URN'] },
    { id: 'webhook', label: 'Any other network (Zapier, Make, Buffer webhook)', connected: !!env.SOCIAL_WEBHOOK_URL, needs: ['SOCIAL_WEBHOOK_URL'] },
  ];
}

interface PublishInput { postId?: number; networks: Network[]; caption: string; imageUrl?: string }

export async function publishToNetworks(env: Env, input: PublishInput) {
  let link = '';
  let image = input.imageUrl || '';
  if (input.postId) {
    const p = await env.DB.prepare('SELECT slug, title, cover FROM posts WHERE id = ?').bind(input.postId).first<any>();
    if (p) {
      link = `${env.SITE_URL}/writing/${p.slug}`;
      if (!image && p.cover) image = p.cover.startsWith('http') ? p.cover : `${env.SITE_URL}/media/${p.cover}`;
    }
  }
  if (image.startsWith('/')) image = env.SITE_URL + image;
  const results: { network: string; ok: boolean; detail: string }[] = [];
  for (const n of input.networks) {
    try {
      const detail = await publishOne(env, n, input.caption, link, image);
      results.push({ network: n, ok: true, detail });
    } catch (e: any) {
      results.push({ network: n, ok: false, detail: String(e?.message || e) });
    }
  }
  await env.DB.batch(results.map((r) => env.DB.prepare('INSERT INTO social_log (post_id, network, status, detail) VALUES (?, ?, ?, ?)').bind(input.postId ?? null, r.network, r.ok ? 'sent' : 'failed', r.detail.slice(0, 500))));
  return results;
}

async function graph(path: string, params: Record<string, string>) {
  const r = await fetch(`${GRAPH}/${path}`, { method: 'POST', body: new URLSearchParams(params) });
  const d: any = await r.json();
  if (!r.ok || d.error) throw new Error(d?.error?.message || `Meta error ${r.status}`);
  return d;
}

async function publishOne(env: Env, n: Network, caption: string, link: string, image: string): Promise<string> {
  if (n === 'facebook') {
    if (!env.META_PAGE_ID || !env.META_PAGE_TOKEN) throw new Error('Facebook is not connected yet');
    const d = image && !link
      ? await graph(`${env.META_PAGE_ID}/photos`, { url: image, caption, access_token: env.META_PAGE_TOKEN })
      : await graph(`${env.META_PAGE_ID}/feed`, { message: caption, ...(link ? { link } : {}), access_token: env.META_PAGE_TOKEN });
    return `Posted (id ${d.id || d.post_id})`;
  }
  if (n === 'instagram') {
    if (!env.META_IG_USER_ID || !env.META_PAGE_TOKEN) throw new Error('Instagram is not connected yet');
    if (!image) throw new Error('Instagram needs an image. Add a cover image to the post first.');
    const text = link ? `${caption}\n\nLink in bio: ${link.replace(/^https?:\/\//, '')}` : caption;
    const container = await graph(`${env.META_IG_USER_ID}/media`, { image_url: image, caption: text, access_token: env.META_PAGE_TOKEN });
    const pub = await graph(`${env.META_IG_USER_ID}/media_publish`, { creation_id: container.id, access_token: env.META_PAGE_TOKEN });
    return `Posted (id ${pub.id})`;
  }
  if (n === 'linkedin') {
    if (!env.LINKEDIN_TOKEN || !env.LINKEDIN_AUTHOR_URN) throw new Error('LinkedIn is not connected yet');
    const r = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.LINKEDIN_TOKEN}`, 'content-type': 'application/json', 'LinkedIn-Version': '202411', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify({
        author: env.LINKEDIN_AUTHOR_URN,
        commentary: link ? `${caption}\n\n${link}` : caption,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
      }),
    });
    if (!r.ok) throw new Error(`LinkedIn error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return 'Posted';
  }
  if (n === 'webhook' || n === 'x') {
    if (!env.SOCIAL_WEBHOOK_URL) throw new Error('No social webhook is set. Add SOCIAL_WEBHOOK_URL (for example a Zapier or Make hook) to post to X and other networks.');
    const r = await fetch(String(env.SOCIAL_WEBHOOK_URL), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ network: n, caption, link, image }) });
    if (!r.ok) throw new Error(`Webhook returned ${r.status}`);
    return 'Sent to webhook';
  }
  throw new Error(`Unknown network ${n}`);
}
