import { h } from 'preact';
import { useState } from 'preact/hooks';
import { adm, api } from '../api';
import { can } from '../session';
import { Area, Btn, ConfirmBtn, Empty, Head, Sheet, Spinner, fmt, toast, useLoad } from '../ui';

export function Inbox() {
  const { data, loading, reload } = useLoad<any[]>(() => adm.list('messages'));
  const [show, setShow] = useState('new');
  const [open, setOpen] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  async function send() {
    setSending(true);
    try { await api(`/admin/messages/${open.id}/reply`, { body: { text: reply } }); toast.ok(`Reply sent to ${open.email}`); setReply(''); setOpen(null); reload(); } catch (e) { toast.err(e); } finally { setSending(false); }
  }
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
              <span class="row-meta">{m.replied_at && <span class="pill published">Replied</span>}{m.topic && <span class="pill">{m.topic}</span>}<small>{fmt(m.created_at)}</small></span>
            </button></li>
          ))}
        </ul>
      ) : <Empty title={show === 'new' ? 'No new messages' : 'Nothing here'}>New messages from the Contact page show up here.</Empty>}
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <p class="muted small">{open.topic}{open.company ? ` · ${open.company}` : ''} · {fmt(open.created_at)}</p>
          <p class="msg-body">{open.body}</p>
          {open.notes && <pre class="notes-log">{open.notes}</pre>}
          {can('inbox.manage') && (
            <div class="reply">
              <Area label={`Reply to ${open.email}`} rows={5} value={reply} onInput={setReply} hint="Sends from the website's address. Their reply comes back to your email." />
              <div class="row wrap"><Btn busy={sending} disabled={!reply.trim()} onClick={send}>Send reply</Btn><a class="btn plain" href={`mailto:${open.email}?subject=${encodeURIComponent('Re: ' + (open.topic || 'your message'))}`}>Use my email app</a></div>
            </div>
          )}
          <div class="row wrap">
            {open.status !== 'archived' && <Btn kind="ghost" onClick={() => archive(open)}>Archive</Btn>}
            <ConfirmBtn label="Delete" onConfirm={async () => { await adm.remove('messages', open.id); setOpen(null); reload(); }} />
          </div>
        </Sheet>
      )}
    </div>
  );
}
