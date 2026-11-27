export interface Me { id: number; email: string; name: string; must_change: number; permissions: string[]; roles: string[] }
let me: Me | null = null;
export const session = {
  set(u: Me | null) { me = u; },
  get me() { return me; },
};
export function can(...perms: string[]): boolean {
  if (!me) return false;
  return me.permissions.includes('*') || perms.some((p) => me!.permissions.includes(p));
}
