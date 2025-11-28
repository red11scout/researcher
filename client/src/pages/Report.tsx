import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, HeadingLevel } from 'docx';
import blueAllyLogo from '@assets/image_1764369352062.png';

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

  // BlueAlly Brand Colors
  const BRAND = {
    primaryBlue: [0, 18, 120] as [number, number, number],     // #001278
    lightBlue: [2, 162, 250] as [number, number, number],       // #02a2fd
    darkNavy: [4, 8, 34] as [number, number, number],           // #040822
    green: [54, 191, 120] as [number, number, number],          // #36bf78
    white: [255, 255, 255] as [number, number, number],
    lightBlueBg: [205, 229, 241] as [number, number, number],   // #cde5f1
    gray: [100, 100, 100] as [number, number, number],
  };

  // PDF Generation with BlueAlly Branding
  const generatePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let currentPage = 1;
    const tocEntries: { title: string; page: number }[] = [];

    // Helper: Add page with header/footer
    const addPageWithBranding = (isFirst = false) => {
      if (!isFirst) {
        doc.addPage();
        currentPage++;
      }
      
      // Header bar
      doc.setFillColor(...BRAND.primaryBlue);
      doc.rect(0, 0, pageWidth, 12, 'F');
      
      // Header text
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.white);
      doc.text('BlueAlly | AI Strategic Assessment', margin, 8);
      doc.text(companyName, pageWidth - margin, 8, { align: 'right' });
      
      // Footer
      doc.setFillColor(...BRAND.lightBlue);
      doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.white);
      doc.text(`Page ${currentPage}`, pageWidth / 2, pageHeight - 3, { align: 'center' });
      doc.text('Confidential', margin, pageHeight - 3);
      doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 3, { align: 'right' });
      
      return 20; // Return starting Y position after header
    };

    // Helper: Check if we need a new page
    const ensureSpace = (neededHeight: number, currentY: number): number => {
      if (currentY + neededHeight > pageHeight - 25) {
        return addPageWithBranding();
      }
      return currentY;
    };

    // Helper: Draw section heading
    const drawSectionHeading = (title: string, yPos: number, addToToc = true): number => {
      yPos = ensureSpace(20, yPos);
      
      if (addToToc) {
        tocEntries.push({ title, page: currentPage });
      }
      
      // Accent bar
      doc.setFillColor(...BRAND.lightBlue);
      doc.rect(margin, yPos, 4, 10, 'F');
      
      // Heading text
      doc.setFontSize(14);
      doc.setTextColor(...BRAND.primaryBlue);
      doc.text(title, margin + 8, yPos + 7);
      
      return yPos + 15;
    };

    // Helper: Draw benefit bar chart
    const drawBenefitChart = (yPos: number, dash: any): number => {
      yPos = ensureSpace(70, yPos);
      
      const chartWidth = contentWidth;
      const barHeight = 12;
      const total = dash.totalAnnualValue || 1;
      const benefits = [
        { label: 'Revenue', value: dash.totalRevenueBenefit, color: BRAND.green },
        { label: 'Cost Reduction', value: dash.totalCostBenefit, color: BRAND.lightBlue },
        { label: 'Cash Flow', value: dash.totalCashFlowBenefit, color: BRAND.primaryBlue },
        { label: 'Risk Reduction', value: dash.totalRiskBenefit, color: [255, 153, 51] as [number, number, number] },
      ];
      
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.darkNavy);
      doc.text('Annual Value by Business Driver', margin, yPos);
      yPos += 8;
      
      benefits.forEach((benefit, i) => {
        const barWidth = Math.max(5, (benefit.value / total) * chartWidth * 0.7);
        
        // Bar
        doc.setFillColor(...benefit.color);
        doc.roundedRect(margin + 50, yPos + (i * 14), barWidth, barHeight - 2, 2, 2, 'F');
        
        // Label
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.gray);
        doc.text(benefit.label, margin, yPos + (i * 14) + 7);
        
        // Value
        doc.setTextColor(...BRAND.darkNavy);
        doc.text(formatCurrency(benefit.value), margin + 55 + barWidth, yPos + (i * 14) + 7);
      });
      
      return yPos + 60;
    };

    // ===== COVER PAGE =====
    // Dark navy background
    doc.setFillColor(...BRAND.darkNavy);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Add BlueAlly logo (white version on dark background)
    try {
      doc.addImage(blueAllyLogo, 'PNG', pageWidth / 2 - 35, 35, 70, 20);
    } catch (e) {
      // Fallback to text if logo fails
      doc.setFontSize(32);
      doc.setTextColor(...BRAND.white);
      doc.text('BlueAlly', pageWidth / 2, 50, { align: 'center' });
    }
    
    // Light blue accent line
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(pageWidth / 2 - 30, 60, 60, 2, 'F');
    
    // Title
    doc.setFontSize(28);
    doc.setTextColor(...BRAND.white);
    doc.text('AI Strategic Assessment', pageWidth / 2, 90, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(...BRAND.lightBlue);
    doc.text('Executive Report', pageWidth / 2, 105, { align: 'center' });
    
    // Company name box
    doc.setFillColor(...BRAND.primaryBlue);
    doc.roundedRect(pageWidth / 2 - 60, 130, 120, 30, 3, 3, 'F');
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.white);
    doc.text(companyName, pageWidth / 2, 150, { align: 'center' });
    
    // Date
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.lightBlueBg);
    doc.text(`Prepared: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, pageWidth / 2, 180, { align: 'center' });
    
    // Total value highlight
    if (data.executiveDashboard) {
      doc.setFillColor(...BRAND.green);
      doc.roundedRect(pageWidth / 2 - 70, 200, 140, 40, 3, 3, 'F');
      doc.setFontSize(11);
      doc.setTextColor(...BRAND.darkNavy);
      doc.text('Total Annual AI Value Opportunity', pageWidth / 2, 215, { align: 'center' });
      doc.setFontSize(22);
      doc.text(formatCurrency(data.executiveDashboard.totalAnnualValue), pageWidth / 2, 232, { align: 'center' });
    }
    
    // Footer on cover
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.lightBlueBg);
    doc.text('Powered by BlueAlly Insight AI Platform', pageWidth / 2, pageHeight - 20, { align: 'center' });
    
    // ===== TABLE OF CONTENTS PAGE (placeholder - will update page numbers later) =====
    const tocPageNum = 2;
    currentPage = 2;
    doc.addPage();
    let yPos = addPageWithBranding(true);
    
    doc.setFontSize(20);
    doc.setTextColor(...BRAND.primaryBlue);
    doc.text('Table of Contents', margin, yPos + 10);
    
    // Save TOC position to update later
    const tocYStart = yPos + 25;
    
    // ===== EXECUTIVE SUMMARY PAGE =====
    yPos = addPageWithBranding();
    yPos = drawSectionHeading('Executive Summary', yPos);
    
    // Key metrics grid
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      
      // Metrics boxes
      const boxWidth = (contentWidth - 10) / 2;
      const boxHeight = 25;
      
      // Total Value
      doc.setFillColor(...BRAND.primaryBlue);
      doc.roundedRect(margin, yPos, boxWidth, boxHeight, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.lightBlueBg);
      doc.text('Total Annual Value', margin + 5, yPos + 10);
      doc.setFontSize(14);
      doc.setTextColor(...BRAND.white);
      doc.text(formatCurrency(dash.totalAnnualValue), margin + 5, yPos + 20);
      
      // Value per Token
      doc.setFillColor(...BRAND.lightBlue);
      doc.roundedRect(margin + boxWidth + 10, yPos, boxWidth, boxHeight, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.darkNavy);
      doc.text('Value per 1M Tokens', margin + boxWidth + 15, yPos + 10);
      doc.setFontSize(14);
      doc.text(formatCurrency(dash.valuePerMillionTokens), margin + boxWidth + 15, yPos + 20);
      
      yPos += boxHeight + 10;
      
      // Draw benefit breakdown chart
      yPos = drawBenefitChart(yPos, dash);
      
      // Top Use Cases Table
      if (dash.topUseCases && dash.topUseCases.length > 0) {
        yPos = ensureSpace(80, yPos);
        doc.setFontSize(11);
        doc.setTextColor(...BRAND.primaryBlue);
        doc.text('Top Priority AI Use Cases', margin, yPos);
        yPos += 5;
        
        autoTable(doc, {
          startY: yPos,
          head: [['Priority', 'Use Case', 'Annual Value', 'Monthly Tokens']],
          body: dash.topUseCases.map((uc: any) => [
            `#${uc.rank}`,
            uc.useCase,
            formatCurrency(uc.annualValue),
            formatNumber(uc.monthlyTokens),
          ]),
          theme: 'grid',
          headStyles: { 
            fillColor: BRAND.primaryBlue,
            textColor: BRAND.white,
            fontStyle: 'bold',
            fontSize: 9
          },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 250, 255] },
          styles: { cellPadding: 3 },
          rowPageBreak: 'avoid',
          didDrawPage: () => { currentPage = doc.getNumberOfPages(); }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    
    // Summary narrative
    if (data.summary) {
      yPos = ensureSpace(40, yPos);
      doc.setFillColor(...BRAND.lightBlueBg);
      doc.roundedRect(margin, yPos, contentWidth, 5, 1, 1, 'F');
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.darkNavy);
      const summaryLines = doc.splitTextToSize(data.summary, contentWidth);
      
      for (const line of summaryLines) {
        yPos = ensureSpace(6, yPos);
        doc.text(line, margin, yPos);
        yPos += 5;
      }
      yPos += 10;
    }
    
    // ===== ANALYSIS STEPS =====
    for (const step of data.steps) {
      // Always start major sections on new page if not much space
      if (yPos > pageHeight - 80) {
        yPos = addPageWithBranding();
      }
      
      yPos = drawSectionHeading(`Step ${step.step}: ${step.title}`, yPos);
      
      if (step.content) {
        doc.setFontSize(9);
        doc.setTextColor(...BRAND.gray);
        const contentLines = doc.splitTextToSize(step.content, contentWidth);
        for (const line of contentLines) {
          yPos = ensureSpace(5, yPos);
          doc.text(line, margin, yPos);
          yPos += 4;
        }
        yPos += 5;
      }
      
      if (step.data && step.data.length > 0) {
        // Filter out formula columns for cleaner display
        const columns = Object.keys(step.data[0]).filter(k => !k.includes('Formula'));
        const rows = step.data.map((row: any) => 
          columns.map(col => {
            const val = row[col];
            if (typeof val === 'number' && col.toLowerCase().includes('$')) {
              return formatCurrency(val);
            }
            if (typeof val === 'number' && val > 1000) {
              return formatNumber(val);
            }
            return val;
          })
        );
        
        yPos = ensureSpace(30, yPos);
        
        autoTable(doc, {
          startY: yPos,
          head: [columns],
          body: rows,
          theme: 'striped',
          headStyles: { 
            fillColor: BRAND.primaryBlue,
            textColor: BRAND.white,
            fontStyle: 'bold',
            fontSize: 7,
            cellPadding: 2
          },
          bodyStyles: { fontSize: 7, cellPadding: 2 },
          alternateRowStyles: { fillColor: [248, 250, 255] },
          styles: { overflow: 'linebreak', cellWidth: 'wrap' },
          columnStyles: { 0: { cellWidth: 25 } },
          margin: { left: margin, right: margin },
          rowPageBreak: 'avoid',
          didDrawPage: (hookData) => {
            currentPage = doc.getNumberOfPages();
            // Re-add header/footer on new pages from table overflow
            if (hookData.pageNumber > 1) {
              doc.setFillColor(...BRAND.primaryBlue);
              doc.rect(0, 0, pageWidth, 12, 'F');
              doc.setFontSize(8);
              doc.setTextColor(...BRAND.white);
              doc.text('BlueAlly | AI Strategic Assessment', margin, 8);
              doc.text(companyName, pageWidth - margin, 8, { align: 'right' });
              
              doc.setFillColor(...BRAND.lightBlue);
              doc.rect(0, pageHeight - 8, pageWidth, 8, 'F');
              doc.setFontSize(7);
              doc.setTextColor(...BRAND.white);
              doc.text(`Page ${currentPage}`, pageWidth / 2, pageHeight - 3, { align: 'center' });
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }
    }
    
    // ===== RECOMMENDATION: BLUEALLY AI WORKSHOP =====
    yPos = addPageWithBranding();
    tocEntries.push({ title: 'Recommended Next Steps', page: currentPage });
    
    // Full section background
    doc.setFillColor(...BRAND.darkNavy);
    doc.roundedRect(margin, yPos, contentWidth, 120, 3, 3, 'F');
    
    // Section title
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.white);
    doc.text('Recommended Next Steps', margin + 10, yPos + 15);
    
    // Accent line
    doc.setFillColor(...BRAND.lightBlue);
    doc.rect(margin + 10, yPos + 20, 50, 2, 'F');
    
    // Workshop title
    doc.setFontSize(14);
    doc.setTextColor(...BRAND.green);
    doc.text('BlueAlly 3-Day AI Use Case Workshop', margin + 10, yPos + 35);
    
    // Description
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.lightBlueBg);
    const workshopDesc = 'Transform this strategic assessment into actionable AI initiatives with our expert-facilitated workshop designed to overcome common AI implementation pitfalls.';
    const descLines = doc.splitTextToSize(workshopDesc, contentWidth - 20);
    doc.text(descLines, margin + 10, yPos + 45);
    
    // Benefits list
    const benefits = [
      'ROI-Focused: Link every AI use case to specific KPIs across four business drivers',
      'Rapid Prototyping: Target 90-day pilot cycles vs. year-long experiments',
      'Executive Alignment: Cross-functional workshops with business and IT leaders',
      'Expert Partnership: BlueAlly handles heavy technical lifting (2.6x higher success rate)',
      'Governance Built-In: Embed security and compliance from day one'
    ];
    
    let benefitY = yPos + 60;
    doc.setFontSize(8);
    benefits.forEach((benefit, i) => {
      doc.setFillColor(...BRAND.green);
      doc.circle(margin + 14, benefitY + (i * 10) - 1, 1.5, 'F');
      doc.setTextColor(...BRAND.white);
      doc.text(benefit, margin + 20, benefitY + (i * 10));
    });
    
    // CTA
    yPos += 130;
    doc.setFillColor(...BRAND.green);
    doc.roundedRect(margin, yPos, contentWidth, 25, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.darkNavy);
    doc.text('Contact BlueAlly to schedule your AI Workshop', pageWidth / 2, yPos + 10, { align: 'center' });
    doc.setFontSize(9);
    doc.text('www.blueally.com | Accelerating AI Value Realization', pageWidth / 2, yPos + 18, { align: 'center' });
    
    // ===== UPDATE TABLE OF CONTENTS =====
    doc.setPage(tocPageNum);
    let tocY = tocYStart;
    doc.setFontSize(10);
    
    tocEntries.forEach((entry, i) => {
      doc.setTextColor(...BRAND.darkNavy);
      doc.text(entry.title, margin, tocY);
      doc.setTextColor(...BRAND.lightBlue);
      doc.text(`.....................................`, margin + doc.getTextWidth(entry.title) + 2, tocY);
      doc.setTextColor(...BRAND.primaryBlue);
      doc.text(`${entry.page}`, pageWidth - margin, tocY, { align: 'right' });
      tocY += 8;
    });
    
    // Save with BlueAlly branding in filename
    doc.save(`BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.pdf`);
  };

  // Excel Generation
  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Executive Dashboard Sheet
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      const dashData = [
        ["AI Portfolio - Executive Dashboard"],
        [""],
        ["Key Totals"],
        ["Total Annual Revenue Benefit", dash.totalRevenueBenefit],
        ["Total Annual Cost Benefit", dash.totalCostBenefit],
        ["Total Annual Cash Flow Benefit", dash.totalCashFlowBenefit],
        ["Total Annual Risk Benefit", dash.totalRiskBenefit],
        ["Total Annual Value (All Drivers)", dash.totalAnnualValue],
        [""],
        ["Total Monthly Tokens", dash.totalMonthlyTokens],
        ["Value per 1M Tokens", dash.valuePerMillionTokens],
        [""],
        ["Top 5 Use Cases by Priority"],
        ["Rank", "Use Case", "Priority Score", "Monthly Tokens", "Annual Value"],
        ...(dash.topUseCases?.map((uc: any) => [uc.rank, uc.useCase, uc.priorityScore, uc.monthlyTokens, uc.annualValue]) || [])
      ];
      const dashSheet = XLSX.utils.aoa_to_sheet(dashData);
      XLSX.utils.book_append_sheet(wb, dashSheet, "Executive Dashboard");
    }

    // Step sheets
    data.steps.forEach((step: any) => {
      if (step.data && step.data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(step.data);
        const sheetName = `Step ${step.step}`.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    XLSX.writeFile(wb, `${companyName}_Insight_AI_Report.xlsx`);
  };

  // Word Generation
  const generateWord = () => {
    const children: (Paragraph | DocxTable)[] = [
      new Paragraph({
        text: `Insight AI Report: ${companyName}`,
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({
        text: `Generated on ${new Date().toLocaleDateString()}`,
        spacing: { after: 200 },
      }),
    ];

    // Executive Dashboard
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      children.push(
        new Paragraph({
          text: "Executive Dashboard",
          heading: HeadingLevel.HEADING_1,
        })
      );

      // Metrics Table
      const metricsTable = new DocxTable({
        rows: [
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Metric", style: "Strong" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: "Value", style: "Strong" })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Total Annual Value" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalAnnualValue) })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Revenue Benefit" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalRevenueBenefit) })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Cost Benefit" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalCostBenefit) })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Cash Flow Benefit" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalCashFlowBenefit) })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Risk Benefit" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.totalRiskBenefit) })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Monthly Tokens" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatNumber(dash.totalMonthlyTokens) })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Value per 1M Tokens" })] }),
              new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(dash.valuePerMillionTokens) })] }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      });
      children.push(metricsTable);

      // Top 5 Use Cases
      if (dash.topUseCases && dash.topUseCases.length > 0) {
        children.push(
          new Paragraph({
            text: "Top 5 Use Cases by Priority",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200 },
          })
        );

        const useCaseTable = new DocxTable({
          rows: [
            new DocxTableRow({
              children: [
                new DocxTableCell({ children: [new Paragraph({ text: "Rank", style: "Strong" })] }),
                new DocxTableCell({ children: [new Paragraph({ text: "Use Case", style: "Strong" })] }),
                new DocxTableCell({ children: [new Paragraph({ text: "Priority Score", style: "Strong" })] }),
                new DocxTableCell({ children: [new Paragraph({ text: "Monthly Tokens", style: "Strong" })] }),
                new DocxTableCell({ children: [new Paragraph({ text: "Annual Value", style: "Strong" })] }),
              ],
            }),
            ...dash.topUseCases.map((uc: any) =>
              new DocxTableRow({
                children: [
                  new DocxTableCell({ children: [new Paragraph({ text: `#${uc.rank}` })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: uc.useCase })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: String(uc.priorityScore?.toFixed(0) || "N/A") })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: formatNumber(uc.monthlyTokens) })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: formatCurrency(uc.annualValue) })] }),
                ],
              })
            ),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        });
        children.push(useCaseTable);
      }
    }

    // Executive Summary
    if (data.summary) {
      children.push(
        new Paragraph({
          text: "Executive Summary",
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: data.summary,
          spacing: { after: 200 },
        })
      );
    }

    data.steps.forEach((step: any) => {
      children.push(
        new Paragraph({
          text: `Step ${step.step}: ${step.title}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200 },
        })
      );

      if (step.content) {
        children.push(
          new Paragraph({
            text: step.content,
            spacing: { after: 100 },
          })
        );
      }

      if (step.data && step.data.length > 0) {
        const columns = Object.keys(step.data[0]);
        const tableRows = [
          new DocxTableRow({
            children: columns.map(col => 
              new DocxTableCell({
                children: [new Paragraph({ text: col, style: "Strong" })],
                width: { size: 100 / columns.length, type: WidthType.PERCENTAGE },
              })
            ),
          }),
          ...step.data.map((row: any) => 
            new DocxTableRow({
              children: Object.values(row).map((value: any) => 
                new DocxTableCell({
                  children: [new Paragraph({ text: String(value) })],
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
      saveAs(blob, `${companyName}_Insight_AI_Report.docx`);
    });
  };

  // Markdown Generation
  const generateMarkdown = () => {
    let mdContent = `# Insight AI Report: ${companyName}\n`;
    mdContent += `*Generated on ${new Date().toLocaleDateString()}*\n\n`;

    if (data.summary) {
      mdContent += `## Executive Summary\n${data.summary}\n\n`;
    }

    // Executive Dashboard
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      mdContent += `## Executive Dashboard\n\n`;
      mdContent += `| Metric | Value |\n|--------|-------|\n`;
      mdContent += `| Total Annual Value | ${formatCurrency(dash.totalAnnualValue)} |\n`;
      mdContent += `| Revenue Benefit | ${formatCurrency(dash.totalRevenueBenefit)} |\n`;
      mdContent += `| Cost Benefit | ${formatCurrency(dash.totalCostBenefit)} |\n`;
      mdContent += `| Cash Flow Benefit | ${formatCurrency(dash.totalCashFlowBenefit)} |\n`;
      mdContent += `| Risk Benefit | ${formatCurrency(dash.totalRiskBenefit)} |\n`;
      mdContent += `| Monthly Tokens | ${formatNumber(dash.totalMonthlyTokens)} |\n`;
      mdContent += `| Value per 1M Tokens | ${formatCurrency(dash.valuePerMillionTokens)} |\n\n`;
    }

    data.steps.forEach((step: any) => {
      mdContent += `## Step ${step.step}: ${step.title}\n\n`;
      
      if (step.content) {
        mdContent += `${step.content}\n\n`;
      }

      if (step.data && step.data.length > 0) {
        const columns = Object.keys(step.data[0]);
        mdContent += `| ${columns.join(' | ')} |\n`;
        mdContent += `| ${columns.map(() => '---').join(' | ')} |\n`;
        step.data.forEach((row: any) => {
          mdContent += `| ${Object.values(row).map(v => String(v)).join(' | ')} |\n`;
        });
        mdContent += `\n`;
      }
    });

    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, `${companyName}_Insight_AI_Report.md`);
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
        <div className="container max-w-3xl mx-auto px-4 py-12">
          <Card className="border-none shadow-lg">
            <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative bg-background p-4 rounded-full border shadow-sm">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
              </div>
              
              <h2 className="text-2xl font-bold mb-2" data-testid="text-loading-title">
                Generating Strategic Report for {companyName}
              </h2>
              
              {currentStep && (
                <div className="mb-6 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-primary font-medium">{currentStep.message}</p>
                  {currentStep.detail && (
                    <p className="text-sm text-muted-foreground mt-1">{currentStep.detail}</p>
                  )}
                </div>
              )}
              
              <div className="w-full max-w-lg space-y-3 text-left">
                {analysisSteps.map((step) => {
                  const isCompleted = completedSteps.includes(step.step);
                  const isActive = currentStep?.step === step.step + 1 || 
                    (currentStep?.message?.includes(`Step ${step.step}`) ?? false);
                  
                  return (
                    <div 
                      key={step.step} 
                      className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${
                        isActive ? 'bg-primary/10 border border-primary/30' : 
                        isCompleted ? 'bg-green-50 border border-green-200' : 
                        'bg-muted/30 border border-transparent'
                      }`}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                        isCompleted ? 'bg-green-500 text-white' : 
                        isActive ? 'bg-primary text-primary-foreground animate-pulse' : 
                        'bg-muted text-muted-foreground'
                      }`}>
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.step}
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${isActive ? 'text-primary' : isCompleted ? 'text-green-700' : 'text-muted-foreground'}`}>
                          Step {step.step}: {step.title}
                        </div>
                        <div className="text-xs text-muted-foreground">{step.desc}</div>
                      </div>
                      {isActive && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                    </div>
                  );
                })}
              </div>
              
              <p className="text-sm text-muted-foreground mt-6">
                This may take 30-60 seconds for comprehensive analysis...
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
        <div className="container max-w-3xl mx-auto px-4 py-20">
          <Card className="border-none shadow-lg">
            <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
              <div className="mb-6 p-4 rounded-full bg-red-100">
                <ShieldCheck className="h-12 w-12 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Analysis Failed</h2>
              <p className="text-muted-foreground mb-6">{error || "Unable to generate analysis"}</p>
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
        <div className="border-b bg-background sticky top-16 z-40 px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
               <ArrowLeft className="h-4 w-4" />
             </Button>
             <div>
               <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-company-name">
                 {companyName}
                 <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-normal">AI Analyzed</Badge>
               </h1>
               <p className="text-xs text-muted-foreground">Full 8-Step Strategic Analysis with 4 Business Drivers</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={regenerateAnalysis}
              disabled={!reportId || status !== "complete"}
              data-testid="button-refresh"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Update
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" data-testid="button-export">
                  <Download className="mr-2 h-4 w-4" />
                  Export Report
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

        <div className="flex-1 bg-muted/30 p-6">
          <div className="container mx-auto max-w-6xl">
            {/* Executive Dashboard */}
            {data.executiveDashboard && (
              <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" data-testid="card-executive-dashboard">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Target className="h-6 w-6 text-primary" />
                    Executive Dashboard
                  </CardTitle>
                  <CardDescription>AI Portfolio KPIs - Total value across all 4 business drivers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <DashboardMetric 
                      icon={<TrendingUp className="h-5 w-5" />}
                      label="Revenue Benefit"
                      value={formatCurrency(data.executiveDashboard.totalRevenueBenefit)}
                      color="text-green-600"
                      bgColor="bg-green-50"
                    />
                    <DashboardMetric 
                      icon={<TrendingDown className="h-5 w-5" />}
                      label="Cost Benefit"
                      value={formatCurrency(data.executiveDashboard.totalCostBenefit)}
                      color="text-blue-600"
                      bgColor="bg-blue-50"
                    />
                    <DashboardMetric 
                      icon={<DollarSign className="h-5 w-5" />}
                      label="Cash Flow Benefit"
                      value={formatCurrency(data.executiveDashboard.totalCashFlowBenefit)}
                      color="text-purple-600"
                      bgColor="bg-purple-50"
                    />
                    <DashboardMetric 
                      icon={<ShieldCheck className="h-5 w-5" />}
                      label="Risk Benefit"
                      value={formatCurrency(data.executiveDashboard.totalRiskBenefit)}
                      color="text-orange-600"
                      bgColor="bg-orange-50"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-1">Total Annual Value</div>
                      <div className="text-2xl font-bold text-primary" data-testid="text-total-value">
                        {formatCurrency(data.executiveDashboard.totalAnnualValue)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-1">Monthly Tokens</div>
                      <div className="text-2xl font-bold">
                        {formatNumber(data.executiveDashboard.totalMonthlyTokens)}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border bg-card">
                      <div className="text-sm text-muted-foreground mb-1">Value per 1M Tokens</div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(data.executiveDashboard.valuePerMillionTokens)}
                      </div>
                    </div>
                  </div>

                  {data.executiveDashboard.topUseCases && data.executiveDashboard.topUseCases.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        Top 5 Use Cases by Priority
                      </h4>
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-semibold text-primary">Rank</TableHead>
                              <TableHead className="font-semibold text-primary">Use Case</TableHead>
                              <TableHead className="font-semibold text-primary">Priority Score</TableHead>
                              <TableHead className="font-semibold text-primary">Monthly Tokens</TableHead>
                              <TableHead className="font-semibold text-primary">Annual Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.executiveDashboard.topUseCases.map((uc: any, i: number) => (
                              <TableRow key={i} className="hover:bg-muted/20">
                                <TableCell>
                                  <Badge variant={uc.rank <= 3 ? "default" : "secondary"}>#{uc.rank}</Badge>
                                </TableCell>
                                <TableCell className="font-medium">{uc.useCase}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-primary rounded-full" 
                                        style={{ width: `${uc.priorityScore}%` }}
                                      />
                                    </div>
                                    <span className="text-sm font-medium">{uc.priorityScore?.toFixed(0)}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{formatNumber(uc.monthlyTokens)}</TableCell>
                                <TableCell className="font-medium text-green-600">{formatCurrency(uc.annualValue)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {data.summary && (
              <Card className="mb-8" data-testid="card-summary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{data.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Analysis Steps */}
            <div className="flex flex-col space-y-8">
              {data.steps?.map((step: any, index: number) => (
                <StepCard key={index} step={step} />
              ))}
            </div>
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
    <div className={`p-4 rounded-lg border ${bgColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={color}>{icon}</div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
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
      case 4: return <Badge variant="secondary" className="gap-1"><Brain className="h-3 w-3" /> AI Primitives</Badge>;
      case 5: return <Badge variant="secondary" className="gap-1"><DollarSign className="h-3 w-3" /> Benefits</Badge>;
      case 6: return <Badge variant="secondary" className="gap-1"><Calculator className="h-3 w-3" /> Token Model</Badge>;
      case 7: return <Badge variant="secondary" className="gap-1"><Target className="h-3 w-3" /> Priority</Badge>;
      default: return null;
    }
  };

  const isBenefitsStep = step.step === 5;

  return (
    <Card data-testid={`card-step-${step.step}`}>
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-primary/20">
              {step.step}
            </div>
            <CardTitle className="text-xl">{step.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isBenefitsStep && hasData && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs">
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs">
                  Collapse All
                </Button>
              </div>
            )}
            {getStepBadge(step.step)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {step.content && (
          <div className="prose prose-sm max-w-none mb-6 text-muted-foreground">
            <p>{step.content}</p>
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
                            <TableCell colSpan={colCount} className="py-4">
                              <div className="flex flex-col gap-4 px-4">
                                <div className="text-sm font-medium text-primary">Benefit Calculation Breakdown by Driver:</div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Revenue Driver */}
                                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <TrendingUp className="h-5 w-5 text-green-600" />
                                      <span className="font-semibold text-green-700">Grow Revenue</span>
                                    </div>
                                    <div className="text-lg font-bold text-green-800 mb-1">{row['Revenue Benefit ($)'] || '$0'}</div>
                                    {row['Revenue Formula'] && (
                                      <div className="text-sm text-green-700 font-mono bg-green-100/50 p-2 rounded">
                                        {row['Revenue Formula']}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Cost Driver */}
                                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <TrendingDown className="h-5 w-5 text-blue-600" />
                                      <span className="font-semibold text-blue-700">Reduce Cost</span>
                                    </div>
                                    <div className="text-lg font-bold text-blue-800 mb-1">{row['Cost Benefit ($)'] || '$0'}</div>
                                    {row['Cost Formula'] && (
                                      <div className="text-sm text-blue-700 font-mono bg-blue-100/50 p-2 rounded">
                                        {row['Cost Formula']}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Cash Flow Driver */}
                                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <DollarSign className="h-5 w-5 text-purple-600" />
                                      <span className="font-semibold text-purple-700">Increase Cash Flow</span>
                                    </div>
                                    <div className="text-lg font-bold text-purple-800 mb-1">{row['Cash Flow Benefit ($)'] || '$0'}</div>
                                    {row['Cash Flow Formula'] && (
                                      <div className="text-sm text-purple-700 font-mono bg-purple-100/50 p-2 rounded">
                                        {row['Cash Flow Formula']}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Risk Driver */}
                                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <ShieldCheck className="h-5 w-5 text-orange-600" />
                                      <span className="font-semibold text-orange-700">Decrease Risk</span>
                                    </div>
                                    <div className="text-lg font-bold text-orange-800 mb-1">{row['Risk Benefit ($)'] || '$0'}</div>
                                    {row['Risk Formula'] && (
                                      <div className="text-sm text-orange-700 font-mono bg-orange-100/50 p-2 rounded">
                                        {row['Risk Formula']}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Total Summary */}
                                <div className="flex items-center justify-center gap-3 p-3 bg-primary/10 rounded-lg border-2 border-primary">
                                  <Target className="h-6 w-6 text-primary" />
                                  <span className="text-lg font-bold text-primary">Total Annual Value: {row['Total Annual Value ($)'] || '$0'}</span>
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
