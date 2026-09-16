/** Site-wide constants. Anything that appears in more than one page lives here. */
export const SITE = {
  name: 'Ivan Panev',
  title: 'Ivan Panev',
  description:
    'Site reliability engineer and former network engineer. Essays, project notes, and a small toolbox.',
  url: 'https://ivanpanev.net',
  author: 'Ivan Panev',
  email: 'ivan@ivanpanev.net',
  locale: 'en',
  /** Used by RSS, security.txt expiry checks and the footer. */
  established: 2026,
} as const;

export const NAV = [
  { href: '/blog', label: 'Blog' },
  { href: '/projects', label: 'Projects' },
  { href: '/tools', label: 'Tools' },
  { href: '/pgp', label: 'PGP' },
  { href: '/about', label: 'About' },
] as const;

/** Section order and labels for the projects wiki sidebar. */
export const PROJECT_SECTIONS = [
  { id: 'platform', label: 'Platform' },
  { id: 'networking', label: 'Networking' },
  { id: 'homelab', label: 'Homelab' },
  { id: 'software', label: 'Software' },
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number]['id'];
