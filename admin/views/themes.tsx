import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Btn, Card, ColorField, ConfirmBtn, Field, Select, Toggle, toast } from '../ui';

export const FONTS = ['Bricolage Grotesque', 'Schibsted Grotesk', 'Syne', 'Unbounded', 'Space Grotesk', 'Hanken Grotesk', 'Figtree', 'Manrope', 'Geist', 'Inter Tight', 'DM Sans', 'Instrument Sans', 'Montserrat', 'Newsreader', 'Literata', 'Fraunces', 'Martian Mono', 'DM Mono', 'Space Mono', 'IBM Plex Mono', 'JetBrains Mono'];
const KEYS: [string, string][] = [['paper', 'Background'], ['ink', 'Text'], ['muted', 'Soft text'], ['accent', 'Highlight'], ['onAccent', 'Text on highlight'], ['line', 'Lines']];

type Pal = Record<string, string>;
type Theme = { id: string; name: string; description: string; fontDisplay: string; fontBody: string; fontMono: string; radius: number; light: Pal; dark: Pal };

function mix(a: string, b: string, t: number) {
  const p = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) || 0);
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}
const darkFrom = (l: Pal): Pal => ({ paper: mix(l.ink, '#000000', 0.25), ink: mix(l.paper, '#FFFFFF', 0.3), muted: mix(l.muted, '#FFFFFF', 0.4), accent: l.accent, onAccent: mix(l.ink, '#000000', 0.25), line: mix(l.ink, '#FFFFFF', 0.12) });

/** A small live sample of the site in a palette, so themes can be compared at a glance. */
function Sample({ t, p, label }: { t: Theme; p: Pal; label?: string }) {
  return (
    <div class="tsample" style={`background:${p.paper};color:${p.ink};border-radius:${Math.min(t.radius, 14)}px;--sa:${p.accent};--so:${p.onAccent};--sl:${p.line};--sm:${p.muted}`}>
      {label && <span class="tlabel" style={`color:${p.muted};font-family:'${t.fontMono}',monospace`}>{label}</span>}
      <b style={`font-family:'${t.fontDisplay}',sans-serif`}>Build <mark>things</mark></b>
      <span style={`font-family:'${t.fontBody}',sans-serif;color:${p.muted}`}>Founder and operator</span>
      <i class="tbtn" style={`border-radius:${t.radius}px`}>Get in touch</i>
    </div>
  );
}

