import { Fragment } from "react";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import path from "path";
import type { GstRateBreakdown } from "./generate";

// Addresses, SKUs, and names must wrap at word boundaries, never mid-word —
// react-pdf's default hyphenation engine breaks e.g. "Police" into "Po-lice"
// when a column is narrow. This forces every word to stay whole.
Font.registerHyphenationCallback((word) => [word]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  size: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Garment value-slab rate this line falls under — Rs.2500 or under is 5%,
  // above is 18%. See lib/gst.ts.
  gstRatePercent: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  orderDate: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    /** Buyer's GSTIN, optional — only present for a business/GST invoice. */
    gstin?: string | null;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
    };
  };
  items: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  isInterState: boolean;
  // One entry per distinct GST rate actually present in this order — a
  // single invoice can legitimately mix 5% and 18% items, and each rate's
  // taxable value + tax must be itemized separately, never blended.
  rateBreakdown: GstRateBreakdown[];
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SELLER = {
  name: "Aarna Label",
  addressLine1: "No. 3571, 1st H Cross",
  addressLine2: "Behind Girinagar Police Station,",
  addressLine3: "Giri Nagar, Bengaluru – 560085",
  gstin: "29ACNFA3302J1ZD",
  phone: "+91 79-75639485",
  email: "hello@shopaarna.in",
};

const LOGO_PATH = path.join(process.cwd(), "public", "logo-invoice.png");

