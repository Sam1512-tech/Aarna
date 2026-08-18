import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/actions/auth";
import {
  getGeneralSalesReportRows,
  getGstCreditNotesRegisterRows,
  getGstSalesRegisterRows,
} from "@/lib/actions/admin/reports";
import { resolveReportDateRange, type ReportPreset } from "@/lib/reports/date-range";
import { buildCsv, CSV_BOM } from "@/lib/reports/csv";
import { buildReportXlsx } from "@/lib/reports/xlsx";
import { generateReportPdf } from "@/lib/reports/report-pdf";
import { ActionError } from "@/lib/action-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportType = "general" | "gst" | "credit_notes";
type ReportFormat = "csv" | "xlsx" | "pdf";

const REPORT_TYPES: ReportType[] = ["general", "gst", "credit_notes"];
const REPORT_FORMATS: ReportFormat[] = ["csv", "xlsx", "pdf"];
const PRESETS: ReportPreset[] = [
  "this_month",
  "last_month",
  "this_quarter",
  "this_financial_year",
  "custom",
];

const GENERAL_HEADERS = [
  "Order Number",
  "Order Date",
  "Customer",
  "Email",
  "Phone",
  "Items",
  "Subtotal (Rs.)",
  "Discount (Rs.)",
  "Shipping (Rs.)",
  "COD Fee (Rs.)",
  "Total (Rs.)",
  "Coupon",
  "Payment Method",
  "Payment Status",
  "Fulfillment Status",
  "Invoice Number",
  "AWB Number",
];

// Relative PDF column widths, same order as GENERAL_HEADERS — see the
// comment on ReportPdfData.columnWidths (lib/reports/report-pdf.tsx) for
// why every column can't just share one flex value. Sized by content type:
// free text (Customer, Email) gets the most room, fixed-length numbers
// (Items, money columns) stay narrow, everything else lands in between.
const GENERAL_COL_WIDTHS = [
  1.4, // Order Number
  1.3, // Order Date
  1.8, // Customer
  2.0, // Email
  1.0, // Phone
  0.6, // Items
  1.1, // Subtotal (Rs.)
  1.1, // Discount (Rs.)
  1.1, // Shipping (Rs.)
  1.1, // COD Fee (Rs.)
  1.1, // Total (Rs.)
  1.0, // Coupon
  1.1, // Payment Method
  1.1, // Payment Status
  1.3, // Fulfillment Status
  1.4, // Invoice Number
  1.2, // AWB Number
];

const GST_HEADERS = [
  "Invoice Number",
  "Invoice Date",
  "Order Number",
  "Customer",
  "Customer GSTIN",
  "Place of Supply",
  "Supply Type",
  "HSN Code",
  "GST Rate (%)",
  "Taxable Value (Rs.)",
  "CGST (Rs.)",
  "SGST (Rs.)",
  "IGST (Rs.)",
  "Total (Rs.)",
  "Payment Status",
];

// Same reasoning as GENERAL_COL_WIDTHS. Customer GSTIN gets deliberately
// generous width — it's a fixed 15-character alphanumeric string with no
// spaces or punctuation, so it has no opportunity to wrap onto a second
// line if the column is too narrow; it must fit on one line or it overflows
// into the next column instead.
const GST_COL_WIDTHS = [
  1.4, // Invoice Number
  1.2, // Invoice Date
  1.3, // Order Number
  1.7, // Customer
  1.6, // Customer GSTIN
  1.2, // Place of Supply
  1.0, // Supply Type
  0.7, // HSN Code
  0.8, // GST Rate (%)
  1.1, // Taxable Value (Rs.)
  0.9, // CGST (Rs.)
  0.9, // SGST (Rs.)
  0.9, // IGST (Rs.)
  1.1, // Total (Rs.)
  1.0, // Payment Status
];

const CREDIT_NOTE_HEADERS = [
  "Credit Note Number",
  "Credit Note Date",
  "Against Invoice",
  "Order Number",
  "Customer",
  "GST Rate (%)",
  "Taxable Value (Rs.)",
  "CGST (Rs.)",
  "SGST (Rs.)",
  "IGST (Rs.)",
  "Total Credit (Rs.)",
  "Needs Review",
];

const CREDIT_NOTE_COL_WIDTHS = [
  1.5, // Credit Note Number
  1.2, // Credit Note Date
  1.4, // Against Invoice
  1.3, // Order Number
  1.7, // Customer
  0.8, // GST Rate (%)
  1.2, // Taxable Value (Rs.)
  0.9, // CGST (Rs.)
  0.9, // SGST (Rs.)
  0.9, // IGST (Rs.)
  1.2, // Total Credit (Rs.)
  1.0, // Needs Review
];

