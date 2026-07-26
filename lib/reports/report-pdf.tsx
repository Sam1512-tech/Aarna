import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
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

// react-pdf's line-breaking only ever splits a line at a space, or at one of
// the split points its hyphenation callback returns for a given "word" (a
// run of non-space characters) — there is no separate, always-on notion of
// a zero-width break character. softWrap() below marks the handful of safe
// break points it inserts (after @ . _ / -) with this marker; the
// hyphenation callback is the ONLY thing that can turn those markers into
// real line-break opportunities, so it must split on them. Any word without
// a marker — i.e. every real name, address, or other normal word — is
// still returned whole, since react-pdf's default hyphenation engine breaks
// real words mid-syllable (e.g. "Police" -> "Po-lice") when a column is
// narrow, which looks wrong for a name or address.
const ZERO_WIDTH_SPACE = "\u200b";
Font.registerHyphenationCallback((word) =>
  word.includes(ZERO_WIDTH_SPACE) ? word.split(ZERO_WIDTH_SPACE) : [word],
);

// A long single-token value — a long email address is the realistic case in
// this data — has no space for react-pdf to wrap at, so with nowhere to
// break it renders as one line and overflows straight into the next column
// instead of wrapping (confirmed live: a fixed column width alone doesn't
// fix this). Inserting this marker after natural break characters gives the
// hyphenation callback above real split points to work with, without
// changing the visible text (GSTINs and short codes have none of these
// characters, so they're unaffected).
const BREAK_AFTER = /([@._/-])/g;
function softWrap(value: string): string {
  return value.replace(BREAK_AFTER, `$1${ZERO_WIDTH_SPACE}`);
}

const LOGO_PATH = path.join(process.cwd(), "public", "logo-invoice.png");

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 7,
    color: "#111111",
    paddingTop: 30,
    paddingBottom: 40,
    paddingHorizontal: 30,
    backgroundColor: "#FFFFFF",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  logo: { width: 170, height: 46, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#4B1323", letterSpacing: 1 },
  dateRange: { fontSize: 8, color: "#555", marginTop: 3 },
  thickDivider: { borderBottomWidth: 1, borderBottomColor: "#4B1323", marginBottom: 10 },

  table: {},
  tableHeader: { flexDirection: "row", backgroundColor: "#4B1323", paddingVertical: 4, paddingHorizontal: 3 },
  tableHeaderText: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#FAF7F2", paddingRight: 6 },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E0D0C6", paddingVertical: 4, paddingHorizontal: 3 },
  tableRowAlt: { backgroundColor: "#FAF7F2" },
  totalsRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#4B1323", paddingVertical: 5, paddingHorizontal: 3 },
  cell: { fontSize: 7, color: "#111111", paddingRight: 6 },
  cellBold: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#111111", paddingRight: 6 },
  // Vertical divider between columns — the invoice table doesn't have one
  // (its columns are few and generously sized), but this report table packs
  // in up to 15 columns at a much smaller font size, where a visible
  // boundary between columns matters a lot more for reading a printed page.
  // Header gets a light divider against its own dark background; body rows
  // reuse the same muted tone as the row's own bottom border.
  columnDividerHeader: { borderRightWidth: 0.5, borderRightColor: "#7A2F42" },
  columnDivider: { borderRightWidth: 0.5, borderRightColor: "#E0D0C6" },

  footer: { position: "absolute", bottom: 18, left: 30, right: 30 },
  footerText: { fontSize: 6.5, color: "#9D948E", textAlign: "center" },
});

export interface ReportPdfData {
  title: string;
  dateRangeLabel: string;
  headers: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  generatedAtLabel: string;
  // Relative flex ratio per column, same length + order as `headers`. Part
  // of the overlapping-text fix: every column previously shared one
  // hardcoded `flex: 1`, so a free-text column (customer name, email) got
  // the exact same width as a short fixed-format column (GST rate, HSN
  // code) — the narrow columns were starved and the wide ones wasted space.
  // (The other part of the fix is `softWrap` below, for long single-token
  // values like an email address that have nowhere to wrap even with a
  // generous column width.) Falls back to a uniform 1 per column if omitted.
  columnWidths?: number[];
}

function ReportDocument({ data }: { data: ReportPdfData }) {
  const { title, dateRangeLabel, headers, rows, totalsRow, generatedAtLabel, columnWidths } = data;
  const lastIndex = headers.length - 1;
  const widthOf = (i: number) => columnWidths?.[i] ?? 1;

  return (
    <Document title={title} author="Aarna Label">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image, no alt concept in PDFs */}
          <Image src={LOGO_PATH} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.title}>{title}</Text>
            <Text style={s.dateRange}>{dateRangeLabel}</Text>
            <Text style={s.dateRange}>Generated {generatedAtLabel}</Text>
          </View>
        </View>

        <View style={s.thickDivider} />

        <View style={s.table}>
          <View style={s.tableHeader} fixed>
            {headers.map((h, i) => (
              <Text
                key={i}
                style={[
                  s.tableHeaderText,
                  { flex: widthOf(i) },
                  i < lastIndex ? s.columnDividerHeader : {},
                ]}
              >
                {h}
              </Text>
            ))}
          </View>

          {rows.map((row, i) => (
            <View
              key={i}
              wrap={false}
              style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
            >
              {row.map((cell, j) => (
                <Text
                  key={j}
                  style={[
                    s.cell,
                    { flex: widthOf(j) },
                    j < lastIndex ? s.columnDivider : {},
                  ]}
                >
                  {softWrap(String(cell))}
                </Text>
              ))}
            </View>
          ))}

          {totalsRow ? (
            <View style={s.totalsRow} wrap={false}>
              {totalsRow.map((cell, j) => (
                <Text
                  key={j}
                  style={[
                    s.cellBold,
                    { flex: widthOf(j) },
                    j < lastIndex ? s.columnDivider : {},
                  ]}
                >
                  {softWrap(String(cell))}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Aarna Label · GSTIN: 29ACNFA3302J1ZD · hello@shopaarna.in · +91 79-75639485
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateReportPdf(data: ReportPdfData): Promise<Buffer> {
  // renderToBuffer expects a Document element at root; our wrapper renders one.
  // Cast is safe — the runtime tree is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(ReportDocument, { data }) as any;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
