import MDXComponents from '@theme-original/MDXComponents';
import Figure from '@site/src/components/Figure';

// Registered globally so docs pages can use <Figure /> without an import.
export default {
  ...MDXComponents,
  Figure,
};
