import type { Env } from './env';

export interface NavItem { label: string; href: string; external?: boolean }
export interface SocialLink { network: string; url: string }

export interface Palette { paper: string; ink: string; muted: string; accent: string; onAccent: string; line: string }
export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  radius: number;
  light: Palette;
  dark: Palette;
}

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
    mode: 'auto' | 'light' | 'dark';   // what visitors see first ('auto' follows their device)
    toggle: boolean;                     // show the light/dark switch to visitors
    fontDisplay: string;
    fontBody: string;
    fontMono: string;
    radius: number;
    customCss: string;
    light: Palette;
    dark: Palette;
  };
  themes: ThemeDef[];                    // your own saved themes
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
    mode: 'auto',
    toggle: true,
    fontDisplay: 'Bricolage Grotesque',
    fontBody: 'Schibsted Grotesk',
    fontMono: 'Martian Mono',
    radius: 3,
    customCss: '',
    light: { paper: '#ECEEEA', ink: '#111A22', muted: '#5B6670', accent: '#F2B825', onAccent: '#111A22', line: '#CDD3CF' },
    dark: { paper: '#101418', ink: '#E9EBE6', muted: '#9AA3AA', accent: '#F2B825', onAccent: '#101418', line: '#252C32' },
  },
  themes: [],
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

/** Built in themes. Each has a light and a dark palette so the visitor switch always looks designed. */
export const THEME_PRESETS: Record<string, ThemeDef> = {
  kowhai: {
    id: 'kowhai', name: 'Kowhai', description: 'Cool stone, ink, and a bright kowhai yellow highlight. Confident and clean.',
    fontDisplay: 'Bricolage Grotesque', fontBody: 'Schibsted Grotesk', fontMono: 'Martian Mono', radius: 3,
    light: { paper: '#ECEEEA', ink: '#111A22', muted: '#5B6670', accent: '#F2B825', onAccent: '#111A22', line: '#CDD3CF' },
    dark: { paper: '#101418', ink: '#E9EBE6', muted: '#9AA3AA', accent: '#F2B825', onAccent: '#101418', line: '#252C32' },
  },
  pounamu: {
    id: 'pounamu', name: 'Pounamu', description: 'Greenstone greens with soft rounded corners. Calm and grounded.',
    fontDisplay: 'Syne', fontBody: 'Figtree', fontMono: 'DM Mono', radius: 10,
    light: { paper: '#F1F4F0', ink: '#0D2620', muted: '#53665E', accent: '#2F7A5B', onAccent: '#F1F4F0', line: '#D0DAD4' },
    dark: { paper: '#0B1A16', ink: '#E3EDE7', muted: '#93A89F', accent: '#5FC79A', onAccent: '#0B1A16', line: '#1D302A' },
  },
  signal: {
    id: 'signal', name: 'Signal', description: 'Swiss style white, black, and electric cobalt. Sharp corners, big type.',
    fontDisplay: 'Unbounded', fontBody: 'Hanken Grotesk', fontMono: 'Space Mono', radius: 0,
    light: { paper: '#FFFFFF', ink: '#0B0B0C', muted: '#6B6B70', accent: '#2B44FF', onAccent: '#FFFFFF', line: '#E4E4E7' },
    dark: { paper: '#0A0A0C', ink: '#F4F4F5', muted: '#A1A1AA', accent: '#7C8CFF', onAccent: '#0A0A0C', line: '#232327' },
  },
  harbour: {
    id: 'harbour', name: 'Harbour', description: 'Deep night navy with a sky blue glow. Made for dark mode first.',
    fontDisplay: 'Space Grotesk', fontBody: 'Manrope', fontMono: 'IBM Plex Mono', radius: 6,
    light: { paper: '#EEF2F6', ink: '#0E2235', muted: '#55687A', accent: '#1673C7', onAccent: '#FFFFFF', line: '#CFD9E3' },
    dark: { paper: '#0B1826', ink: '#E6EEF5', muted: '#8FA3B6', accent: '#7FD1FF', onAccent: '#0B1826', line: '#1B2C3D' },
  },
  basalt: {
    id: 'basalt', name: 'Basalt', description: 'Volcanic charcoal and mint with editorial serif headlines.',
    fontDisplay: 'Newsreader', fontBody: 'Schibsted Grotesk', fontMono: 'Martian Mono', radius: 2,
    light: { paper: '#F4F4F1', ink: '#161717', muted: '#61646A', accent: '#1E8C74', onAccent: '#FFFFFF', line: '#DCDDD8' },
    dark: { paper: '#121314', ink: '#E7E9E4', muted: '#8B9297', accent: '#9FD3C7', onAccent: '#121314', line: '#26292C' },
  },
};

/** Builds a dark palette from a light one, for custom themes. */
export function darkFrom(l: Palette): Palette {
  return { paper: mix(l.ink, '#000000', 0.25), ink: mix(l.paper, '#FFFFFF', 0.3), muted: mix(l.muted, '#FFFFFF', 0.4), accent: l.accent, onAccent: mix(l.ink, '#000000', 0.25), line: mix(l.ink, '#FFFFFF', 0.12) };
}
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
