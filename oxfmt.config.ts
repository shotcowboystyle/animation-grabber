import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

import { baseIgnorePatterns } from './oxc.ignore.ts';

export default defineConfig({
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  endOfLine: 'lf',
  experimentalSortImports: {
    ignoreCase: true,
    newlinesBetween: true,
    order: 'asc',
  },
  experimentalSortPackageJson: true,
  extends: [ultracite],
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...(baseIgnorePatterns ?? [])],
  jsxSingleQuote: false,
  printWidth: 100,
  quoteProps: 'as-needed',
  semi: true,
  singleAttributePerLine: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
});
