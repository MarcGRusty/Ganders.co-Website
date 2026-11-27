/** Every built in permission, grouped for the Studio roles editor. */
export const PERMISSIONS: { group: string; items: [string, string][] }[] = [
  { group: 'General', items: [['dashboard.view', 'See the Studio home screen']] },
  { group: 'Posts', items: [['posts.view', 'See posts and drafts'], ['posts.edit', 'Write and edit posts'], ['posts.publish', 'Publish posts'], ['posts.delete', 'Delete posts']] },
  { group: 'Pages', items: [['pages.view', 'See pages'], ['pages.edit', 'Create and edit pages'], ['pages.publish', 'Publish pages'], ['pages.delete', 'Delete pages']] },
  { group: 'AI', items: [['ai.use', 'Use Write with AI'], ['ideas.use', 'Create ideas and AI drafts'], ['ai.settings', 'Change AI settings and models'], ['knowledge.manage', 'Edit the knowledge base']] },
  { group: 'Site', items: [['ventures.manage', 'Manage ventures'], ['design.manage', 'Change design, menu and home page'], ['media.upload', 'Upload media'], ['media.delete', 'Delete media'], ['modules.manage', 'Build and edit modules']] },
  { group: 'Reach', items: [['inbox.view', 'Read contact messages'], ['inbox.manage', 'Archive and delete messages'], ['social.publish', 'Share to social accounts'], ['integrations.manage', 'Manage API connections']] },
  { group: 'People', items: [['users.manage', 'Manage people, roles, groups and permissions']] },
];
export const ALL_PERMISSION_KEYS = PERMISSIONS.flatMap((g) => g.items.map(([k]) => k));

export function has(perms: Set<string>, p: string): boolean {
  return perms.has('*') || perms.has(p);
}
