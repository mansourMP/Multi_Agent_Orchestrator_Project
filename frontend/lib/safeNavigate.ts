export const safeNavigate = (href: string) => {
  if (typeof window === 'undefined') return;
  const target = String(href || '').trim();
  if (!target) return;
  window.location.assign(target);
};
