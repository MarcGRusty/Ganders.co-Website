import { h } from 'preact';
import { useState } from 'preact/hooks';
import { adm } from '../api';
import { Btn, ConfirmBtn, Empty, Head, Sheet, Spinner, fmt, toast, useLoad } from '../ui';

export function Inbox() {
  const { data, loading, reload } = useLoad<any[]>(() => adm.list('messages'));
  const [show, setShow] = useState('new');
  const [open, setOpen] = useState<any | null>(null);
  const list = (data || []).filter((m) => show === 'all' || m.status === show);
  async function view(m: any) {
    setOpen(m);
    if (m.status === 'new') { await adm.update('messages', m.id, { status: 'read' }).catch(() => {}); reload(); }
  }
  async function archive(m: any) {
    try { await adm.update('messages', m.id, { status: 'archived' }); setOpen(null); reload(); toast.ok('Archived'); } catch (e) { toast.err(e); }
  }
  return (
    <div class="view">
      <Head title="Inbox" sub="Messages sent through your Contact page." />
      <div class="tabs">{[['new', 'New'], ['read', 'Read'], ['archived', 'Archived'], ['all', 'All']].map(([k, l]) => <button class={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}</button>)}</div>
      {loading ? <Spinner /> : list.length ? (
        <ul class="rows">
          {list.map((m) => (
            <li><button class="row-link" onClick={() => view(m)}>
              <span class="row-main"><strong>{m.status === 'new' && <span class="led on" />} {m.name}{m.company ? `, ${m.company}` : ''}</strong><span class="muted">{m.body}</span></span>
              <span class="row-meta">{m.topic && <span class="pill">{m.topic}</span>}<small>{fmt(m.created_at)}</small></span>
            </button></li>
          ))}
        </ul>
      ) : <Empty title={show === 'new' ? 'No new messages' : 'Nothing here'}>New messages from the Contact page show up here.</Empty>}
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <p class="muted small">{open.topic}{open.company ? ` · ${open.company}` : ''} · {fmt(open.created_at)}</p>
          <p class="msg-body">{open.body}</p>
          <div class="row wrap">
            <a class="btn" href={`mailto:${open.email}?subject=${encodeURIComponent('Re: ' + (open.topic || 'your message'))}`}>Reply to {open.email}</a>
            {open.status !== 'archived' && <Btn kind="ghost" onClick={() => archive(open)}>Archive</Btn>}
            <ConfirmBtn label="Delete" onConfirm={async () => { await adm.remove('messages', open.id); setOpen(null); reload(); }} />
          </div>
        </Sheet>
      )}
    </div>
  );
}
