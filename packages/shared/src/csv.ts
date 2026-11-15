/**
 * CSV for spreadsheets. Every cell is quoted, and cells that a spreadsheet would treat as a
 * formula (starting with = + - @, tab or carriage return) are prefixed with ' so text such
 * as a member's name can never run as a formula when the file is opened (CSV injection).
 */
export function toCsv(rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  // Byte order mark so Excel reads UTF-8 (GH₵, names with accents).
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
