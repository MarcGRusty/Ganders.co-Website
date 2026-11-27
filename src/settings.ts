import type { Env } from './env';

export interface NavItem { label: string; href: string; external?: boolean }
export interface SocialLink { network: string; url: string }

export interface SiteSettings {
  site: {
    name: string;
    tagline: string;
    email: string;
    location: string;
    logo: string;        // media key or URL
    logoDark: string;
    favicon: string;
    portrait: string;
    ogImage: string;
  };
  theme: {
    preset: string;
    paper: string;
    ink: string;
    muted: string;
    accent: string;
    onAccent: string;
    line: string;
    fontDisplay: string;
    fontBody: string;
    fontMono: string;
    radius: number;
    customCss: string;
  };
  home: {
    kicker: string;
    headline: string;
    headlineEmphasis: string;
    intro: string;
    primaryCta: NavItem;
    secondaryCta: NavItem;
    now: string[];
    storyTitle: string;
    storyBody: string;
    storyQuote: string;
    venturesTitle: string;
    venturesIntro: string;
    writingTitle: string;
    contactTitle: string;
    contactBody: string;
    sections: string[];  // order of home sections
  };
  contact: {
    title: string;
    intro: string;
    topics: string[];
    success: string;
    showEmail: boolean;
    notes: string[];
  };
  nav: NavItem[];
  social: SocialLink[];
  ai: {
    mode: 'auto' | 'anthropic' | 'openai' | 'xai' | 'gemini' | 'openrouter';
    order: string[];
    models: Record<string, string>;
    voice: string;
    temperature: number;
  };
  seo: { title: string; description: string };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  site: {
    name: 'Marc Gander',
    tagline: 'Founder. Operator. Builder of useful things.',
    email: 'hello@ganders.co',
    location: 'Aotearoa New Zealand',
    logo: '',
    logoDark: '',
    favicon: '',
    portrait: '',
    ogImage: '',
  },
  theme: {
    preset: 'kowhai',
    paper: '#ECEEEA',
    ink: '#111A22',
    muted: '#5B6670',
    accent: '#F2B825',
    onAccent: '#111A22',
    line: '#CDD3CF',
    fontDisplay: 'Bricolage Grotesque',
    fontBody: 'Schibsted Grotesk',
    fontMono: 'Martian Mono',
    radius: 3,
    customCss: '',
  },
  home: {
    kicker: 'Founder, operator, and the person behind a few good companies',
    headline: 'I build businesses that',
    headlineEmphasis: 'outlast the hype.',
    intro:
      'This is where my work lives. The companies I run, the ideas I keep coming back to, and the lessons I picked up the hard way. If you landed here, there is probably a reason. Have a look around.',
    primaryCta: { label: "See what I'm building", href: '#ventures' },
    secondaryCta: { label: 'Get in touch', href: '/contact' },
    now: ['Building across several ventures', 'Writing about business and technology', 'Based in Aotearoa New Zealand'],
    storyTitle: 'The short version',
    storyBody:
      '<p>Replace this with your story. Where you started, the turn that changed things, and what you are working toward now. Keep it in your own words, the way you would tell it over coffee.</p><p>Everything on this page is editable from the admin area, including this text.</p>',
    storyQuote: 'Build the thing you wish already existed.',
    venturesTitle: 'Ventures',
    venturesIntro: 'The companies I have started, run, or back. Each one opens in a new tab.',
    writingTitle: 'Writing',
    contactTitle: "Let's talk.",
    contactBody: 'Partnerships, speaking, or just a good idea. My inbox is open.',
    sections: ['hero', 'now', 'ventures', 'story', 'writing', 'contact'],
  },
  contact: {
    title: "Let's talk.",
    intro: 'Partnerships, speaking, investment, or a good idea you want to test. Send a note and I will get back to you personally.',
    topics: ['Working together', 'Speaking or media', 'Investment', 'One of my businesses', 'Something else'],
    success: 'Thanks. Your message is in, and I read every one myself.',
    showEmail: true,
    notes: ['I reply to most messages within two working days.', 'For customer support, the fastest route is through the business itself. Find them all on the Ventures page.'],
  },
  nav: [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' },
    { label: 'Ventures', href: '/ventures' },
    { label: 'Writing', href: '/writing' },
    { label: 'Contact', href: '/contact' },
  ],
  social: [
    { network: 'LinkedIn', url: '' },
    { network: 'Instagram', url: '' },
    { network: 'Facebook', url: '' },
    { network: 'X', url: '' },
  ],
  ai: {
    mode: 'auto',
    order: ['anthropic', 'openai', 'gemini', 'xai', 'openrouter'],
    models: {
      anthropic: 'claude-sonnet-5-5',
      openai: 'gpt-5',
      xai: 'grok-4',
      gemini: 'gemini-2.5-pro',
      openrouter: 'anthropic/claude-sonnet-5.5',
    },
    voice:
      'Direct, warm, and practical. Short sentences. Concrete examples over theory. Confident without being loud. Never corporate, never salesy.',
    temperature: 0.7,
  },
  seo: {
    title: 'Marc Gander',
    description: 'Founder and operator. The businesses I build, and what I learn along the way.',
  },
};

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(base)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b && typeof b === 'object' && !Array.isArray(b) ? merge(b, v) : v;
  }
  return out as T;
}

export async function getSettings(env: Env): Promise<SiteSettings> {
  const rows = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  let s: SiteSettings = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows.results ?? []) {
    try {
      s = merge(s, { [r.key]: JSON.parse(r.value) });
    } catch { /* ignore bad row */ }
  }
  return s;
}

export async function saveSettings(env: Env, patch: Partial<SiteSettings>): Promise<void> {
  const stmts = Object.entries(patch).map(([k, v]) =>
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, JSON.stringify(v)),
  );
  if (stmts.length) await env.DB.batch(stmts);
}

export const THEME_PRESETS: Record<string, Partial<SiteSettings['theme']>> = {
  kowhai: { paper: '#ECEEEA', ink: '#111A22', muted: '#5B6670', accent: '#F2B825', onAccent: '#111A22', line: '#CDD3CF', fontDisplay: 'Bricolage Grotesque', fontBody: 'Schibsted Grotesk', fontMono: 'Martian Mono', radius: 3 },
  basalt: { paper: '#121416', ink: '#E7E9E4', muted: '#8B9297', accent: '#9FD3C7', onAccent: '#121416', line: '#262A2E', fontDisplay: 'Bricolage Grotesque', fontBody: 'Schibsted Grotesk', fontMono: 'Martian Mono', radius: 3 },
  pounamu: { paper: '#F2F4F1', ink: '#0D2620', muted: '#55665F', accent: '#2F7A5B', onAccent: '#F2F4F1', line: '#D3DBD6', fontDisplay: 'Syne', fontBody: 'Figtree', fontMono: 'DM Mono', radius: 8 },
  signal: { paper: '#FFFFFF', ink: '#0B0B0C', muted: '#6E6E73', accent: '#2B44FF', onAccent: '#FFFFFF', line: '#E4E4E7', fontDisplay: 'Unbounded', fontBody: 'Hanken Grotesk', fontMono: 'Space Mono', radius: 0 },
};
