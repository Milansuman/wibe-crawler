import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Vulnerability {
  id: string
  title: string  // Changed from 'name' to match backend schema
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  cwe?: string
  cvss?: number
  description: string
  recommendation: string
  affectedAssets: string[]
  references?: string[]
  proof?: {
    payload?: string
    parameter?: string
    request?: string
    response?: string
    confidence?: 'High' | 'Medium' | 'Low'
  }
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
  const watermarkedPages = new Set<number>()

  // Helper function to add watermark (must be called early so it appears behind content)
  const addWatermark = () => {
    const pageNum = (doc as any).internal.getCurrentPageInfo().pageNumber
    if (watermarkedPages.has(pageNum)) return
    watermarkedPages.add(pageNum)

    // Add diagonal watermark centered on page
    doc.saveGraphicsState()
    
    // Set semi-transparent gray for visibility
    doc.setTextColor(245, 245, 245)
    doc.setFontSize(80)
    doc.setFont('helvetica', 'bold')
    
    // Trig calculations for perfect centering
    // Text rotates around baseline. We need to shift pivot point to match visual center.
    // Visual center is approx 1/3 font size "above" baseline.
    // Rotated 45 degrees, "above" is Top-Right (NE).
    // To center, we must shift the pivot Down-Left (SW).
    // Offset amount: ~7.5mm (approx 1/3 of 60pt/21mm height)
    // const offset = 5.3 // 7.5 * sin(45)
    
    // User requested manual adjustment: "move some right and down"
    const centerX = pageWidth / 2 + 30
    const centerY = pageHeight / 2 + 45
    
    doc.text('Wibe Crawler', centerX, centerY, {
      align: 'center',
      angle: 45
    })
    doc.restoreGraphicsState()
  }

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
      addWatermark() // Add watermark to new page
      yPos = margin
      return true
    }
    return false
  }

  // Title Page
  // Add watermark first so it appears behind content
  addWatermark()
  
  doc.setFillColor(30, 41, 59) // Slate 800
  doc.rect(0, 0, pageWidth, 90, 'F')

  // WIBE CRAWLER branding
  doc.setTextColor(100, 200, 255) // Light blue
  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.text('WIBE CRAWLER', pageWidth / 2, 25, { align: 'center' })

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Security Assessment Report', pageWidth / 2, 45, { align: 'center' })

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(scanData.targetUrl, pageWidth / 2, 60, { align: 'center' })

  doc.setFontSize(9)
  doc.setTextColor(200, 200, 200)
  doc.text(
    `Generated on ${scanData.scannedAt.toLocaleDateString()} at ${scanData.scannedAt.toLocaleTimeString()}`,
    pageWidth / 2,
    72,
    { align: 'center' }
  )

  yPos = 110

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
    styles: { fontSize: 10 },
    willDrawPage: () => addWatermark()
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
    },
    willDrawPage: () => addWatermark()
  })

  yPos = (doc as any).lastAutoTable.finalY + 20

  // Vulnerabilities Section
  doc.addPage()
  addWatermark() // Add watermark to new page
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

  // DEBUG: Log vulnerability data to verify metadata is present
  console.log('[PDF] Generating PDF with vulnerabilities:', sortedVulns.map(v => ({
    title: v.title,
    cwe: v.cwe,
    cvss: v.cvss,
    hasReferences: !!v.references?.length
  })))

  sortedVulns.forEach((vuln, index) => {
    checkPageBreak(80)

    // Vulnerability header
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`${index + 1}. ${vuln.title}`, margin, yPos)
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
    doc.rect(margin, yPos - 4, 30, 6, 'F')
    doc.text(vuln.severity.toUpperCase(), margin + 15, yPos, { align: 'center' })
    
    // CWE & CVSS Badges (if available) - Visual Only
    let badgeX = margin + 35
    
    if (vuln.cvss) {
        // CVSS Badge
        const cvssColor = getCvssColor(vuln.cvss)
        doc.setFillColor(cvssColor[0], cvssColor[1], cvssColor[2])
        doc.rect(badgeX, yPos - 4, 25, 6, 'F')
        doc.setTextColor(255, 255, 255)
        doc.text(`CVSS: ${vuln.cvss}`, badgeX + 12.5, yPos, { align: 'center' })
        badgeX += 30
    }

    if (vuln.cwe) {
        // CWE Badge
        doc.setFillColor(107, 114, 128) // Gray
        doc.rect(badgeX, yPos - 4, 35, 6, 'F')
        doc.setTextColor(255, 255, 255)
        doc.text(vuln.cwe, badgeX + 17.5, yPos, { align: 'center' })
    }

    yPos += 8

    // Metadata Text Line (Searchable/Copyable)
    if (vuln.cwe || vuln.cvss) {
        doc.setTextColor(100) // Dark Gray
        doc.setFontSize(9)
        const parts = []
        if (vuln.cwe) parts.push(`Classification: ${vuln.cwe}`)
        if (vuln.cvss) parts.push(`Severity Score: ${vuln.cvss} (CVSS 3.1)`)
        
        doc.text(parts.join('  |  '), margin, yPos)
        yPos += 6
        doc.setTextColor(0) // Reset
    }

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
      
      // Show ALL affected assets (no limit)
      vuln.affectedAssets.forEach(asset => {
        // Check if we need a new page for this item
        if (checkPageBreak(7)) {
            yPos = 20 // Reset Y position on new page
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(9)
        }
        
        // Handle long URLs by splitting them
        const assetLines = doc.splitTextToSize(`• ${asset}`, pageWidth - 2 * margin - 10)
        doc.text(assetLines, margin + 5, yPos)
        yPos += assetLines.length * 4 + 2
      })
      
      doc.setTextColor(0)
      
      doc.setFontSize(10)
      yPos += 3
    }

    // Evidence / Proof
    if (vuln.proof) {
      checkPageBreak(40)
      doc.setFont('helvetica', 'bold')
      doc.text('Proof of Vulnerability:', margin, yPos)
      yPos += 5
      
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      
      if (vuln.proof.confidence) {
        doc.text(`Confidence: ${vuln.proof.confidence}`, margin + 5, yPos)
        yPos += 5
      }
      
      if (vuln.proof.parameter) {
        doc.text(`Vulnerable Parameter: ${vuln.proof.parameter}`, margin + 5, yPos)
        yPos += 5
      }
      
      if (vuln.proof.payload) {
        doc.text(`Payload Used:`, margin + 5, yPos)
        yPos += 5
        doc.setFont('courier', 'normal')
        doc.setTextColor(50)
        doc.text(vuln.proof.payload, margin + 10, yPos)
        yPos += 5
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0)
      }
      
      if (vuln.proof.request) {
        checkPageBreak(30)
        doc.text(`Request Snippet:`, margin + 5, yPos)
        yPos += 5
        doc.setFont('courier', 'normal')
        doc.setFontSize(8)
        doc.setFillColor(245, 245, 245)
        
        const reqLines = doc.splitTextToSize(vuln.proof.request, pageWidth - 2 * margin - 15)
        const reqHeight = reqLines.length * 4 + 4
        
        if (checkPageBreak(reqHeight)) yPos += 5
        
        doc.rect(margin + 5, yPos - 3, pageWidth - 2 * margin - 10, reqHeight, 'F')
        doc.text(reqLines, margin + 10, yPos)
        yPos += reqHeight + 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
      }

      if (vuln.proof.response) {
        checkPageBreak(30)
        doc.text(`Response Snippet:`, margin + 5, yPos)
        yPos += 5
        doc.setFont('courier', 'normal')
        doc.setFontSize(8)
        doc.setFillColor(245, 245, 245)
        
        const resLines = doc.splitTextToSize(vuln.proof.response, pageWidth - 2 * margin - 15)
        const resHeight = resLines.length * 4 + 4
        
        if (checkPageBreak(resHeight)) yPos += 5
        
        doc.rect(margin + 5, yPos - 3, pageWidth - 2 * margin - 10, resHeight, 'F')
        doc.text(resLines, margin + 10, yPos)
        yPos += resHeight + 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
      }
      
      yPos += 2
    }

    // Recommendation
    checkPageBreak(25)
    doc.setFont('helvetica', 'bold')
    doc.text('Recommendation:', margin, yPos)
    yPos += 5
    doc.setFont('helvetica', 'normal')
    const recLines = doc.splitTextToSize(vuln.recommendation, pageWidth - 2 * margin)
    doc.text(recLines, margin + 5, yPos)
    yPos += recLines.length * 5 + 5

    // References
    if (vuln.references && vuln.references.length > 0) {
        checkPageBreak(20)
        doc.setFont('helvetica', 'bold')
        doc.text('References:', margin, yPos)
        yPos += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(0, 0, 238) // Blue link color
        
        vuln.references.forEach(ref => {
            if (checkPageBreak(6)) yPos += 5
            doc.textWithLink(`• ${ref}`, margin + 5, yPos, { url: ref })
            yPos += 5
        })
        doc.setTextColor(0)
        doc.setFontSize(10)
        yPos += 5
    }


    // Separator
    doc.setDrawColor(200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 10
  })

  // Recommendations Section
  if (reportData.recommendations && reportData.recommendations.length > 0) {
    doc.addPage()
    addWatermark() // Add watermark to new page
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
  const fileName = `Wibe-Crawler-Vulnerability-Report-${scanData.targetUrl.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
  doc.save(fileName)
}

function getCvssColor(score: number): [number, number, number] {
    if (score >= 9.0) return [220, 38, 38] // Critical (Red)
    if (score >= 7.0) return [249, 115, 22] // High (Orange)
    if (score >= 4.0) return [234, 179, 8]  // Medium (Yellow)
    return [59, 130, 246] // Low (Blue)
}