export function ThemesTab({ s, presets, setTheme, setThemes }: { s: any; presets: Record<string, Theme>; setTheme: (t: any) => void; setThemes: (list: Theme[]) => void }) {
  useEffect(() => {
    // Load every font once so the previews show the real typefaces
    if (document.getElementById('theme-fonts')) return;
    const l = document.createElement('link');
    l.id = 'theme-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + FONTS.map((f) => 'family=' + f.replace(/ /g, '+') + (f === 'Space Mono' ? ':wght@400;700' : f.includes('Mono') ? ':wght@400;500' : ':wght@400;600;700')).join('&') + '&display=swap';
    document.head.appendChild(l);
  }, []);
  const t = s.theme;
  const custom: Theme[] = s.themes || [];
  const [editing, setEditing] = useState(false);
  const current: Theme = { id: t.preset, name: '', description: '', fontDisplay: t.fontDisplay, fontBody: t.fontBody, fontMono: t.fontMono, radius: t.radius, light: t.light, dark: t.dark };
  const apply = (th: Theme) => { setTheme({ ...t, preset: th.id, fontDisplay: th.fontDisplay, fontBody: th.fontBody, fontMono: th.fontMono, radius: th.radius, light: { ...th.light }, dark: { ...th.dark } }); toast.ok(`${th.name} applied. Save changes to make it live.`); };
  const setPal = (mode: 'light' | 'dark', k: string, v: string) => setTheme({ ...t, preset: 'custom', [mode]: { ...t[mode], [k]: v } });
  const setT = (k: string, v: any) => setTheme({ ...t, [k]: v });

  function saveAsMine() {
    const name = (document.getElementById('tname') as HTMLInputElement)?.value?.trim() || 'My theme';
    const existing = custom.find((c) => c.id === t.preset);
    const th: Theme = { ...current, id: existing ? existing.id : `mine-${Date.now().toString(36)}`, name: existing && !name ? existing.name : name, description: 'Your own theme' };
    setThemes(existing ? custom.map((c) => (c.id === th.id ? th : c)) : [...custom, th]);
    setTheme({ ...t, preset: th.id });
    toast.ok(`Saved "${th.name}" to your themes. Save changes to keep it.`);
  }

  const all: (Theme & { mine?: boolean })[] = [...Object.values(presets), ...custom.map((c) => ({ ...c, mine: true }))];
  return (
    <div class="stack">
      <Card title="Light and dark">
        <div class="seg" role="radiogroup" aria-label="What visitors see first">
          {[['auto', 'Match their device'], ['light', 'Always start light'], ['dark', 'Always start dark']].map(([k, l]) => (
            <button role="radio" aria-checked={t.mode === k} class={t.mode === k ? 'on' : ''} onClick={() => setT('mode', k)}>{l}</button>
          ))}
        </div>
        <Toggle label="Show the light and dark switch on the site" hint="Visitors can flip it, and their choice is remembered on their device." checked={t.toggle !== false} onChange={(v) => setT('toggle', v)} />
      </Card>

      <Card title="Themes">
        <div class="tgrid">
          {all.map((th) => (
            <div class={`tcard${t.preset === th.id ? ' on' : ''}`}>
              <div class="tpair"><Sample t={th} p={th.light} /><Sample t={th} p={th.dark} /></div>
              <div class="tmeta"><strong>{th.name}{th.mine && <span class="pill">Yours</span>}</strong><small class="muted">{th.description}</small></div>
              <div class="row wrap">
                <Btn small kind={t.preset === th.id ? 'accent' : 'ghost'} onClick={() => apply(th)}>{t.preset === th.id ? 'In use' : 'Use this'}</Btn>
                {th.mine && <ConfirmBtn label="Delete" onConfirm={() => setThemes(custom.filter((c) => c.id !== th.id))} />}
              </div>
            </div>
          ))}
          <button class="tcard new" onClick={() => { setEditing(true); setTimeout(() => document.getElementById('tbuilder')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>
            <span>+</span><strong>Create your own</strong><small class="muted">Start from the current theme and change anything.</small>
          </button>
        </div>
      </Card>

      <Card title="Theme builder" class={editing ? 'focus' : ''}>
        <div id="tbuilder" class="tbuild">
          <div class="tpreview">
            <Sample t={current} p={t.light} label="Light" />
            <Sample t={current} p={t.dark} label="Dark" />
          </div>
          <div class="stack">
            <div class="two">
              <Select label="Headlines" value={t.fontDisplay} onChange={(v) => setT('fontDisplay', v)} options={FONTS.map((f) => [f, f])} />
              <Select label="Body text" value={t.fontBody} onChange={(v) => setT('fontBody', v)} options={FONTS.map((f) => [f, f])} />
              <Select label="Labels" value={t.fontMono} onChange={(v) => setT('fontMono', v)} options={FONTS.map((f) => [f, f])} />
              <Field label="Corner roundness (px)" type="number" value={t.radius} onInput={(v) => setT('radius', Math.max(0, Math.min(40, Number(v) || 0)))} />
            </div>
            <div class="palettes">
              <fieldset class="pal"><legend>Light colours</legend>{KEYS.map(([k, l]) => <ColorField label={l} value={t.light[k]} onInput={(v) => setPal('light', k, v)} />)}</fieldset>
              <fieldset class="pal"><legend>Dark colours <button type="button" class="link" onClick={() => setTheme({ ...t, preset: 'custom', dark: darkFrom(t.light) })}>Make from light</button></legend>{KEYS.map(([k, l]) => <ColorField label={l} value={t.dark[k]} onInput={(v) => setPal('dark', k, v)} />)}</fieldset>
            </div>
            <div class="row wrap end">
              <div class="field grow"><label for="tname">Theme name</label><input id="tname" placeholder="My theme" value={custom.find((c) => c.id === t.preset)?.name || ''} /></div>
              <Btn kind="ghost" onClick={saveAsMine}>Save to my themes</Btn>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
