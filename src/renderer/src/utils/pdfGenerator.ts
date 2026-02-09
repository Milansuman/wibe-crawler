import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Vulnerability {
  id: string
  name: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
  recommendation: string
  affectedAssets: string[]
}

interface ReportData {
  title?: string
  executive_summary?: string
  vulnerabilities: Vulnerability[]
  statistics?: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info?: number
  }
  methodology?: string
  recommendations?: string[]
  generatedAt?: string
}

interface ScanData {
  targetUrl: string
  scannedAt: Date
  totalUrls: number
  totalForms: number
  totalCookies: number
  totalApiCalls: number
}

export function generateVulnerabilityPDF(
  reportData: ReportData,
  scanData: ScanData
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  let yPos = margin

  // Helper function to add page numbers
  const addPageNumber = () => {
    const pageCount = (doc as any).internal.getNumberOfPages()
    doc.setFontSize(9)
    doc.setTextColor(150)
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 10,
        { align: 'right' }
      )
    }
  }

  // Helper to check if we need a new page
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage()
      yPos = margin
      return true
    }
    return false
  }

  // Title Page
  doc.setFillColor(30, 41, 59) // Slate 800
  doc.rect(0, 0, pageWidth, 80, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('Security Assessment Report', pageWidth / 2, 35, { align: 'center' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text(scanData.targetUrl, pageWidth / 2, 50, { align: 'center' })

  doc.setFontSize(10)
  doc.text(
    `Generated on ${scanData.scannedAt.toLocaleDateString()} at ${scanData.scannedAt.toLocaleTimeString()}`,
    pageWidth / 2,
    60,
    { align: 'center' }
  )

  yPos = 100

  // Executive Summary Section
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Executive Summary', margin, yPos)
  yPos += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  
  const summaryText = reportData.executive_summary || 
    `This report details the security assessment performed on ${scanData.targetUrl}. ` +
    `The scan discovered ${scanData.totalUrls} pages, analyzed ${scanData.totalForms} forms, ` +
    `and identified ${reportData.statistics?.total || reportData.vulnerabilities.length} security vulnerabilities.`

  const splitSummary = doc.splitTextToSize(summaryText, pageWidth - 2 * margin)
  doc.text(splitSummary, margin, yPos)
  yPos += splitSummary.length * 6 + 10

  // Statistics Overview
  checkPageBreak(60)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Vulnerability Statistics', margin, yPos)
  yPos += 10

  const stats = reportData.statistics || {
    total: reportData.vulnerabilities.length,
    critical: reportData.vulnerabilities.filter(v => v.severity === 'critical').length,
    high: reportData.vulnerabilities.filter(v => v.severity === 'high').length,
    medium: reportData.vulnerabilities.filter(v => v.severity === 'medium').length,
    low: reportData.vulnerabilities.filter(v => v.severity === 'low').length,
    info: reportData.vulnerabilities.filter(v => v.severity === 'info').length
  }

  const statsData = [
    ['Total Vulnerabilities', stats.total.toString()],
    ['Critical', stats.critical.toString()],
    ['High', stats.high.toString()],
    ['Medium', stats.medium.toString()],
    ['Low', stats.low.toString()]
  ]

  if (stats.info && stats.info > 0) {
    statsData.push(['Info', stats.info.toString()])
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Severity', 'Count']],
    body: statsData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: margin, right: margin },
    styles: { fontSize: 10 }
  })

  yPos = (doc as any).lastAutoTable.finalY + 15

  // Scan Details
  checkPageBreak(50)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Scan Details', margin, yPos)
  yPos += 10

  autoTable(doc, {
    startY: yPos,
    body: [
      ['Target URL', scanData.targetUrl],
      ['URLs Scanned', scanData.totalUrls.toString()],
      ['Forms Analyzed', scanData.totalForms.toString()],
      ['API Endpoints', scanData.totalApiCalls.toString()],
      ['Cookies Examined', scanData.totalCookies.toString()]
    ],
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { fontSize: 10 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 'auto' }
    }
  })

  yPos = (doc as any).lastAutoTable.finalY + 20

  // Vulnerabilities Section
  doc.addPage()
  yPos = margin

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Detailed Vulnerability Findings', margin, yPos)
  yPos += 15

  // Sort vulnerabilities by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  const sortedVulns = [...reportData.vulnerabilities].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  )

  sortedVulns.forEach((vuln, index) => {
    checkPageBreak(80)

    // Vulnerability header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`${index + 1}. ${vuln.name}`, margin, yPos)
    yPos += 7

    // Severity badge
    const severityColors = {
      critical: [220, 38, 38],
      high: [249, 115, 22],
      medium: [234, 179, 8],
      low: [59, 130, 246],
      info: [14, 165, 233]
    }
    
    const color = severityColors[vuln.severity]
    doc.setFillColor(color[0], color[1], color[2])
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.rect(margin, yPos - 4, 25, 6, 'F')
    doc.text(vuln.severity.toUpperCase(), margin + 12.5, yPos, { align: 'center' })
    yPos += 8

    // Description
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Description:', margin, yPos)
    yPos += 5

    doc.setFont('helvetica', 'normal')
    const descLines = doc.splitTextToSize(vuln.description, pageWidth - 2 * margin)
    doc.text(descLines, margin, yPos)
    yPos += descLines.length * 5 + 5

    // Affected Assets
    if (vuln.affectedAssets && vuln.affectedAssets.length > 0) {
      checkPageBreak(30)
      doc.setFont('helvetica', 'bold')
      doc.text('Affected Assets:', margin, yPos)
      yPos += 5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      vuln.affectedAssets.slice(0, 5).forEach(asset => {
        if (checkPageBreak(6)) yPos += 5
        doc.text(`• ${asset}`, margin + 5, yPos)
        yPos += 5
      })
      
      if (vuln.affectedAssets.length > 5) {
        doc.setTextColor(100)
        doc.text(`  ... and ${vuln.affectedAssets.length - 5} more`, margin + 5, yPos)
        yPos += 5
        doc.setTextColor(0)
      }
      
      doc.setFontSize(10)
      yPos += 3
    }

    // Recommendation
    checkPageBreak(25)
    doc.setFont('helvetica', 'bold')
    doc.text('Recommendation:', margin, yPos)
    yPos += 5

    doc.setFont('helvetica', 'normal')
    const recLines = doc.splitTextToSize(vuln.recommendation, pageWidth - 2 * margin)
    doc.text(recLines, margin, yPos)
    yPos += recLines.length * 5 + 12

    // Separator
    doc.setDrawColor(200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 10
  })

  // Recommendations Section
  if (reportData.recommendations && reportData.recommendations.length > 0) {
    doc.addPage()
    yPos = margin

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0)
    doc.text('Recommendations', margin, yPos)
    yPos += 15

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    reportData.recommendations.forEach((rec, index) => {
      checkPageBreak(20)
      const recLines = doc.splitTextToSize(`${index + 1}. ${rec}`, pageWidth - 2 * margin - 5)
      doc.text(recLines, margin, yPos)
      yPos += recLines.length * 6 + 5
    })
  }

  // Add page numbers
  addPageNumber()

  // Save the PDF
  const fileName = `vulnerability-report-${scanData.targetUrl.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
  doc.save(fileName)
}
