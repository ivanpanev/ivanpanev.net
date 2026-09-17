/** Registry of browser tools: one entry per /tools/* page. */
export const TOOLS = [
  {
    id: 'subnet',
    href: '/tools/subnet',
    name: 'Subnet calculator',
    description: 'IPv4 and IPv6 prefix arithmetic with the binary view, split and supernet helpers.',
  },
  {
    id: 'counter',
    href: '/tools/counter',
    name: 'Text counter',
    description: 'Words, characters, sentences, bytes and reading time. Unicode-aware.',
  },
  {
    id: 'secrets',
    href: '/tools/secrets',
    name: 'Secret generator',
    description: 'Uniformly random strings and EFF-wordlist passphrases, with honest entropy figures.',
  },
  {
    id: 'color',
    href: '/tools/color',
    name: 'Colour picker',
    description: 'Named colours, palettes, and a Photoshop-style sampler from an image.',
  },
  {
    id: 'editor',
    href: '/tools/editor',
    name: 'Editor',
    description: 'A Notepad++-flavoured browser editor with tabs, split view, and a cloud save.',
  },
] as const;
export type ToolId = (typeof TOOLS)[number]['id'];
