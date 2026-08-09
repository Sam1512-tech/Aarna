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
import type { GstRateBreakdown } from "@/lib/invoice/generate";
import { SELLER, LOGO_PATH, INR, amountInWords } from "@/lib/invoice/template";

// Same reasoning as lib/invoice/template.tsx's identical call — react-pdf's
// default hyphenation breaks words like "Police" into "Po-lice" otherwise.
Font.registerHyphenationCallback((word) => [word]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreditNoteData {
  creditNoteNumber: string;
  creditNoteDate: string;
  // The tax invoice this credit note reverses — mandatory under Section 34,
  // CGST Act; a credit note with no traceable original invoice isn't valid.
  originalInvoiceNumber: string;
  originalInvoiceDate: string;
  orderNumber: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    gstin?: string | null;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
    };
  };
  reason: string;
  isInterState: boolean;
  rateBreakdown: GstRateBreakdown[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  refundedAmount: number;
  // See lib/db/schema.ts's creditNotes.needsReview comment — true when this
  // credit note's GST breakdown is a proportional estimate across the whole
  // order rather than attributed to the exact item refunded (a refund with
  // no matching return row to resolve the specific item from).
  needsReview: boolean;
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Deliberately the same visual language as lib/invoice/template.tsx (same
// colors, spacing, type scale) — this is a sibling GST document, not a
// different brand moment.

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

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  logo: { width: 210, height: 56, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#4B1323", letterSpacing: 2, marginBottom: 4 },
  docMeta: { fontSize: 8, color: "#555", marginBottom: 2 },

  divider: { borderBottomWidth: 0.5, borderBottomColor: "#C8BFB3", marginVertical: 10 },
  thickDivider: { borderBottomWidth: 1, borderBottomColor: "#4B1323", marginVertical: 10 },

  infoRow: { flexDirection: "row", gap: 24, marginBottom: 12 },
  infoBox: { flex: 1, alignItems: "flex-start" },
  infoLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9D948E", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  infoText: { fontSize: 8, color: "#111111", lineHeight: 1.5 },
  infoTextBold: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#111111" },

  reasonBox: { marginBottom: 12, padding: 10, backgroundColor: "#FAF7F2", borderWidth: 0.5, borderColor: "#E0D0C6" },
  reasonLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#9D948E", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 },
  reasonText: { fontSize: 8.5, color: "#111111" },

  reviewBanner: { marginBottom: 12, padding: 8, backgroundColor: "#FBEFE0", borderWidth: 0.5, borderColor: "#D9A857" },
  reviewText: { fontSize: 7.5, color: "#7A4E14" },

  totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totalsBox: { width: 260 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalLabel: { fontSize: 8, color: "#555" },
  totalValue: { fontSize: 8, color: "#111111" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: 1, borderTopColor: "#4B1323", marginTop: 4 },
  grandTotalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#4B1323" },
  grandTotalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#4B1323" },

  amountWords: { marginTop: 6, fontSize: 7.5, color: "#555", fontStyle: "italic" },

  footer: { position: "absolute", bottom: 24, left: 40, right: 40 },
  footerDivider: { borderTopWidth: 0.5, borderTopColor: "#C8BFB3", marginBottom: 8 },
  footerText: { fontSize: 7, color: "#9D948E", textAlign: "center", lineHeight: 1.6 },
});

// ── Component ────────────────────────────────────────────────────────────────

export function CreditNoteDocument({ data }: { data: CreditNoteData }) {
  return (
    <Document title={`Credit Note ${data.creditNoteNumber}`} author="Aarna Label">
      <CreditNotePage data={data} />
    </Document>
  );
}

/**
 * Batch variant — mirrors InvoiceBatchDocument (lib/invoice/template.tsx),
 * same reasoning: one Document, one Page per credit note, for an admin
 * "print/download selected credit notes" flow.
 */
export function CreditNoteBatchDocument({ credits }: { credits: CreditNoteData[] }) {
  return (
    <Document title="Credit Notes" author="Aarna Label">
      {credits.map((data) => (
        <CreditNotePage key={data.creditNoteNumber} data={data} />
      ))}
    </Document>
  );
}

function CreditNotePage({ data }: { data: CreditNoteData }) {
  const {
    creditNoteNumber, creditNoteDate, originalInvoiceNumber, originalInvoiceDate,
    orderNumber, customer, reason, isInterState, rateBreakdown,
    refundedAmount, needsReview,
  } = data;

  return (
    <Page size="A4" style={s.page}>

      {/* ── Header ── */}
      <View style={s.header}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image, no alt concept in PDFs */}
        <Image src={LOGO_PATH} style={s.logo} />
        <View style={s.headerRight}>
          <Text style={s.docTitle}>CREDIT NOTE</Text>
          <Text style={s.docMeta}>Credit Note No: {creditNoteNumber}</Text>
          <Text style={s.docMeta}>Credit Note Date: {creditNoteDate}</Text>
          <Text style={s.docMeta}>Against Invoice: {originalInvoiceNumber}</Text>
          <Text style={s.docMeta}>Invoice Date: {originalInvoiceDate}</Text>
          <Text style={s.docMeta}>Order No: {orderNumber}</Text>
        </View>
      </View>

      <View style={s.thickDivider} />

      {needsReview ? (
        <View style={s.reviewBanner}>
          <Text style={s.reviewText}>
            This credit note&apos;s GST breakdown is a proportional estimate
            across the order, not attributed to a specific returned item —
            the underlying refund had no matching return record. Verify
            before filing.
          </Text>
        </View>
      ) : null}

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
          <Text style={s.infoLabel}>Refund</Text>
          <Text style={s.infoText}>Method: Original payment method (Razorpay)</Text>
          <Text style={[s.infoText, { marginTop: 8 }]}>Place of Supply:</Text>
          <Text style={s.infoTextBold}>{customer.address.state}</Text>
          <Text style={[s.infoText, { marginTop: 4 }]}>
            Tax Type: {isInterState ? "IGST" : "CGST + SGST"}
          </Text>
        </View>
      </View>

      <View style={s.divider} />

      <View style={s.reasonBox}>
        <Text style={s.reasonLabel}>Reason for Credit</Text>
        <Text style={s.reasonText}>{reason}</Text>
      </View>

      {/* ── Totals ── */}
      <View style={s.totalsSection}>
        <View style={s.totalsBox}>
          {rateBreakdown.map((bucket) => (
            <Fragment key={bucket.ratePercent}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>
                  Taxable Value @ {bucket.ratePercent}%
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
            <Text style={s.grandTotalLabel}>TOTAL CREDIT</Text>
            <Text style={s.grandTotalValue}>{INR(refundedAmount)}</Text>
          </View>
        </View>
      </View>

      <Text style={s.amountWords}>
        Amount in words: {amountInWords(refundedAmount)}
      </Text>

      {/* ── Footer ── */}
      <View style={s.footer}>
        <View style={s.footerDivider} />
        <Text style={s.footerText}>
          This is a system-generated credit note and does not require a physical signature.{"\n"}
          Issued under Section 34 of the CGST Act against the invoice referenced above.{"\n"}
          Aarna Label · GSTIN: 29ACNFA3302J1ZD · hello@shopaarna.in · +91 79-75639485
        </Text>
      </View>

    </Page>
  );
}
