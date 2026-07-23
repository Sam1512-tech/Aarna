import ExcelJS from "exceljs";
import { neutralizeFormulaCell } from "./sanitize";

const MAROON = "FF4B1323";
const CREAM = "FFFAF7F2";

/**
 * Builds a single-sheet workbook: a title/date-range banner, a bold header
 * row, the data rows, and — if `totalsRow` is given — a bold totals row at
 * the bottom. Column widths are sized off the header text and a sample of
 * the data so numbers don't get clipped.
 */
export async function buildReportXlsx(
  title: string,
  dateRangeLabel: string,
  headers: string[],
  rows: (string | number)[][],
  totalsRow?: (string | number)[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Aarna Label";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Report", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: MAROON } };

  sheet.mergeCells(2, 1, 2, headers.length);
  const rangeCell = sheet.getCell(2, 1);
  rangeCell.value = dateRangeLabel;
  rangeCell.font = { italic: true, size: 10, color: { argb: "FF555555" } };

  const headerRow = sheet.getRow(3);
  headerRow.values = headers;
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAROON } };
    cell.alignment = { vertical: "middle" };
  });

  rows.forEach((row, i) => {
    // Row data can contain customer-controlled fields (e.g. shipping name)
    // — neutralize any that would be read as a live formula when the
    // exported workbook is opened. Headers/totals are app-generated, not
    // user input, so they're left alone.
    const excelRow = sheet.addRow(row.map(neutralizeFormulaCell));
    if (i % 2 === 1) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      });
    }
  });

  if (totalsRow) {
    const excelRow = sheet.addRow(totalsRow);
    excelRow.font = { bold: true };
    excelRow.eachCell((cell) => {
      cell.border = { top: { style: "thin", color: { argb: MAROON } } };
    });
  }

  headers.forEach((header, i) => {
    const col = sheet.getColumn(i + 1);
    const sample = rows.slice(0, 200).map((r) => String(r[i] ?? ""));
    const longest = Math.max(header.length, ...sample.map((s) => s.length), 8);
    col.width = Math.min(40, longest + 2);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
