import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import blueAllyLogoUrl from '@assets/image_1764369352062.png';
import blueAllyLogoWhiteUrl from '@assets/blueally-logo-white.png';

export const sanitizeForPDF = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/⚠️?\s*CRITICAL\s*ASSUMPTION:?\s*/gi, 'CRITICAL ASSUMPTION: ')
    .replace(/⚠️/g, '')
    .replace(/⚠/g, '')
    .replace(/↑/g, 'Up')
    .replace(/↓/g, 'Down')
    .replace(/[\u2191\u2197]/g, 'Up')
    .replace(/[\u2193\u2198]/g, 'Down')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[\u2192]/g, '->')
    .replace(/[\u2190]/g, '<-')
    .replace(/\s+/g, ' ')
    .trim();
};

export const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

const addCommas = (num: number): string => {
  return num.toLocaleString('en-US');
};

const formatCurrency = (value: number | string): string => {
  if (typeof value === 'string') {
    if (value.startsWith('$')) return value;
    const num = parseFloat(value.replace(/[,$]/g, ''));
    if (isNaN(num)) return value;
    value = num;
  }
  if (typeof value !== 'number' || isNaN(value)) return '$0';
  
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const prefix = isNegative ? '-$' : '$';
  
  if (absValue >= 1000000000) {
    return `${prefix}${(absValue / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `${prefix}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${prefix}${addCommas(Math.round(absValue))}`;
  } else if (absValue > 0) {
    return `${prefix}${absValue.toFixed(0)}`;
  }
  return '$0';
};

const formatNumber = (value: number | string): string => {
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/[,]/g, ''));
    if (isNaN(num)) return value;
    value = num;
  }
  if (typeof value !== 'number' || isNaN(value)) return '0';
  
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const prefix = isNegative ? '-' : '';
  
  if (absValue >= 1000000000) {
    return `${prefix}${(absValue / 1000000000).toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    return `${prefix}${(absValue / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${prefix}${addCommas(Math.round(absValue))}`;
  }
  return `${prefix}${Math.round(absValue)}`;
};

const BRAND = {
  primaryBlue: [0, 18, 120] as [number, number, number],
  lightBlue: [2, 162, 250] as [number, number, number],
  darkNavy: [4, 8, 34] as [number, number, number],
  green: [54, 191, 120] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  lightBlueBg: [205, 229, 241] as [number, number, number],
  gray: [80, 80, 80] as [number, number, number],
  lightGray: [248, 250, 252] as [number, number, number],
};

export async function generateBoardPresentationPDF(data: any, companyName: string): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (margin * 2);
  const centerX = pageWidth / 2;
  let currentPage = 1;
  const tocEntries: { title: string; page: number }[] = [];
  
  let headerLogoBase64: string | null = null;
  try {
    headerLogoBase64 = await loadImageAsBase64(blueAllyLogoWhiteUrl);
  } catch (e) {
    console.warn('Could not load header logo, using text fallback');
  }
  
  doc.setFont('helvetica');

  const drawHeader = () => {
    doc.setFillColor(...BRAND.primaryBlue);
    doc.rect(0, 0, pageWidth, 14, 'F');
    
    if (headerLogoBase64) {
      try {
        doc.addImage(headerLogoBase64, 'PNG', 8, 2, 28, 10);
      } catch (e) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BRAND.white);
        doc.text('BlueAlly', 12, 9);
      }
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.white);
      doc.text('BlueAlly', 12, 9);
    }
  };

  const addPageWithBranding = (skipHeader = false) => {
    if (!skipHeader) {
      doc.addPage();
    }
    currentPage = doc.getNumberOfPages();
    
    drawHeader();
    
    doc.setFillColor(...BRAND.primaryBlue);
    doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.white);
    doc.text(`Page ${currentPage}`, centerX, pageHeight - 5, { align: 'center' });
    
    return 28;
  };

  const ensureSpace = (needed: number, currentY: number): number => {
    if (currentY + needed > pageHeight - 30) {
      return addPageWithBranding();
    }
    return currentY;
  };

  const drawSectionHeading = (title: string, yPos: number): number => {
    yPos = ensureSpace(30, yPos);
    
    tocEntries.push({ title, page: currentPage });
    
    doc.setFillColor(...BRAND.lightBlueBg);
    doc.roundedRect(margin, yPos - 5, contentWidth, 22, 4, 4, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.primaryBlue);
    doc.text(title, centerX, yPos + 8, { align: 'center' });
    
    doc.setFillColor(...BRAND.lightBlue);
    const headingWidth = doc.getTextWidth(title);
    doc.rect(centerX - headingWidth/2, yPos + 13, headingWidth, 2, 'F');
    
    return yPos + 30;
  };

  const drawBenefitChart = (yPos: number, dash: any): number => {
    yPos = ensureSpace(85, yPos);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...BRAND.primaryBlue);
    doc.text('Value by Benefit Category', centerX, yPos, { align: 'center' });
    yPos += 10;
    
    const total = (dash.totalRevenueBenefit || 0) + (dash.totalCostBenefit || 0) + 
                  (dash.totalCashFlowBenefit || 0) + (dash.totalRiskBenefit || 0);
    
    const benefits = [
      { label: 'Revenue', value: dash.totalRevenueBenefit || 0, color: [46, 125, 50] as [number, number, number] },
      { label: 'Cost', value: dash.totalCostBenefit || 0, color: [25, 118, 210] as [number, number, number] },
      { label: 'Cash Flow', value: dash.totalCashFlowBenefit || 0, color: [123, 31, 162] as [number, number, number] },
      { label: 'Risk', value: dash.totalRiskBenefit || 0, color: [230, 81, 0] as [number, number, number] },
    ];
    
    const barWidth = 130;
    const barHeight = 12;
    const barX = centerX - barWidth/2;
    
    benefits.forEach((benefit, i) => {
      const pct = total > 0 ? (benefit.value / total) * 100 : 0;
      const filledWidth = (barWidth * pct) / 100;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.darkNavy);
      doc.text(benefit.label, barX - 5, yPos + 8, { align: 'right' });
      
      doc.setFillColor(230, 235, 240);
      doc.roundedRect(barX, yPos, barWidth, barHeight, 2, 2, 'F');
      
      if (filledWidth > 0) {
        doc.setFillColor(...benefit.color);
        doc.roundedRect(barX, yPos, Math.max(filledWidth, 4), barHeight, 2, 2, 'F');
      }
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.gray);
      doc.text(`${formatCurrency(benefit.value)} (${pct.toFixed(0)}%)`, barX + barWidth + 5, yPos + 8);
      
      yPos += barHeight + 6;
    });
    
    return yPos + 10;
  };

  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(blueAllyLogoUrl);
  } catch (e) {
    console.warn('Could not load cover logo, using text fallback');
  }

  doc.setFillColor(...BRAND.darkNavy);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', centerX - 40, 25, 80, 30);
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(...BRAND.white);
      doc.text('BlueAlly', centerX, 50, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...BRAND.white);
    doc.text('BlueAlly', centerX, 50, { align: 'center' });
  }
  
  doc.setFillColor(...BRAND.lightBlue);
  doc.rect(centerX - 50, 85, 100, 2, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(36);
  doc.setTextColor(...BRAND.white);
  doc.text('AI Strategic Assessment', centerX, 115, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.lightBlue);
  doc.text('Board Presentation', centerX, 135, { align: 'center' });
  
  doc.setFillColor(...BRAND.primaryBlue);
  doc.roundedRect(centerX - 80, 155, 160, 40, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.white);
  doc.text(companyName, centerX, 180, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(180, 190, 220);
  doc.text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), centerX, 215, { align: 'center' });
  
  if (data.executiveDashboard) {
    doc.setFillColor(...BRAND.green);
    doc.roundedRect(centerX - 85, 235, 170, 55, 5, 5, 'F');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.darkNavy);
    doc.text('Total Annual AI Value Opportunity', centerX, 255, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text(formatCurrency(data.executiveDashboard.totalAnnualValue), centerX, 278, { align: 'center' });
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(130, 140, 170);
  doc.text('BlueAlly Insight  |  Enterprise AI Advisory', centerX, pageHeight - 30, { align: 'center' });
  
  doc.setFillColor(...BRAND.lightBlue);
  doc.rect(0, pageHeight - 4, pageWidth, 4, 'F');
  
  const tocPageNum = 2;
  currentPage = 2;
  doc.addPage();
  let yPos = addPageWithBranding(true);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...BRAND.primaryBlue);
  doc.text('Table of Contents', centerX, yPos + 15, { align: 'center' });
  
  doc.setFillColor(...BRAND.lightBlue);
  doc.rect(centerX - 50, yPos + 20, 100, 2, 'F');
  
  const tocYStart = yPos + 40;
  
  yPos = addPageWithBranding();
  yPos = drawSectionHeading('Executive Summary', yPos);
  
  if (data.executiveDashboard) {
    const dash = data.executiveDashboard;
    const boxWidth = 75;
    const boxHeight = 40;
    const gap = 15;
    const startX = centerX - boxWidth - gap/2;
    
    doc.setFillColor(...BRAND.primaryBlue);
    doc.roundedRect(startX, yPos, boxWidth, boxHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(200, 210, 230);
    doc.text('Total Annual Value', startX + boxWidth/2, yPos + 14, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.white);
    doc.text(formatCurrency(dash.totalAnnualValue), startX + boxWidth/2, yPos + 30, { align: 'center' });
    
    doc.setFillColor(...BRAND.lightBlue);
    doc.roundedRect(startX + boxWidth + gap, yPos, boxWidth, boxHeight, 4, 4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.darkNavy);
    doc.text('Value / 1M Tokens', startX + boxWidth + gap + boxWidth/2, yPos + 14, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(formatCurrency(dash.valuePerMillionTokens), startX + boxWidth + gap + boxWidth/2, yPos + 30, { align: 'center' });
    
    yPos += boxHeight + 20;
    
    yPos = drawBenefitChart(yPos, dash);
    
    if (dash.topUseCases && dash.topUseCases.length > 0) {
      yPos = ensureSpace(100, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...BRAND.primaryBlue);
      doc.text('Top Priority AI Use Cases', centerX, yPos, { align: 'center' });
      yPos += 10;
      
      const useCaseColWidths = { rank: 10, useCase: 95, value: 32, tokens: 33 };
      
      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Use Case', 'Annual Value', 'Tokens/Mo']],
        body: dash.topUseCases.map((uc: any) => [
          uc.rank,
          String(uc.useCase).substring(0, 70),
          formatCurrency(uc.annualValue),
          formatNumber(uc.monthlyTokens),
        ]),
        theme: 'plain',
        showHead: 'everyPage',
        headStyles: { 
          fillColor: BRAND.primaryBlue,
          textColor: BRAND.white,
          fontStyle: 'bold',
          fontSize: 10,
          cellPadding: 3,
          halign: 'center'
        },
        bodyStyles: { 
          fontSize: 10, 
          cellPadding: 3,
          textColor: BRAND.darkNavy,
          halign: 'center'
        },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        styles: { 
          overflow: 'linebreak',
          lineColor: [220, 225, 235],
          lineWidth: 0.5
        },
        columnStyles: {
          0: { cellWidth: useCaseColWidths.rank, halign: 'center' },
          1: { cellWidth: useCaseColWidths.useCase, halign: 'left' },
          2: { cellWidth: useCaseColWidths.value, halign: 'right' },
          3: { cellWidth: useCaseColWidths.tokens, halign: 'right' }
        },
        tableWidth: contentWidth,
        margin: { left: margin, right: margin },
        didDrawPage: () => { currentPage = doc.getNumberOfPages(); }
      });
      yPos = (doc as any).lastAutoTable.finalY + 20;
    }
  }
  
  if (data.summary) {
    yPos = ensureSpace(60, yPos);
    
    // Parse Value Drivers summary with new markdown structure
    // Note: Don't sanitize before parsing - sanitize individual text when writing
    const summaryContent = data.summary;
    const summarySections = summaryContent.split(/\n---\n|\n-{3,}\n/);
    
    for (const section of summarySections) {
      if (!section.trim()) continue;
      
      const lines = section.trim().split('\n');
      let inTable = false;
      const tableRows: string[][] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Handle markdown tables
        if (line.startsWith('|')) {
          if (line.includes('---')) continue; // Skip separator row
          
          const cells = line.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim());
          if (cells.length >= 2) {
            tableRows.push(cells);
            inTable = true;
            continue;
          }
        } else if (inTable && tableRows.length > 0) {
          // End of table - render it
          yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
          autoTable(doc, {
            startY: yPos,
            head: tableRows.length > 1 ? [tableRows[0]] : undefined,
            body: tableRows.length > 1 ? tableRows.slice(1) : tableRows,
            theme: 'striped',
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: BRAND.primaryBlue, textColor: BRAND.white },
            tableWidth: contentWidth,
            margin: { left: margin, right: margin }
          });
          yPos = (doc as any).lastAutoTable.finalY + 10;
          tableRows.length = 0;
          inTable = false;
        }
        
        // Handle ### headers
        const h3Match = line.match(/^###\s*(.+)$/);
        if (h3Match) {
          yPos = ensureSpace(25, yPos);
          const headerText = h3Match[1].replace(/[⚠️]/g, '').trim();
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          // Use orange for Portfolio Risk, blue for others
          if (line.includes('Portfolio Risk') || line.includes('Critical')) {
            doc.setTextColor(220, 120, 0);
          } else {
            doc.setTextColor(...BRAND.primaryBlue);
          }
          doc.text(headerText, margin, yPos);
          doc.setDrawColor(...BRAND.lightBlue);
          doc.setLineWidth(0.5);
          doc.line(margin, yPos + 3, margin + doc.getTextWidth(headerText), yPos + 3);
          yPos += 15;
          continue;
        }
        
        // Handle big headline numbers like **$52.4M** in annual value
        if (line.startsWith('**') && line.includes('annual value')) {
          yPos = ensureSpace(20, yPos);
          const cleanLine = line.replace(/\*\*/g, '');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(18);
          doc.setTextColor(...BRAND.primaryBlue);
          doc.text(cleanLine, margin, yPos);
          yPos += 14;
          continue;
        }
        
        // Handle use case headers **[Name]** — $X.XM
        const useCaseMatch = line.match(/^\*\*([^*]+)\*\*\s*[—–-]\s*\$?([\d.,]+[MKB]?)/);
        if (useCaseMatch) {
          yPos = ensureSpace(16, yPos);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(...BRAND.darkNavy);
          doc.text(`${useCaseMatch[1]} — $${useCaseMatch[2]}`, margin, yPos);
          yPos += 10;
          continue;
        }
        
        // Handle bold headers like **If it fails:** or **Mitigation:**
        const boldMatch = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
        if (boldMatch) {
          yPos = ensureSpace(14, yPos);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...BRAND.darkNavy);
          doc.text(boldMatch[1] + ':', margin, yPos);
          yPos += 8;
          
          if (boldMatch[2]) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const bodyLines = doc.splitTextToSize(boldMatch[2], contentWidth - 10);
            for (const bodyLine of bodyLines) {
              yPos = ensureSpace(8, yPos);
              doc.text(bodyLine, margin, yPos);
              yPos += 6;
            }
          }
          continue;
        }
        
        // Regular paragraph text
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...BRAND.darkNavy);
        const paraLines = doc.splitTextToSize(line, contentWidth - 10);
        for (const paraLine of paraLines) {
          yPos = ensureSpace(8, yPos);
          doc.text(paraLine, margin, yPos);
          yPos += 6;
        }
      }
      
      // Render any remaining table at end of section
      if (tableRows.length > 0) {
        yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
        autoTable(doc, {
          startY: yPos,
          head: tableRows.length > 1 ? [tableRows[0]] : undefined,
          body: tableRows.length > 1 ? tableRows.slice(1) : tableRows,
          theme: 'striped',
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: BRAND.primaryBlue, textColor: BRAND.white },
          tableWidth: contentWidth,
          margin: { left: margin, right: margin }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }
      
      yPos += 8;
    }
    yPos += 12;
  }
  
  for (const step of data.steps) {
    const hasContent = step.content || (step.data && step.data.length > 0);
    if (!hasContent) continue;
    
    yPos = addPageWithBranding();
    yPos = drawSectionHeading(`Step ${step.step}: ${step.title}`, yPos);
    
    if (step.step === 0 && step.content) {
      const content = sanitizeForPDF(step.content);
      
      // Split by horizontal rules to separate major sections
      const majorSections = content.split(/\n---\n|\n-{3,}\n/);
      
      for (const majorSection of majorSections) {
        if (!majorSection.trim()) continue;
        
        const lines = majorSection.trim().split('\n');
        let inTable = false;
        const tableRows: string[][] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Handle markdown tables
          if (line.startsWith('|')) {
            if (line.includes('---')) continue; // Skip separator row
            
            const cells = line.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim());
            if (cells.length >= 2) {
              tableRows.push(cells);
              inTable = true;
              continue;
            }
          } else if (inTable && tableRows.length > 0) {
            // End of table - render it
            yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
            autoTable(doc, {
              startY: yPos,
              body: tableRows,
              theme: 'plain',
              styles: { fontSize: 10, cellPadding: 4 },
              columnStyles: {
                0: { textColor: BRAND.gray, fontStyle: 'normal', cellWidth: 50 },
                1: { textColor: BRAND.darkNavy, fontStyle: 'bold', cellWidth: contentWidth - 50 }
              },
              tableWidth: contentWidth,
              margin: { left: margin, right: margin }
            });
            yPos = (doc as any).lastAutoTable.finalY + 10;
            tableRows.length = 0;
            inTable = false;
          }
          
          // Handle markdown ### headers (new format) or **Bold** headers (legacy format)
          const markdownH3Match = line.match(/^###\s*(.+)$/);
          if (markdownH3Match) {
            yPos = ensureSpace(25, yPos);
            const headerText = markdownH3Match[1].replace(/[⚠️]/g, '').trim();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            // Use orange for Critical Assumptions, blue for others
            if (line.includes('Critical Assumptions')) {
              doc.setTextColor(220, 120, 0); // Orange for warnings
            } else {
              doc.setTextColor(...BRAND.primaryBlue);
            }
            doc.text(headerText, margin, yPos);
            // Underline
            doc.setDrawColor(...BRAND.lightBlue);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos + 3, margin + doc.getTextWidth(headerText), yPos + 3);
            yPos += 15;
            continue;
          }
          
          // Handle main section headers like **Company Profile** or **Key Business Challenges** (legacy format)
          const mainHeaderMatch = line.match(/^\*\*(Company Profile|Key Business Challenges)\*\*$/);
          if (mainHeaderMatch) {
            yPos = ensureSpace(25, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...BRAND.primaryBlue);
            doc.text(mainHeaderMatch[1], margin, yPos);
            // Underline
            doc.setDrawColor(...BRAND.lightBlue);
            doc.setLineWidth(0.5);
            doc.line(margin, yPos + 3, margin + doc.getTextWidth(mainHeaderMatch[1]), yPos + 3);
            yPos += 15;
            continue;
          }
          
          // Handle ticker/HQ line (Company | TICKER | City, State)
          if (!line.startsWith('**') && line.includes(' | ') && !line.startsWith('|')) {
            yPos = ensureSpace(12, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.gray);
            doc.text(line, margin, yPos);
            yPos += 8;
            continue;
          }
          
          // Handle big numbers line like **$152.7B** revenue. **$15.0B** earnings.
          if (line.includes('**') && (line.includes('revenue') || line.includes('earnings') || line.includes('Revenue') || line.includes('Earnings'))) {
            yPos = ensureSpace(20, yPos);
            const cleanLine = line.replace(/\*\*/g, '');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...BRAND.primaryBlue);
            doc.text(cleanLine, margin, yPos);
            yPos += 12;
            continue;
          }
          
          // Handle challenge headers like **The $3B Problem: Shrink**
          const challengeMatch = line.match(/^\*\*([^*]+)\*\*$/);
          if (challengeMatch) {
            yPos = ensureSpace(18, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...BRAND.darkNavy);
            doc.text(challengeMatch[1], margin, yPos);
            yPos += 10;
            continue;
          }
          
          // Handle any remaining bold text patterns
          const boldMatch = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
          if (boldMatch) {
            yPos = ensureSpace(16, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...BRAND.primaryBlue);
            doc.text(boldMatch[1], margin, yPos);
            yPos += 10;
            
            if (boldMatch[2]) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(...BRAND.darkNavy);
              const bodyLines = doc.splitTextToSize(boldMatch[2], contentWidth - 10);
              for (const bodyLine of bodyLines) {
                yPos = ensureSpace(8, yPos);
                doc.text(bodyLine, margin, yPos);
                yPos += 6;
              }
            }
            continue;
          }
          
          // Regular paragraph text
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...BRAND.darkNavy);
          const paraLines = doc.splitTextToSize(line, contentWidth - 10);
          for (const paraLine of paraLines) {
            yPos = ensureSpace(8, yPos);
            doc.text(paraLine, margin, yPos);
            yPos += 6;
          }
        }
        
        // Render any remaining table at end of section
        if (tableRows.length > 0) {
          yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
          autoTable(doc, {
            startY: yPos,
            body: tableRows,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 4 },
            columnStyles: {
              0: { textColor: BRAND.gray, fontStyle: 'normal', cellWidth: 50 },
              1: { textColor: BRAND.darkNavy, fontStyle: 'bold', cellWidth: contentWidth - 50 }
            },
            tableWidth: contentWidth,
            margin: { left: margin, right: margin }
          });
          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
        
        yPos += 8;
      }
      yPos += 12;
    }
    else if (step.content) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(step.step === 1 ? 11 : 12);
      doc.setTextColor(...BRAND.gray);
      const sanitizedContent = sanitizeForPDF(step.content);
      const contentLines = doc.splitTextToSize(sanitizedContent, contentWidth - 20);
      for (const line of contentLines) {
        yPos = ensureSpace(8, yPos);
        doc.text(line, centerX, yPos, { align: 'center', maxWidth: contentWidth - 20 });
        yPos += 7;
      }
      yPos += 12;
    }
    
    if (step.data && step.data.length > 0) {
      const isBenefitsStep = step.step === 5;
      const isNarrativeStep = step.step === 1 || step.step === 2 || step.step === 3;
      const allColumns = Object.keys(step.data[0]);
      const formulaColumns = allColumns.filter(k => k.includes('Formula'));
      const displayColumns = allColumns.filter(k => !k.includes('Formula'));
      
      const maxCols = isNarrativeStep ? 4 : 6;
      const limitedColumns = displayColumns.slice(0, maxCols);
      
      const cellCharLimit = isNarrativeStep ? 120 : 60;
      const truncationLimit = isNarrativeStep ? 100 : 45;
      
      const rows = step.data.map((row: any) => 
        limitedColumns.map(col => {
          const val = row[col];
          if (typeof val === 'number' && col.toLowerCase().includes('$')) {
            return formatCurrency(val);
          }
          if (typeof val === 'number' && val > 1000) {
            return formatNumber(val);
          }
          return sanitizeForPDF(String(val || '')).substring(0, cellCharLimit);
        })
      );
      
      yPos = ensureSpace(40, yPos);
      
      const colCount = limitedColumns.length;
      const strictColStyles: any = {};
      
      if (isNarrativeStep) {
        const textColWidth = Math.floor((contentWidth - 15) / Math.max(colCount - 1, 1));
        limitedColumns.forEach((col: string, idx: number) => {
          if (idx === 0) {
            strictColStyles[idx] = { cellWidth: 35, halign: 'left', overflow: 'linebreak' };
          } else if (col.toLowerCase().includes('description') || col.toLowerCase().includes('pain') || col.toLowerCase().includes('insight')) {
            strictColStyles[idx] = { cellWidth: Math.min(textColWidth, 70), halign: 'left', overflow: 'linebreak' };
          } else {
            strictColStyles[idx] = { cellWidth: Math.min(textColWidth, 50), halign: 'left', overflow: 'linebreak' };
          }
        });
      } else {
        const fixedColWidth = Math.floor(contentWidth / colCount);
        limitedColumns.forEach((col: string, idx: number) => {
          if (idx === 0) {
            strictColStyles[idx] = { cellWidth: 15, halign: 'center' };
          } else if (col.toLowerCase().includes('use case') || col.toLowerCase().includes('description')) {
            strictColStyles[idx] = { cellWidth: Math.min(fixedColWidth * 1.8, 60), halign: 'left' };
          } else {
            strictColStyles[idx] = { cellWidth: fixedColWidth - 3, halign: 'center' };
          }
        });
      }
      
      const truncatedRows = rows.map((row: string[]) => 
        row.map((cell: string) => String(cell).substring(0, truncationLimit))
      );
      const truncatedHeaders = limitedColumns.map((h: string) => String(h).substring(0, 25));
      
      autoTable(doc, {
        startY: yPos,
        head: [truncatedHeaders],
        body: isNarrativeStep ? rows : truncatedRows,
        theme: 'plain',
        showHead: 'everyPage',
        headStyles: { 
          fillColor: BRAND.primaryBlue,
          textColor: BRAND.white,
          fontStyle: 'bold',
          fontSize: isNarrativeStep ? 10 : 9,
          cellPadding: isNarrativeStep ? 4 : 2,
          halign: isNarrativeStep ? 'left' : 'center'
        },
        bodyStyles: { 
          fontSize: isNarrativeStep ? 9 : 9, 
          cellPadding: isNarrativeStep ? 4 : 2,
          textColor: BRAND.darkNavy,
          halign: isNarrativeStep ? 'left' : 'center'
        },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        styles: { 
          overflow: 'linebreak', 
          lineColor: [220, 225, 235],
          lineWidth: 0.5,
          minCellHeight: isNarrativeStep ? 12 : 8
        },
        columnStyles: strictColStyles,
        tableWidth: contentWidth,
        margin: { left: margin - 2, right: margin - 2 },
        didDrawPage: () => {
          currentPage = doc.getNumberOfPages();
          drawHeader();
          
          doc.setFillColor(...BRAND.primaryBlue);
          doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(...BRAND.white);
          doc.text(`Page ${currentPage}`, centerX, pageHeight - 5, { align: 'center' });
        }
      });
      yPos = (doc as any).lastAutoTable.finalY + 20;
      
      if (isBenefitsStep && formulaColumns.length > 0) {
        yPos = addPageWithBranding();
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...BRAND.primaryBlue);
        doc.text('Benefit Calculation Formulas', centerX, yPos + 10, { align: 'center' });
        
        doc.setFillColor(...BRAND.lightBlue);
        const headingWidth = doc.getTextWidth('Benefit Calculation Formulas');
        doc.rect(centerX - headingWidth/2, yPos + 14, headingWidth, 2, 'F');
        yPos += 30;
        
        const formulaTableColumns = ['ID', 'Use Case', ...formulaColumns.slice(0, 2)];
        const formulaRows = step.data.map((row: any) => 
          [
            row['ID'] || '', 
            String(row['Use Case'] || '').substring(0, 40),
            ...formulaColumns.slice(0, 2).map(col => sanitizeForPDF(String(row[col] || 'N/A')).substring(0, 80))
          ]
        );
        
        const fColCount = formulaTableColumns.length;
        const fColStyles: any = {
          0: { cellWidth: 12, halign: 'center', overflow: 'linebreak' },
          1: { cellWidth: 45, halign: 'left', overflow: 'linebreak' }
        };
        const fRemainingWidth = contentWidth - 57;
        const fColWidth = Math.floor(fRemainingWidth / Math.max(fColCount - 2, 1));
        for (let i = 2; i < fColCount; i++) {
          fColStyles[i] = { cellWidth: fColWidth, halign: 'left', overflow: 'linebreak' };
        }
        
        autoTable(doc, {
          startY: yPos,
          head: [formulaTableColumns.map(h => String(h).substring(0, 22))],
          body: formulaRows,
          theme: 'plain',
          showHead: 'everyPage',
          headStyles: { 
            fillColor: BRAND.primaryBlue,
            textColor: BRAND.white,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 3,
            halign: 'center'
          },
          bodyStyles: { 
            fontSize: 8, 
            cellPadding: 3,
            textColor: BRAND.darkNavy,
            minCellHeight: 10
          },
          alternateRowStyles: { fillColor: [248, 250, 255] },
          styles: { 
            overflow: 'linebreak', 
            lineColor: [220, 225, 235],
            lineWidth: 0.5
          },
          columnStyles: fColStyles,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didDrawPage: () => {
            currentPage = doc.getNumberOfPages();
            drawHeader();
            
            doc.setFillColor(...BRAND.primaryBlue);
            doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.white);
            doc.text(`Page ${currentPage}`, centerX, pageHeight - 5, { align: 'center' });
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 20;
      }
    }
  }
  
  yPos = addPageWithBranding();
  tocEntries.push({ title: 'Recommended Next Steps', page: currentPage });
  
  doc.setFillColor(...BRAND.darkNavy);
  doc.roundedRect(margin, yPos, contentWidth, 150, 6, 6, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.white);
  doc.text('Recommended Next Steps', centerX, yPos + 25, { align: 'center' });
  
  doc.setFillColor(...BRAND.lightBlue);
  doc.rect(centerX - 50, yPos + 32, 100, 2, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.green);
  doc.text('BlueAlly 3-Day AI Use Case Workshop', centerX, yPos + 55, { align: 'center' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(200, 210, 230);
  const workshopDesc = 'Transform this strategic assessment into actionable AI initiatives with our expert-facilitated workshop designed to overcome common AI implementation pitfalls.';
  const descLines = doc.splitTextToSize(workshopDesc, contentWidth - 40);
  descLines.forEach((line: string, i: number) => {
    doc.text(line, centerX, yPos + 72 + (i * 8), { align: 'center' });
  });
  
  const benefits = [
    'ROI-Focused: Link every AI use case to specific KPIs',
    'Rapid Prototyping: Target 90-day pilot cycles',
    'Executive Alignment: Cross-functional workshops',
    'Expert Partnership: 2.6x higher success rate',
    'Governance Built-In: Security and compliance from day one'
  ];
  
  let benefitY = yPos + 98;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  benefits.forEach((benefit, i) => {
    doc.setTextColor(...BRAND.white);
    doc.text(`• ${benefit}`, centerX, benefitY + (i * 10), { align: 'center' });
  });
  
  yPos += 165;
  doc.setFillColor(...BRAND.green);
  doc.roundedRect(centerX - 80, yPos, 160, 35, 5, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.darkNavy);
  doc.text('Schedule Your AI Workshop', centerX, yPos + 15, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('www.blueally.com', centerX, yPos + 28, { align: 'center' });
  
  doc.setPage(tocPageNum);
  let tocY = tocYStart;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  
  tocEntries.forEach((entry) => {
    doc.setTextColor(...BRAND.darkNavy);
    const entryText = `${entry.title}`;
    doc.text(entryText, margin + 10, tocY);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.primaryBlue);
    doc.text(`${entry.page}`, pageWidth - margin - 10, tocY, { align: 'right' });
    
    const titleWidth = doc.getTextWidth(entryText);
    doc.setTextColor(180, 190, 210);
    doc.setFont('helvetica', 'normal');
    const dotsWidth = contentWidth - titleWidth - 40;
    const dotCount = Math.floor(dotsWidth / 3);
    const dots = '.'.repeat(dotCount);
    doc.text(dots, margin + 15 + titleWidth, tocY);
    
    tocY += 12;
  });
  
  doc.save(`BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.pdf`);
}
