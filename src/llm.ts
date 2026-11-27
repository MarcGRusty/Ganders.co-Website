import type { Env } from './env';
import type { SiteSettings } from './settings';
import { noEmDash } from './util';

export type ProviderId = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'openrouter';

export const PROVIDERS: Record<ProviderId, { label: string; secret: keyof Env; strengths: string[] }> = {
  anthropic: { label: 'Claude (Anthropic)', secret: 'ANTHROPIC_API_KEY', strengths: ['writing', 'code', 'ideas', 'reasoning'] },
  openai: { label: 'ChatGPT (OpenAI)', secret: 'OPENAI_API_KEY', strengths: ['writing', 'code', 'ideas', 'social'] },
  xai: { label: 'Grok (xAI)', secret: 'XAI_API_KEY', strengths: ['social', 'ideas', 'trends'] },
  gemini: { label: 'Gemini (Google)', secret: 'GEMINI_API_KEY', strengths: ['research', 'writing', 'ideas'] },
  openrouter: { label: 'OpenRouter (any model)', secret: 'OPENROUTER_API_KEY', strengths: ['fallback'] },
};

/** Which provider Auto mode prefers for each kind of task. */
const TASK_PREFERENCE: Record<string, ProviderId[]> = {
  writing: ['anthropic', 'openai', 'gemini', 'xai', 'openrouter'],
  ideas: ['anthropic', 'openai', 'xai', 'gemini', 'openrouter'],
  social: ['xai', 'openai', 'anthropic', 'gemini', 'openrouter'],
  code: ['anthropic', 'openai', 'gemini', 'xai', 'openrouter'],
  design: ['anthropic', 'openai', 'gemini', 'xai', 'openrouter'],
};

export const HOUSE_RULES = [
  'Never use em dashes or en dashes as punctuation. Use commas, full stops, colons, or brackets instead.',
  'Write like a real person, not a marketing department. Avoid cliches such as "in today\'s fast-paced world", "unlock", "elevate", "delve", "game-changer", "harness", "seamless", and "leverage" as a verb.',
  'Use New Zealand English spelling.',
].join(' ');

export interface LlmRequest {
  task: keyof typeof TASK_PREFERENCE | string;
  system?: string;
  prompt: string;
  provider?: ProviderId | 'auto';
  maxTokens?: number;
  json?: boolean;
}
export interface LlmResult { text: string; provider: ProviderId; model: string; ms: number }

export function availableProviders(env: Env): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => !!env[PROVIDERS[p].secret]);
}

function pickOrder(env: Env, s: SiteSettings, req: LlmRequest): ProviderId[] {
  const have = new Set(availableProviders(env));
  const chosen = req.provider && req.provider !== 'auto' ? req.provider : s.ai.mode !== 'auto' ? s.ai.mode : null;
  if (chosen) {
    if (!have.has(chosen)) throw new Error(`${PROVIDERS[chosen]?.label ?? chosen} has no API key set yet.`);
    return [chosen];
  }
  const pref = TASK_PREFERENCE[req.task] ?? (s.ai.order as ProviderId[]);
  const order = [...pref, ...(s.ai.order as ProviderId[])].filter((p, i, a) => a.indexOf(p) === i && have.has(p));
  if (!order.length) throw new Error('No AI provider is connected yet. Add an API key as a Worker secret, then try again.');
  return order;
}

async function callProvider(env: Env, p: ProviderId, model: string, system: string, prompt: string, maxTokens: number, temperature: number, json: boolean): Promise<string> {
  const key = String(env[PROVIDERS[p].secret]);
  if (p === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Anthropic error ${r.status}`);
    return (d.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  }
  if (p === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    const d: any = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Gemini error ${r.status}`);
    return (d.candidates?.[0]?.content?.parts || []).map((x: any) => x.text || '').join('');
  }
  // OpenAI compatible: OpenAI, xAI, OpenRouter
  const base = p === 'openai' ? String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') : p === 'xai' ? 'https://api.x.ai/v1' : 'https://openrouter.ai/api/v1';
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_completion_tokens: maxTokens,
      ...(json && p !== 'openrouter' ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `${PROVIDERS[p].label} error ${r.status}`);
  return d.choices?.[0]?.message?.content ?? '';
}

export async function generate(env: Env, s: SiteSettings, req: LlmRequest): Promise<LlmResult> {
  const order = pickOrder(env, s, req);
  const system = [req.system || 'You are a skilled writing and building assistant for a personal website.', `Voice: ${s.ai.voice}`, HOUSE_RULES].join('\n\n');
  const errors: string[] = [];
  for (const p of order) {
    const model = s.ai.models[p] || '';
    const t0 = Date.now();
    try {
      const text = await callProvider(env, p, model, system, req.prompt, req.maxTokens ?? 2000, s.ai.temperature, !!req.json);
      const ms = Date.now() - t0;
      await env.DB.prepare('INSERT INTO ai_log (task, provider, model, ok, ms) VALUES (?, ?, ?, 1, ?)').bind(req.task, p, model, ms).run();
      return { text: noEmDash(text), provider: p, model, ms };
    } catch (e: any) {
      const msg = String(e?.message || e);
      errors.push(`${PROVIDERS[p].label}: ${msg}`);
      await env.DB.prepare('INSERT INTO ai_log (task, provider, model, ok, ms, error) VALUES (?, ?, ?, 0, ?, ?)').bind(req.task, p, model, Date.now() - t0, msg.slice(0, 500)).run();
    }
  }
  throw new Error(errors.join(' | '));
}
