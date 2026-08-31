import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const GITHUB_ORG = 'helixid';
const GITHUB_REPO = 'helixid';
const WIKI_REPO = 'helix-wiki';
const GITHUB_URL = `https://github.com/${GITHUB_ORG}/${GITHUB_REPO}`;

/**
 * Where this site is served from.
 *
 * Until a custom domain is wired up, the site publishes to the default
 * GitHub Pages URL: https://helixid.github.io/helix-wiki/
 *
 * To move it to a custom domain, set the repository variable CUSTOM_DOMAIN
 * (Settings -> Secrets and variables -> Actions -> Variables) to the bare
 * hostname, e.g. `wiki.helixid.dev`. The deploy workflow reads it, switches
 * baseUrl to `/`, and writes the CNAME file. No code change required.
 */
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN?.trim();
const SITE_URL = CUSTOM_DOMAIN
  ? `https://${CUSTOM_DOMAIN}`
  : `https://${GITHUB_ORG}.github.io`;
const BASE_URL = CUSTOM_DOMAIN ? '/' : `/${WIKI_REPO}/`;

const config: Config = {
  title: 'HelixID Docs',
  tagline: 'Cryptographic identity and authorization for AI agents',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
    faster: true,
  },

  url: SITE_URL,
  baseUrl: BASE_URL,

  organizationName: GITHUB_ORG,
  projectName: WIKI_REPO,
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: `https://github.com/${GITHUB_ORG}/${WIKI_REPO}/tree/main/`,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/helixid-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: { hideable: true, autoCollapseCategories: false },
    },
    navbar: {
      title: 'HelixID',
      logo: {
        alt: 'HelixID',
        src: 'img/logo.png',
        srcDark: 'img/logo-dark.png',
      },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/sdk/sdk-js', label: 'SDK', position: 'left' },
        { to: '/examples/overview', label: 'Examples', position: 'left' },
        { href: 'https://helixid.dev', label: 'helixid.dev', position: 'right' },
        { href: GITHUB_URL, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/' },
            { label: 'Quick Start', to: '/get-started/quick-start' },
            { label: 'Core Concepts', to: '/concepts/trust-stack' },
            { label: 'SDK Reference', to: '/sdk/sdk-js' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub Discussions', href: `${GITHUB_URL}/discussions` },
            { label: 'GitHub Issues', href: `${GITHUB_URL}/issues` },
            { label: 'Contributing', to: '/contributing/how-to-contribute' },
            { label: 'Security Policy', to: '/security/reporting-a-vulnerability' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'GitHub', href: GITHUB_URL },
            { label: 'helixid.dev', href: 'https://helixid.dev' },
            { label: 'DgVerse', href: 'https://www.dgverse.in' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} DgVerse. HelixID is Apache-2.0 licensed.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'json', 'typescript', 'diff'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
