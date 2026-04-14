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
    if (url.startsWith('http') && !url.includes(window.location.origin)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
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
      } catch (e) {
        reject(new Error('Canvas drawing failed - possible CORS issue'));
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
    const billions = Math.round(absValue / 1000000000 * 10) / 10;
    return billions === Math.floor(billions)
      ? `${prefix}${Math.floor(billions)}B`
      : `${prefix}${billions.toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    const millions = Math.round(absValue / 1000000 * 10) / 10;
    return millions === Math.floor(millions)
      ? `${prefix}${Math.floor(millions)}M`
      : `${prefix}${millions.toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${prefix}${addCommas(Math.round(absValue))}`;
  } else if (absValue > 0) {
    return `${prefix}${Math.round(absValue)}`;
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
    const billions = Math.round(absValue / 1000000000 * 10) / 10;
    return billions === Math.floor(billions)
      ? `${prefix}${Math.floor(billions)}B`
      : `${prefix}${billions.toFixed(1)}B`;
  } else if (absValue >= 1000000) {
    const millions = Math.round(absValue / 1000000 * 10) / 10;
    return millions === Math.floor(millions)
      ? `${prefix}${Math.floor(millions)}M`
      : `${prefix}${millions.toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `${prefix}${addCommas(Math.round(absValue))}`;
  }
  return `${prefix}${Math.round(absValue)}`;
};

// ── Unified Design System ────────────────────────────────────────────
// Matches the HTML report and Dashboard color palette exactly
const BRAND = {
  // Primary brand colors
  primary: [3, 57, 175] as [number, number, number],        // #0339AF
  accent: [76, 115, 233] as [number, number, number],       // #4C73E9
  navy: [15, 23, 42] as [number, number, number],           // #0F172A
  sky: [0, 163, 224] as [number, number, number],            // #00A3E0
  white: [255, 255, 255] as [number, number, number],

  // Pillar colors
  revenue: [5, 150, 105] as [number, number, number],       // #059669
  cost: [0, 102, 204] as [number, number, number],           // #0066CC
  cashflow: [217, 119, 6] as [number, number, number],      // #D97706
  risk: [99, 102, 241] as [number, number, number],          // #6366F1

  // Text
  textPrimary: [15, 23, 42] as [number, number, number],    // #0F172A
  textSecondary: [51, 65, 85] as [number, number, number],  // #334155
  textTertiary: [100, 116, 139] as [number, number, number],// #64748B
  textMuted: [148, 163, 184] as [number, number, number],   // #94A3B8

  // Backgrounds
  bgSecondary: [248, 250, 252] as [number, number, number], // #F8FAFC
  bgTertiary: [241, 245, 249] as [number, number, number],  // #F1F5F9

  // Borders
  borderLight: [226, 232, 240] as [number, number, number], // #E2E8F0
  borderDefault: [203, 213, 225] as [number, number, number],// #CBD5E1

  // Scenario colors
  scenarioConservative: [100, 116, 139] as [number, number, number], // #64748B
  scenarioBase: [3, 57, 175] as [number, number, number],           // #0339AF
  scenarioOptimistic: [5, 150, 105] as [number, number, number],    // #059669

  // Scenario backgrounds
  scenarioConservativeBg: [248, 250, 252] as [number, number, number], // #F8FAFC
  scenarioBaseBg: [239, 246, 255] as [number, number, number],        // #EFF6FF
  scenarioOptimisticBg: [240, 253, 244] as [number, number, number],  // #F0FDF4
};

// Table style presets for clean, minimal tables
const TABLE_STYLES = {
  headStyles: {
    fillColor: BRAND.bgSecondary,
    textColor: BRAND.navy,
    fontStyle: 'bold' as const,
    fontSize: 9,
    cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
    halign: 'left' as const,
    lineColor: BRAND.borderLight,
    lineWidth: { bottom: 0.5, top: 0, left: 0, right: 0 },
  },
  bodyStyles: {
    fontSize: 9,
    cellPadding: { top: 3, bottom: 3, left: 6, right: 6 },
    textColor: BRAND.textSecondary,
    lineColor: BRAND.borderLight,
    lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
  },
  alternateRowStyles: { fillColor: BRAND.bgSecondary },
  styles: {
    overflow: 'linebreak' as const,
    lineColor: BRAND.borderLight,
    lineWidth: 0,
    minCellHeight: 8,
  },
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

  let coverLogoBase64: string | null = null;
  try {
    coverLogoBase64 = await loadImageAsBase64(blueAllyLogoUrl);
  } catch (e) {
    console.warn('Could not load cover logo, using text fallback');
  }

  doc.setFont('helvetica');

  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // ── Header: thin blue bar with branding ────────────────────────────
  const drawHeader = () => {
    // Thin blue accent bar at top (3px)
    doc.setFillColor(...BRAND.primary);
    doc.rect(0, 0, pageWidth, 3, 'F');

    // Header text area
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.textTertiary);
    doc.text('BlueAlly  |  AI Strategic Assessment', margin, 10);

    // Page number right-aligned
    doc.text(`${currentPage}`, pageWidth - margin, 10, { align: 'right' });
  };

  // ── Footer: thin line with date and confidential ───────────────────
  const drawFooter = () => {
    const footerY = pageHeight - 10;
    // Thin line
    doc.setDrawColor(...BRAND.borderLight);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.textMuted);
    doc.text(formattedDate, margin, footerY);
    doc.text('Confidential', centerX, footerY, { align: 'center' });
    doc.text(`Page ${currentPage}`, pageWidth - margin, footerY, { align: 'right' });
  };

  const addPageWithBranding = (skipHeader = false) => {
    if (!skipHeader) {
      doc.addPage();
    }
    currentPage = doc.getNumberOfPages();
    drawHeader();
    drawFooter();
    return 20; // content start Y
  };

  const ensureSpace = (needed: number, currentY: number): number => {
    if (currentY + needed > pageHeight - 20) {
      return addPageWithBranding();
    }
    return currentY;
  };

  // ── Section Heading: blue left accent bar + navy bold text ─────────
  const drawSectionHeading = (title: string, yPos: number, sectionNum?: string): number => {
    yPos = ensureSpace(30, yPos);
    tocEntries.push({ title: sectionNum ? `${sectionNum}  ${title}` : title, page: currentPage });

    // Blue left accent bar
    doc.setFillColor(...BRAND.primary);
    doc.rect(margin, yPos - 2, 4, 16, 'F');

    // Section number (small, muted)
    if (sectionNum) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(sectionNum, margin + 10, yPos + 3);
    }

    // Section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.navy);
    doc.text(title, margin + 10, yPos + 12);

    return yPos + 26;
  };

  // ── Sub-heading ────────────────────────────────────────────────────
  const drawSubHeading = (title: string, yPos: number): number => {
    yPos = ensureSpace(18, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...BRAND.navy);
    doc.text(title, margin, yPos);
    return yPos + 10;
  };

  // ── Paragraph text ─────────────────────────────────────────────────
  const drawParagraph = (text: string, yPos: number, opts?: { bold?: boolean; color?: [number, number, number]; indent?: number }): number => {
    const indent = opts?.indent || 0;
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...(opts?.color || BRAND.textSecondary));
    const lines = doc.splitTextToSize(text, contentWidth - indent);
    for (const line of lines) {
      yPos = ensureSpace(7, yPos);
      doc.text(line, margin + indent, yPos);
      yPos += 6;
    }
    return yPos + 2;
  };

  // ── Benefit bar chart ──────────────────────────────────────────────
  const drawBenefitChart = (yPos: number, dash: any): number => {
    yPos = ensureSpace(90, yPos);

    const total = (dash.totalRevenueBenefit || 0) + (dash.totalCostBenefit || 0) +
                  (dash.totalCashFlowBenefit || 0) + (dash.totalRiskBenefit || 0);

    const benefits = [
      { label: 'Revenue Growth', value: dash.totalRevenueBenefit || 0, color: BRAND.revenue },
      { label: 'Cost Savings', value: dash.totalCostBenefit || 0, color: BRAND.cost },
      { label: 'Cash Flow', value: dash.totalCashFlowBenefit || 0, color: BRAND.cashflow },
      { label: 'Risk Mitigation', value: dash.totalRiskBenefit || 0, color: BRAND.risk },
    ];

    const barWidth = 110;
    const barHeight = 10;
    const labelWidth = 40;
    const barX = margin + labelWidth;

    benefits.forEach((benefit) => {
      const pct = total > 0 ? (benefit.value / total) * 100 : 0;
      const filledWidth = (barWidth * pct) / 100;

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.textSecondary);
      doc.text(benefit.label, margin, yPos + 7);

      // Background track
      doc.setFillColor(...BRAND.bgTertiary);
      doc.roundedRect(barX, yPos, barWidth, barHeight, 2, 2, 'F');

      // Filled bar
      if (filledWidth > 0) {
        doc.setFillColor(...benefit.color);
        doc.roundedRect(barX, yPos, Math.max(filledWidth, 4), barHeight, 2, 2, 'F');
      }

      // Value + percentage
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...benefit.color);
      doc.text(`${formatCurrency(benefit.value)}`, barX + barWidth + 4, yPos + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(`${pct.toFixed(0)}%`, barX + barWidth + 4, yPos + 10);

      yPos += barHeight + 8;
    });

    return yPos + 6;
  };

  // ── KPI Card (small box with colored left border) ──────────────────
  const drawKPICard = (x: number, y: number, w: number, h: number, label: string, value: string, pct: string, color: [number, number, number]) => {
    // Card background
    doc.setFillColor(...BRAND.white);
    doc.setDrawColor(...BRAND.borderLight);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');

    // Colored left border
    doc.setFillColor(...color);
    doc.rect(x, y + 3, 3, h - 6, 'F');

    // Label (uppercase, small)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.textTertiary);
    doc.text(label.toUpperCase(), x + 8, y + 9);

    // Value (large, bold, colored)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...color);
    doc.text(value, x + 8, y + 22);

    // Percentage of total
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.textMuted);
    doc.text(`${pct} of total`, x + 8, y + 28);
  };

  // ── Scenario Card ──────────────────────────────────────────────────
  const drawScenarioCard = (x: number, y: number, w: number, h: number, config: {
    label: string;
    color: [number, number, number];
    bgColor: [number, number, number];
    isHighlighted: boolean;
    adoption: string;
    timeline: string;
    realization: string;
    annualBenefit: string;
    npv: string;
  }) => {
    // Card background
    doc.setFillColor(...config.bgColor);
    if (config.isHighlighted) {
      doc.setDrawColor(...config.color);
      doc.setLineWidth(1.5);
    } else {
      doc.setDrawColor(...BRAND.borderLight);
      doc.setLineWidth(0.3);
    }
    doc.roundedRect(x, y, w, h, 4, 4, 'FD');

    let cy = y + 8;

    // Scenario label pill
    const pillW = doc.getTextWidth(config.label) * 1.4 + 8;
    doc.setFillColor(...config.color);
    doc.roundedRect(x + 6, cy - 4, pillW, 10, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.white);
    doc.text(config.label, x + 6 + pillW / 2, cy + 2, { align: 'center' });

    // "Recommended" badge for base case
    if (config.isHighlighted) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...config.color);
      doc.text('RECOMMENDED', x + w - 8, cy + 2, { align: 'right' });
    }

    cy += 14;

    // Definitions
    const defs = [
      { label: 'Adoption', value: config.adoption },
      { label: 'Timeline', value: config.timeline },
      { label: 'Realization', value: config.realization },
    ];
    doc.setFontSize(7);
    defs.forEach(d => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND.textTertiary);
      doc.text(`${d.label}:`, x + 8, cy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BRAND.textSecondary);
      const valLines = doc.splitTextToSize(d.value, w - 40);
      doc.text(valLines[0] || '', x + 28, cy);
      cy += 7;
    });

    cy += 4;

    // Divider
    doc.setDrawColor(...BRAND.borderLight);
    doc.setLineWidth(0.3);
    doc.line(x + 8, cy, x + w - 8, cy);
    cy += 6;

    // Metrics
    const metrics = [
      { label: 'Annual Benefit', value: config.annualBenefit },
      { label: '5-Year NPV', value: config.npv },
    ];
    metrics.forEach(m => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.textTertiary);
      doc.text(m.label, x + 8, cy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...config.color);
      doc.text(m.value, x + 8, cy + 8);
      cy += 16;
    });
  };

  // Helper: autoTable didDrawPage callback
  const autoTablePageCallback = () => {
    currentPage = doc.getNumberOfPages();
    drawHeader();
    drawFooter();
  };

  // Helper: % of total
  const pctOfTotal = (val: number): string => {
    const total = data.executiveDashboard?.totalAnnualValue || 0;
    if (!total) return '0%';
    return `${((val / total) * 100).toFixed(0)}%`;
  };

  // ══════════════════════════════════════════════════════════════════
  // PAGE 1: COVER PAGE — White/Light, Professional
  // ══════════════════════════════════════════════════════════════════

  // White background (default)
  // Gradient accent bar at top
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageWidth, 5, 'F');
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 5, pageWidth, 2, 'F');

  // Logo
  if (coverLogoBase64) {
    try {
      doc.addImage(coverLogoBase64, 'PNG', centerX - 35, 30, 70, 26);
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(...BRAND.primary);
      doc.text('BlueAlly', centerX, 50, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...BRAND.primary);
    doc.text('BlueAlly', centerX, 50, { align: 'center' });
  }

  // Blue divider line
  doc.setFillColor(...BRAND.primary);
  doc.rect(centerX - 40, 68, 80, 1.5, 'F');

  // Subtitle badge
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.textTertiary);
  doc.text('AI STRATEGIC ASSESSMENT', centerX, 82, { align: 'center' });

  // Main title — Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...BRAND.navy);
  // Handle long company names
  const companyLines = doc.splitTextToSize(companyName, contentWidth - 20);
  let titleY = 105;
  for (const line of companyLines) {
    doc.text(line, centerX, titleY, { align: 'center' });
    titleY += 14;
  }

  // Date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.textTertiary);
  doc.text(formattedDate, centerX, titleY + 10, { align: 'center' });

  // Total Value highlight box
  if (data.executiveDashboard) {
    const boxY = titleY + 30;
    const boxW = 130;
    const boxH = 46;
    const boxX = centerX - boxW / 2;

    // White card with blue border
    doc.setFillColor(...BRAND.white);
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(1);
    doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, 'FD');

    // Label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.textTertiary);
    doc.text('TOTAL ANNUAL AI VALUE OPPORTUNITY', centerX, boxY + 14, { align: 'center' });

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...BRAND.primary);
    doc.text(formatCurrency(data.executiveDashboard.totalAnnualValue), centerX, boxY + 34, { align: 'center' });
  }

  // Footer branding
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.textMuted);
  doc.text('BlueAlly  |  Enterprise AI Advisory', centerX, pageHeight - 25, { align: 'center' });

  // Bottom accent bar
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, pageHeight - 5, pageWidth, 5, 'F');

  // ══════════════════════════════════════════════════════════════════
  // PAGE 2: TABLE OF CONTENTS
  // ══════════════════════════════════════════════════════════════════

  const tocPageNum = 2;
  currentPage = 2;
  doc.addPage();
  let yPos = addPageWithBranding(true);

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.navy);
  doc.text('Table of Contents', margin, yPos + 15);

  // Blue accent underline
  doc.setFillColor(...BRAND.primary);
  doc.rect(margin, yPos + 19, 50, 2, 'F');

  const tocYStart = yPos + 35;

  // ══════════════════════════════════════════════════════════════════
  // SECTION 1: EXECUTIVE SUMMARY
  // ══════════════════════════════════════════════════════════════════

  yPos = addPageWithBranding();
  yPos = drawSectionHeading('Executive Summary', yPos, '01');

  if (data.executiveDashboard) {
    const dash = data.executiveDashboard;

    // 4 KPI Cards in a 2x2 grid
    const cardW = (contentWidth - 8) / 2;
    const cardH = 34;
    const totalVal = dash.totalAnnualValue || 0;

    const kpis = [
      { label: 'Revenue Growth', value: formatCurrency(dash.totalRevenueBenefit || 0), pct: pctOfTotal(dash.totalRevenueBenefit || 0), color: BRAND.revenue },
      { label: 'Cost Savings', value: formatCurrency(dash.totalCostBenefit || 0), pct: pctOfTotal(dash.totalCostBenefit || 0), color: BRAND.cost },
      { label: 'Cash Flow Impact', value: formatCurrency(dash.totalCashFlowBenefit || 0), pct: pctOfTotal(dash.totalCashFlowBenefit || 0), color: BRAND.cashflow },
      { label: 'Risk Mitigation', value: formatCurrency(dash.totalRiskBenefit || 0), pct: pctOfTotal(dash.totalRiskBenefit || 0), color: BRAND.risk },
    ];

    kpis.forEach((kpi, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (cardW + 8);
      const y = yPos + row * (cardH + 6);
      drawKPICard(x, y, cardW, cardH, kpi.label, kpi.value, kpi.pct, kpi.color);
    });

    yPos += 2 * (cardH + 6) + 10;

    // Value breakdown chart
    yPos = drawBenefitChart(yPos, dash);

    // Top 5 Use Cases table
    if (dash.topUseCases && dash.topUseCases.length > 0) {
      yPos = ensureSpace(100, yPos);
      yPos = drawSubHeading('Top Priority AI Use Cases', yPos);

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
        ...TABLE_STYLES,
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 95, halign: 'left' },
          2: { cellWidth: 32, halign: 'right' },
          3: { cellWidth: 33, halign: 'right' },
        },
        tableWidth: contentWidth,
        margin: { left: margin, right: margin },
        didDrawPage: autoTablePageCallback,
      });
      yPos = (doc as any).lastAutoTable.finalY + 15;
    }
  }

  // Executive narrative (summary)
  if (data.summary) {
    yPos = ensureSpace(60, yPos);
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
          if (line.includes('---')) continue;
          const cells = line.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim());
          if (cells.length >= 2) {
            tableRows.push(cells);
            inTable = true;
            continue;
          }
        } else if (inTable && tableRows.length > 0) {
          yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
          autoTable(doc, {
            startY: yPos,
            head: tableRows.length > 1 ? [tableRows[0]] : undefined,
            body: tableRows.length > 1 ? tableRows.slice(1) : tableRows,
            theme: 'plain',
            ...TABLE_STYLES,
            tableWidth: contentWidth,
            margin: { left: margin, right: margin },
          });
          yPos = (doc as any).lastAutoTable.finalY + 10;
          tableRows.length = 0;
          inTable = false;
        }

        // ### headers
        const h3Match = line.match(/^###\s*(.+)$/);
        if (h3Match) {
          yPos = ensureSpace(20, yPos);
          const headerText = h3Match[1].replace(/[⚠️]/g, '').trim();
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          if (line.includes('Portfolio Risk') || line.includes('Critical')) {
            doc.setTextColor(...BRAND.cashflow);
          } else {
            doc.setTextColor(...BRAND.navy);
          }
          doc.text(headerText, margin, yPos);
          // Subtle underline
          doc.setDrawColor(...BRAND.borderLight);
          doc.setLineWidth(0.3);
          doc.line(margin, yPos + 3, margin + Math.min(doc.getTextWidth(headerText), contentWidth), yPos + 3);
          yPos += 12;
          continue;
        }

        // Big headline numbers
        if (line.startsWith('**') && line.includes('annual value')) {
          yPos = ensureSpace(16, yPos);
          const cleanLine = line.replace(/\*\*/g, '');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...BRAND.primary);
          doc.text(cleanLine, margin, yPos);
          yPos += 12;
          continue;
        }

        // Use case headers **[Name]** — $X.XM
        const useCaseMatch = line.match(/^\*\*([^*]+)\*\*\s*[—–-]\s*\$?([\d.,]+[MKB]?)/);
        if (useCaseMatch) {
          yPos = ensureSpace(14, yPos);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...BRAND.navy);
          doc.text(`${useCaseMatch[1]} — $${useCaseMatch[2]}`, margin, yPos);
          yPos += 8;
          continue;
        }

        // Bold text patterns **label**: text
        const boldMatch = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
        if (boldMatch) {
          yPos = ensureSpace(12, yPos);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...BRAND.navy);
          doc.text(boldMatch[1] + ':', margin, yPos);
          yPos += 7;

          if (boldMatch[2]) {
            yPos = drawParagraph(boldMatch[2], yPos, { indent: 4 });
          }
          continue;
        }

        // Regular paragraph text
        yPos = drawParagraph(line, yPos);
      }

      // Render any remaining table
      if (tableRows.length > 0) {
        yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
        autoTable(doc, {
          startY: yPos,
          head: tableRows.length > 1 ? [tableRows[0]] : undefined,
          body: tableRows.length > 1 ? tableRows.slice(1) : tableRows,
          theme: 'plain',
          ...TABLE_STYLES,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      }

      yPos += 6;
    }
    yPos += 8;
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 2: FINANCIAL SENSITIVITY ANALYSIS
  // ══════════════════════════════════════════════════════════════════

  yPos = addPageWithBranding();
  yPos = drawSectionHeading('Financial Sensitivity Analysis', yPos, '02');

  if (data.analysisData && data.analysisData.scenarioAnalysis) {
    // Intro text
    yPos = drawParagraph(
      'This analysis models three adoption scenarios to provide a range of expected outcomes. Each scenario reflects different assumptions about organizational readiness, adoption speed, and benefit realization.',
      yPos,
    );
    yPos += 4;

    const scenarios = data.analysisData.scenarioAnalysis;

    // 3 Scenario Cards side by side
    const cardW = (contentWidth - 12) / 3;
    const cardH = 120;
    yPos = ensureSpace(cardH + 10, yPos);

    const scenarioConfigs = [
      {
        label: 'Conservative',
        color: BRAND.scenarioConservative,
        bgColor: BRAND.scenarioConservativeBg,
        isHighlighted: false,
        adoption: '70% of use cases',
        timeline: '18-month ramp',
        realization: '75% of projected',
        annualBenefit: typeof scenarios.conservative?.annualBenefit === 'string' ? scenarios.conservative.annualBenefit : formatCurrency(scenarios.conservative?.annualBenefit || 0),
        npv: typeof scenarios.conservative?.npv === 'string' ? scenarios.conservative.npv : formatCurrency(scenarios.conservative?.npv || 0),
      },
      {
        label: 'Base Case',
        color: BRAND.scenarioBase,
        bgColor: BRAND.scenarioBaseBg,
        isHighlighted: true,
        adoption: '85% of use cases',
        timeline: '12-month ramp',
        realization: '100% of projected',
        annualBenefit: typeof scenarios.moderate?.annualBenefit === 'string' ? scenarios.moderate.annualBenefit : formatCurrency(scenarios.moderate?.annualBenefit || 0),
        npv: typeof scenarios.moderate?.npv === 'string' ? scenarios.moderate.npv : formatCurrency(scenarios.moderate?.npv || 0),
      },
      {
        label: 'Optimistic',
        color: BRAND.scenarioOptimistic,
        bgColor: BRAND.scenarioOptimisticBg,
        isHighlighted: false,
        adoption: '95%+ of use cases',
        timeline: '9-month ramp',
        realization: '125% of projected',
        annualBenefit: typeof scenarios.aggressive?.annualBenefit === 'string' ? scenarios.aggressive.annualBenefit : formatCurrency(scenarios.aggressive?.annualBenefit || 0),
        npv: typeof scenarios.aggressive?.npv === 'string' ? scenarios.aggressive.npv : formatCurrency(scenarios.aggressive?.npv || 0),
      },
    ];

    scenarioConfigs.forEach((cfg, i) => {
      const x = margin + i * (cardW + 6);
      drawScenarioCard(x, yPos, cardW, cardH, cfg);
    });

    yPos += cardH + 14;

    // Scenario definitions table
    yPos = ensureSpace(80, yPos);
    yPos = drawSubHeading('Scenario Definitions', yPos);

    const defTableData = [
      ['Conservative', '70% adoption, 18-month ramp, 75% benefit realization', 'Slower organizational change, extended learning curves'],
      ['Base Case', '85% adoption, 12-month ramp, 100% benefit realization', 'Standard implementation with normal change management'],
      ['Optimistic', '95%+ adoption, 9-month ramp, 125% benefit realization', 'Strong executive sponsorship, accelerated rollout with network effects'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Scenario', 'Parameters', 'Assumptions']],
      body: defTableData,
      theme: 'plain',
      ...TABLE_STYLES,
      columnStyles: {
        0: { cellWidth: 32, fontStyle: 'bold' },
        1: { cellWidth: 60 },
        2: { cellWidth: contentWidth - 92 },
      },
      tableWidth: contentWidth,
      margin: { left: margin, right: margin },
      didDrawPage: autoTablePageCallback,
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Comparison metrics table
    yPos = ensureSpace(60, yPos);
    yPos = drawSubHeading('Metric Comparison', yPos);

    const metricsTableData = [
      ['Annual Benefit', scenarioConfigs[0].annualBenefit, scenarioConfigs[1].annualBenefit, scenarioConfigs[2].annualBenefit],
      ['5-Year NPV', scenarioConfigs[0].npv, scenarioConfigs[1].npv, scenarioConfigs[2].npv],
      ['IRR', 'N/A', data.analysisData.multiYearProjection?.irr || 'N/A', 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Conservative', 'Base Case', 'Optimistic']],
      body: metricsTableData,
      theme: 'plain',
      headStyles: {
        ...TABLE_STYLES.headStyles,
        halign: 'center',
      },
      bodyStyles: {
        ...TABLE_STYLES.bodyStyles,
        halign: 'center',
      },
      alternateRowStyles: TABLE_STYLES.alternateRowStyles,
      styles: TABLE_STYLES.styles,
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold', halign: 'left' },
        1: { cellWidth: (contentWidth - 40) / 3 },
        2: { cellWidth: (contentWidth - 40) / 3, fontStyle: 'bold' },
        3: { cellWidth: (contentWidth - 40) / 3 },
      },
      tableWidth: contentWidth,
      margin: { left: margin, right: margin },
      didDrawPage: autoTablePageCallback,
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // ══════════════════════════════════════════════════════════════════
  // SECTION 3: VALUE DRIVERS
  // ══════════════════════════════════════════════════════════════════

  if (data.executiveDashboard) {
    const dash = data.executiveDashboard;
    const total = dash.totalAnnualValue || 0;

    yPos = addPageWithBranding();
    yPos = drawSectionHeading('Value Drivers', yPos, '03');

    yPos = drawParagraph(
      'Breakdown of total value opportunity by benefit pillar, showing the contribution of each value driver to the overall annual impact.',
      yPos,
    );
    yPos += 6;

    const drivers = [
      { label: 'Revenue Growth', value: dash.totalRevenueBenefit || 0, color: BRAND.revenue, desc: 'New revenue streams, market expansion, and customer value optimization through AI-driven insights.' },
      { label: 'Cost Savings', value: dash.totalCostBenefit || 0, color: BRAND.cost, desc: 'Operational efficiency, automation of manual processes, and reduction in waste through intelligent optimization.' },
      { label: 'Cash Flow Improvement', value: dash.totalCashFlowBenefit || 0, color: BRAND.cashflow, desc: 'Working capital optimization, faster collections, improved inventory turnover, and supply chain efficiency.' },
      { label: 'Risk Mitigation', value: dash.totalRiskBenefit || 0, color: BRAND.risk, desc: 'Reduced exposure to compliance, operational, and market risks through predictive analytics and monitoring.' },
    ];

    // 2x2 driver cards
    const driverCardW = (contentWidth - 8) / 2;
    const driverCardH = 60;

    drivers.forEach((driver, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + col * (driverCardW + 8);
      const y = yPos + row * (driverCardH + 8);

      // Ensure space
      if (row === 1 && i === 2) {
        const neededY = yPos + driverCardH + 8;
        if (neededY + driverCardH + 8 > pageHeight - 20) {
          yPos = addPageWithBranding();
        }
      }

      // Card with colored left border
      doc.setFillColor(...BRAND.white);
      doc.setDrawColor(...BRAND.borderLight);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, driverCardW, driverCardH, 4, 4, 'FD');

      // Colored left bar
      doc.setFillColor(...driver.color);
      doc.rect(x, y + 4, 3, driverCardH - 8, 'F');

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...driver.color);
      doc.text(driver.label, x + 10, y + 12);

      // Value + %
      const pct = total > 0 ? ((driver.value / total) * 100).toFixed(0) : '0';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(formatCurrency(driver.value), x + 10, y + 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.textMuted);
      doc.text(`${pct}% of total`, x + 10, y + 34);

      // Progress bar
      const barX = x + 10;
      const barY = y + 38;
      const barW = driverCardW - 20;
      doc.setFillColor(...BRAND.bgTertiary);
      doc.roundedRect(barX, barY, barW, 4, 1, 1, 'F');
      const filledW = total > 0 ? (barW * driver.value) / total : 0;
      if (filledW > 0) {
        doc.setFillColor(...driver.color);
        doc.roundedRect(barX, barY, Math.max(filledW, 2), 4, 1, 1, 'F');
      }

      // Description text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.textTertiary);
      const descLines = doc.splitTextToSize(driver.desc, driverCardW - 20);
      doc.text(descLines[0] || '', x + 10, y + 50);
      if (descLines[1]) {
        doc.text(descLines[1], x + 10, y + 55);
      }
    });

    yPos += 2 * (driverCardH + 8) + 10;
  }

  // ══════════════════════════════════════════════════════════════════
  // STEPS 0–7: Data sections
  // ══════════════════════════════════════════════════════════════════

  const stepSectionNumbers: Record<number, string> = {
    0: '04', 1: '05', 2: '06', 3: '07', 4: '08', 5: '09', 6: '10', 7: '11',
  };

  for (const step of data.steps) {
    const hasContent = step.content || (step.data && step.data.length > 0);
    if (!hasContent) continue;

    yPos = addPageWithBranding();
    const sectionNum = stepSectionNumbers[step.step] || '';
    yPos = drawSectionHeading(`${step.title}`, yPos, sectionNum);

    // Step 0: Company Overview — rich markdown parsing
    if (step.step === 0 && step.content) {
      const content = sanitizeForPDF(step.content);
      const majorSections = content.split(/\n---\n|\n-{3,}\n/);

      for (const majorSection of majorSections) {
        if (!majorSection.trim()) continue;

        const lines = majorSection.trim().split('\n');
        let inTable = false;
        const tableRows: string[][] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Markdown tables
          if (line.startsWith('|')) {
            if (line.includes('---')) continue;
            const cells = line.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim());
            if (cells.length >= 2) {
              tableRows.push(cells);
              inTable = true;
              continue;
            }
          } else if (inTable && tableRows.length > 0) {
            yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
            autoTable(doc, {
              startY: yPos,
              body: tableRows,
              theme: 'plain',
              ...TABLE_STYLES,
              columnStyles: {
                0: { textColor: BRAND.textTertiary, fontStyle: 'normal' as const, cellWidth: 50 },
                1: { textColor: BRAND.navy, fontStyle: 'bold' as const, cellWidth: contentWidth - 50 },
              },
              tableWidth: contentWidth,
              margin: { left: margin, right: margin },
            });
            yPos = (doc as any).lastAutoTable.finalY + 10;
            tableRows.length = 0;
            inTable = false;
          }

          // ### headers
          const markdownH3Match = line.match(/^###\s*(.+)$/);
          if (markdownH3Match) {
            yPos = ensureSpace(20, yPos);
            const headerText = markdownH3Match[1].replace(/[⚠️]/g, '').trim();
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            if (line.includes('Critical Assumptions')) {
              doc.setTextColor(...BRAND.cashflow);
            } else {
              doc.setTextColor(...BRAND.navy);
            }
            doc.text(headerText, margin, yPos);
            doc.setDrawColor(...BRAND.borderLight);
            doc.setLineWidth(0.3);
            doc.line(margin, yPos + 3, margin + Math.min(doc.getTextWidth(headerText), contentWidth), yPos + 3);
            yPos += 12;
            continue;
          }

          // Main headers (legacy)
          const mainHeaderMatch = line.match(/^\*\*(Company Profile|Key Business Challenges)\*\*$/);
          if (mainHeaderMatch) {
            yPos = ensureSpace(20, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...BRAND.navy);
            doc.text(mainHeaderMatch[1], margin, yPos);
            doc.setDrawColor(...BRAND.borderLight);
            doc.setLineWidth(0.3);
            doc.line(margin, yPos + 3, margin + doc.getTextWidth(mainHeaderMatch[1]), yPos + 3);
            yPos += 12;
            continue;
          }

          // Ticker/HQ line
          if (!line.startsWith('**') && line.includes(' | ') && !line.startsWith('|')) {
            yPos = ensureSpace(10, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...BRAND.textTertiary);
            doc.text(line, margin, yPos);
            yPos += 8;
            continue;
          }

          // Big numbers (revenue/earnings)
          if (line.includes('**') && (line.includes('revenue') || line.includes('earnings') || line.includes('Revenue') || line.includes('Earnings'))) {
            yPos = ensureSpace(16, yPos);
            const cleanLine = line.replace(/\*\*/g, '');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...BRAND.primary);
            doc.text(cleanLine, margin, yPos);
            yPos += 12;
            continue;
          }

          // Challenge headers
          const challengeMatch = line.match(/^\*\*([^*]+)\*\*$/);
          if (challengeMatch) {
            yPos = ensureSpace(14, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.navy);
            doc.text(challengeMatch[1], margin, yPos);
            yPos += 8;
            continue;
          }

          // Bold text
          const boldMatch = line.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
          if (boldMatch) {
            yPos = ensureSpace(14, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.navy);
            doc.text(boldMatch[1], margin, yPos);
            yPos += 8;
            if (boldMatch[2]) {
              yPos = drawParagraph(boldMatch[2], yPos, { indent: 4 });
            }
            continue;
          }

          // Regular text
          yPos = drawParagraph(line, yPos);
        }

        // Remaining table
        if (tableRows.length > 0) {
          yPos = ensureSpace(tableRows.length * 12 + 10, yPos);
          autoTable(doc, {
            startY: yPos,
            body: tableRows,
            theme: 'plain',
            ...TABLE_STYLES,
            columnStyles: {
              0: { textColor: BRAND.textTertiary, fontStyle: 'normal' as const, cellWidth: 50 },
              1: { textColor: BRAND.navy, fontStyle: 'bold' as const, cellWidth: contentWidth - 50 },
            },
            tableWidth: contentWidth,
            margin: { left: margin, right: margin },
          });
          yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        yPos += 6;
      }
      yPos += 8;
    }
    // Other steps with content (non-step-0)
    else if (step.content) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.textSecondary);
      const sanitizedContent = sanitizeForPDF(step.content);
      const contentLines = doc.splitTextToSize(sanitizedContent, contentWidth - 10);
      for (const line of contentLines) {
        yPos = ensureSpace(7, yPos);
        doc.text(line, margin, yPos);
        yPos += 6;
      }
      yPos += 10;
    }

    // Data tables for step
    if (step.data && step.data.length > 0) {
      const isBenefitsStep = step.step === 5;
      const isStep1 = step.step === 1;
      const isStep2 = step.step === 2;
      const isStep3 = step.step === 3;
      const isStep6 = step.step === 6;
      const isNarrativeStep = step.step === 1 || step.step === 2 || step.step === 3;
      const allColumns = Object.keys(step.data[0]);
      const formulaColumns = allColumns.filter(k => k.includes('Formula'));
      const displayColumns = allColumns.filter(k => !k.includes('Formula'));

      let limitedColumns: string[] = [];
      if (isStep1) {
        limitedColumns = ['Strategic Theme', 'Current State', 'Target State', 'Primary Driver', 'Secondary Driver'];
      } else if (isStep2) {
        limitedColumns = ['KPI Name', 'Function', 'Sub-Function', 'Baseline Value', 'Direction', 'Target Value', 'Benchmark (Avg)', 'Benchmark (Industry Best)', 'Benchmark (Overall Best)', 'Timeframe', 'Strategic Theme'];
      } else if (isStep3) {
        limitedColumns = ['Friction Point', 'Function', 'Sub-Function', 'Role', 'Estimated Annual Cost ($)', 'Severity', 'Primary Driver Impact', 'Strategic Theme'];
      } else if (isStep6) {
        limitedColumns = ['ID', 'Use Case Name', 'Time-to-Value', 'Data Readiness', 'Integration Complexity', 'Readiness Score', 'Change Mgmt', 'Monthly Tokens', 'Runs/Month', 'Input Tokens/Run', 'Output Tokens/Run'];
      } else {
        const maxCols = isNarrativeStep ? 4 : 6;
        limitedColumns = displayColumns.slice(0, maxCols);
      }

      const cellCharLimit = isNarrativeStep ? 120 : 60;
      const truncationLimit = isNarrativeStep ? 100 : 45;

      let rows: any[] = [];
      let groupedData: any = null;

      if (isStep3) {
        groupedData = {};
        for (const row of step.data) {
          const theme = row['Strategic Theme'] || 'Other';
          if (!groupedData[theme]) groupedData[theme] = [];
          groupedData[theme].push(row);
        }

        for (const theme in groupedData) {
          rows.push([theme, '', '', '', '', '', '', '']);
          for (const row of groupedData[theme]) {
            rows.push(
              limitedColumns.map(col => {
                const val = row[col];
                if (typeof val === 'number' && col.toLowerCase().includes('$')) return formatCurrency(val);
                if (typeof val === 'number' && val > 1000) return formatNumber(val);
                return sanitizeForPDF(String(val || '')).substring(0, cellCharLimit);
              })
            );
          }
        }
      } else {
        rows = step.data.map((row: any) =>
          limitedColumns.map(col => {
            const val = row[col];
            if (typeof val === 'number' && col.toLowerCase().includes('$')) return formatCurrency(val);
            if (typeof val === 'number' && val > 1000) return formatNumber(val);
            return sanitizeForPDF(String(val || '')).substring(0, cellCharLimit);
          })
        );
      }

      yPos = ensureSpace(40, yPos);

      const colCount = limitedColumns.length;
      const strictColStyles: any = {};
      let tableFontSize = 9;
      let tableHeadFontSize = 8;

      if (isStep2 || isStep6) {
        tableFontSize = 7;
        tableHeadFontSize = 7;
      } else if (isStep3) {
        tableFontSize = 8;
        tableHeadFontSize = 8;
      }

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
      } else if (isStep2) {
        const colWidth = Math.floor(contentWidth / colCount);
        limitedColumns.forEach((col: string, idx: number) => {
          let width = colWidth;
          if (col.includes('KPI Name') || col.includes('Function')) width = colWidth * 1.2;
          strictColStyles[idx] = { cellWidth: width, halign: 'center', overflow: 'linebreak' };
        });
      } else if (isStep3) {
        const colWidth = Math.floor(contentWidth / colCount);
        limitedColumns.forEach((col: string, idx: number) => {
          let width = colWidth;
          if (col === 'Friction Point' || col === 'Function' || col === 'Sub-Function' || col === 'Strategic Theme') width = colWidth * 1.3;
          strictColStyles[idx] = { cellWidth: width, halign: 'left', overflow: 'linebreak' };
        });
      } else if (isStep6) {
        const colWidth = Math.floor(contentWidth / colCount);
        limitedColumns.forEach((col: string, idx: number) => {
          let width = colWidth;
          if (col === 'Use Case Name') width = colWidth * 1.5;
          strictColStyles[idx] = { cellWidth: width, halign: 'center', overflow: 'linebreak' };
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

      // Step 3 with theme grouping
      if (isStep3 && groupedData) {
        const tableBody: any[] = [];
        for (const theme in groupedData) {
          tableBody.push({
            content: theme,
            colSpan: limitedColumns.length,
            styles: {
              fontStyle: 'bold',
              fillColor: BRAND.bgTertiary,
              textColor: BRAND.navy,
              fontSize: 9,
              cellPadding: 4,
            },
          });
          for (const row of groupedData[theme]) {
            tableBody.push(
              limitedColumns.map(col => {
                const val = row[col];
                if (typeof val === 'number' && col.toLowerCase().includes('$')) return formatCurrency(val);
                if (typeof val === 'number' && val > 1000) return formatNumber(val);
                return sanitizeForPDF(String(val || '')).substring(0, cellCharLimit);
              })
            );
          }
        }

        autoTable(doc, {
          startY: yPos,
          head: [truncatedHeaders],
          body: tableBody,
          theme: 'plain',
          showHead: 'everyPage',
          headStyles: {
            fillColor: BRAND.bgSecondary,
            textColor: BRAND.navy,
            fontStyle: 'bold',
            fontSize: tableHeadFontSize,
            cellPadding: 3,
            halign: 'left',
          },
          bodyStyles: {
            fontSize: tableFontSize,
            cellPadding: 3,
            textColor: BRAND.textSecondary,
            halign: 'left',
            lineColor: BRAND.borderLight,
            lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
          },
          alternateRowStyles: { fillColor: BRAND.bgSecondary },
          styles: {
            overflow: 'linebreak',
            lineColor: BRAND.borderLight,
            lineWidth: 0,
            minCellHeight: 8,
          },
          columnStyles: strictColStyles,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didDrawPage: autoTablePageCallback,
        });
      } else {
        // Standard autoTable for other steps
        autoTable(doc, {
          startY: yPos,
          head: [truncatedHeaders],
          body: isNarrativeStep ? rows : truncatedRows,
          theme: 'plain',
          showHead: 'everyPage',
          headStyles: {
            fillColor: BRAND.bgSecondary,
            textColor: BRAND.navy,
            fontStyle: 'bold',
            fontSize: isNarrativeStep ? 9 : tableHeadFontSize,
            cellPadding: isNarrativeStep ? 4 : 3,
            halign: isNarrativeStep ? 'left' : 'center',
          },
          bodyStyles: {
            fontSize: isNarrativeStep ? 9 : tableFontSize,
            cellPadding: isNarrativeStep ? 4 : 3,
            textColor: BRAND.textSecondary,
            halign: isNarrativeStep ? 'left' : 'center',
            lineColor: BRAND.borderLight,
            lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
          },
          alternateRowStyles: { fillColor: BRAND.bgSecondary },
          styles: {
            overflow: 'linebreak',
            lineColor: BRAND.borderLight,
            lineWidth: 0,
            minCellHeight: isNarrativeStep ? 12 : 8,
          },
          columnStyles: strictColStyles,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didDrawPage: autoTablePageCallback,
        });
      }
      yPos = (doc as any).lastAutoTable.finalY + 20;

      // Benefits step: render the full multi-dimensional benefits table
      if (isBenefitsStep) {
        const benefitColumns = ['ID', 'Use Case', 'Cost Benefit ($)', 'Revenue Benefit ($)', 'Cash Flow Benefit ($)', 'Risk Benefit ($)', 'Total Annual Value ($)', 'Probability of Success'];
        const benefitRows = step.data.map((row: any) =>
          benefitColumns.map(col => {
            const val = row[col];
            if (typeof val === 'number' && col.toLowerCase().includes('$')) return formatCurrency(val);
            if (typeof val === 'number' && (col.toLowerCase().includes('probability') || col.toLowerCase().includes('rate'))) return `${(val * 100).toFixed(0)}%`;
            if (typeof val === 'number' && val > 1000) return formatNumber(val);
            return sanitizeForPDF(String(val || '')).substring(0, 60);
          })
        );

        yPos = ensureSpace(120, yPos);

        const benefitColCount = benefitColumns.length;
        const benefitColStyles: any = {};
        const benefitColWidth = Math.floor(contentWidth / benefitColCount);

        benefitColumns.forEach((col: string, idx: number) => {
          let width = benefitColWidth;
          if (col === 'Use Case') width = benefitColWidth * 1.5;
          else if (col === 'ID') width = benefitColWidth * 0.8;
          benefitColStyles[idx] = { cellWidth: width, halign: 'right', overflow: 'linebreak' };
        });

        autoTable(doc, {
          startY: yPos,
          head: [benefitColumns.map((h: string) => String(h).substring(0, 20))],
          body: benefitRows,
          theme: 'plain',
          showHead: 'everyPage',
          headStyles: {
            fillColor: BRAND.bgSecondary,
            textColor: BRAND.navy,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 2,
            halign: 'center',
          },
          bodyStyles: {
            fontSize: 8,
            cellPadding: 2,
            textColor: BRAND.textSecondary,
            halign: 'right',
            lineColor: BRAND.borderLight,
            lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
          },
          alternateRowStyles: { fillColor: BRAND.bgSecondary },
          styles: {
            overflow: 'linebreak',
            lineColor: BRAND.borderLight,
            lineWidth: 0,
            minCellHeight: 8,
          },
          columnStyles: benefitColStyles,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didDrawPage: autoTablePageCallback,
        });
        yPos = (doc as any).lastAutoTable.finalY + 20;
      }

      // Formula columns for benefits step
      if (isBenefitsStep && formulaColumns.length > 0) {
        yPos = addPageWithBranding();
        yPos = drawSubHeading('Benefit Calculation Formulas', yPos);
        yPos += 4;

        const formulaTableColumns = ['ID', 'Use Case', ...formulaColumns.slice(0, 2)];
        const formulaRows = step.data.map((row: any) =>
          [
            row['ID'] || '',
            String(row['Use Case'] || '').substring(0, 40),
            ...formulaColumns.slice(0, 2).map(col => sanitizeForPDF(String(row[col] || 'N/A')).substring(0, 80)),
          ]
        );

        const fColCount = formulaTableColumns.length;
        const fColStyles: any = {
          0: { cellWidth: 12, halign: 'center', overflow: 'linebreak' },
          1: { cellWidth: 45, halign: 'left', overflow: 'linebreak' },
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
            fillColor: BRAND.bgSecondary,
            textColor: BRAND.navy,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: 3,
            halign: 'center',
          },
          bodyStyles: {
            fontSize: 8,
            cellPadding: 3,
            textColor: BRAND.textSecondary,
            minCellHeight: 10,
            lineColor: BRAND.borderLight,
            lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
          },
          alternateRowStyles: { fillColor: BRAND.bgSecondary },
          styles: {
            overflow: 'linebreak',
            lineColor: BRAND.borderLight,
            lineWidth: 0,
          },
          columnStyles: fColStyles,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didDrawPage: autoTablePageCallback,
        });
        yPos = (doc as any).lastAutoTable.finalY + 20;
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // APPENDIX: STANDARDIZED ROLES REFERENCE
  // ══════════════════════════════════════════════════════════════════

  yPos = addPageWithBranding();
  yPos = drawSectionHeading('Appendix: Standardized Roles Reference', yPos, '12');

  const standardRolesData = [
    ['Store Associate', 'Operations', '$28/hr', 'Store Operations, Fulfillment'],
    ['Sales Specialist', 'Sales', '$42/hr', 'Sales, Customer Service'],
    ['Merchandiser', 'Merchandising', '$35/hr', 'Merchandising, Supply Chain'],
    ['Analyst - Category', 'Analysis', '$52/hr', 'Category Management, Planning'],
    ['Project Manager', 'Delivery', '$65/hr', 'Implementation, Integration'],
    ['Data Engineer', 'Technical', '$85/hr', 'Data Integration, APIs'],
    ['Business Analyst', 'Analysis', '$72/hr', 'Process, Requirements'],
    ['Finance Manager', 'Finance', '$58/hr', 'Finance, Planning & Analysis'],
  ];

  const roleHeaders = ['Role Name', 'Category', 'Loaded Rate', 'Function Mapping'];

  yPos = ensureSpace(100, yPos);

  autoTable(doc, {
    startY: yPos,
    head: [roleHeaders],
    body: standardRolesData,
    theme: 'plain',
    ...TABLE_STYLES,
    columnStyles: {
      0: { cellWidth: 50, halign: 'left' },
      1: { cellWidth: 40, halign: 'left' },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: contentWidth - 125, halign: 'left' },
    },
    tableWidth: contentWidth,
    margin: { left: margin, right: margin },
    didDrawPage: autoTablePageCallback,
  });
  yPos = (doc as any).lastAutoTable.finalY + 12;

  yPos = drawParagraph(
    'Loaded rates include full employer costs (benefits, payroll taxes, overhead allocation). These standardized roles serve as reference points for friction point costing and effort estimation across the organization.',
    yPos,
    { color: BRAND.textTertiary },
  );

  // ══════════════════════════════════════════════════════════════════
  // CTA PAGE: RECOMMENDED NEXT STEPS
  // ══════════════════════════════════════════════════════════════════

  yPos = addPageWithBranding();
  tocEntries.push({ title: 'Recommended Next Steps', page: currentPage });

  // Clean, professional CTA section
  const ctaY = 30;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.navy);
  doc.text('Recommended Next Steps', centerX, ctaY, { align: 'center' });

  // Accent underline
  doc.setFillColor(...BRAND.primary);
  doc.rect(centerX - 40, ctaY + 5, 80, 2, 'F');

  // Workshop card
  const workshopCardY = ctaY + 20;
  const workshopCardH = 120;
  doc.setFillColor(...BRAND.bgSecondary);
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(1);
  doc.roundedRect(margin, workshopCardY, contentWidth, workshopCardH, 8, 8, 'FD');

  // Workshop title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.primary);
  doc.text('BlueAlly 3-Day AI Use Case Workshop', centerX, workshopCardY + 22, { align: 'center' });

  // Workshop description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.textSecondary);
  const workshopDesc = 'Transform this strategic assessment into actionable AI initiatives with our expert-facilitated workshop designed to overcome common AI implementation pitfalls.';
  const descLines = doc.splitTextToSize(workshopDesc, contentWidth - 40);
  descLines.forEach((line: string, i: number) => {
    doc.text(line, centerX, workshopCardY + 35 + (i * 6), { align: 'center' });
  });

  // Benefits list
  const benefits = [
    'ROI-Focused: Link every AI use case to specific KPIs',
    'Rapid Prototyping: Target 90-day pilot cycles',
    'Executive Alignment: Cross-functional workshops',
    'Expert Partnership: 2.6x higher success rate',
    'Governance Built-In: Security and compliance from day one',
  ];

  let benefitY = workshopCardY + 58;
  doc.setFontSize(9);
  benefits.forEach((benefit) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND.textSecondary);
    // Bullet point
    doc.setFillColor(...BRAND.primary);
    doc.circle(margin + 18, benefitY - 1.5, 1.5, 'F');
    doc.text(benefit, margin + 24, benefitY);
    benefitY += 10;
  });

  // CTA button
  const ctaButtonY = workshopCardY + workshopCardH + 16;
  const btnW = 140;
  const btnH = 32;
  doc.setFillColor(...BRAND.primary);
  doc.roundedRect(centerX - btnW / 2, ctaButtonY, btnW, btnH, 6, 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.white);
  doc.text('Schedule Your AI Workshop', centerX, ctaButtonY + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('www.blueally.com', centerX, ctaButtonY + 24, { align: 'center' });

  // Confidential notice at bottom
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.textMuted);
  doc.text('This document is confidential and intended solely for the use of the intended recipient.', centerX, pageHeight - 30, { align: 'center' });
  doc.text(`© ${new Date().getFullYear()} BlueAlly. All rights reserved.`, centerX, pageHeight - 24, { align: 'center' });

  // ══════════════════════════════════════════════════════════════════
  // FILL IN TABLE OF CONTENTS (go back to page 2)
  // ══════════════════════════════════════════════════════════════════

  doc.setPage(tocPageNum);
  let tocY = tocYStart;

  tocEntries.forEach((entry) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.textSecondary);
    doc.text(entry.title, margin + 8, tocY);

    // Page number
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.primary);
    doc.text(`${entry.page}`, pageWidth - margin - 8, tocY, { align: 'right' });

    // Dot leader
    const titleWidth = doc.getTextWidth(entry.title);
    doc.setTextColor(...BRAND.borderLight);
    doc.setFont('helvetica', 'normal');
    const dotsWidth = contentWidth - titleWidth - 30;
    const dotCount = Math.max(Math.floor(dotsWidth / 3), 0);
    const dots = '.'.repeat(dotCount);
    doc.text(dots, margin + 12 + titleWidth, tocY);

    tocY += 12;
  });

  // ══════════════════════════════════════════════════════════════════
  // SAVE
  // ══════════════════════════════════════════════════════════════════

  doc.save(`BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.pdf`);
}
