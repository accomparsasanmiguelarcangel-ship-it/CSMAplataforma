import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { downloadBlob } from './utils'

export interface Column<T> {
  header: string
  value: (row: T) => string | number
}

export function exportExcel<T>(filename: string, sheetName: string, columns: Column<T>[], rows: T[]): void {
  const header = columns.map((c) => c.header)
  const body = rows.map((r) => columns.map((c) => c.value(r)))
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  ws['!cols'] = header.map((h, i) => ({
    wch: Math.min(
      42,
      Math.max(12, h.length + 4, ...body.map((b) => String(b[i] ?? '').length + 3)),
    ),
  }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(new Blob([out], { type: 'application/octet-stream' }), `${filename}.xlsx`)
}

export interface PdfMeta {
  title: string
  subtitle?: string
  filename: string
  summary?: Array<[string, string]>
  footNote?: string
}

export function exportPdf<T>(meta: PdfMeta, columns: Column<T>[], rows: T[]): void {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const marginX = 40
  doc.setFillColor(18, 53, 27)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 74, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(meta.title, marginX, 32)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('ASOCIACIÓN CULTURAL COMPARSA SAN MIGUEL ARCÁNGEL 2004', marginX, 50)
  doc.text(
    `Generado: ${new Date().toLocaleString('es-PE')}`,
    doc.internal.pageSize.getWidth() - marginX,
    50,
    { align: 'right' },
  )
  let y = 96
  doc.setTextColor(40, 40, 40)
  if (meta.subtitle) {
    doc.setFontSize(10)
    doc.text(meta.subtitle, marginX, y)
    y += 16
  }
  if (meta.summary?.length) {
    doc.setFontSize(9)
    meta.summary.forEach(([k, v]) => {
      doc.text(`${k}: ${v}`, marginX, y)
      y += 13
    })
    y += 4
  }
  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(c.value(r) ?? ''))),
    styles: { fontSize: 8, cellPadding: 4, textColor: [40, 40, 40] },
    headStyles: { fillColor: [46, 120, 55], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 244] },
    margin: { left: marginX, right: marginX },
  })
  if (meta.footNote) {
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text(meta.footNote, marginX, (last?.finalY ?? y) + 18, { maxWidth: doc.internal.pageSize.getWidth() - marginX * 2 })
  }
  doc.save(`${meta.filename}.pdf`)
}
