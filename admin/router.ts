import { useEffect, useState } from 'preact/hooks';
export const go = (path: string) => { location.hash = '#' + path; };
export function useRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const [r, set] = useState(read());
  useEffect(() => {
    const f = () => { set(read()); window.scrollTo(0, 0); document.body.classList.remove('menu-open'); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}
