import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import path from "path";

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  logo: { width: 100, height: 40, objectFit: "contain" },
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
}

function ReportDocument({ data }: { data: ReportPdfData }) {
  const { title, dateRangeLabel, headers, rows, totalsRow, generatedAtLabel } = data;
  const colStyle = { flex: 1 };

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
              <Text key={i} style={[s.tableHeaderText, colStyle]}>
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
                <Text key={j} style={[s.cell, colStyle]}>
                  {String(cell)}
                </Text>
              ))}
            </View>
          ))}

          {totalsRow ? (
            <View style={s.totalsRow} wrap={false}>
              {totalsRow.map((cell, j) => (
                <Text key={j} style={[s.cellBold, colStyle]}>
                  {String(cell)}
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
