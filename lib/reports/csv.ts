/**
 * Minimal RFC 4180 CSV builder — no library needed for plain tabular data.
 * Excel (and every accounting tool) expects a UTF-8 BOM to render ₹/non-ASCII
 * correctly instead of guessing the wrong codepage, so callers should prepend
 * `CSV_BOM` when writing the response body.
 */

import { neutralizeFormulaCell } from "./sanitize";

export const CSV_BOM = "﻿";

function escapeCsvCell(value: string | number): string {
  const str = String(neutralizeFormulaCell(value));
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCsvCell).join(","),
  );
  return lines.join("\r\n") + "\r\n";
}
