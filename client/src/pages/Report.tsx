import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Loader2, CheckCircle2, Download, 
  RefreshCw, FileSpreadsheet, FileText, FileType, 
  ArrowLeft, Brain, Calculator, TrendingUp, TrendingDown, 
  DollarSign, ShieldCheck, Zap, Target, ChevronDown, ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType } from 'docx';
import blueAllyLogoUrl from '@assets/image_1764369352062.png';

const loadImageAsBase64 = (url: string): Promise<string> => {
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

interface ProgressUpdate {
  step: number;
  message: string;
  detail?: string;
}

export default function Report() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const companyName = params.get("company") || "Unknown Company";
  const { toast } = useToast();

  const [status, setStatus] = useState<"init" | "loading" | "complete">("init");
  const [data, setData] = useState<any>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ProgressUpdate | null>(null);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    if (status === "init") {
      fetchAnalysis();
    }
  }, []);

  const fetchAnalysis = async () => {
    try {
      setStatus("loading");
      setError(null);
      setCompletedSteps([]);
      
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set up SSE connection for progress updates
      const eventSource = new EventSource(`/api/progress/${sessionId}`);
      
      eventSource.onmessage = (event) => {
        try {
          const update: ProgressUpdate = JSON.parse(event.data);
          setCurrentStep(update);
          
          if (update.step > 0 && update.step < 100) {
            setCompletedSteps(prev => {
              if (!prev.includes(update.step - 1) && update.step > 1) {
                return [...prev, update.step - 1];
              }
              return prev;
            });
          }
          
          if (update.step === 100) {
            setCompletedSteps([0, 1, 2, 3, 4, 5, 6, 7, 8]);
            eventSource.close();
          }
          
          if (update.step === -1) {
            eventSource.close();
          }
        } catch (e) {
          console.error("Error parsing progress update:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, sessionId }),
      });

      eventSource.close();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate analysis");
      }

      const result = await response.json();
      
      setReportId(result.id);
      setData(result.data);
      setStatus("complete");
      setCompletedSteps([0, 1, 2, 3, 4, 5, 6, 7, 8]);

      if (result.isNew) {
        toast({
          title: "Analysis Complete",
          description: "Your strategic analysis has been generated and saved.",
        });
      } else {
        toast({
          title: "Report Retrieved",
          description: "Loaded existing analysis for this company.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("complete");
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: err instanceof Error ? err.message : "Unable to generate analysis. Please try again.",
      });
    }
  };

  const regenerateAnalysis = async () => {
    if (!reportId) return;

    try {
      setStatus("loading");
      setError(null);
      setCompletedSteps([]);
      
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const eventSource = new EventSource(`/api/progress/${sessionId}`);
      
      eventSource.onmessage = (event) => {
        try {
          const update: ProgressUpdate = JSON.parse(event.data);
          setCurrentStep(update);
          if (update.step === 100 || update.step === -1) {
            eventSource.close();
          }
        } catch (e) {
          console.error("Error parsing progress update:", e);
        }
      };

      const response = await fetch(`/api/regenerate/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, sessionId }),
      });

      eventSource.close();

      if (!response.ok) {
        throw new Error("Failed to regenerate analysis");
      }

      const result = await response.json();
      
      setData(result.data);
      setStatus("complete");
      setCompletedSteps([0, 1, 2, 3, 4, 5, 6, 7, 8]);

      toast({
        title: "Analysis Refreshed",
        description: "Your report has been regenerated with latest insights.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("complete");
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Unable to regenerate analysis. Please try again.",
      });
    }
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
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${addCommas(Math.round(value))}`;
    }
    return `$${addCommas(Math.round(value))}`;
  };

  const formatNumber = (value: number | string): string => {
    if (typeof value === 'string') {
      const num = parseFloat(value.replace(/[,]/g, ''));
      if (isNaN(num)) return value;
      value = num;
    }
    if (typeof value !== 'number' || isNaN(value)) return '0';
    if (value >= 1000000000) {
      return `${(value / 1000000000).toFixed(1)}B`;
    } else if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    return addCommas(Math.round(value));
  };

  // BlueAlly Brand Colors - Board Presentation Standard
  const BRAND = {
    primaryBlue: [0, 18, 120] as [number, number, number],     // #001278
    lightBlue: [2, 162, 250] as [number, number, number],       // #02a2fd
    darkNavy: [4, 8, 34] as [number, number, number],           // #040822
    green: [54, 191, 120] as [number, number, number],          // #36bf78
    white: [255, 255, 255] as [number, number, number],
    lightBlueBg: [205, 229, 241] as [number, number, number],   // #cde5f1
    gray: [80, 80, 80] as [number, number, number],
    lightGray: [248, 250, 252] as [number, number, number],
  };

  // PDF Generation - Board-Level Presentation Standard
  const generatePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    const centerX = pageWidth / 2;
    let currentPage = 1;
    const tocEntries: { title: string; page: number }[] = [];
    
    // Set professional font
    doc.setFont('helvetica');

    // Helper: Add page with header/footer - Board Standard
    const addPageWithBranding = (isFirst = false) => {
      if (!isFirst) {
        doc.addPage();
        currentPage++;
      }
      
      // Clean header bar
      doc.setFillColor(...BRAND.primaryBlue);
      doc.rect(0, 0, pageWidth, 14, 'F');
      
      // Centered header text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.white);
      doc.text('BlueAlly  |  AI Strategic Assessment', centerX, 9, { align: 'center' });
      
      // Clean footer
      doc.setFillColor(...BRAND.primaryBlue);
      doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.white);
      doc.text(`Page ${currentPage}`, centerX, pageHeight - 5, { align: 'center' });
      
      return 24;
    };

    // Helper: Check page space
    const ensureSpace = (neededHeight: number, currentY: number): number => {
      if (currentY + neededHeight > pageHeight - 30) {
        return addPageWithBranding();
      }
      return currentY;
    };

    // Helper: Centered section heading - Board Standard
    const drawSectionHeading = (title: string, yPos: number, addToToc = true): number => {
      yPos = ensureSpace(30, yPos);
      
      if (addToToc) {
        tocEntries.push({ title, page: currentPage });
      }
      
      // Centered heading with accent
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...BRAND.primaryBlue);
      doc.text(title, centerX, yPos + 12, { align: 'center' });
      
      // Centered underline accent
      const titleWidth = doc.getTextWidth(title);
      doc.setFillColor(...BRAND.lightBlue);
      doc.rect(centerX - titleWidth/2, yPos + 16, titleWidth, 2, 'F');
      
      return yPos + 28;
    };

    // Helper: Draw benefit chart - centered, no overlap
    const drawBenefitChart = (yPos: number, dash: any): number => {
      yPos = ensureSpace(100, yPos);
      
      const total = dash.totalAnnualValue || 1;
      const benefits = [
        { label: 'Revenue Growth', value: dash.totalRevenueBenefit, color: BRAND.green },
        { label: 'Cost Reduction', value: dash.totalCostBenefit, color: BRAND.lightBlue },
        { label: 'Cash Flow', value: dash.totalCashFlowBenefit, color: BRAND.primaryBlue },
        { label: 'Risk Mitigation', value: dash.totalRiskBenefit, color: [255, 153, 51] as [number, number, number] },
      ];
      
      // Centered title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...BRAND.darkNavy);
      doc.text('Value Distribution by Business Driver', centerX, yPos, { align: 'center' });
      yPos += 15;
      
      // Draw bars centered
      const barMaxWidth = 80;
      const labelWidth = 50;
      const valueWidth = 40;
      const rowHeight = 20;
      
      benefits.forEach((benefit, i) => {
        const percentage = (benefit.value / total) * 100;
        const barWidth = Math.max(10, (percentage / 100) * barMaxWidth);
        const rowY = yPos + (i * rowHeight);
        
        // Left-aligned label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(...BRAND.gray);
        doc.text(benefit.label, margin + 10, rowY + 12);
        
        // Centered bar
        doc.setFillColor(...benefit.color);
        doc.roundedRect(margin + labelWidth + 10, rowY + 4, barWidth, 14, 3, 3, 'F');
        
        // Right-aligned value
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...BRAND.darkNavy);
        doc.text(`${formatCurrency(benefit.value)} (${percentage.toFixed(0)}%)`, pageWidth - margin - 10, rowY + 12, { align: 'right' });
      });
      
      return yPos + (benefits.length * rowHeight) + 10;
    };

    // ===== COVER PAGE - Board Presentation Standard =====
    doc.setFillColor(...BRAND.darkNavy);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Top accent line
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(0, 0, pageWidth, 4, 'F');
    
    // Centered logo
    try {
      const logoBase64 = await loadImageAsBase64(blueAllyLogoUrl);
      doc.addImage(logoBase64, 'PNG', centerX - 45, 50, 90, 27);
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(40);
      doc.setTextColor(...BRAND.white);
      doc.text('BlueAlly', centerX, 70, { align: 'center' });
    }
    
    // Centered divider
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(centerX - 50, 85, 100, 2, 'F');
    
    // Centered title - larger font
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(...BRAND.white);
    doc.text('AI Strategic Assessment', centerX, 115, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.lightBlue);
    doc.text('Board Presentation', centerX, 135, { align: 'center' });
    
    // Centered company name box
    doc.setFillColor(...BRAND.primaryBlue);
    doc.roundedRect(centerX - 80, 155, 160, 40, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...BRAND.white);
    doc.text(companyName, centerX, 180, { align: 'center' });
    
    // Centered date
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(180, 190, 220);
    doc.text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), centerX, 215, { align: 'center' });
    
    // Centered value highlight
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
    
    // Centered footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(130, 140, 170);
    doc.text('BlueAlly Insight  |  Enterprise AI Advisory', centerX, pageHeight - 30, { align: 'center' });
    
    // Bottom accent
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(0, pageHeight - 4, pageWidth, 4, 'F');
    
    // ===== TABLE OF CONTENTS PAGE =====
    const tocPageNum = 2;
    currentPage = 2;
    doc.addPage();
    let yPos = addPageWithBranding(true);
    
    // Centered TOC heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...BRAND.primaryBlue);
    doc.text('Table of Contents', centerX, yPos + 15, { align: 'center' });
    
    // Centered underline
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(centerX - 50, yPos + 20, 100, 2, 'F');
    
    const tocYStart = yPos + 40;
    
    // ===== EXECUTIVE SUMMARY PAGE =====
    yPos = addPageWithBranding();
    yPos = drawSectionHeading('Executive Summary', yPos);
    
    // Centered metrics boxes
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      const boxWidth = 75;
      const boxHeight = 40;
      const gap = 15;
      const startX = centerX - boxWidth - gap/2;
      
      // Total Value box - centered
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
      
      // Value per Token box - centered
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
      
      // Benefit chart
      yPos = drawBenefitChart(yPos, dash);
      
      // Top Use Cases Table - Board Standard with proper text wrap
      if (dash.topUseCases && dash.topUseCases.length > 0) {
        yPos = ensureSpace(100, yPos);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...BRAND.primaryBlue);
        doc.text('Top Priority AI Use Cases', centerX, yPos, { align: 'center' });
        yPos += 10;
        
        // Fixed column widths that sum exactly to contentWidth (~170mm)
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
    
    // Summary narrative - centered, wrapped text
    if (data.summary) {
      yPos = ensureSpace(60, yPos);
      
      doc.setFillColor(...BRAND.lightBlueBg);
      doc.roundedRect(margin, yPos, contentWidth, 8, 3, 3, 'F');
      yPos += 18;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(...BRAND.darkNavy);
      const summaryLines = doc.splitTextToSize(data.summary, contentWidth - 10);
      
      for (const line of summaryLines) {
        yPos = ensureSpace(8, yPos);
        doc.text(line, centerX, yPos, { align: 'center', maxWidth: contentWidth - 10 });
        yPos += 7;
      }
      yPos += 15;
    }
    
    // ===== ANALYSIS STEPS - Board Presentation Standard =====
    for (const step of data.steps) {
      // Start each major step on a new page
      yPos = addPageWithBranding();
      yPos = drawSectionHeading(`Step ${step.step}: ${step.title}`, yPos);
      
      // Centered content description with larger font
      if (step.content) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(...BRAND.gray);
        const contentLines = doc.splitTextToSize(step.content, contentWidth - 20);
        for (const line of contentLines) {
          yPos = ensureSpace(8, yPos);
          doc.text(line, centerX, yPos, { align: 'center', maxWidth: contentWidth - 20 });
          yPos += 7;
        }
        yPos += 12;
      }
      
      if (step.data && step.data.length > 0) {
        const isBenefitsStep = step.step === 5;
        const allColumns = Object.keys(step.data[0]);
        const formulaColumns = allColumns.filter(k => k.includes('Formula'));
        const displayColumns = allColumns.filter(k => !k.includes('Formula'));
        
        // Limit columns for board readability - max 6 columns
        const maxCols = 6;
        const limitedColumns = displayColumns.slice(0, maxCols);
        
        const rows = step.data.map((row: any) => 
          limitedColumns.map(col => {
            const val = row[col];
            if (typeof val === 'number' && col.toLowerCase().includes('$')) {
              return formatCurrency(val);
            }
            if (typeof val === 'number' && val > 1000) {
              return formatNumber(val);
            }
            return String(val || '').substring(0, 60);
          })
        );
        
        yPos = ensureSpace(40, yPos);
        
        // Strictly calculate column widths to fit within contentWidth (~170mm)
        const colCount = limitedColumns.length;
        const fixedColWidth = Math.floor(contentWidth / colCount);
        const strictColStyles: any = {};
        
        limitedColumns.forEach((col: string, idx: number) => {
          if (idx === 0) {
            strictColStyles[idx] = { cellWidth: 12, halign: 'center' };
          } else if (col.toLowerCase().includes('use case') || col.toLowerCase().includes('description')) {
            strictColStyles[idx] = { cellWidth: Math.min(fixedColWidth * 1.8, 60), halign: 'left' };
          } else {
            strictColStyles[idx] = { cellWidth: fixedColWidth - 3, halign: 'center' };
          }
        });
        
        // Truncate cell values to prevent overflow
        const truncatedRows = rows.map((row: string[]) => 
          row.map((cell: string) => String(cell).substring(0, 45))
        );
        const truncatedHeaders = limitedColumns.map((h: string) => String(h).substring(0, 20));
        
        // Board-level table - strictly fits page width
        autoTable(doc, {
          startY: yPos,
          head: [truncatedHeaders],
          body: truncatedRows,
          theme: 'plain',
          headStyles: { 
            fillColor: BRAND.primaryBlue,
            textColor: BRAND.white,
            fontStyle: 'bold',
            fontSize: 9,
            cellPadding: 2,
            halign: 'center'
          },
          bodyStyles: { 
            fontSize: 9, 
            cellPadding: 2,
            textColor: BRAND.darkNavy,
            halign: 'center'
          },
          alternateRowStyles: { fillColor: [248, 250, 255] },
          styles: { 
            overflow: 'linebreak', 
            lineColor: [220, 225, 235],
            lineWidth: 0.5
          },
          columnStyles: strictColStyles,
          tableWidth: contentWidth,
          margin: { left: margin, right: margin },
          didDrawPage: () => {
            currentPage = doc.getNumberOfPages();
            // Re-add header/footer on new pages
            doc.setFillColor(...BRAND.primaryBlue);
            doc.rect(0, 0, pageWidth, 14, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.white);
            doc.text('BlueAlly  |  AI Strategic Assessment', centerX, 9, { align: 'center' });
            
            doc.setFillColor(...BRAND.primaryBlue);
            doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.white);
            doc.text(`Page ${currentPage}`, centerX, pageHeight - 5, { align: 'center' });
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 20;
        
        // Benefit Calculation Formulas - Board Standard
        if (isBenefitsStep && formulaColumns.length > 0) {
          yPos = addPageWithBranding();
          
          // Centered heading
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(...BRAND.primaryBlue);
          doc.text('Benefit Calculation Formulas', centerX, yPos + 10, { align: 'center' });
          
          doc.setFillColor(...BRAND.lightBlue);
          const headingWidth = doc.getTextWidth('Benefit Calculation Formulas');
          doc.rect(centerX - headingWidth/2, yPos + 14, headingWidth, 2, 'F');
          yPos += 30;
          
          // Formulas table - strict widths to fit page
          const formulaTableColumns = ['ID', 'Use Case', ...formulaColumns.slice(0, 2)]; // Limit to 4 columns max
          const formulaRows = step.data.map((row: any) => 
            [
              row['ID'] || '', 
              String(row['Use Case'] || '').substring(0, 35),
              ...formulaColumns.slice(0, 2).map(col => String(row[col] || 'N/A').substring(0, 40))
            ]
          );
          
          // Fixed widths: ID=10, UseCase=50, Formula cols share remaining
          const fColCount = formulaTableColumns.length;
          const fColStyles: any = {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 50, halign: 'left' }
          };
          const fRemainingWidth = contentWidth - 60;
          const fColWidth = Math.floor(fRemainingWidth / (fColCount - 2));
          for (let i = 2; i < fColCount; i++) {
            fColStyles[i] = { cellWidth: fColWidth, halign: 'left' };
          }
          
          autoTable(doc, {
            startY: yPos,
            head: [formulaTableColumns.map(h => String(h).substring(0, 18))],
            body: formulaRows,
            theme: 'plain',
            headStyles: { 
              fillColor: BRAND.primaryBlue,
              textColor: BRAND.white,
              fontStyle: 'bold',
              fontSize: 8,
              cellPadding: 2,
              halign: 'center'
            },
            bodyStyles: { 
              fontSize: 8, 
              cellPadding: 2,
              textColor: BRAND.darkNavy
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
              doc.setFillColor(...BRAND.primaryBlue);
              doc.rect(0, 0, pageWidth, 14, 'F');
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(10);
              doc.setTextColor(...BRAND.white);
              doc.text('BlueAlly  |  AI Strategic Assessment', centerX, 9, { align: 'center' });
              
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
    
    // ===== RECOMMENDATION: BLUEALLY AI WORKSHOP - Board Standard =====
    yPos = addPageWithBranding();
    tocEntries.push({ title: 'Recommended Next Steps', page: currentPage });
    
    // Centered section background
    doc.setFillColor(...BRAND.darkNavy);
    doc.roundedRect(margin, yPos, contentWidth, 150, 6, 6, 'F');
    
    // Centered section title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...BRAND.white);
    doc.text('Recommended Next Steps', centerX, yPos + 25, { align: 'center' });
    
    // Centered accent line
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(centerX - 50, yPos + 32, 100, 2, 'F');
    
    // Centered workshop title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.green);
    doc.text('BlueAlly 3-Day AI Use Case Workshop', centerX, yPos + 55, { align: 'center' });
    
    // Centered description
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(200, 210, 230);
    const workshopDesc = 'Transform this strategic assessment into actionable AI initiatives with our expert-facilitated workshop designed to overcome common AI implementation pitfalls.';
    const descLines = doc.splitTextToSize(workshopDesc, contentWidth - 40);
    descLines.forEach((line: string, i: number) => {
      doc.text(line, centerX, yPos + 72 + (i * 8), { align: 'center' });
    });
    
    // Centered benefits list
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
    
    // Centered CTA
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
    
    // ===== UPDATE TABLE OF CONTENTS - Centered =====
    doc.setPage(tocPageNum);
    let tocY = tocYStart;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    
    tocEntries.forEach((entry, i) => {
      // Centered TOC entries
      doc.setTextColor(...BRAND.darkNavy);
      const entryText = `${entry.title}`;
      doc.text(entryText, margin + 10, tocY);
      
      // Page number right-aligned
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND.primaryBlue);
      doc.text(`${entry.page}`, pageWidth - margin - 10, tocY, { align: 'right' });
      
      // Dotted line
      const titleWidth = doc.getTextWidth(entryText);
      doc.setTextColor(180, 190, 210);
      doc.setFont('helvetica', 'normal');
      const dotsWidth = contentWidth - titleWidth - 40;
      const dotCount = Math.floor(dotsWidth / 3);
      const dots = '.'.repeat(dotCount);
      doc.text(dots, margin + 15 + titleWidth, tocY);
      
      tocY += 12;
    });
    
    // Save with BlueAlly branding in filename
    doc.save(`BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.pdf`);
  };

  // Excel Generation - Board Presentation Standard
  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Cover Sheet - Board Standard
    const coverData = [
      [""],
      [""],
      ["BLUEALLY AI STRATEGIC ASSESSMENT"],
      [""],
      ["Board Presentation"],
      [""],
      [companyName],
      [""],
      [new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
      [""],
      [""],
      ["Prepared by BlueAlly Insight"],
      ["Enterprise AI Advisory"],
    ];
    const coverSheet = XLSX.utils.aoa_to_sheet(coverData);
    coverSheet['!cols'] = [{ wch: 60 }];
    XLSX.utils.book_append_sheet(wb, coverSheet, "Cover");
    
    // Executive Dashboard Sheet - Board Standard
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      const dashData = [
        [""],
        ["EXECUTIVE DASHBOARD"],
        [""],
        ["KEY METRICS"],
        [""],
        ["Metric", "Value"],
        ["Total Annual Value", formatCurrency(dash.totalAnnualValue)],
        ["Revenue Benefit", formatCurrency(dash.totalRevenueBenefit)],
        ["Cost Benefit", formatCurrency(dash.totalCostBenefit)],
        ["Cash Flow Benefit", formatCurrency(dash.totalCashFlowBenefit)],
        ["Risk Benefit", formatCurrency(dash.totalRiskBenefit)],
        [""],
        ["Monthly Tokens", formatNumber(dash.totalMonthlyTokens)],
        ["Value per 1M Tokens", formatCurrency(dash.valuePerMillionTokens)],
        [""],
        [""],
        ["TOP PRIORITY USE CASES"],
        [""],
        ["Rank", "Use Case", "Priority Score", "Monthly Tokens", "Annual Value"],
        ...(dash.topUseCases?.map((uc: any) => [
          uc.rank, 
          uc.useCase, 
          uc.priorityScore, 
          formatNumber(uc.monthlyTokens), 
          formatCurrency(uc.annualValue)
        ]) || [])
      ];
      const dashSheet = XLSX.utils.aoa_to_sheet(dashData);
      dashSheet['!cols'] = [
        { wch: 25 },
        { wch: 50 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 }
      ];
      XLSX.utils.book_append_sheet(wb, dashSheet, "Executive Dashboard");
    }

    // Step sheets with proper column widths
    data.steps.forEach((step: any) => {
      if (step.data && step.data.length > 0) {
        // Add header rows
        const headerRows = [
          [`STEP ${step.step}: ${step.title.toUpperCase()}`],
          [step.content || ''],
          ['']
        ];
        
        const ws = XLSX.utils.aoa_to_sheet(headerRows);
        XLSX.utils.sheet_add_json(ws, step.data, { origin: 'A4' });
        
        // Set column widths
        const cols = Object.keys(step.data[0]);
        ws['!cols'] = cols.map(col => ({
          wch: Math.min(40, Math.max(15, col.length + 5))
        }));
        
        const sheetName = `Step ${step.step}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    XLSX.writeFile(wb, `BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.xlsx`);
  };

  // Word Generation - Board Presentation Standard
  const generateWord = () => {
    const children: (Paragraph | DocxTable)[] = [];
    
    // Cover Page - Centered, Board Standard
    children.push(
      new Paragraph({ text: "", spacing: { after: 600 } }),
      new Paragraph({
        text: "BLUEALLY",
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: "AI Strategic Assessment",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: "Board Presentation",
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
      new Paragraph({
        text: companyName,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
    
    // Total Value highlight if available
    if (data.executiveDashboard) {
      children.push(
        new Paragraph({
          text: `Total Annual AI Value Opportunity: ${formatCurrency(data.executiveDashboard.totalAnnualValue)}`,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );
    }
    
    children.push(
      new Paragraph({
        text: "Prepared by BlueAlly Insight | Enterprise AI Advisory",
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );

    // Executive Dashboard - Centered headers
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      children.push(
        new Paragraph({
          text: "EXECUTIVE DASHBOARD",
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        })
      );

      // Metrics Table with centered content
      const metricsTable = new DocxTable({
        rows: [
          new DocxTableRow({
            children: [
              new DocxTableCell({ 
                children: [new Paragraph({ text: "Metric", alignment: AlignmentType.CENTER })],
                shading: { fill: "001278" },
              }),
              new DocxTableCell({ 
                children: [new Paragraph({ text: "Value", alignment: AlignmentType.CENTER })],
                shading: { fill: "001278" },
              }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Total Annual Value", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalAnnualValue), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Revenue Benefit", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalRevenueBenefit), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Cost Benefit", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalCostBenefit), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Cash Flow Benefit", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalCashFlowBenefit), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Risk Benefit", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalRiskBenefit), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Monthly Tokens", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatNumber(dash.totalMonthlyTokens), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Value per 1M Tokens", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.valuePerMillionTokens), alignment: AlignmentType.CENTER })] }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      });
      children.push(metricsTable);

      // Top Use Cases - Centered
      if (dash.topUseCases && dash.topUseCases.length > 0) {
        children.push(
          new Paragraph({
            text: "TOP PRIORITY USE CASES",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
            spacing: { before: 300, after: 200 },
          })
        );

        const useCaseTable = new DocxTable({
          rows: [
            new DocxTableRow({
              children: [
                new DocxTableCell({ children: [new Paragraph({ text: "#", alignment: AlignmentType.CENTER })], shading: { fill: "001278" } }),
                new DocxTableCell({ children: [new Paragraph({ text: "Use Case", alignment: AlignmentType.CENTER })], shading: { fill: "001278" } }),
                new DocxTableCell({ children: [new Paragraph({ text: "Priority", alignment: AlignmentType.CENTER })], shading: { fill: "001278" } }),
                new DocxTableCell({ children: [new Paragraph({ text: "Tokens/Month", alignment: AlignmentType.CENTER })], shading: { fill: "001278" } }),
                new DocxTableCell({ children: [new Paragraph({ text: "Annual Value", alignment: AlignmentType.CENTER })], shading: { fill: "001278" } }),
              ],
            }),
            ...dash.topUseCases.map((uc: any) =>
              new DocxTableRow({
                children: [
                  new DocxTableCell({ children: [new Paragraph({ text: `${uc.rank}`, alignment: AlignmentType.CENTER })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: uc.useCase, alignment: AlignmentType.CENTER })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: String(uc.priorityScore?.toFixed(0) || "N/A"), alignment: AlignmentType.CENTER })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: formatNumber(uc.monthlyTokens), alignment: AlignmentType.CENTER })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(uc.annualValue), alignment: AlignmentType.CENTER })] }),
                ],
              })
            ),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        });
        children.push(useCaseTable);
      }
    }

    // Executive Summary - Centered
    if (data.summary) {
      children.push(
        new Paragraph({
          text: "EXECUTIVE SUMMARY",
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          text: data.summary,
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        })
      );
    }

    // Analysis Steps - Centered headers
    data.steps.forEach((step: any) => {
      children.push(
        new Paragraph({
          text: `STEP ${step.step}: ${step.title.toUpperCase()}`,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        })
      );

      if (step.content) {
        children.push(
          new Paragraph({
            text: step.content,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }

      if (step.data && step.data.length > 0) {
        const allColumns = Object.keys(step.data[0]);
        const columns = allColumns.filter(k => !k.includes('Formula')).slice(0, 6);
        
        const tableRows = [
          new DocxTableRow({
            children: columns.map(col => 
              new DocxTableCell({
                children: [new Paragraph({ text: col, alignment: AlignmentType.CENTER })],
                shading: { fill: "001278" },
              })
            ),
          }),
          ...step.data.map((row: any) => 
            new DocxTableRow({
              children: columns.map(col => 
                new DocxTableCell({
                  children: [new Paragraph({ text: String(row[col] || '').substring(0, 50), alignment: AlignmentType.CENTER })],
                })
              ),
            })
          ),
        ];

        children.push(
          new DocxTable({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
      }
    });

    const doc = new Document({
      sections: [{ children }],
    });

    Packer.toBlob(doc).then(blob => {
      saveAs(blob, `BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.docx`);
    });
  };

  // Markdown Generation - Board Presentation Standard
  const generateMarkdown = () => {
    let mdContent = `# BLUEALLY AI STRATEGIC ASSESSMENT\n\n`;
    mdContent += `## Board Presentation\n\n`;
    mdContent += `### ${companyName}\n\n`;
    mdContent += `*${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}*\n\n`;
    mdContent += `---\n\n`;

    // Executive Dashboard - Key highlight first
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      mdContent += `## EXECUTIVE DASHBOARD\n\n`;
      mdContent += `### Total Annual AI Value Opportunity: ${formatCurrency(dash.totalAnnualValue)}\n\n`;
      mdContent += `| Metric | Value |\n`;
      mdContent += `|:------:|:------:|\n`;
      mdContent += `| Revenue Benefit | ${formatCurrency(dash.totalRevenueBenefit)} |\n`;
      mdContent += `| Cost Benefit | ${formatCurrency(dash.totalCostBenefit)} |\n`;
      mdContent += `| Cash Flow Benefit | ${formatCurrency(dash.totalCashFlowBenefit)} |\n`;
      mdContent += `| Risk Benefit | ${formatCurrency(dash.totalRiskBenefit)} |\n`;
      mdContent += `| Monthly Tokens | ${formatNumber(dash.totalMonthlyTokens)} |\n`;
      mdContent += `| Value per 1M Tokens | ${formatCurrency(dash.valuePerMillionTokens)} |\n\n`;
      
      // Top Use Cases
      if (dash.topUseCases && dash.topUseCases.length > 0) {
        mdContent += `### TOP PRIORITY USE CASES\n\n`;
        mdContent += `| Rank | Use Case | Priority | Tokens/Month | Annual Value |\n`;
        mdContent += `|:----:|:--------:|:--------:|:------------:|:------------:|\n`;
        dash.topUseCases.forEach((uc: any) => {
          mdContent += `| ${uc.rank} | ${uc.useCase} | ${uc.priorityScore?.toFixed(0) || 'N/A'} | ${formatNumber(uc.monthlyTokens)} | ${formatCurrency(uc.annualValue)} |\n`;
        });
        mdContent += `\n`;
      }
    }

    // Executive Summary
    if (data.summary) {
      mdContent += `---\n\n`;
      mdContent += `## EXECUTIVE SUMMARY\n\n`;
      mdContent += `${data.summary}\n\n`;
    }

    // Analysis Steps
    data.steps.forEach((step: any) => {
      mdContent += `---\n\n`;
      mdContent += `## STEP ${step.step}: ${step.title.toUpperCase()}\n\n`;
      
      if (step.content) {
        mdContent += `${step.content}\n\n`;
      }

      if (step.data && step.data.length > 0) {
        const allColumns = Object.keys(step.data[0]);
        const columns = allColumns.filter(k => !k.includes('Formula')).slice(0, 6);
        mdContent += `| ${columns.join(' | ')} |\n`;
        mdContent += `| ${columns.map(() => ':---:').join(' | ')} |\n`;
        step.data.forEach((row: any) => {
          const values = columns.map(col => String(row[col] || '').substring(0, 40));
          mdContent += `| ${values.join(' | ')} |\n`;
        });
        mdContent += `\n`;
      }
    });

    // Add footer
    mdContent += `---\n\n`;
    mdContent += `*Prepared by BlueAlly Insight | Enterprise AI Advisory*\n\n`;
    mdContent += `*www.blueally.com*\n`;
    
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.md`);
  };

  const handleDownload = async (format: string) => {
    if (!data) return;

    toast({
      title: "Download Started",
      description: `Generating ${format} report for ${companyName}...`,
    });

    try {
      switch (format) {
        case "PDF": await generatePDF(); break;
        case "Excel": generateExcel(); break;
        case "Word": generateWord(); break;
        case "Markdown": generateMarkdown(); break;
      }
      
      toast({
        title: "Download Complete",
        description: `Your ${format} report is ready.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Download Failed",
        description: "There was an error generating your report.",
        variant: "destructive",
      });
    }
  };

  const analysisSteps = [
    { step: 0, title: "Company Overview", desc: "Gathering company information..." },
    { step: 1, title: "Strategic Anchoring", desc: "Identifying business drivers..." },
    { step: 2, title: "Business Functions", desc: "Analyzing departments and KPIs..." },
    { step: 3, title: "Friction Points", desc: "Identifying operational bottlenecks..." },
    { step: 4, title: "AI Use Cases", desc: "Generating opportunities with 6 primitives..." },
    { step: 5, title: "Benefit Quantification", desc: "Calculating ROI across 4 drivers..." },
    { step: 6, title: "Token Modeling", desc: "Estimating token costs per use case..." },
    { step: 7, title: "Priority Scoring", desc: "Computing weighted priority scores..." },
  ];

  if (status === "loading") {
    return (
      <Layout>
        <div className="container max-w-3xl mx-auto px-3 md:px-4 py-6 md:py-12">
          <Card className="border-none shadow-lg">
            <CardContent className="pt-6 md:pt-10 pb-6 md:pb-10 flex flex-col items-center text-center px-3 md:px-6">
              <div className="relative mb-4 md:mb-6">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative bg-background p-3 md:p-4 rounded-full border shadow-sm">
                  <Loader2 className="h-8 w-8 md:h-10 md:w-10 text-primary animate-spin" />
                </div>
              </div>
              
              <h2 className="text-lg md:text-2xl font-bold mb-2" data-testid="text-loading-title">
                Generating Report for {companyName}
              </h2>
              
              {currentStep && (
                <div className="mb-4 md:mb-6 p-2 md:p-3 bg-primary/5 rounded-lg border border-primary/20 w-full">
                  <p className="text-primary font-medium text-sm md:text-base">{currentStep.message}</p>
                  {currentStep.detail && (
                    <p className="text-xs md:text-sm text-muted-foreground mt-1">{currentStep.detail}</p>
                  )}
                </div>
              )}
              
              <div className="w-full max-w-lg space-y-2 md:space-y-3 text-left">
                {analysisSteps.map((step) => {
                  const isCompleted = completedSteps.includes(step.step);
                  const isActive = currentStep?.step === step.step + 1 || 
                    (currentStep?.message?.includes(`Step ${step.step}`) ?? false);
                  
                  return (
                    <div 
                      key={step.step} 
                      className={`flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg transition-all duration-300 ${
                        isActive ? 'bg-primary/10 border border-primary/30' : 
                        isCompleted ? 'bg-green-50 border border-green-200' : 
                        'bg-muted/30 border border-transparent'
                      }`}
                    >
                      <div className={`flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full text-xs md:text-sm font-medium transition-colors flex-shrink-0 ${
                        isCompleted ? 'bg-green-500 text-white' : 
                        isActive ? 'bg-primary text-primary-foreground animate-pulse' : 
                        'bg-muted text-muted-foreground'
                      }`}>
                        {isCompleted ? <CheckCircle2 className="h-3 w-3 md:h-4 md:w-4" /> : step.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-xs md:text-sm ${isActive ? 'text-primary' : isCompleted ? 'text-green-700' : 'text-muted-foreground'}`}>
                          <span className="hidden sm:inline">Step {step.step}: </span>{step.title}
                        </div>
                        <div className="text-[10px] md:text-xs text-muted-foreground truncate">{step.desc}</div>
                      </div>
                      {isActive && <Loader2 className="h-3 w-3 md:h-4 md:w-4 text-primary animate-spin flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>
              
              <p className="text-xs md:text-sm text-muted-foreground mt-4 md:mt-6">
                This may take 30-60 seconds...
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="container max-w-3xl mx-auto px-3 md:px-4 py-12 md:py-20">
          <Card className="border-none shadow-lg">
            <CardContent className="pt-8 md:pt-12 pb-8 md:pb-12 flex flex-col items-center text-center px-4">
              <div className="mb-4 md:mb-6 p-3 md:p-4 rounded-full bg-red-100">
                <ShieldCheck className="h-8 w-8 md:h-12 md:w-12 text-red-500" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold mb-2">Analysis Failed</h2>
              <p className="text-sm md:text-base text-muted-foreground mb-4 md:mb-6">{error || "Unable to generate analysis"}</p>
              <Button onClick={() => { setStatus("init"); setError(null); }} data-testid="button-retry">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Toolbar */}
        <div className="border-b bg-background sticky top-14 md:top-16 z-40 px-3 md:px-6 py-2 md:py-3 flex flex-col gap-3 md:gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
               <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back" className="h-8 w-8 md:h-9 md:w-9 flex-shrink-0">
                 <ArrowLeft className="h-4 w-4" />
               </Button>
               <div className="min-w-0">
                 <h1 className="text-base md:text-xl font-bold flex items-center gap-2 flex-wrap" data-testid="text-company-name">
                   <span className="truncate">{companyName}</span>
                   <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-normal text-[10px] md:text-xs flex-shrink-0">AI Analyzed</Badge>
                 </h1>
                 <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Full 8-Step Strategic Analysis with 4 Business Drivers</p>
               </div>
            </div>
            <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={regenerateAnalysis}
                disabled={!reportId || status !== "complete"}
                data-testid="button-refresh"
                className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm"
              >
                <RefreshCw className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />
                <span className="hidden md:inline">Update</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-export" className="h-8 md:h-9 px-2 md:px-3 text-xs md:text-sm">
                    <Download className="h-3 w-3 md:h-4 md:w-4 md:mr-2" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload("PDF")} data-testid="menu-pdf">
                    <FileText className="mr-2 h-4 w-4" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("Excel")} data-testid="menu-excel">
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("Word")} data-testid="menu-word">
                    <FileType className="mr-2 h-4 w-4" /> Download Word
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("Markdown")} data-testid="menu-md">
                    <FileText className="mr-2 h-4 w-4" /> Download Markdown
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-muted/30 p-3 md:p-6">
          <div className="container mx-auto max-w-6xl">
            {/* Executive Dashboard */}
            {data.executiveDashboard && (
              <Card className="mb-4 md:mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" data-testid="card-executive-dashboard">
                <CardHeader className="pb-2 md:pb-6">
                  <CardTitle className="flex items-center gap-2 text-lg md:text-2xl">
                    <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                    Executive Dashboard
                  </CardTitle>
                  <CardDescription className="text-xs md:text-sm">AI Portfolio KPIs - Total value across all 4 business drivers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-6">
                    <DashboardMetric 
                      icon={<TrendingUp className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Revenue Benefit"
                      value={formatCurrency(data.executiveDashboard.totalRevenueBenefit)}
                      color="text-green-600"
                      bgColor="bg-green-50"
                    />
                    <DashboardMetric 
                      icon={<TrendingDown className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Cost Benefit"
                      value={formatCurrency(data.executiveDashboard.totalCostBenefit)}
                      color="text-blue-600"
                      bgColor="bg-blue-50"
                    />
                    <DashboardMetric 
                      icon={<DollarSign className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Cash Flow Benefit"
                      value={formatCurrency(data.executiveDashboard.totalCashFlowBenefit)}
                      color="text-purple-600"
                      bgColor="bg-purple-50"
                    />
                    <DashboardMetric 
                      icon={<ShieldCheck className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Risk Benefit"
                      value={formatCurrency(data.executiveDashboard.totalRiskBenefit)}
                      color="text-orange-600"
                      bgColor="bg-orange-50"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                    <div className="p-3 md:p-4 rounded-lg border bg-card">
                      <div className="text-xs md:text-sm text-muted-foreground mb-1">Total Annual Value</div>
                      <div className="text-lg md:text-2xl font-bold text-primary" data-testid="text-total-value">
                        {formatCurrency(data.executiveDashboard.totalAnnualValue)}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 rounded-lg border bg-card">
                      <div className="text-xs md:text-sm text-muted-foreground mb-1">Monthly Tokens</div>
                      <div className="text-lg md:text-2xl font-bold">
                        {formatNumber(data.executiveDashboard.totalMonthlyTokens)}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 rounded-lg border bg-card">
                      <div className="text-xs md:text-sm text-muted-foreground mb-1">Value per 1M Tokens</div>
                      <div className="text-lg md:text-2xl font-bold">
                        {formatCurrency(data.executiveDashboard.valuePerMillionTokens)}
                      </div>
                    </div>
                  </div>

                  {data.executiveDashboard.topUseCases && data.executiveDashboard.topUseCases.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                        <Zap className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                        Top 5 Use Cases by Priority
                      </h4>
                      <div className="rounded-md border overflow-hidden">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap">#</TableHead>
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap">Use Case</TableHead>
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap hidden sm:table-cell">Score</TableHead>
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap hidden md:table-cell">Tokens</TableHead>
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap">Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.executiveDashboard.topUseCases.map((uc: any, i: number) => (
                                <TableRow key={i} className="hover:bg-muted/20">
                                  <TableCell className="py-2">
                                    <Badge variant={uc.rank <= 3 ? "default" : "secondary"} className="text-[10px] md:text-xs">#{uc.rank}</Badge>
                                  </TableCell>
                                  <TableCell className="font-medium text-xs md:text-sm py-2">{uc.useCase}</TableCell>
                                  <TableCell className="hidden sm:table-cell py-2">
                                    <div className="flex items-center gap-1.5 md:gap-2">
                                      <div className="w-10 md:w-16 h-1.5 md:h-2 bg-muted rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-primary rounded-full" 
                                          style={{ width: `${uc.priorityScore}%` }}
                                        />
                                      </div>
                                      <span className="text-xs md:text-sm font-medium">{uc.priorityScore?.toFixed(0)}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="hidden md:table-cell text-xs md:text-sm py-2">{formatNumber(uc.monthlyTokens)}</TableCell>
                                  <TableCell className="font-medium text-green-600 text-xs md:text-sm py-2">{formatCurrency(uc.annualValue)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {data.summary && (
              <Card className="mb-4 md:mb-8" data-testid="card-summary">
                <CardHeader className="pb-2 md:pb-6">
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Brain className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed text-xs md:text-sm">{data.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Analysis Steps */}
            <div className="flex flex-col space-y-4 md:space-y-8">
              {data.steps?.map((step: any, index: number) => (
                <StepCard key={index} step={step} />
              ))}
            </div>

            {/* Save Confirmation & Actions */}
            <Card className="mt-4 md:mt-8 border-green-200 bg-gradient-to-br from-green-50 to-transparent" data-testid="card-save-confirmation">
              <CardContent className="pt-4 md:pt-6 pb-4">
                <div className="flex flex-col gap-3 md:gap-4">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm md:text-lg text-green-800">Report Saved Successfully</h3>
                      <p className="text-xs md:text-sm text-green-700">
                        This analysis is saved and can be accessed from Saved Reports anytime.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-green-200">
                    <Button 
                      variant="outline" 
                      onClick={regenerateAnalysis}
                      disabled={!reportId}
                      className="flex-1 gap-2 border-green-300 text-green-700 hover:bg-green-100 h-9 md:h-10 text-xs md:text-sm"
                      data-testid="button-update-analysis"
                    >
                      <RefreshCw className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      Update Analysis
                    </Button>
                    <Link href="/saved" className="flex-1">
                      <Button variant="default" className="w-full gap-2 bg-green-600 hover:bg-green-700 h-9 md:h-10 text-xs md:text-sm" data-testid="button-view-saved">
                        <FileText className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        View Saved Reports
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function DashboardMetric({ icon, label, value, color, bgColor }: { 
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  color: string; 
  bgColor: string;
}) {
  return (
    <div className={`p-2 md:p-4 rounded-lg border ${bgColor}`}>
      <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
        <div className={color}>{icon}</div>
        <span className="text-[10px] md:text-sm text-muted-foreground">{label}</span>
      </div>
      <div className={`text-sm md:text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function StepCard({ step }: { step: any }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const hasData = step.data && Array.isArray(step.data) && step.data.length > 0;
  
  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const expandAll = () => {
    if (hasData) {
      setExpandedRows(new Set(step.data.map((_: any, i: number) => i)));
    }
  };

  const collapseAll = () => {
    setExpandedRows(new Set());
  };
  
  const getStepBadge = (stepNum: number) => {
    switch(stepNum) {
      case 4: return <Badge variant="secondary" className="gap-1 text-[10px] md:text-xs"><Brain className="h-2.5 w-2.5 md:h-3 md:w-3" /> <span className="hidden sm:inline">AI Primitives</span><span className="sm:hidden">AI</span></Badge>;
      case 5: return <Badge variant="secondary" className="gap-1 text-[10px] md:text-xs"><DollarSign className="h-2.5 w-2.5 md:h-3 md:w-3" /> Benefits</Badge>;
      case 6: return <Badge variant="secondary" className="gap-1 text-[10px] md:text-xs"><Calculator className="h-2.5 w-2.5 md:h-3 md:w-3" /> <span className="hidden sm:inline">Token Model</span><span className="sm:hidden">Tokens</span></Badge>;
      case 7: return <Badge variant="secondary" className="gap-1 text-[10px] md:text-xs"><Target className="h-2.5 w-2.5 md:h-3 md:w-3" /> Priority</Badge>;
      default: return null;
    }
  };

  const isBenefitsStep = step.step === 5;

  return (
    <Card data-testid={`card-step-${step.step}`}>
      <CardHeader className="pb-2 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs md:text-sm border border-primary/20 flex-shrink-0">
              {step.step}
            </div>
            <CardTitle className="text-base md:text-xl leading-tight">{step.title}</CardTitle>
          </div>
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {isBenefitsStep && hasData && (
              <div className="flex gap-0.5 md:gap-1">
                <Button variant="ghost" size="sm" onClick={expandAll} className="text-[10px] md:text-xs h-7 md:h-8 px-1.5 md:px-2">
                  <span className="hidden sm:inline">Expand All</span>
                  <span className="sm:hidden">+</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} className="text-[10px] md:text-xs h-7 md:h-8 px-1.5 md:px-2">
                  <span className="hidden sm:inline">Collapse All</span>
                  <span className="sm:hidden">-</span>
                </Button>
              </div>
            )}
            {getStepBadge(step.step)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 md:pt-0">
        {step.content && (
          <div className="prose prose-sm max-w-none mb-4 md:mb-6 text-muted-foreground">
            <p className="text-xs md:text-sm">{step.content}</p>
          </div>
        )}
        
        {hasData && isBenefitsStep ? (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8"></TableHead>
                    {Object.keys(step.data[0]).filter((k: string) => 
                      !k.includes('Formula') && k !== 'Benefit Formula'
                    ).map((key: string, i: number) => (
                      <TableHead key={i} className="font-semibold text-primary whitespace-nowrap">{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {step.data.map((row: any, i: number) => {
                    const isExpanded = expandedRows.has(i);
                    const colCount = Object.keys(row).filter(k => !k.includes('Formula')).length + 1;
                    
                    return (
                      <>
                        <TableRow 
                          key={i} 
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => toggleRow(i)}
                        >
                          <TableCell className="w-8 p-2">
                            <div className="flex items-center justify-center">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-primary" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          {Object.entries(row).filter(([key]) => 
                            !key.includes('Formula') && key !== 'Benefit Formula'
                          ).map(([key, value]: [string, any], j: number) => (
                            <TableCell key={j} className={j === 0 ? "font-medium" : ""}>
                              {renderCellValue(key, value)}
                            </TableCell>
                          ))}
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${i}-expanded`} className="bg-primary/5 border-l-4 border-l-primary">
                            <TableCell colSpan={colCount} className="py-2 md:py-4">
                              <div className="flex flex-col gap-2 md:gap-4 px-1 md:px-4">
                                <div className="text-xs md:text-sm font-medium text-primary">Benefit Calculation Breakdown by Driver:</div>
                                
                                <div className="grid grid-cols-2 gap-2 md:gap-4">
                                  {/* Revenue Driver */}
                                  <div className="p-2 md:p-3 bg-green-50 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-1 md:gap-2 mb-1 md:mb-2">
                                      <TrendingUp className="h-3 w-3 md:h-5 md:w-5 text-green-600" />
                                      <span className="font-semibold text-green-700 text-[10px] md:text-sm">Grow Revenue</span>
                                    </div>
                                    <div className="text-xs md:text-lg font-bold text-green-800 mb-1">{row['Revenue Benefit ($)'] || '$0'}</div>
                                    {row['Revenue Formula'] && (
                                      <div className="text-[9px] md:text-sm text-green-700 font-mono bg-green-100/50 p-1 md:p-2 rounded break-all">
                                        {row['Revenue Formula']}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Cost Driver */}
                                  <div className="p-2 md:p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-1 md:gap-2 mb-1 md:mb-2">
                                      <TrendingDown className="h-3 w-3 md:h-5 md:w-5 text-blue-600" />
                                      <span className="font-semibold text-blue-700 text-[10px] md:text-sm">Reduce Cost</span>
                                    </div>
                                    <div className="text-xs md:text-lg font-bold text-blue-800 mb-1">{row['Cost Benefit ($)'] || '$0'}</div>
                                    {row['Cost Formula'] && (
                                      <div className="text-[9px] md:text-sm text-blue-700 font-mono bg-blue-100/50 p-1 md:p-2 rounded break-all">
                                        {row['Cost Formula']}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Cash Flow Driver */}
                                  <div className="p-2 md:p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="flex items-center gap-1 md:gap-2 mb-1 md:mb-2">
                                      <DollarSign className="h-3 w-3 md:h-5 md:w-5 text-purple-600" />
                                      <span className="font-semibold text-purple-700 text-[10px] md:text-sm">Cash Flow</span>
                                    </div>
                                    <div className="text-xs md:text-lg font-bold text-purple-800 mb-1">{row['Cash Flow Benefit ($)'] || '$0'}</div>
                                    {row['Cash Flow Formula'] && (
                                      <div className="text-[9px] md:text-sm text-purple-700 font-mono bg-purple-100/50 p-1 md:p-2 rounded break-all">
                                        {row['Cash Flow Formula']}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Risk Driver */}
                                  <div className="p-2 md:p-3 bg-orange-50 rounded-lg border border-orange-200">
                                    <div className="flex items-center gap-1 md:gap-2 mb-1 md:mb-2">
                                      <ShieldCheck className="h-3 w-3 md:h-5 md:w-5 text-orange-600" />
                                      <span className="font-semibold text-orange-700 text-[10px] md:text-sm">Reduce Risk</span>
                                    </div>
                                    <div className="text-xs md:text-lg font-bold text-orange-800 mb-1">{row['Risk Benefit ($)'] || '$0'}</div>
                                    {row['Risk Formula'] && (
                                      <div className="text-[9px] md:text-sm text-orange-700 font-mono bg-orange-100/50 p-1 md:p-2 rounded break-all">
                                        {row['Risk Formula']}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Total Summary */}
                                <div className="flex items-center justify-center gap-2 md:gap-3 p-2 md:p-3 bg-primary/10 rounded-lg border-2 border-primary">
                                  <Target className="h-4 w-4 md:h-6 md:w-6 text-primary flex-shrink-0" />
                                  <span className="text-xs md:text-lg font-bold text-primary">Total: {row['Total Annual Value ($)'] || '$0'}</span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : hasData ? (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {Object.keys(step.data[0]).map((key: string, i: number) => (
                      <TableHead key={i} className="font-semibold text-primary whitespace-nowrap">{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {step.data.map((row: any, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/20 transition-colors">
                      {Object.entries(row).map(([key, value]: [string, any], j: number) => (
                        <TableCell key={j} className={j === 0 ? "font-medium" : ""}>
                          {renderCellValue(key, value)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function renderCellValue(key: string, value: any): React.ReactNode {
  if (value === null || value === undefined) return "-";
  
  const strValue = String(value);
  
  // Priority tier badges
  if (key.toLowerCase().includes("priority") && typeof value === "string") {
    const tierColors: Record<string, string> = {
      "Critical": "bg-red-100 text-red-700 border-red-200",
      "High": "bg-orange-100 text-orange-700 border-orange-200",
      "Medium": "bg-yellow-100 text-yellow-700 border-yellow-200",
      "Low": "bg-gray-100 text-gray-700 border-gray-200",
    };
    if (tierColors[value]) {
      return <Badge variant="outline" className={tierColors[value]}>{value}</Badge>;
    }
  }
  
  // Severity badges
  if (key.toLowerCase().includes("severity") && typeof value === "string") {
    const severityColors: Record<string, string> = {
      "Critical": "bg-red-100 text-red-700 border-red-200",
      "High": "bg-orange-100 text-orange-700 border-orange-200",
      "Medium": "bg-yellow-100 text-yellow-700 border-yellow-200",
      "Low": "bg-green-100 text-green-700 border-green-200",
    };
    if (severityColors[value]) {
      return <Badge variant="outline" className={severityColors[value]}>{value}</Badge>;
    }
  }

  // Direction arrows
  if (key.toLowerCase().includes("direction")) {
    if (strValue === "↑" || strValue.toLowerCase().includes("up") || strValue.toLowerCase().includes("increase")) {
      return <span className="text-green-600 font-medium">↑ Increase</span>;
    }
    if (strValue === "↓" || strValue.toLowerCase().includes("down") || strValue.toLowerCase().includes("decrease")) {
      return <span className="text-blue-600 font-medium">↓ Decrease</span>;
    }
  }

  // Probability formatting
  if (key.toLowerCase().includes("probability") && typeof value === "number") {
    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${value * 100}%` }} />
        </div>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
    );
  }

  // Format large numbers with commas (Runs/Month, Monthly Tokens, Input/Output Tokens)
  const numericColumns = ['runs/month', 'monthly tokens', 'input tokens', 'output tokens', 'tokens'];
  if (numericColumns.some(col => key.toLowerCase().includes(col)) && typeof value === 'number') {
    return value.toLocaleString('en-US');
  }

  // Also handle numeric values that might be strings
  if (numericColumns.some(col => key.toLowerCase().includes(col)) && typeof value === 'string') {
    const num = parseFloat(value.replace(/[,]/g, ''));
    if (!isNaN(num)) {
      return num.toLocaleString('en-US');
    }
  }

  return strValue;
}

function Step({ active, completed, label, subLabel }: { active: boolean, completed: boolean, label: string, subLabel: string }) {
  return (
    <div className={`flex items-start gap-4 transition-opacity duration-500 ${active || completed ? 'opacity-100' : 'opacity-40'}`}>
      <div className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-500 ${
        completed ? 'bg-primary border-primary text-primary-foreground' : 
        active ? 'border-primary text-primary animate-pulse' : 'border-muted-foreground'
      }`}>
        {completed ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-2 w-2 rounded-full bg-current" />}
      </div>
      <div>
        <div className={`font-semibold ${active ? 'text-primary' : ''}`}>{label}</div>
        <div className="text-sm text-muted-foreground">{subLabel}</div>
      </div>
    </div>
  );
}
