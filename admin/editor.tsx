import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { api, adm, mediaUrl } from './api';
import { Btn, MediaPicker, ProviderPicker, Sheet, toast, Area } from './ui';

const strip = (s: string) => s.replace(/\s*—\s*/g, ', ').replace(/\s+–\s+/g, ', ');

export function RichEditor({ html, onChange, placeholder = 'Start writing...', context = '' }: { html: string; onChange: (html: string, json: string) => void; placeholder?: string; context?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<Editor | null>(null);
  const [, tick] = useState(0);
  const [picker, setPicker] = useState(false);
  const [ai, setAi] = useState(false);
  const [mods, setMods] = useState<any[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');

  useEffect(() => {
    const e = new Editor({
      element: host.current!,
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } } }),
        Image.configure({ HTMLAttributes: { loading: 'lazy' } }),
        Placeholder.configure({ placeholder }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ],
      content: html || '',
      editorProps: {
        attributes: { class: 'prose-edit' },
        // House rule: em dashes typed or pasted are converted as you go
        transformPastedHTML: strip,
        transformPastedText: strip,
        handleTextInput: (view, from, to, text) => {
          if (text === '—') { view.dispatch(view.state.tr.insertText(', ', from, to)); return true; }
          return false;
        },
      },
      onUpdate: ({ editor }) => onChange(editor.getHTML(), JSON.stringify(editor.getJSON())),
      onSelectionUpdate: () => tick((n) => n + 1),
      onTransaction: () => tick((n) => n + 1),
    });
    ed.current = e;
    return () => e.destroy();
  }, []);

  const e = ed.current;
  const B = ({ label, on, act, title }: { label: any; on?: boolean; act: () => void; title: string }) => (
    <button type="button" class={`tb${on ? ' on' : ''}`} title={title} aria-label={title} aria-pressed={!!on} onMouseDown={(ev) => ev.preventDefault()} onClick={act}>{label}</button>
  );
  const chain = () => e!.chain().focus();

  return (
    <div class="editor">
      {e && (
        <div class="toolbar" role="toolbar" aria-label="Formatting">
          <B title="Heading" label="H2" on={e.isActive('heading', { level: 2 })} act={() => chain().toggleHeading({ level: 2 }).run()} />
          <B title="Subheading" label="H3" on={e.isActive('heading', { level: 3 })} act={() => chain().toggleHeading({ level: 3 }).run()} />
          <B title="Bold" label={<b>B</b>} on={e.isActive('bold')} act={() => chain().toggleBold().run()} />
          <B title="Italic" label={<i>I</i>} on={e.isActive('italic')} act={() => chain().toggleItalic().run()} />
          <B title="Underline" label={<u>U</u>} on={e.isActive('underline')} act={() => chain().toggleUnderline().run()} />
          <span class="tb-sep" />
          <B title="Bulleted list" label="&bull; List" on={e.isActive('bulletList')} act={() => chain().toggleBulletList().run()} />
          <B title="Numbered list" label="1. List" on={e.isActive('orderedList')} act={() => chain().toggleOrderedList().run()} />
          <B title="Quote" label="&ldquo; Quote" on={e.isActive('blockquote')} act={() => chain().toggleBlockquote().run()} />
          <B title="Divider" label="Line" act={() => chain().setHorizontalRule().run()} />
          <span class="tb-sep" />
          <B title="Link" label="Link" on={e.isActive('link')} act={() => { setHref(e.getAttributes('link').href || ''); setLinkOpen(true); }} />
          <B title="Image" label="Image" act={() => setPicker(true)} />
          <B title="Insert module" label="Module" act={async () => { try { setMods(await adm.list('modules')); } catch (x) { toast.err(x); } }} />
          <span class="tb-sep" />
          <B title="Align left" label="Left" on={e.isActive({ textAlign: 'left' })} act={() => chain().setTextAlign('left').run()} />
          <B title="Align centre" label="Centre" on={e.isActive({ textAlign: 'center' })} act={() => chain().setTextAlign('center').run()} />
          <span class="tb-sep" />
          <B title="Undo" label="Undo" act={() => chain().undo().run()} />
          <B title="Redo" label="Redo" act={() => chain().redo().run()} />
          <button type="button" class="tb ai" onMouseDown={(ev) => ev.preventDefault()} onClick={() => setAi(true)}>Write with AI</button>
        </div>
      )}
      <div ref={host} class="editor-host" />

      {picker && <MediaPicker onClose={() => setPicker(false)} onPick={(k) => { chain().setImage({ src: mediaUrl(k) }).run(); setPicker(false); }} />}

      {linkOpen && (
        <Sheet title="Link" onClose={() => setLinkOpen(false)}>
          <form class="stack" onSubmit={(ev) => { ev.preventDefault(); if (href) chain().extendMarkRange('link').setLink({ href, target: /^https?:/.test(href) ? '_blank' : null } as any).run(); else chain().unsetLink().run(); setLinkOpen(false); }}>
            <div class="field"><label for="lnk">Web address</label><input id="lnk" value={href} placeholder="https://" onInput={(x) => setHref((x.target as HTMLInputElement).value)} autoFocus /></div>
            <div class="row"><Btn type="submit">Save link</Btn>{e?.isActive('link') && <Btn kind="ghost" onClick={() => { chain().unsetLink().run(); setLinkOpen(false); }}>Remove link</Btn>}</div>
          </form>
        </Sheet>
      )}

      {mods && (
        <Sheet title="Insert a module" onClose={() => setMods(null)}>
          {mods.length ? (
            <ul class="list">
              {mods.map((m) => (
                <li><button class="list-btn" onClick={() => { chain().insertContent(`<p>[[module:${m.slug}]]</p>`).run(); setMods(null); }}>
                  <strong>{m.name}</strong><span class="muted">{m.enabled ? m.description : 'Turned off. Turn it on in Modules to show it on the site.'}</span>
                </button></li>
              ))}
            </ul>
          ) : <p class="muted">No modules yet. Build one in the Modules section, by hand or by describing it to the AI.</p>}
        </Sheet>
      )}

      {ai && e && <AiAssist editor={e} context={context} onClose={() => setAi(false)} />}
    </div>
  );
}

