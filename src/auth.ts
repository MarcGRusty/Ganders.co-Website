import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, Env } from './env';
import { has } from './permissions';

const COOKIE = 'gco_session';
const MAX_AGE = 60 * 60 * 24 * 14; // 14 days
const ITER = 100_000;               // PBKDF2 rounds (Workers maximum)
const enc = new TextEncoder();

export interface SessionUser { id: number; email: string; name: string; must_change: number; permissions: string[]; roles: string[] }

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf)))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt || b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(s), iterations: ITER }, key, 256);
  return { hash: b64(bits), salt: s };
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function secretOf(env: Env): string {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
}

export function validPassword(p: string): string | null {
  if (!p || p.length < 10) return 'Passwords need at least 10 characters.';
  return null;
}

async function issueSession(c: Context<AppEnv>, user: { id: number; session_version: number }) {
  await c.env.DB.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").bind(user.id).run();
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${user.id}.${user.session_version}.${exp}`;
  setCookie(c, COOKIE, `${payload}.${await hmac(secretOf(c.env), payload)}`, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: MAX_AGE,
  });
}

/** Creates the Owner account the first time anyone signs in. */
async function bootstrapOwner(c: Context<AppEnv>, email: string, password?: string): Promise<string | null> {
  const db = c.env.DB;
  const count = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if (count?.n) return null;
  const owner = (c.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (owner && email !== owner) return 'That email and password did not match.';
  if (password !== undefined) {
    if (!c.env.ADMIN_PASSWORD) return 'ADMIN_PASSWORD is not set. Add it as a secret to create the first account.';
    if (!(await timingSafeEqual(password, c.env.ADMIN_PASSWORD))) return 'That email and password did not match.';
  } else if (!owner) {
    return 'Set OWNER_EMAIL to use sign in links for the first account.';
  }
  const { hash, salt } = password ? await hashPassword(password) : { hash: '', salt: '' };
  const u = await db.prepare('INSERT INTO users (email, name, password_hash, salt) VALUES (?, ?, ?, ?) RETURNING id').bind(email, email.split('@')[0], hash, salt).first<{ id: number }>();
  await db.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE key = 'owner'").bind(u!.id).run();
  return null;
}

/** Sign in with email and password. */
export async function login(c: Context<AppEnv>, email: string, password: string): Promise<string | null> {
  email = (email || '').trim().toLowerCase();
  if (!email || !password) return 'Enter your email and password.';
  const boot = await bootstrapOwner(c, email, password);
  if (boot) return boot;
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<any>();
  // Hash anyway when the user does not exist, so timing does not reveal which emails have accounts
  const check = await hashPassword(password, user?.salt || 'no-user-salt');
  if (!user || !user.active || !user.password_hash || !(await timingSafeEqual(check.hash, user.password_hash))) return 'That email and password did not match.';
  await issueSession(c, user);
  return null;
}

const sha = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** Creates a one time sign in link, valid for 15 minutes. Returns null when no such active user exists. */
export async function createLoginLink(c: Context<AppEnv>, email: string): Promise<{ url: string; user: any } | null> {
  email = (email || '').trim().toLowerCase();
  if (await bootstrapOwner(c, email)) return null;
  const user = await c.env.DB.prepare('SELECT id, email, name, active FROM users WHERE email = ?').bind(email).first<any>();
  if (!user || !user.active) return null;
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  await c.env.DB.prepare("INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+15 minutes'))").bind(await sha(token), user.id).run();
  const origin = new URL(c.req.url).origin;
  return { url: `${origin}/api/login/verify?t=${encodeURIComponent(token)}`, user };
}

export async function useLoginLink(c: Context<AppEnv>, token: string): Promise<boolean> {
  const h = await sha(token || '');
  const row = await c.env.DB.prepare("UPDATE login_tokens SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now') RETURNING user_id").bind(h).first<{ user_id: number }>();
  if (!row) return false;
  const user = await c.env.DB.prepare('SELECT id, session_version, active FROM users WHERE id = ?').bind(row.user_id).first<any>();
  if (!user?.active) return false;
  await issueSession(c, user);
  return true;
}

export function logout(c: Context<AppEnv>) {
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function effectivePermissions(env: Env, userId: number): Promise<{ permissions: string[]; roles: string[] }> {
  const rows = await env.DB.prepare(`
    SELECT r.key, r.permissions FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?1
    UNION
    SELECT r.key, r.permissions FROM roles r JOIN group_roles gr ON gr.role_id = r.id JOIN user_groups ug ON ug.group_id = gr.group_id WHERE ug.user_id = ?1
    UNION
    SELECT '' AS key, g.permissions FROM groups g JOIN user_groups ug ON ug.group_id = g.id WHERE ug.user_id = ?1`).bind(userId).all<{ key: string; permissions: string }>();
  const perms = new Set<string>();
  const roles: string[] = [];
  for (const r of rows.results) {
    if (r.key) roles.push(r.key);
    try { for (const p of JSON.parse(r.permissions || '[]')) perms.add(p); } catch { /* ignore */ }
  }
  return { permissions: [...perms], roles };
}

export async function currentUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const cached = c.get('user');
  if (cached) return cached;
  const raw = getCookie(c, COOKIE);
  if (!raw || !secretOf(c.env)) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [uid, ver, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!(await timingSafeEqual(sig, await hmac(secretOf(c.env), `${uid}.${ver}.${exp}`)))) return null;
  const u = await c.env.DB.prepare('SELECT id, email, name, active, must_change, session_version FROM users WHERE id = ?').bind(Number(uid)).first<any>();
  if (!u || !u.active || String(u.session_version) !== ver) return null;
  const eff = await effectivePermissions(c.env, u.id);
  const user: SessionUser = { id: u.id, email: u.email, name: u.name, must_change: u.must_change, ...eff };
  c.set('user', user);
  return user;
}

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const user = await currentUser(c);
  if (!user) return c.json({ error: 'Not signed in' }, 401);
  if (c.req.method !== 'GET') {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: 'Bad origin' }, 403);
  }
  await next();
}

/** Throw a 403 unless the signed in person has at least one of these permissions. */
export class Forbidden extends Error { status = 403; }
export function need(c: Context<AppEnv>, ...perms: string[]) {
  const u = c.get('user');
  const set = new Set(u?.permissions || []);
  if (!perms.some((p) => has(set, p))) throw new Forbidden(`You do not have permission to do that (${perms.join(' or ')}). Ask an owner to update your role.`);
}
export function can(c: Context<AppEnv>, p: string) {
  return has(new Set(c.get('user')?.permissions || []), p);
}
