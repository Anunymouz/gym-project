import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('quotes every cell and escapes quotes', () => {
    expect(toCsv([['a', 'say "hi"', 3, null]])).toBe('﻿"a","say ""hi""","3",""\r\n');
  });

  it('neutralises spreadsheet formulas in text (CSV injection)', () => {
    const out = toCsv([['=HYPERLINK("http://evil","x")', '+233', '-2+3', '@SUM(A1)', '\tx', 'Ama']]);
    expect(out).toBe('﻿"\'=HYPERLINK(""http://evil"",""x"")","\'+233","\'-2+3","\'@SUM(A1)","\'\tx","Ama"\r\n');
  });

  it('leaves numbers alone, including negatives', () => {
    expect(toCsv([[-5]])).toBe('﻿"-5"\r\n');
  });
});
