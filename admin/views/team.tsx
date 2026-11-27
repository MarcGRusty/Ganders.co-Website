import { h } from 'preact';
import { useState } from 'preact/hooks';
import { api } from '../api';
import { Area, Btn, Card, ColorField, ConfirmBtn, Empty, Field, Head, Sheet, Spinner, Toggle, fmt, toast, useLoad } from '../ui';
import { session } from '../session';

type Team = { users: any[]; roles: any[]; groups: any[]; permissions: { group: string; items: [string, string][] }[]; custom: any[] };

export function TeamView() {
  const { data, loading, reload } = useLoad<Team>(() => api('/admin/team'));
  const [tab, setTab] = useState('people');
  const [edit, setEdit] = useState<{ kind: string; item: any } | null>(null);
  const [temp, setTemp] = useState<{ email: string; pw: string } | null>(null);
  if (loading || !data) return <Spinner />;
  const roleName = (id: number) => data.roles.find((r) => r.id === id);
  const done = () => { setEdit(null); reload(); };
  return (
    <div class="view">
      <Head title="People and permissions" sub="Invite people, give them roles, and put them in groups. Roles are bundles of permissions, and groups give everyone inside them the same access.">
        {tab === 'people' && <Btn onClick={() => setEdit({ kind: 'user', item: { email: '', name: '', roleIds: [], groupIds: [] } })}>Add person</Btn>}
        {tab === 'roles' && <Btn onClick={() => setEdit({ kind: 'role', item: { name: '', description: '', permissions: [], colour: '#5B6670' } })}>New role</Btn>}
        {tab === 'groups' && <Btn onClick={() => setEdit({ kind: 'group', item: { name: '', description: '', permissions: [], roleIds: [], memberIds: [] } })}>New group</Btn>}
        {tab === 'perms' && <Btn onClick={() => setEdit({ kind: 'perm', item: { label: '', description: '' } })}>New permission</Btn>}
      </Head>
      <div class="tabs scroll">{[['people', `People (${data.users.length})`], ['roles', `Roles (${data.roles.length})`], ['groups', `Groups (${data.groups.length})`], ['perms', 'Custom permissions']].map(([k, l]) => <button class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {temp && <div class="banner">Share this temporary password with {temp.email} privately: <code class="mono">{temp.pw}</code>. They will be asked to choose their own when they first sign in. It will not be shown again.</div>}

      {tab === 'people' && (
        <ul class="rows">
          {data.users.map((u) => (
            <li><button class="row-link" onClick={() => setEdit({ kind: 'user', item: u })}>
              <span class="row-main"><strong>{u.name || u.email}{u.id === session.me?.id && <span class="muted"> (you)</span>}</strong><span class="muted">{u.email}{u.last_login ? ` · last in ${fmt(u.last_login)}` : ' · not signed in yet'}</span></span>
              <span class="row-meta">{!u.active && <span class="pill">Suspended</span>}{u.roleIds.map((id: number) => <RoleChip r={roleName(id)} />)}{u.groupIds.map((id: number) => <span class="pill">{data.groups.find((g) => g.id === id)?.name}</span>)}</span>
            </button></li>
          ))}
        </ul>
      )}

      {tab === 'roles' && (
        <div class="kb-grid">
          {data.roles.map((r) => (
            <button class="kb" onClick={() => setEdit({ kind: 'role', item: r })}>
              <span class="role-top"><RoleChip r={r} />{r.system ? <small class="muted">Built in</small> : <small class="muted">Custom</small>}</span>
              <span class="kb-body">{r.description}</span>
              <small class="muted">{r.permissions.includes('*') ? 'Every permission' : `${r.permissions.length} permissions`} · {data.users.filter((u) => u.roleIds.includes(r.id)).length} people</small>
            </button>
          ))}
        </div>
      )}

      {tab === 'groups' && (data.groups.length ? (
        <div class="kb-grid">
          {data.groups.map((g) => (
            <button class="kb" onClick={() => setEdit({ kind: 'group', item: g })}>
              <strong>{g.name}</strong>
              <span class="kb-body">{g.description}</span>
              <span class="row-meta">{g.roleIds.map((id: number) => <RoleChip r={roleName(id)} />)}</span>
              <small class="muted">{g.memberIds.length} members{g.permissions.length ? ` · ${g.permissions.length} extra permissions` : ''}</small>
            </button>
          ))}
        </div>
      ) : <Empty title="No groups yet">Groups are handy for teams, like "Marketing" or "Business A staff". Everyone in a group gets its roles.</Empty>)}

      {tab === 'perms' && (
        <Card title="Your own permissions">
          <p class="muted small">Built in permissions cover everything in Studio. Add your own for things you build, like a module only some people can manage, then tick them in any role or group.</p>
          {data.custom.length ? <ul class="list">{data.custom.map((p) => <li class="perm-row"><span><strong>{p.label}</strong><code class="mono small muted"> {p.key}</code>{p.description && <small class="muted">{p.description}</small>}</span><ConfirmBtn onConfirm={async () => { await api(`/admin/team/permissions/${p.key}`, { method: 'DELETE' }); reload(); }} /></li>)}</ul> : <p class="muted">None yet.</p>}
        </Card>
      )}

      {edit?.kind === 'user' && <UserSheet team={data} user={edit.item} onClose={() => setEdit(null)} onDone={(pw) => { if (pw) setTemp({ email: edit.item.email, pw }); done(); }} />}
      {edit?.kind === 'role' && <RoleSheet team={data} role={edit.item} onClose={() => setEdit(null)} onDone={done} />}
      {edit?.kind === 'group' && <GroupSheet team={data} group={edit.item} onClose={() => setEdit(null)} onDone={done} />}
      {edit?.kind === 'perm' && <PermSheet onClose={() => setEdit(null)} onDone={done} />}
    </div>
  );
}

function RoleChip({ r }: { r?: any }) {
  if (!r) return null;
  return <span class="pill role" style={r.colour ? `--rc:${r.colour}` : ''}>{r.name}</span>;
}

function Picker({ label, options, value, onChange }: { label: string; options: { id: number; label: string; hint?: string }[]; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <fieldset class="picker">
      <legend>{label}</legend>
      {options.map((o) => (
        <label class="check">
          <input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange((e.target as HTMLInputElement).checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />
          <span>{o.label}{o.hint && <small>{o.hint}</small>}</span>
        </label>
      ))}
    </fieldset>
  );
}

function PermGrid({ team, value, onChange, locked }: { team: Team; value: string[]; onChange: (v: string[]) => void; locked?: boolean }) {
  const groups = [...team.permissions, ...(team.custom.length ? [{ group: 'Custom', items: team.custom.map((c) => [c.key, c.label] as [string, string]) }] : [])];
  const toggle = (k: string, on: boolean) => onChange(on ? [...value, k] : value.filter((x) => x !== k));
  return (
    <div class="perm-grid">
      {groups.map((g) => {
        const keys = g.items.map(([k]) => k);
        const all = keys.every((k) => value.includes(k) || value.includes('*'));
        return (
          <fieldset class="perm-group" disabled={locked}>
            <legend><span>{g.group}</span>{!locked && <button type="button" class="link" onClick={() => onChange(all ? value.filter((x) => !keys.includes(x)) : [...new Set([...value, ...keys])])}>{all ? 'None' : 'All'}</button>}</legend>
            {g.items.map(([k, l]) => (
              <label class="check slim"><input type="checkbox" checked={value.includes('*') || value.includes(k)} onChange={(e) => toggle(k, (e.target as HTMLInputElement).checked)} /><span>{l}</span></label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

function UserSheet({ team, user, onClose, onDone }: { team: Team; user: any; onClose: () => void; onDone: (pw?: string) => void }) {
  const [u, setU] = useState({ ...user, roleIds: [...(user.roleIds || [])], groupIds: [...(user.groupIds || [])] });
  const [busy, setBusy] = useState('');
  const isNew = !u.id;
  async function save(extra: any = {}) {
    setBusy(extra.resetPassword ? 'reset' : 'save');
    try {
      const r = isNew
        ? await api('/admin/team/users', { body: u })
        : await api(`/admin/team/users/${u.id}`, { method: 'PUT', body: { name: u.name, active: u.active, roleIds: u.roleIds, groupIds: u.groupIds, ...extra } });
      toast.ok(isNew ? 'Person added' : 'Saved');
      onDone(r.tempPassword);
    } catch (e) { toast.err(e); setBusy(''); }
  }
  return (
    <Sheet title={isNew ? 'Add a person' : u.name || u.email} onClose={onClose} wide>
      <div class="stack">
        <div class="two">
          <Field label="Name" value={u.name} onInput={(v) => setU({ ...u, name: v })} />
          <Field label="Email" type="email" value={u.email} onInput={(v) => isNew && setU({ ...u, email: v })} hint={isNew ? 'They sign in with this.' : 'Email cannot be changed.'} />
        </div>
        <Picker label="Roles" value={u.roleIds} onChange={(v) => setU({ ...u, roleIds: v })} options={team.roles.map((r) => ({ id: r.id, label: r.name, hint: r.description }))} />
        {team.groups.length > 0 && <Picker label="Groups" value={u.groupIds} onChange={(v) => setU({ ...u, groupIds: v })} options={team.groups.map((g) => ({ id: g.id, label: g.name, hint: g.description }))} />}
        {!isNew && <Toggle label="Can sign in" hint="Turn off to suspend this person without deleting them." checked={!!u.active} onChange={(v) => setU({ ...u, active: v ? 1 : 0 })} />}
        <div class="row wrap">
          <Btn busy={busy === 'save'} onClick={() => save()}>{isNew ? 'Add and create password' : 'Save'}</Btn>
          {!isNew && <Btn kind="ghost" busy={busy === 'reset'} onClick={() => save({ resetPassword: true })}>Reset password</Btn>}
          {!isNew && u.id !== session.me?.id && <ConfirmBtn label="Remove person" onConfirm={async () => { try { await api(`/admin/team/users/${u.id}`, { method: 'DELETE' }); onDone(); } catch (e) { toast.err(e); } }} />}
        </div>
      </div>
    </Sheet>
  );
}

function RoleSheet({ team, role, onClose, onDone }: { team: Team; role: any; onClose: () => void; onDone: () => void }) {
  const [r, setR] = useState({ ...role, permissions: [...role.permissions] });
  const [busy, setBusy] = useState(false);
  const locked = r.key === 'owner';
  async function save() {
    setBusy(true);
    try { r.id ? await api(`/admin/team/roles/${r.id}`, { method: 'PUT', body: r }) : await api('/admin/team/roles', { body: r }); toast.ok('Saved'); onDone(); } catch (e) { toast.err(e); setBusy(false); }
  }
  return (
    <Sheet title={r.id ? r.name : 'New role'} onClose={onClose} wide>
      <div class="stack">
        {locked && <p class="note">The Owner role always has every permission so nobody can be locked out.</p>}
        <div class="two"><Field label="Name" value={r.name} onInput={(v) => setR({ ...r, name: v })} /><ColorField label="Colour" value={r.colour || ''} onInput={(v) => setR({ ...r, colour: v })} /></div>
        <Area label="What is this role for?" rows={2} value={r.description} onInput={(v) => setR({ ...r, description: v })} />
        <PermGrid team={team} locked={locked} value={r.permissions} onChange={(v) => setR({ ...r, permissions: v })} />
        {!locked && <div class="row wrap"><Btn busy={busy} onClick={save}>Save role</Btn>{r.id && !r.system && <ConfirmBtn label="Delete role" onConfirm={async () => { await api(`/admin/team/roles/${r.id}`, { method: 'DELETE' }); onDone(); }} />}</div>}
      </div>
    </Sheet>
  );
}

function GroupSheet({ team, group, onClose, onDone }: { team: Team; group: any; onClose: () => void; onDone: () => void }) {
  const [g, setG] = useState({ ...group, permissions: [...group.permissions], roleIds: [...group.roleIds], memberIds: [...group.memberIds] });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { g.id ? await api(`/admin/team/groups/${g.id}`, { method: 'PUT', body: g }) : await api('/admin/team/groups', { body: g }); toast.ok('Saved'); onDone(); } catch (e) { toast.err(e); setBusy(false); }
  }
  return (
    <Sheet title={g.id ? g.name : 'New group'} onClose={onClose} wide>
      <div class="stack">
        <Field label="Name" value={g.name} onInput={(v) => setG({ ...g, name: v })} />
        <Area label="Description" rows={2} value={g.description} onInput={(v) => setG({ ...g, description: v })} />
        <Picker label="Members" value={g.memberIds} onChange={(v) => setG({ ...g, memberIds: v })} options={team.users.map((u) => ({ id: u.id, label: u.name || u.email, hint: u.email }))} />
        <Picker label="Roles everyone in this group gets" value={g.roleIds} onChange={(v) => setG({ ...g, roleIds: v })} options={team.roles.map((r) => ({ id: r.id, label: r.name }))} />
        <details class="more"><summary>Extra permissions just for this group</summary><PermGrid team={team} value={g.permissions} onChange={(v) => setG({ ...g, permissions: v })} /></details>
        <div class="row wrap"><Btn busy={busy} onClick={save}>Save group</Btn>{g.id && <ConfirmBtn label="Delete group" onConfirm={async () => { await api(`/admin/team/groups/${g.id}`, { method: 'DELETE' }); onDone(); }} />}</div>
      </div>
    </Sheet>
  );
}

function PermSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [p, setP] = useState({ label: '', description: '' });
  return (
    <Sheet title="New permission" onClose={onClose}>
      <div class="stack">
        <Field label="Name" value={p.label} onInput={(v) => setP({ ...p, label: v })} placeholder="Manage the booking module" />
        <Area label="Description" rows={2} value={p.description} onInput={(v) => setP({ ...p, description: v })} />
        <Btn onClick={async () => { try { await api('/admin/team/permissions', { body: p }); onDone(); } catch (e) { toast.err(e); } }}>Create permission</Btn>
      </div>
    </Sheet>
  );
}

export function AccountSheet({ onClose, forced }: { onClose: () => void; forced?: boolean }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api('/admin/account/password', { body: { current: cur, next } }); toast.ok('Password changed. Please sign in again.'); setTimeout(() => location.reload(), 900); } catch (e) { toast.err(e); setBusy(false); }
  }
  return (
    <Sheet title={forced ? 'Choose your own password' : 'Your account'} onClose={forced ? () => {} : onClose}>
      <div class="stack">
        <p class="muted small">Signed in as {session.me?.email}. Roles: {session.me?.roles.join(', ') || 'none'}.</p>
        <Field label={forced ? 'Temporary password' : 'Current password'} type="password" value={cur} onInput={setCur} />
        <Field label="New password" type="password" value={next} onInput={setNext} hint="At least 10 characters. A short phrase is easy to remember." />
        <Btn busy={busy} onClick={save}>Change password</Btn>
      </div>
    </Sheet>
  );
}
