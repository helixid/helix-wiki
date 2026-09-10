import MDXComponents from '@theme-original/MDXComponents';
import Figure from '@site/src/components/Figure';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

// Registered globally so docs pages can use <Figure />, <Tabs>, and
// <TabItem> without an import.
export default {
  ...MDXComponents,
  Figure,
  Tabs,
  TabItem,
};