// "Rs." not "₹" — the built-in Helvetica PDF font has no rupee glyph (it
// renders as "¹"), and this is a legal tax document.
const INR = (paise: number) =>
  `Rs.${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#111111",
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    backgroundColor: "#FFFFFF",
  },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  logo: { width: 210, height: 56, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  invoiceTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#4B1323", letterSpacing: 2, marginBottom: 4 },
  invoiceMeta: { fontSize: 8, color: "#555", marginBottom: 2 },

  // Divider
  divider: { borderBottomWidth: 0.5, borderBottomColor: "#C8BFB3", marginVertical: 10 },
  thickDivider: { borderBottomWidth: 1, borderBottomColor: "#4B1323", marginVertical: 10 },

  // Two-column info
  infoRow: { flexDirection: "row", gap: 24, marginBottom: 12 },
  infoBox: { flex: 1, alignItems: "flex-start" },
  infoLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9D948E", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  infoText: { fontSize: 8, color: "#111111", lineHeight: 1.5 },
  infoTextBold: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#111111" },

  // Table
  table: { marginTop: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: "#4B1323", paddingVertical: 5, paddingHorizontal: 4 },
  tableHeaderText: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#FAF7F2", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E0D0C6", paddingVertical: 5, paddingHorizontal: 4 },
  tableRowAlt: { backgroundColor: "#FAF7F2" },

  // Table columns
  colDesc: { flex: 3 },
  colHsn: { flex: 1, textAlign: "center" },
  colSize: { flex: 0.8, textAlign: "center" },
  colQty: { flex: 0.6, textAlign: "center" },
  colRate: { flex: 1.2, textAlign: "right" },
  colGstRate: { flex: 0.8, textAlign: "center" },
  colTotal: { flex: 1.2, textAlign: "right" },

  tableCell: { fontSize: 8, color: "#111111" },
  tableCellSub: { fontSize: 7, color: "#9D948E", marginTop: 1 },

  // Totals
  totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totalsBox: { width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 8, color: "#555" },
  totalValue: { fontSize: 8, color: "#111111" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: 1, borderTopColor: "#4B1323", marginTop: 4 },
  grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#4B1323" },
  grandTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#4B1323" },

  // Amount in words
  amountWords: { marginTop: 6, fontSize: 7.5, color: "#555", fontStyle: "italic" },

  // Footer
  footer: { position: "absolute", bottom: 24, left: 40, right: 40 },
  footerDivider: { borderTopWidth: 0.5, borderTopColor: "#C8BFB3", marginBottom: 8 },
  footerText: { fontSize: 7, color: "#9D948E", textAlign: "center", lineHeight: 1.6 },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numToWords(n: number): string {
  if (n === 0) return "Zero";
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
  if (n < 1000) return ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numToWords(n % 100) : "");
  if (n < 100000) return numToWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numToWords(n % 1000) : "");
  if (n < 10000000) return numToWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + numToWords(n % 100000) : "");
  return numToWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + numToWords(n % 10000000) : "");
}

function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let result = numToWords(rupees) + " Rupees";
  if (p > 0) result += " and " + numToWords(p) + " Paise";
  return result + " Only";
}

// ── Component ────────────────────────────────────────────────────────────────

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  return (
    <Document title={`Tax Invoice ${data.invoiceNumber}`} author="Aarna Label">
      <InvoicePage data={data} />
    </Document>
  );
}

/**
 * Batch variant — one Document, one Page per invoice. Used by the admin
 * "print selected invoices" flow (see lib/actions/admin/orders.ts's
 * regenerateInvoicePdfBatch) so the admin gets a single PDF to print or save,
 * the same way generateHangTagPdf batches multiple tags into one file.
 */
export function InvoiceBatchDocument({ invoices }: { invoices: InvoiceData[] }) {
  return (
    <Document title="Tax Invoices" author="Aarna Label">
      {invoices.map((data) => (
        <InvoicePage key={data.invoiceNumber} data={data} />
      ))}
    </Document>
  );
}

function InvoicePage({ data }: { data: InvoiceData }) {
  const {
    invoiceNumber, invoiceDate, orderNumber, orderDate,
    customer, items, subtotal, discount, shippingFee,
    isInterState, rateBreakdown, total,
  } = data;

  return (
    <Page size="A4" style={s.page}>

      {/* ── Header ── */}
      <View style={s.header}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image, no alt concept in PDFs */}
        <Image src={LOGO_PATH} style={s.logo} />
        <View style={s.headerRight}>
          <Text style={s.invoiceTitle}>TAX INVOICE</Text>
          <Text style={s.invoiceMeta}>Invoice No: {invoiceNumber}</Text>
          <Text style={s.invoiceMeta}>Invoice Date: {invoiceDate}</Text>
          <Text style={s.invoiceMeta}>Order No: {orderNumber}</Text>
          <Text style={s.invoiceMeta}>Order Date: {orderDate}</Text>
        </View>
      </View>

      <View style={s.thickDivider} />

      {/* ── Seller + Buyer ── */}
      <View style={s.infoRow}>
        <View style={s.infoBox}>
          <Text style={s.infoLabel}>Sold By</Text>
          <Text style={s.infoTextBold}>{SELLER.name}</Text>
          <Text style={s.infoText}>{SELLER.addressLine1}</Text>
          <Text style={s.infoText}>{SELLER.addressLine2}</Text>
          <Text style={s.infoText}>{SELLER.addressLine3}</Text>
          <Text style={s.infoText}>GSTIN: {SELLER.gstin}</Text>
          <Text style={s.infoText}>Ph: {SELLER.phone}</Text>
          <Text style={s.infoText}>{SELLER.email}</Text>
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoLabel}>Bill To</Text>
          <Text style={s.infoTextBold}>{customer.name}</Text>
          <Text style={s.infoText}>{customer.address.line1}</Text>
          {customer.address.line2 ? <Text style={s.infoText}>{customer.address.line2}</Text> : null}
          <Text style={s.infoText}>{customer.address.city}, {customer.address.state} – {customer.address.pincode}</Text>
          <Text style={s.infoText}>Ph: {customer.phone}</Text>
          <Text style={s.infoText}>{customer.email}</Text>
          {customer.gstin ? (
            <Text style={s.infoText}>GSTIN: {customer.gstin}</Text>
          ) : null}
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoLabel}>Payment</Text>
          <Text style={s.infoText}>Method: Online (Razorpay)</Text>
          <Text style={s.infoText}>Status: Paid</Text>
          <Text style={[s.infoText, { marginTop: 8 }]}>Place of Supply:</Text>
          <Text style={s.infoTextBold}>{customer.address.state}</Text>
          <Text style={[s.infoText, { marginTop: 4 }]}>
            Tax Type: {isInterState ? "IGST" : "CGST + SGST"}
          </Text>
        </View>
      </View>

      <View style={s.divider} />

      {/* ── Line Items Table ── */}
      <View style={s.table}>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colDesc]}>Description</Text>
          <Text style={[s.tableHeaderText, s.colHsn]}>HSN</Text>
          <Text style={[s.tableHeaderText, s.colSize]}>Size</Text>
          <Text style={[s.tableHeaderText, s.colQty]}>Qty</Text>
          <Text style={[s.tableHeaderText, s.colRate]}>Rate</Text>
          <Text style={[s.tableHeaderText, s.colGstRate]}>GST%</Text>
          <Text style={[s.tableHeaderText, s.colTotal]}>Total</Text>
        </View>

        {items.map((item, i) => (
          <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <View style={s.colDesc}>
              <Text style={s.tableCell}>{item.description}</Text>
              <Text style={s.tableCellSub}>SKU: {item.sku}</Text>
            </View>
            <Text style={[s.tableCell, s.colHsn]}>6211</Text>
            <Text style={[s.tableCell, s.colSize]}>{item.size ?? "—"}</Text>
            <Text style={[s.tableCell, s.colQty]}>{item.quantity}</Text>
            <Text style={[s.tableCell, s.colRate]}>{INR(item.unitPrice)}</Text>
            <Text style={[s.tableCell, s.colGstRate]}>{item.gstRatePercent}%</Text>
            <Text style={[s.tableCell, s.colTotal]}>{INR(item.lineTotal)}</Text>
          </View>
        ))}
      </View>

      {/* ── Totals ── */}
      <View style={s.totalsSection}>
        <View style={s.totalsBox}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalValue}>{INR(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Discount</Text>
              <Text style={s.totalValue}>– {INR(discount)}</Text>
            </View>
          )}
          {shippingFee > 0 && (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Shipping</Text>
              <Text style={s.totalValue}>{INR(shippingFee)}</Text>
            </View>
          )}
          {rateBreakdown.map((bucket) => (
            <Fragment key={bucket.ratePercent}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>
                  Taxable @ {bucket.ratePercent}%
                </Text>
                <Text style={s.totalValue}>{INR(bucket.taxableAmount)}</Text>
              </View>
              {isInterState ? (
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>IGST @ {bucket.ratePercent}%</Text>
                  <Text style={s.totalValue}>{INR(bucket.igst)}</Text>
                </View>
              ) : (
                <>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>
                      CGST @ {bucket.ratePercent / 2}%
                    </Text>
                    <Text style={s.totalValue}>{INR(bucket.cgst)}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>
                      SGST @ {bucket.ratePercent / 2}%
                    </Text>
                    <Text style={s.totalValue}>{INR(bucket.sgst)}</Text>
                  </View>
                </>
              )}
            </Fragment>
          ))}
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>TOTAL</Text>
            <Text style={s.grandTotalValue}>{INR(total)}</Text>
          </View>
        </View>
      </View>

      <Text style={s.amountWords}>
        Amount in words: {amountInWords(total)}
      </Text>

      {/* ── Footer ── */}
      <View style={s.footer}>
        <View style={s.footerDivider} />
        <Text style={s.footerText}>
          This is a system-generated invoice and does not require a physical signature.{"\n"}
          Returns accepted within 3 days of delivery. Visit shopaarna.in/return-policy for the return policy.{"\n"}
          Aarna Label · GSTIN: 29ACNFA3302J1ZD · hello@shopaarna.in · +91 79-75639485
        </Text>
      </View>

    </Page>
  );
}
