import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Get Started',
      collapsed: false,
      items: [
        'get-started/introduction',
        'get-started/quick-start',
        'get-started/installation-and-modes',
        'get-started/project-structure',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      collapsed: false,
      items: [
        'concepts/trust-stack',
        'concepts/dids-and-identity',
        'concepts/verifiable-credentials',
        'concepts/two-issuer-model',
        'concepts/delegation',
        'concepts/authorization-and-scopes',
        'concepts/revocation',
        'concepts/offline-verification',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/system-overview',
        'architecture/hybrid-layers',
        'architecture/performance-and-caching',
        'architecture/design-decisions',
      ],
    },
    {
      type: 'category',
      label: 'SDK Reference',
      items: [
        'sdk/sdk-js',
        'sdk/core',
        'sdk/mcp',
        'sdk/langchain',
        'sdk/cli',
        'sdk/did-hedera',
        'sdk/widget',
        'sdk/http-api',
      ],
    },
    {
      type: 'category',
      label: 'Framework Integrations',
      items: [
        'integrations/langchain',
        'integrations/mcp',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/overview',
        'examples/consent-demo',
        'examples/travel-concierge',
        'examples/delegation-chain',
        'examples/local-verification',
      ],
    },
    {
      type: 'category',
      label: 'Self-Hosting & Deployment',
      items: [
        'self-hosting/self-hosted-vs-cloud',
        'self-hosting/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Comparisons',
      items: ['comparisons/why-not-just-use'],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/security-model',
        'security/reporting-a-vulnerability',
        'security/key-compromise-and-safe-harbor',
      ],
    },
    {
      type: 'category',
      label: 'Contributing',
      items: [
        'contributing/how-to-contribute',
        'contributing/coding-standards',
      ],
    },
    'roadmap',
  ],
};

export default sidebars;
