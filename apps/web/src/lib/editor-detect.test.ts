import { describe, expect, it } from 'vitest';
import { detectLanguage, languageFromFilename } from './editor-detect';

describe('editor-detect', () => {
  it('uses the filename first', () => {
    expect(languageFromFilename('main.go')).toBe('go');
    expect(detectLanguage('app.ts', 'not typescript looking')).toBe('typescript');
  });
  it('falls back to content', () => {
    expect(detectLanguage('untitled', '#!/usr/bin/env python3\nprint(1)')).toBe('python');
    expect(detectLanguage('untitled', '{"a":1}')).toBe('json');
    expect(detectLanguage('untitled', '<?php echo 1;')).toBe('php');
  });
});
