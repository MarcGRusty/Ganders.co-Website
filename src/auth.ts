import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Env } from './env';

const COOKIE = 'gco_session';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

const enc = new TextEncoder();

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function secretOf(env: Env): string {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function login(c: Context<AppEnv>, password: string): Promise<boolean> {
  const expected = c.env.ADMIN_PASSWORD;
  if (!expected) return false;
  if (!(await timingSafeEqual(password, expected))) return false;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `admin.${exp}`;
  const sig = await hmac(secretOf(c.env), payload);
  setCookie(c, COOKIE, `${payload}.${sig}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return true;
}

export function logout(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function isAuthed(c: Context<AppEnv>): Promise<boolean> {
  const raw = getCookie(c, COOKIE);
  if (!raw || !secretOf(c.env)) return false;
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const [who, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return false;
  const good = await hmac(secretOf(c.env), `${who}.${exp}`);
  return timingSafeEqual(sig, good);
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  if (!(await isAuthed(c))) return c.json({ error: 'Not signed in' }, 401);
  // Basic CSRF guard for state changing requests
  if (c.req.method !== 'GET') {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: 'Bad origin' }, 403);
  }
  await next();
}
