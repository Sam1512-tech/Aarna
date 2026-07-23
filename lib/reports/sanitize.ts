/**
 * Shared between the CSV and Excel report exports (lib/reports/csv.ts,
 * lib/reports/xlsx.ts) — a string cell starting with one of these
 * characters is interpreted as a live formula the moment the exported file
 * is opened in Excel/Google Sheets, not literal text. A customer-controlled
 * field (e.g. the shipping full name from checkout) landing in the
 * accountant's exported sales/GST report is a real path to a formula like
 * =HYPERLINK(...) exfiltrating adjacent cells (other customers' totals,
 * emails, phone numbers) the moment the report is opened.
 *
 * A leading apostrophe forces spreadsheet apps to treat the cell as plain
 * text — the standard OWASP CSV-injection mitigation — and doesn't render
 * visibly in the cell. Only strings are touched: a genuine numeric cell can
 * never be interpreted as a formula regardless of its value (a negative
 * number's leading "-" is a number, not a string starting with "-").
 */
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function neutralizeFormulaCell<T extends string | number>(value: T): T {
  if (typeof value !== "string" || value.length === 0) return value;
  return (FORMULA_TRIGGER_CHARS.has(value[0]) ? `'${value}` : value) as T;
}
