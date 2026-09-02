import {
  Document as PdfDocument,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import type { ReportBlock, ReportDocument } from "@/lib/report-document"

const styles = StyleSheet.create({
  // Helvetica is a built-in registered font in @react-pdf/renderer. App web
  // fonts are not loaded because serverless PDF generation is self-contained.
  page: { paddingTop: 42, paddingBottom: 36, paddingHorizontal: 46, fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a" },
  eyebrow: { fontSize: 7, letterSpacing: 1.4, color: "#A6332B", textTransform: "uppercase" },
  rule: { borderBottomWidth: 1, borderBottomColor: "#1a1a1a", marginTop: 7, marginBottom: 22 },
  title: { fontSize: 21, fontWeight: 700, marginBottom: 5 },
  subtitle: { color: "#6d6d6d", fontSize: 9, marginBottom: 14 },
  coverage: { borderLeftWidth: 2, borderLeftColor: "#A6332B", paddingLeft: 10, paddingVertical: 7, marginBottom: 17, color: "#4f4f4f", lineHeight: 1.45 },
  coverageStrong: { fontWeight: 700, color: "#1a1a1a" },
  section: { marginBottom: 17 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 4 },
  caption: { color: "#6d6d6d", fontSize: 8.5, marginBottom: 9 },
  kpis: { flexDirection: "row", gap: 9, marginBottom: 17 },
  kpi: { flexGrow: 1, borderWidth: 1, borderColor: "#e2e3e6", borderRadius: 5, padding: 11 },
  kpiLabel: { fontSize: 7, color: "#8a8a8a", letterSpacing: 1, textTransform: "uppercase" },
  kpiValue: { fontSize: 17, fontWeight: 700, marginTop: 7, marginBottom: 3 },
  kpiNote: { color: "#6d6d6d", fontSize: 8 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  barLabel: { width: 145, fontSize: 8.5 },
  barTrack: { flexGrow: 1, height: 10, backgroundColor: "#f0f0f1", borderRadius: 3, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: "#A6332B" },
  barValue: { width: 65, textAlign: "right", fontSize: 8, color: "#4f4f4f" },
  stat: { fontSize: 14, fontWeight: 700, marginVertical: 2 },
  table: { borderWidth: 1, borderColor: "#e2e3e6", borderRadius: 4 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeeef", paddingVertical: 5, paddingHorizontal: 6 },
  tableHeader: { backgroundColor: "#f5f5f6", fontWeight: 700 },
  tableCell: { flexGrow: 1, flexBasis: 0, paddingRight: 4, fontSize: 7.5 },
  suppressed: { borderWidth: 1, borderStyle: "dashed", borderColor: "#d5d7db", borderRadius: 5, padding: 10, marginBottom: 14, color: "#6d6d6d" },
  suppressedTitle: { fontSize: 9.5, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 },
  note: { borderTopWidth: 1, borderTopColor: "#e2e3e6", paddingTop: 10, marginTop: 3, color: "#6d6d6d", fontSize: 8.2, lineHeight: 1.4 },
  footer: { position: "absolute", left: 46, right: 46, bottom: 20, borderTopWidth: 1, borderTopColor: "#c9c9c9", paddingTop: 6, flexDirection: "row", justifyContent: "space-between", color: "#8a8a8a", fontSize: 6.5, letterSpacing: 0.8, textTransform: "uppercase" },
})

export function suppressedPlaceholderText(block: ReportBlock & { suppressed?: boolean; reason?: string }): string | null {
  return block.suppressed ? `${block.type.toUpperCase()} — SUPPRESSED: ${block.reason ?? "Coverage is insufficient."}` : null
}

function textValue(value: string | number | null): string {
  return value === null ? "—" : String(value)
}

function renderSuppressed(block: ReportBlock & { suppressed?: boolean; reason?: string }) {
  return <View style={styles.suppressed}><Text style={styles.suppressedTitle}>{block.type.toUpperCase()} — NOT STATED</Text><Text>{block.reason ?? "Coverage is insufficient for this block."}</Text></View>
}

function renderBlock(block: ReportBlock & { suppressed?: boolean; reason?: string }, index: number) {
  if (block.suppressed) return <View key={`suppressed-${index}`}>{renderSuppressed(block)}</View>
  switch (block.type) {
    case "kpi":
      return <View key={`kpi-${index}`} style={styles.kpis}>{block.items.map((item) => <View key={item.label} style={styles.kpi}><Text style={styles.kpiLabel}>{item.label}</Text><Text style={styles.kpiValue}>{item.value}</Text>{item.note ? <Text style={styles.kpiNote}>{item.note}</Text> : null}</View>)}</View>
    case "share": {
      const max = Math.max(...block.rows.map((row) => row.value), 1)
      return <View key={`share-${index}`} style={styles.section}><Text style={styles.sectionTitle}>{block.title}</Text>{block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}{block.rows.map((row) => <View key={row.label} style={styles.barRow}><Text style={styles.barLabel}>{row.label}</Text><View style={styles.barTrack}><View style={{ ...styles.barFill, width: `${Math.max(0, Math.min(100, row.value / max * 100))}%` }} /></View><Text style={styles.barValue}>{row.value.toFixed(2)}</Text></View>)}</View>
    }
    case "table":
      return <View key={`table-${index}`} style={styles.section}><Text style={styles.sectionTitle}>{block.title}</Text><View style={styles.table}><View style={[styles.tableRow, styles.tableHeader]}>{block.columns.map((column) => <Text key={column} style={styles.tableCell}>{column}</Text>)}</View>{block.rows.map((row, rowIndex) => <View key={`row-${rowIndex}`} style={styles.tableRow}>{row.map((value, cellIndex) => <Text key={`${rowIndex}-${cellIndex}`} style={styles.tableCell}>{textValue(value)}</Text>)}</View>)}</View></View>
    case "stat":
      return <View key={`stat-${index}`} style={styles.section}><Text style={styles.sectionTitle}>{block.title}</Text><Text style={styles.stat}>{block.value}</Text>{block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}</View>
    case "narrative":
      return <View key={`narrative-${index}`} style={styles.section}><Text style={styles.sectionTitle}>{block.title}</Text><Text>{block.text}</Text></View>
    case "note":
      return <Text key={`note-${index}`} style={styles.note}>{block.text}</Text>
  }
}

export function ReportPdf({ document }: { document: ReportDocument }) {
  return <PdfDocument><Page size="A4" style={styles.page}><Text style={styles.eyebrow}>AVINTELLIGENCE · SMART STORAGE</Text><View style={styles.rule} /><Text style={styles.title}>{document.title}</Text>{document.subtitle ? <Text style={styles.subtitle}>{document.subtitle} · generated {document.generatedAt}</Text> : null}{document.coverage ? <Text style={styles.coverage}><Text style={styles.coverageStrong}>Coverage. </Text>{document.coverage.statement}</Text> : null}{document.blocks.map(renderBlock)}{document.method ? <Text style={styles.note}>{document.method}</Text> : null}<View style={styles.footer}><Text>AVIntelligence · avintph.com</Text><Text>{document.title}</Text></View></Page></PdfDocument>
}

export async function renderReportPdf(document: ReportDocument): Promise<Buffer> {
  return renderToBuffer(<ReportPdf document={document} />)
}