function money(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// GET /api/admin/reports/export?type=general|gst&format=csv|xlsx|pdf
//   &preset=this_month|last_month|this_quarter|this_financial_year|custom
//   &from=YYYY-MM-DD&to=YYYY-MM-DD (only used when preset=custom)
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") as ReportType | null;
  const format = url.searchParams.get("format") as ReportFormat | null;
  const preset = url.searchParams.get("preset") as ReportPreset | null;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  if (!type || !REPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid or missing 'type'" }, { status: 400 });
  }
  if (!format || !REPORT_FORMATS.includes(format)) {
    return NextResponse.json({ error: "invalid or missing 'format'" }, { status: 400 });
  }
  if (!preset || !PRESETS.includes(preset)) {
    return NextResponse.json({ error: "invalid or missing 'preset'" }, { status: 400 });
  }

  let range;
  try {
    range = resolveReportDateRange(preset, from, to);
  } catch (err) {
    console.error("[admin reports export] date range resolution failed:", err);
    // Only ActionError messages are safe to show an admin verbatim — route
    // handlers don't get Next's server-action digest masking.
    if (err instanceof ActionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }

  const title =
    type === "gst"
      ? "GST Sales Register"
      : type === "credit_notes"
        ? "GST Credit Notes Register"
        : "Sales Report";

  let headers: string[];
  let columnWidths: number[];
  let rows: (string | number)[][];
  let totalsRow: (string | number)[] | undefined;

  try {
    if (type === "gst") {
      const data = await getGstSalesRegisterRows(range.from, range.to);
      headers = GST_HEADERS;
      columnWidths = GST_COL_WIDTHS;
      rows = data.map((r) => [
        r.invoiceNumber,
        r.invoiceDate,
        r.orderNumber,
        r.customerName,
        r.customerGstin,
        r.placeOfSupply,
        r.supplyType,
        r.hsnCode,
        r.gstRatePercent,
        money(r.taxableValue),
        money(r.cgst),
        money(r.sgst),
        money(r.igst),
        money(r.total),
        r.paymentStatus,
      ]);
      if (data.length > 0) {
        const sum = (f: (r: (typeof data)[number]) => number) =>
          data.reduce((s, r) => s + f(r), 0);
        totalsRow = [
          "", "", "", "", "", "", "", "", "TOTAL",
          money(sum((r) => r.taxableValue)),
          money(sum((r) => r.cgst)),
          money(sum((r) => r.sgst)),
          money(sum((r) => r.igst)),
          money(sum((r) => r.total)),
          "",
        ];
      }
    } else if (type === "credit_notes") {
      const data = await getGstCreditNotesRegisterRows(range.from, range.to);
      headers = CREDIT_NOTE_HEADERS;
      columnWidths = CREDIT_NOTE_COL_WIDTHS;
      rows = data.map((r) => [
        r.creditNoteNumber,
        r.creditNoteDate,
        r.originalInvoiceNumber,
        r.orderNumber,
        r.customerName,
        r.gstRatePercent,
        money(r.taxableValue),
        money(r.cgst),
        money(r.sgst),
        money(r.igst),
        money(r.total),
        r.needsReview,
      ]);
      if (data.length > 0) {
        const sum = (f: (r: (typeof data)[number]) => number) =>
          data.reduce((s, r) => s + f(r), 0);
        totalsRow = [
          "", "", "", "", "", "TOTAL",
          money(sum((r) => r.taxableValue)),
          money(sum((r) => r.cgst)),
          money(sum((r) => r.sgst)),
          money(sum((r) => r.igst)),
          money(sum((r) => r.total)),
          "",
        ];
      }
    } else {
      const data = await getGeneralSalesReportRows(range.from, range.to);
      headers = GENERAL_HEADERS;
      columnWidths = GENERAL_COL_WIDTHS;
      rows = data.map((r) => [
        r.orderNumber,
        r.orderDate,
        r.customerName,
        r.email,
        r.phone,
        r.itemCount,
        money(r.subtotal),
        money(r.discount),
        money(r.shippingFee),
        money(r.codFee),
        money(r.total),
        r.couponCode,
        r.paymentMethod,
        r.paymentStatus,
        r.fulfillmentStatus,
        r.invoiceNumber,
        r.awbNumber,
      ]);
      if (data.length > 0) {
        const sum = (f: (r: (typeof data)[number]) => number) =>
          data.reduce((s, r) => s + f(r), 0);
        totalsRow = [
          "", "", "", "", "TOTAL",
          sum((r) => r.itemCount),
          money(sum((r) => r.subtotal)),
          money(sum((r) => r.discount)),
          money(sum((r) => r.shippingFee)),
          money(sum((r) => r.codFee)),
          money(sum((r) => r.total)),
          "", "", "", "", "", "",
        ];
      }
    }
  } catch (err) {
    console.error(`[admin reports export] ${type} report query failed:`, err);
    // Route handlers don't get Next's server-action digest masking, so only
    // an explicit ActionError (e.g. the date-range-too-wide guard) is safe
    // to forward to the client verbatim — anything else stays generic.
    if (err instanceof ActionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }

  const filenameBase = `aarna-${type}-report-${range.from.toISOString().slice(0, 10)}-to-${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}`;

  try {
    if (format === "csv") {
      const csv = CSV_BOM + buildCsv(headers, [...rows, ...(totalsRow ? [totalsRow] : [])]);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (format === "xlsx") {
      const buffer = await buildReportXlsx(title, range.label, headers, rows, totalsRow);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const generatedAtLabel = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });
    const buffer = await generateReportPdf({
      title,
      dateRangeLabel: range.label,
      headers,
      columnWidths,
      rows,
      totalsRow,
      generatedAtLabel,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error(`[admin reports export] ${type} ${format} export failed:`, err);
    // Only ActionError messages are safe to show an admin verbatim — route
    // handlers don't get Next's server-action digest masking, so anything
    // else (DB hiccup, xlsx/PDF-lib exception) must stay generic.
    const message =
      err instanceof ActionError ? err.message : "Something went wrong — please try again";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
