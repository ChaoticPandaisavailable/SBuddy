export type Page =
  | 'home'
  | 'play'
  | 'characters'
  | 'daily'
  | 'tools'
  | 'gallery'
  | 'settings'
  | 'animation-preview'
  | 'interaction-guide';
export type Tool = 'courseware' | 'notes' | 'gesture' | 'focus' | undefined;
export type Subpage = Tool | 'schedule';
export function parseNavigation(hash: string): { page: Page; sub?: Subpage } {
  const [page, sub] = hash.replace(/^#/, '').split('/');
  if (page === 'tools' && sub === 'schedule')
    return { page: 'daily', sub: 'schedule' };
  if (page === 'daily')
    return { page, sub: sub === 'schedule' ? 'schedule' : undefined };
  if (page === 'tools')
    return {
      page,
      sub: ['courseware', 'notes', 'gesture', 'focus'].includes(sub)
        ? (sub as Tool)
        : undefined,
    };
  return {
    page: [
      'home',
      'play',
      'characters',
      'gallery',
      'settings',
      'animation-preview',
      'interaction-guide',
    ].includes(page)
      ? (page as Page)
      : 'home',
  };
}
