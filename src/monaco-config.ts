import { loader } from '@monaco-editor/react';

loader.config({
  paths: {
    vs: '/editor/min/vs'
  },
  'vs/nls': { availableLanguages: { '*': 'zh-cn' } }
});