function AiAssist({ editor, context, onClose }: { editor: Editor; context: string; onClose: () => void }) {
  const { from, to, empty } = editor.state.selection;
  const selected = empty ? '' : editor.state.doc.textBetween(from, to, '\n\n');
  const [provider, setProvider] = useState('auto');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<{ html: string; provider: string } | null>(null);
  const source = selected || editor.getText();

  async function run(action: string) {
    if (!source.trim() && action !== 'custom') return toast.err('Write something first, or select some text.');
    setBusy(action);
    try {
      setResult(await api('/admin/ai/assist', { body: { action, text: source || '(empty document)', instruction, provider, context } }));
    } catch (x) { toast.err(x); } finally { setBusy(''); }
  }
  function apply(mode: 'replace' | 'insert') {
    if (!result) return;
    if (mode === 'replace' && selected) editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, result.html).run();
    else if (mode === 'replace') editor.chain().focus().setContent(result.html, { emitUpdate: true }).run();
    else editor.chain().focus().insertContentAt(empty ? editor.state.doc.content.size : to, result.html).run();
    onClose();
  }
  const acts: [string, string][] = [['improve', 'Improve'], ['shorten', 'Shorten'], ['expand', 'Expand'], ['tone', 'Make it sound like me'], ['continue', 'Keep writing'], ['headline', 'Headline ideas']];
  return (
    <Sheet title="Write with AI" onClose={onClose} wide>
      <p class="muted small">{selected ? `Working on your selection (${selected.length} characters).` : 'Working on the whole document. Select text first to change just part of it.'}</p>
      <ProviderPicker value={provider} onChange={setProvider} />
      <div class="chips">{acts.map(([k, l]) => <Btn kind="ghost" small busy={busy === k} disabled={!!busy} onClick={() => run(k)}>{l}</Btn>)}</div>
      <Area label="Or tell it what you want" rows={2} value={instruction} onInput={setInstruction} placeholder="Add a story about my first customer, and end with a question" />
      <Btn kind="accent" busy={busy === 'custom'} disabled={!!busy || !instruction.trim()} onClick={() => run('custom')}>Ask</Btn>
      {result && (
        <div class="ai-result">
          <div class="ai-meta mono">Written by {result.provider}. Review before using.</div>
          <div class="prose-edit preview" dangerouslySetInnerHTML={{ __html: result.html }} />
          <div class="row">
            <Btn onClick={() => apply('replace')}>{selected ? 'Replace selection' : 'Replace everything'}</Btn>
            <Btn kind="ghost" onClick={() => apply('insert')}>Insert below</Btn>
          </div>
        </div>
      )}
    </Sheet>
  );
}
