import React, { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { HowWeScoreReadiness } from "@/components/dashboard/how-we-score-readiness";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, CheckCircle2, Download, 
  RefreshCw, FileSpreadsheet, FileText, FileType, 
  ArrowLeft, ArrowRight, Brain, Calculator, TrendingUp, TrendingDown, 
  DollarSign, ShieldCheck, Zap, Target, ChevronDown, ChevronRight,
  Settings2, HelpCircle, Info, Sliders, BarChart3, Building2,
  Users, ClipboardList, Lightbulb, Scale, MapPin, Save, Layers, Share2, LayoutDashboard,
  Menu, X, AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType } from 'docx';
import blueAllyLogoUrl from '@assets/image_1764369352062.png';
import blueAllyLogoWhiteUrl from '@assets/blueally-logo-white.png';
import { WorkflowExportPanel } from "@/components/report/WorkflowExportPanel";
import { generateBoardPresentationPDF } from "@/lib/pdfGenerator";
import { parseEpochFlags, getEpochBadge as epochGetBadge } from "@/lib/epoch-utils";
import { STEP_COLUMN_ORDER, COLUMN_NAME_ALIASES } from "@shared/taxonomy";

// ===== COLUMN ORDERING & TAXONOMY =====
// Imported from shared/taxonomy.ts for consistency across all report pages

// Hidden columns that should never appear in main table views
const HIDDEN_COLUMNS = new Set([
  "Cost Formula", "Revenue Formula", "Cash Flow Formula", "Risk Formula", "Benefit Formula",
  "Cost Formula Labels", "Revenue Formula Labels", "Cash Flow Formula Labels", "Risk Formula Labels",
  "Annual Hours", "Hourly Rate", "Measurement Method",
  "Friction Point", // Only hidden when it's a "Target Friction" alias scenario
  "Annual Token Cost", "Annual Token Cost ($)",
]);

function reorderAndFilterColumns(data: any[], stepNum: number): any[] {
  if (!data || data.length === 0) return data;

  const desiredOrder = STEP_COLUMN_ORDER[stepNum];
  if (!desiredOrder || desiredOrder.length === 0) return data;

  return data.map(row => {
    // Normalize column names
    const normalizedRow: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      let canonicalKey = COLUMN_NAME_ALIASES[key] || key;
      if (stepNum === 4 && canonicalKey === 'Use Case') {
        canonicalKey = 'Use Case Name';
      }
      normalizedRow[canonicalKey] = value;
    }

    // Compute Expected Value for Step 5 if not present
    if (stepNum === 5 && !('Expected Value ($)' in normalizedRow)) {
      const totalStr = String(normalizedRow['Total Annual Value ($)'] || 0);
      const totalVal = parseFloat(totalStr.replace(/[^0-9.-]/g, '')) || 0;
      const prob = normalizedRow['Probability of Success'] || 0;
      const probNum = typeof prob === 'number' ? prob : parseFloat(String(prob)) || 0;
      const adjustedProb = probNum > 1 ? probNum / 100 : probNum;
      const ev = totalVal * adjustedProb;
      normalizedRow['Expected Value ($)'] = `$${ev.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
    }

    // Reorder: desired columns first, then extras
    const reorderedRow: Record<string, any> = {};
    for (const col of desiredOrder) {
      if (col in normalizedRow) {
        reorderedRow[col] = normalizedRow[col];
      }
    }
    // Add remaining non-hidden columns
    for (const [key, value] of Object.entries(normalizedRow)) {
      if (!(key in reorderedRow) && !HIDDEN_COLUMNS.has(key)) {
        reorderedRow[key] = value;
      }
    }
    return reorderedRow;
  });
}

// Get visible columns for a step (excludes hidden/formula columns)
function getVisibleColumns(row: any, stepNum: number): string[] {
  const desiredOrder = STEP_COLUMN_ORDER[stepNum];
  if (!desiredOrder) {
    return Object.keys(row).filter(k => !HIDDEN_COLUMNS.has(k));
  }

  const cols: string[] = [];
  // Add ordered columns first
  for (const col of desiredOrder) {
    if (col in row) cols.push(col);
  }
  // Add extras
  for (const key of Object.keys(row)) {
    if (!cols.includes(key) && !HIDDEN_COLUMNS.has(key)) cols.push(key);
  }
  return cols;
}

// Benchmark column color coding
function getBenchmarkCellClass(columnName: string): string {
  if (columnName === "Benchmark (Avg)" || columnName === "Industry Benchmark") {
    return "bg-yellow-50 text-yellow-800";
  }
  if (columnName === "Benchmark (Industry Best)") {
    return "bg-blue-50 text-blue-800";
  }
  if (columnName === "Benchmark (Overall Best)") {
    return "bg-green-50 text-green-800";
  }
  return "";
}

// Strategic theme colors (5 distinct colors for 5 themes)
const THEME_COLORS = [
  { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", badge: "bg-teal-100 text-teal-700 border-teal-300" },
  { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", badge: "bg-rose-100 text-rose-700 border-rose-300" },
  { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700 border-amber-300" },
  { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700", badge: "bg-cyan-100 text-cyan-700 border-cyan-300" },
];

function getThemeColor(themeIndex: number) {
  return THEME_COLORS[themeIndex % THEME_COLORS.length];
}

// Group data by Strategic Theme field
function groupByStrategicTheme(data: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  const ungrouped: any[] = [];

  for (const row of data) {
    const theme = row["Strategic Theme"];
    if (theme) {
      if (!groups.has(theme)) groups.set(theme, []);
      groups.get(theme)!.push(row);
    } else {
      ungrouped.push(row);
    }
  }

  // Add ungrouped items if any
  if (ungrouped.length > 0) {
    groups.set("Other", ungrouped);
  }

  return groups;
}

// Render a labeled formula component grid
function formatLabelValue(label: string, value: any): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);
  const lbl = label.toLowerCase();
  if (lbl.includes('uplift') || lbl.includes('reduction') || lbl.includes('maturity') || lbl.includes('realization') || lbl.includes('adoption') || lbl.includes('loading') || lbl.includes('capital')) {
    if (num >= 0 && num <= 1) return num.toString();
  }
  if (lbl.includes('revenue') || lbl.includes('exposure') || lbl.includes('risk')) {
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `$${Math.round(num / 1_000)}K`;
    return `$${num}`;
  }
  if (lbl.includes('rate') && !lbl.includes('uplift') && !lbl.includes('reduction')) {
    return `$${num}`;
  }
  if (lbl.includes('hours') || lbl.includes('days')) {
    return num.toLocaleString();
  }
  return num.toLocaleString();
}

function renderLabeledFormula(formulaLabels: any, formulaStr: string, colorClass: string): React.ReactNode {
  if (!formulaLabels || !formulaLabels.components || formulaLabels.components.length === 0) {
    return (
      <div className={`text-[10px] md:text-sm ${colorClass} font-mono break-all leading-relaxed`}>
        {formulaStr}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-1 md:gap-2">
        {formulaLabels.components.map((comp: any, idx: number) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-muted-foreground font-mono text-sm self-end pb-0.5">×</span>}
            <div className="flex flex-col items-center">
              <span className="text-[8px] md:text-[10px] text-muted-foreground font-medium mb-0.5 text-center leading-tight">{comp.label}</span>
              <span className={`text-[10px] md:text-sm ${colorClass} font-mono font-semibold bg-white/60 px-1.5 py-0.5 rounded border`}>
                {formatLabelValue(comp.label, comp.value)}
              </span>
            </div>
          </React.Fragment>
        ))}
        <span className="text-muted-foreground font-mono text-sm self-end pb-0.5">=</span>
        <div className="flex flex-col items-center">
          <span className="text-[8px] md:text-[10px] text-muted-foreground font-medium mb-0.5">Result</span>
          <span className={`text-[10px] md:text-sm ${colorClass} font-mono font-bold bg-white/80 px-1.5 py-0.5 rounded border-2`}>
            {formulaLabels.result || formulaStr}
          </span>
        </div>
      </div>
    </div>
  );
}

// Sanitize text for PDF - remove emojis and fix encoding issues
const sanitizeForPDF = (text: string): string => {
  if (!text) return '';
  return text
    // Replace ⚠️ CRITICAL ASSUMPTION with proper formatting
    .replace(/⚠️?\s*CRITICAL\s*ASSUMPTION:?\s*/gi, 'CRITICAL ASSUMPTION: ')
    // Remove warning emoji
    .replace(/⚠️/g, '')
    .replace(/⚠/g, '')
    // Replace arrow symbols with text equivalents (fixing PDF encoding issues)
    .replace(/↑/g, 'Up')
    .replace(/↓/g, 'Down')
    .replace(/[\u2191\u2197]/g, 'Up')  // Unicode up arrows (↑ ↗)
    .replace(/[\u2193\u2198]/g, 'Down') // Unicode down arrows (↓ ↘)
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[\u2192]/g, '->')  // Unicode right arrow
    .replace(/[\u2190]/g, '<-')  // Unicode left arrow
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
};

// Sanitize text for UI display - remove markdown artifacts for professional prose
const sanitizeForProse = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^[-_*]{3,}\s*$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|\s*[-:]+\s*\|/g, '')
    .replace(/^\|(.+)\|$/gm, (_, content) => {
      const cells = content.split('|').map((c: string) => c.trim()).filter((c: string) => c);
      return cells.join(', ');
    })
    .replace(/\|/g, ' ')
    .replace(/⚠️?/g, '')
    .replace(/[\u2600-\u26FF\u2700-\u27BF]/g, '')
    .replace(/[→←↑↓↗↘]/g, '')
    .replace(/\[(HIGH|MEDIUM|LOW|ASSUMPTION|ESTIMATED|DATED)[^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for external URLs to avoid CORS issues with bundled assets
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
        // Fallback: if canvas operations fail (CORS), reject gracefully
        reject(new Error('Canvas drawing failed - possible CORS issue'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

// Parse formatted values like "$2.5M", "$800K", "1.4B tokens" into base numbers
const parseFormattedValue = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  
  // Remove currency symbol and commas first
  let cleanVal = value.replace(/[$,]/g, '').trim();
  
  // Extract number with optional K/M/B suffix using regex
  const match = cleanVal.match(/^([\d.]+)\s*([KkMmBb])?/);
  if (!match) return 0;
  
  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;
  
  // Handle suffixes (K, M, B)
  const suffix = (match[2] || '').toUpperCase();
  let multiplier = 1;
  if (suffix === 'K') multiplier = 1000;
  else if (suffix === 'M') multiplier = 1000000;
  else if (suffix === 'B') multiplier = 1000000000;
  
  return num * multiplier;
};

// Normalize all hours fields in report data to whole numbers
// This ensures every rendering path and export gets clean integers
function normalizeReportData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(item => normalizeReportData(item));
  }
  
  const normalized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes('hours') && typeof value === 'number') {
      normalized[key] = Math.round(value);
    } else if (typeof value === 'object' && value !== null) {
      normalized[key] = normalizeReportData(value);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

// Formatting helpers (used by both Report and StepCard)
// Format numbers with commas for readability (e.g., 1,234,567)
const addCommas = (num: number): string => {
  return num.toLocaleString('en-US');
};

// Format currency values with $ symbol and commas
// Examples: $1,234 | $45,678 | $1.2M | $3.5B
const formatCurrency = (value: number | string): string => {
  if (typeof value === 'string') {
    if (value.startsWith('$')) return value;
    const num = parseFloat(value.replace(/[,$]/g, ''));
    if (isNaN(num)) return value;
    value = num;
  }
  if (typeof value !== 'number' || isNaN(value)) return '$0';
  
  // Handle negative values
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

// Format plain numbers with commas for readability
// All numbers rounded to whole values (except percentages)
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

interface ProgressUpdate {
  step: number;
  message: string;
  detail?: string;
}

// Navigation sections for sidebar (matching actual AI-generated report structure)
const navigationSections = [
  { id: "dashboard", label: "Executive Dashboard", icon: Target },
  { id: "summary", label: "Executive Summary", icon: Brain },
  { id: "step-0", label: "Company Overview", icon: Building2 },
  { id: "step-1", label: "Strategic Anchoring", icon: Target },
  { id: "step-2", label: "Business Functions", icon: ClipboardList },
  { id: "step-3", label: "Friction Points", icon: Zap },
  { id: "step-4", label: "AI Use Cases", icon: Lightbulb },
  { id: "step-5", label: "Benefits Quantification", icon: DollarSign },
  { id: "step-6", label: "Readiness & Token Modeling", icon: Calculator },
  { id: "step-7", label: "Priority Roadmap", icon: MapPin },
];

// Tooltip definitions for key metrics
const metricTooltips: Record<string, string> = {
  "totalAnnualValue": "Total projected annual value across all AI use cases, combining revenue, cost, cash flow, and risk benefits.",
  "revenueBenefit": "Projected annual revenue increase from AI-driven improvements in sales, pricing, and customer retention.",
  "costBenefit": "Projected annual cost savings from AI-driven process automation and efficiency improvements.",
  "cashFlowBenefit": "Projected annual cash flow improvements from accelerated collections and reduced inventory carrying costs.",
  "riskBenefit": "Projected annual risk reduction value from improved compliance, fraud detection, and quality control.",
  "priorityScore": "Composite score (0-100) based on value potential, time-to-value, and implementation readiness.",
  "probabilityOfSuccess": "Estimated likelihood of achieving projected benefits, based on data readiness and implementation complexity.",
  "monthlyTokens": "Estimated total monthly token consumption across all AI use cases, based on projected runs and average tokens per run.",
  "valuePerToken": "Average value generated per million tokens consumed, calculated by dividing total annual value by annual token consumption.",
};

export default function Report() {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const companyName = params.get("company") || "Unknown Company";
  const { toast } = useToast();

  const [status, setStatus] = useState<"init" | "loading" | "complete">("init");
  const [data, setData] = useState<any>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<ProgressUpdate | null>(null);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [failedStep, setFailedStep] = useState<number | null>(null);
  const accumulatedResultsRef = useRef<Record<string, any>>({});
  
  // Assumption drawer state
  const [assumptionDrawerOpen, setAssumptionDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [assumptionEdits, setAssumptionEdits] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Section refs for navigation
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (status === "init") {
      fetchAnalysis();
    }
  }, []);

  const stepLabels: Record<number, string> = {
    0: "Company Overview",
    1: "Strategic Anchoring",
    2: "Business Functions & KPIs",
    3: "Friction Points",
    4: "AI Use Cases",
    5: "Benefits Quantification",
    6: "Readiness & Token Modeling",
    7: "Priority Roadmap",
  };

  const callLabels = [
    "Company Overview & Strategic Themes",
    "Friction Points & AI Use Cases",
    "Benefits Quantification",
    "Readiness, Roadmap & Summary",
  ];

  const runPipelineFromStep = async (startCall: number, accumulatedResults: Record<string, any>, documentContext: string) => {
    const stepsBeforeCall: Record<number, number[]> = {
      1: [],
      2: [0, 1, 2],
      3: [0, 1, 2, 3, 4],
      4: [0, 1, 2, 3, 4, 5],
    };

    for (let callNum = startCall; callNum <= 4; callNum++) {
      setCurrentStep({
        step: callNum,
        message: `Step ${callNum}/4: ${callLabels[callNum - 1]}`,
        detail: `Generating ${callLabels[callNum - 1].toLowerCase()}...`,
      });

      if (stepsBeforeCall[callNum]) {
        setCompletedSteps(stepsBeforeCall[callNum]);
      }

      let attempts = 0;
      const MAX_RETRIES = 3;
      let success = false;

      while (attempts < MAX_RETRIES && !success) {
        try {
          const response = await fetch("/api/analyze/step", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyName,
              callNumber: callNum,
              previousCallResults: accumulatedResults,
              documentContext: callNum === 1 ? documentContext : undefined,
            }),
            signal: AbortSignal.timeout(180_000),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Call ${callNum} failed: HTTP ${response.status}`);
          }

          const result = await response.json();

          if (callNum === 4 && result.report) {
            setReportId(result.report.id);
            setData(normalizeReportData(result.report.data));
            setStatus("complete");
            setCompletedSteps([0, 1, 2, 3, 4, 5, 6, 7, 8]);
            toast({ title: "Analysis Complete", description: "Your strategic analysis has been generated and saved." });
            return;
          }

          accumulatedResults[`call${callNum}`] = result.data;
          accumulatedResultsRef.current = { ...accumulatedResults };
          success = true;
        } catch (err: any) {
          attempts++;
          console.warn(`[Call ${callNum}] Attempt ${attempts} failed:`, err.message);
          if (attempts >= MAX_RETRIES) {
            setFailedStep(callNum);
            accumulatedResultsRef.current = { ...accumulatedResults };
            throw new Error(`Analysis failed at "${callLabels[callNum - 1]}" after ${MAX_RETRIES} attempts: ${err.message}`);
          }
          const delay = 2000 * Math.pow(2, attempts) + Math.random() * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  };

  const fetchAnalysis = async () => {
    try {
      setStatus("loading");
      setError(null);
      setCompletedSteps([]);
      setFailedStep(null);
      accumulatedResultsRef.current = {};

      let documents: Array<{ name: string; content: string }> = [];
      try {
        const storedDocs = sessionStorage.getItem("uploadedDocuments");
        if (storedDocs) {
          documents = JSON.parse(storedDocs);
          sessionStorage.removeItem("uploadedDocuments");
        }
      } catch (e) {}

      let documentContext = "";
      if (documents.length > 0) {
        documentContext = documents.map(d => `--- ${d.name} ---\n${d.content.slice(0, 50000)}\n--- End ---`).join("\n\n");
      }

      const checkResponse = await fetch("/api/analyze/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });

      if (checkResponse.ok) {
        const existing = await checkResponse.json();
        if (existing.exists && existing.report) {
          setReportId(existing.report.id);
          setData(normalizeReportData(existing.report.data));
          setStatus("complete");
          setCompletedSteps([0, 1, 2, 3, 4, 5, 6, 7, 8]);
          toast({ title: "Report Retrieved", description: "Loaded existing analysis." });
          return;
        }
      }

      await runPipelineFromStep(1, {}, documentContext);
    } catch (err: any) {
      console.error("Analysis error details:", err);
      let errorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
      if (errorMessage === "{}") errorMessage = "Connection failed - please try again";
      setError(errorMessage);
      setStatus("complete");
      toast({
        variant: "destructive",
        title: "Analysis Failed",
        description: errorMessage,
      });
    }
  };

  const retryFromStep = async (stepNum: number) => {
    try {
      setStatus("loading");
      setError(null);
      setFailedStep(null);
      await runPipelineFromStep(stepNum, { ...accumulatedResultsRef.current }, "");
    } catch (err: any) {
      console.error("Retry error:", err);
      let errorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
      if (errorMessage === "{}") errorMessage = "Connection failed - please try again";
      setError(errorMessage);
      setStatus("complete");
      toast({
        variant: "destructive",
        title: "Retry Failed",
        description: errorMessage,
      });
    }
  };

  const regenerateAnalysis = async () => {
    if (!reportId) return;

    try {
      setStatus("loading");
      setError(null);
      setCompletedSteps([]);
      setFailedStep(null);
      accumulatedResultsRef.current = {};

      await runPipelineFromStep(1, {}, "");
    } catch (err: any) {
      console.error("Regenerate error details:", err);
      let errorMessage = err instanceof Error ? err.message : String(err || "Unknown error");
      if (errorMessage === "{}") errorMessage = "Connection failed - please try again";
      setError(errorMessage);
      setStatus("complete");
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: errorMessage,
      });
    }
  };

  // Fetch active assumption set for this report
  const { data: activeAssumptions, refetch: refetchAssumptions } = useQuery({
    queryKey: ["/api/assumptions/sets/active", reportId],
    queryFn: async () => {
      if (!reportId) return null;
      const res = await fetch(`/api/assumptions/sets/${reportId}/active`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!reportId && status === "complete",
  });

  // Recalculate mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      if (!reportId) throw new Error("No report ID");
      const res = await fetch(`/api/assumptions/recalculate/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to recalculate");
      return res.json();
    },
    onSuccess: (result) => {
      if (result.report) {
        setData(normalizeReportData(result.report.analysisData));
      }
      setHasUnsavedChanges(false);
      setAssumptionEdits({});
      refetchAssumptions();
      toast({
        title: "Report Recalculated",
        description: "All calculations updated with your assumption changes.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Recalculation Failed",
        description: "Unable to apply assumption changes.",
      });
    },
  });

  // Scroll to section
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
  };

  // Update active section based on scroll
  useEffect(() => {
    const handleScroll = () => {
      const sections = navigationSections.map(s => document.getElementById(s.id));
      const scrollPosition = window.scrollY + 200;
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(navigationSections[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle assumption field edit
  const handleAssumptionEdit = (fieldName: string, value: string) => {
    setAssumptionEdits(prev => ({ ...prev, [fieldName]: value }));
    setHasUnsavedChanges(true);
  };

  // Apply assumption changes
  const applyAssumptionChanges = async () => {
    if (!activeAssumptions?.fields || Object.keys(assumptionEdits).length === 0) {
      return;
    }

    try {
      const updates = Object.entries(assumptionEdits).map(([fieldName, value]) => {
        const field = activeAssumptions.fields.find((f: any) => f.fieldName === fieldName);
        return {
          fieldId: field?.id,
          value,
          source: field?.source || "User Modified",
        };
      }).filter(u => u.fieldId);

      if (updates.length > 0) {
        await fetch("/api/assumptions/fields/batch", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
      }

      await recalculateMutation.mutateAsync();
    } catch (error) {
      console.error("Error applying assumptions:", error);
    }
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
    
    // Pre-load logo for header
    let headerLogoBase64: string | null = null;
    try {
      headerLogoBase64 = await loadImageAsBase64(blueAllyLogoWhiteUrl);
    } catch (e) {
      console.warn('Could not load header logo, using text fallback');
    }
    
    // Set professional font
    doc.setFont('helvetica');

    // Helper: Draw header with logo
    const drawHeader = () => {
      doc.setFillColor(...BRAND.primaryBlue);
      doc.rect(0, 0, pageWidth, 14, 'F');
      
      if (headerLogoBase64) {
        // Logo on left side of header
        try {
          doc.addImage(headerLogoBase64, 'PNG', 8, 2, 28, 10);
        } catch (e) {
          // Fallback to text if image fails
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
      
      // Title text on right side
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.white);
      doc.text('AI Strategic Assessment', pageWidth - 12, 9, { align: 'right' });
    };

    // Helper: Add page with header/footer - Board Standard
    const addPageWithBranding = (isFirst = false) => {
      if (!isFirst) {
        doc.addPage();
        currentPage++;
      }
      
      // Draw header with logo
      drawHeader();
      
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
    
    // Summary narrative - centered, wrapped text
    if (data.summary) {
      yPos = ensureSpace(60, yPos);
      
      doc.setFillColor(...BRAND.lightBlueBg);
      doc.roundedRect(margin, yPos, contentWidth, 8, 3, 3, 'F');
      yPos += 18;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(...BRAND.darkNavy);
      const summaryLines = doc.splitTextToSize(sanitizeForPDF(data.summary), contentWidth - 10);
      
      for (const line of summaryLines) {
        yPos = ensureSpace(8, yPos);
        doc.text(line, centerX, yPos, { align: 'center', maxWidth: contentWidth - 10 });
        yPos += 7;
      }
      yPos += 15;
    }
    
    // ===== ANALYSIS STEPS - Board Presentation Standard =====
    for (const step of data.steps) {
      // Check if this step has meaningful content before creating a new page
      const hasContent = step.content || (step.data && step.data.length > 0);
      if (!hasContent) continue; // Skip empty steps to prevent blank pages
      
      // Start each major step on a new page
      yPos = addPageWithBranding();
      yPos = drawSectionHeading(`Step ${step.step}: ${step.title}`, yPos);
      
      // Special handling for Step 0 (Company Overview) - format as clean, readable paragraphs
      if (step.step === 0 && step.content) {
        const content = sanitizeForPDF(step.content);
        
        // Known section headers (case-insensitive check without stateful regex)
        const knownHeaders = [
          'COMPANY PROFILE',
          'KEY BUSINESS CHALLENGES',
          'STRATEGIC PRIORITIES',
          'EXECUTIVE SUMMARY',
          'OVERVIEW',
          'BUSINESS CONTEXT',
          'INDUSTRY CONTEXT',
          'MARKET POSITION'
        ];
        
        // Check if text starts with a known header
        const isKnownHeader = (text: string): string | null => {
          const upperText = text.toUpperCase().trim();
          for (const header of knownHeaders) {
            if (upperText.startsWith(header)) {
              return header;
            }
          }
          return null;
        };
        
        // Split content by double asterisks (markdown bold) or numbered items
        const sections = content.split(/(?=\*\*[A-Z]|\d+\.\s\*\*)/);
        
        for (const section of sections) {
          if (!section.trim()) continue;
          
          const trimmedSection = section.trim();
          
          // Check for markdown bold headers like **COMPANY PROFILE**
          const boldMatch = trimmedSection.match(/^\*\*([^*]+)\*\*:?\s*/);
          
          if (boldMatch) {
            // This is a section header
            yPos = ensureSpace(20, yPos);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...BRAND.primaryBlue);
            doc.text(boldMatch[1].trim(), centerX, yPos, { align: 'center' });
            yPos += 12;
            
            // Rest of the section as body text
            const bodyText = trimmedSection.substring(boldMatch[0].length).trim();
            if (bodyText) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(...BRAND.darkNavy);
              const bodyLines = doc.splitTextToSize(bodyText, contentWidth - 20);
              for (const line of bodyLines) {
                yPos = ensureSpace(8, yPos);
                doc.text(line, centerX, yPos, { align: 'center', maxWidth: contentWidth - 20 });
                yPos += 6;
              }
              yPos += 8;
            }
          } else if (/^\d+\.\s/.test(trimmedSection)) {
            // Numbered item
            yPos = ensureSpace(15, yPos);
            
            const numMatch = trimmedSection.match(/^(\d+\.)\s*/);
            if (numMatch) {
              // Format number and text together
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(...BRAND.darkNavy);
              
              const itemText = trimmedSection.trim();
              const itemLines = doc.splitTextToSize(itemText, contentWidth - 30);
              for (const line of itemLines) {
                yPos = ensureSpace(8, yPos);
                doc.text(line, margin + 15, yPos);
                yPos += 6;
              }
              yPos += 4;
            }
          } else {
            // Regular paragraph - centered like other content
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...BRAND.darkNavy);
            const paraLines = doc.splitTextToSize(trimmedSection, contentWidth - 20);
            for (const line of paraLines) {
              yPos = ensureSpace(8, yPos);
              doc.text(line, centerX, yPos, { align: 'center', maxWidth: contentWidth - 20 });
              yPos += 6;
            }
            yPos += 6;
          }
        }
        yPos += 12;
      }
      // Standard content handling for other steps
      else if (step.content) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(step.step === 1 ? 11 : 12); // Consistent font size for Step 1
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
        const isNarrativeStep = step.step === 1 || step.step === 2 || step.step === 3; // Strategic Anchoring, Business Functions, Friction Points
        // Apply column reordering and normalization
        const reorderedData = reorderAndFilterColumns(step.data, step.step);
        const allColumns = Object.keys(reorderedData[0]);
        const formulaColumns = allColumns.filter(k => k.includes('Formula'));
        const displayColumns = allColumns.filter(k => !k.includes('Formula') && !k.includes('Labels') && !HIDDEN_COLUMNS.has(k));
        
        // Limit columns for board readability - fewer columns for narrative steps
        const maxCols = isNarrativeStep ? 4 : (isBenefitsStep ? 9 : 6);
        const limitedColumns = displayColumns.slice(0, maxCols);
        
        // Character limits based on step type - narrative steps get more room
        const cellCharLimit = isNarrativeStep ? 120 : 60;
        const truncationLimit = isNarrativeStep ? 100 : 45;
        
        const rows = reorderedData.map((row: any) =>
          limitedColumns.map(col => {
            const val = row[col];
            if (typeof val === 'number' && col.toLowerCase().includes('$')) {
              return formatCurrency(val);
            }
            // Round hours to whole numbers
            if (typeof val === 'number' && col.toLowerCase().includes('hours')) {
              return Math.round(val).toLocaleString();
            }
            if (typeof val === 'number' && val > 1000) {
              return formatNumber(val);
            }
            return sanitizeForPDF(String(val || '')).substring(0, cellCharLimit);
          })
        );
        
        yPos = ensureSpace(40, yPos);
        
        // Calculate column widths based on step type
        const colCount = limitedColumns.length;
        const strictColStyles: any = {};
        
        if (isNarrativeStep) {
          // Narrative steps: wider columns for text-heavy content
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
          // Numeric/structured steps: balanced columns
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
        
        // Apply truncation - less aggressive for narrative steps
        const truncatedRows = rows.map((row: string[]) => 
          row.map((cell: string) => String(cell).substring(0, truncationLimit))
        );
        const truncatedHeaders = limitedColumns.map((h: string) => String(h).substring(0, 25));
        
        // Board-level table - strictly fits page width
        autoTable(doc, {
          startY: yPos,
          head: [truncatedHeaders],
          body: isNarrativeStep ? rows : truncatedRows, // Use full rows for narrative steps
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
            // Re-add header/footer on new pages
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
          
          // Formulas table - strict widths to fit page with better text wrapping
          const formulaTableColumns = ['ID', 'Use Case', ...formulaColumns.slice(0, 2)]; // Limit to 4 columns max
          const formulaRows = step.data.map((row: any) => 
            [
              row['ID'] || '', 
              String(row['Use Case'] || '').substring(0, 40),
              ...formulaColumns.slice(0, 2).map(col => sanitizeForPDF(String(row[col] || 'N/A')).substring(0, 80))
            ]
          );
          
          // Fixed widths: ID=12, UseCase=45, Formula cols get more space for text
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
  const generateExcel = async () => {
    const wb = new ExcelJS.Workbook();
    
    // Cover Sheet - Board Standard
    const coverSheet = wb.addWorksheet('Cover');
    
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
    
    coverData.forEach((row) => {
      coverSheet.addRow(row);
    });
    
    // Set column width for cover sheet
    coverSheet.getColumn(1).width = 60;
    
    // Executive Dashboard Sheet - Board Standard
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      const dashSheet = wb.addWorksheet('Executive Dashboard');
      
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
      
      dashData.forEach((row) => {
        dashSheet.addRow(row);
      });
      
      // Set column widths for dashboard
      dashSheet.getColumn(1).width = 25;
      dashSheet.getColumn(2).width = 50;
      dashSheet.getColumn(3).width = 18;
      dashSheet.getColumn(4).width = 18;
      dashSheet.getColumn(5).width = 18;
    }

    // VRM v2.1 — Methodology Integrity Sheet
    if (data.vrm?.diagnostic) {
      const diag = data.vrm.diagnostic;
      const schemaVersion = data.vrm.schemaVersion || '2.1';
      const integritySheet = wb.addWorksheet('Methodology Integrity');

      const totalUseCases = diag.totalUseCases ?? 0;
      const protoCount = diag.prototypingCandidatesCount ?? 0;
      const protoPct = diag.prototypingCandidatesPct ??
        (totalUseCases > 0 ? Math.round((protoCount / totalUseCases) * 100) : 0);
      const foundationHard = diag.foundationHardCount ?? 0;
      const foundationSoft = diag.foundationSoftCount ?? 0;

      const integrityData: (string | number)[][] = [
        [""],
        [`METHODOLOGY INTEGRITY (v${schemaVersion})`],
        [""],
        ["SUMMARY"],
        [""],
        ["Metric", "Value"],
        ["Total Use Cases", totalUseCases],
        ["Prototyping Candidates", `${protoCount} (${protoPct}%)`],
        ["Median Value Score", diag.medianValueScore ?? 0],
        ["Median Readiness Score", diag.medianReadinessScore ?? 0],
        [""],
        [""],
        ["QUADRANT BREAKDOWN"],
        [""],
        ["Quadrant", "Count"],
        ["Champion", diag.championCount ?? 0],
        ["Conditional Champion", diag.conditionalChampionCount ?? 0],
        ["Quick Win", diag.quickWinCount ?? 0],
        ["Strategic", diag.strategicCount ?? 0],
        [`Foundation (${foundationHard} hard / ${foundationSoft} soft)`, diag.foundationCount ?? 0],
        [""],
        [""],
        ["WARNINGS"],
        [""],
      ];

      const warnings = diag.warnings || [];
      if (warnings.length === 0) {
        integrityData.push(["No methodology integrity warnings — portfolio passes all v2.1 checks."]);
      } else {
        integrityData.push(["Severity", "Code", "Message", "Recommendation"]);
        warnings.forEach((wn: any) => {
          integrityData.push([
            String(wn.severity || '').toUpperCase(),
            wn.code || '',
            wn.message || '',
            wn.remediation || wn.recommendedAction || '',
          ]);
        });
      }

      integrityData.forEach((row) => integritySheet.addRow(row));

      integritySheet.getColumn(1).width = 30;
      integritySheet.getColumn(2).width = 30;
      integritySheet.getColumn(3).width = 60;
      integritySheet.getColumn(4).width = 60;
    }

    // Step sheets with proper column widths and data handling
    data.steps.forEach((step: any) => {
      if (step.data && step.data.length > 0) {
        const sheetName = `Step ${step.step}`.substring(0, 31);
        const ws = wb.addWorksheet(sheetName);

        // Add header rows
        ws.addRow([`STEP ${step.step}: ${step.title.toUpperCase()}`]);
        ws.addRow([sanitizeForProse(step.content || '')]);
        ws.addRow(['']);

        // Apply column reordering and normalization
        const reorderedStepData = reorderAndFilterColumns(step.data, step.step);

        // Get all unique column keys from reordered data
        const allKeys = new Set<string>();
        reorderedStepData.forEach((dataRow: any) => {
          Object.keys(dataRow).forEach(key => allKeys.add(key));
        });
        const cols = Array.from(allKeys).filter(k => !HIDDEN_COLUMNS.has(k) && !k.includes('Labels'));

        // Add column headers
        ws.addRow(cols);

        // Add data rows, preserving native types
        reorderedStepData.forEach((dataRow: any) => {
          const values = cols.map(col => {
            const val = dataRow[col];
            // Handle different value types
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            // Round hours to whole numbers
            if (col.toLowerCase().includes('hours') && typeof val === 'number') {
              return Math.round(val);
            }
            // Preserve numbers, booleans, and strings as native types
            return val;
          });
          ws.addRow(values);
        });
        
        // Set column widths based on content
        cols.forEach((col, index) => {
          const columnIndex = index + 1;
          ws.getColumn(columnIndex).width = Math.min(40, Math.max(15, col.length + 5));
        });
      }
    });

    // Write to buffer and save
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.xlsx`);
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
          text: sanitizeForProse(data.summary),
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        })
      );
    }

    // Analysis Steps - Centered headers
    data.steps.forEach((step: any) => {
      const isBenefitsStepDocx = step.step === 5;
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
            text: sanitizeForProse(step.content),
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      }

      if (step.data && step.data.length > 0) {
        // Apply column reordering and normalization
        const reorderedDocxData = reorderAndFilterColumns(step.data, step.step);
        const allColumns = Object.keys(reorderedDocxData[0]);
        const columns = allColumns.filter(k => !k.includes('Formula') && !k.includes('Labels') && !HIDDEN_COLUMNS.has(k)).slice(0, isBenefitsStepDocx ? 9 : 6);

        const tableRows = [
          new DocxTableRow({
            children: columns.map(col =>
              new DocxTableCell({
                children: [new Paragraph({ text: col, alignment: AlignmentType.CENTER })],
                shading: { fill: "001278" },
              })
            ),
          }),
          ...reorderedDocxData.map((row: any) =>
            new DocxTableRow({
              children: columns.map(col => {
                const val = row[col];
                // Round hours to whole numbers
                const formattedVal = col.toLowerCase().includes('hours') && typeof val === 'number'
                  ? Math.round(val).toLocaleString()
                  : String(val || '').substring(0, 50);
                return new DocxTableCell({
                  children: [new Paragraph({ text: formattedVal, alignment: AlignmentType.CENTER })],
                });
              }),
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

    // VRM v2.1 — Methodology Integrity (Appendix)
    if (data.vrm?.diagnostic) {
      const diag = data.vrm.diagnostic;
      const schemaVersion = data.vrm.schemaVersion || '2.1';
      const totalUseCases = diag.totalUseCases ?? 0;
      const protoCount = diag.prototypingCandidatesCount ?? 0;
      const protoPct = diag.prototypingCandidatesPct ??
        (totalUseCases > 0 ? Math.round((protoCount / totalUseCases) * 100) : 0);
      const foundationHard = diag.foundationHardCount ?? 0;
      const foundationSoft = diag.foundationSoftCount ?? 0;

      children.push(
        new Paragraph({
          text: `METHODOLOGY INTEGRITY (v${schemaVersion})`,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          text: `${totalUseCases} use cases analyzed · ${protoCount} prototyping candidates (${protoPct}%)`,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: "Quadrant Breakdown",
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 120 },
        })
      );

      const quadrantTable = new DocxTable({
        rows: [
          new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [new Paragraph({ text: "Quadrant", alignment: AlignmentType.CENTER })],
                shading: { fill: "001278" },
              }),
              new DocxTableCell({
                children: [new Paragraph({ text: "Count", alignment: AlignmentType.CENTER })],
                shading: { fill: "001278" },
              }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Champion", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: String(diag.championCount ?? 0), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Conditional Champion", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: String(diag.conditionalChampionCount ?? 0), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Quick Win", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: String(diag.quickWinCount ?? 0), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: "Strategic", alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: String(diag.strategicCount ?? 0), alignment: AlignmentType.CENTER })] }),
            ],
          }),
          new DocxTableRow({
            children: [
              new DocxTableCell({ children: [new Paragraph({ text: `Foundation (${foundationHard} hard / ${foundationSoft} soft)`, alignment: AlignmentType.CENTER })] }),
              new DocxTableCell({ children: [new Paragraph({ text: String(diag.foundationCount ?? 0), alignment: AlignmentType.CENTER })] }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
      });
      children.push(quadrantTable);

      children.push(
        new Paragraph({
          text: "Warnings",
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 120 },
        })
      );

      const warnings = diag.warnings || [];
      if (warnings.length === 0) {
        children.push(
          new Paragraph({
            text: "No methodology integrity warnings — portfolio passes all v2.1 checks.",
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          })
        );
      } else {
        const warningsTable = new DocxTable({
          rows: [
            new DocxTableRow({
              children: [
                new DocxTableCell({
                  children: [new Paragraph({ text: "Severity", alignment: AlignmentType.CENTER })],
                  shading: { fill: "001278" },
                }),
                new DocxTableCell({
                  children: [new Paragraph({ text: "Code", alignment: AlignmentType.CENTER })],
                  shading: { fill: "001278" },
                }),
                new DocxTableCell({
                  children: [new Paragraph({ text: "Message", alignment: AlignmentType.CENTER })],
                  shading: { fill: "001278" },
                }),
                new DocxTableCell({
                  children: [new Paragraph({ text: "Recommendation", alignment: AlignmentType.CENTER })],
                  shading: { fill: "001278" },
                }),
              ],
            }),
            ...warnings.map((wn: any) =>
              new DocxTableRow({
                children: [
                  new DocxTableCell({ children: [new Paragraph({ text: String(wn.severity || '').toUpperCase(), alignment: AlignmentType.CENTER })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: String(wn.code || ''), alignment: AlignmentType.CENTER })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: String(wn.message || ''), alignment: AlignmentType.LEFT })] }),
                  new DocxTableCell({ children: [new Paragraph({ text: String(wn.remediation || wn.recommendedAction || ''), alignment: AlignmentType.LEFT })] }),
                ],
              })
            ),
          ],
          width: { size: 100, type: WidthType.PERCENTAGE },
        });
        children.push(warningsTable);
      }
    }

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
      mdContent += `${sanitizeForProse(data.summary)}\n\n`;
    }

    // Analysis Steps
    data.steps.forEach((step: any) => {
      const isBenefitsStepMd = step.step === 5;
      mdContent += `---\n\n`;
      mdContent += `## STEP ${step.step}: ${step.title.toUpperCase()}\n\n`;
      
      if (step.content) {
        mdContent += `${sanitizeForProse(step.content)}\n\n`;
      }

      if (step.data && step.data.length > 0) {
        // Apply column reordering and normalization
        const reorderedMdData = reorderAndFilterColumns(step.data, step.step);
        const allColumns = Object.keys(reorderedMdData[0]);
        const columns = allColumns.filter(k => !k.includes('Formula') && !k.includes('Labels') && !HIDDEN_COLUMNS.has(k)).slice(0, isBenefitsStepMd ? 9 : 6);
        mdContent += `| ${columns.join(' | ')} |\n`;
        mdContent += `| ${columns.map(() => ':---:').join(' | ')} |\n`;
        reorderedMdData.forEach((row: any) => {
          const values = columns.map(col => {
            const val = row[col];
            // Round hours to whole numbers
            if (col.toLowerCase().includes('hours') && typeof val === 'number') {
              return Math.round(val).toLocaleString();
            }
            return String(val || '').substring(0, 40);
          });
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

  // HTML Generation - Professional Web Report
  const generateHTML = () => {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlueAlly AI Strategic Assessment - ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; padding: 40px 20px; }
    .header { background: linear-gradient(135deg, #001278 0%, #02a2fd 100%); color: white; padding: 40px; text-align: center; border-radius: 12px; margin-bottom: 30px; }
    .header-logo { height: 40px; margin-bottom: 16px; }
    .header h1 { font-size: 16px; margin-bottom: 10px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: white; }
    .header .company { font-size: 24px; font-weight: 600; margin-bottom: 8px; color: white; }
    .header .date { opacity: 0.9; font-size: 14px; color: white; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 24px; overflow: hidden; }
    .card-header { background: #f1f5f9; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; }
    .card-header h2 { font-size: 18px; color: #001278; display: flex; align-items: center; gap: 12px; }
    .step-badge { background: #001278; color: white; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; }
    .card-content { padding: 24px; }
    .executive-dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .metric-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
    .metric-box.primary { background: linear-gradient(135deg, #001278 0%, #02a2fd 100%); color: white; grid-column: span 2; }
    .metric-label { font-size: 12px; text-transform: uppercase; opacity: 0.8; margin-bottom: 4px; }
    .metric-value { font-size: 24px; font-weight: bold; }
    .metric-box.primary .metric-value { font-size: 32px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #001278; color: white; padding: 12px 16px; text-align: left; font-weight: 600; }
    td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
    tr:hover { background: #f8fafc; }
    .benefit-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 16px; }
    .benefit-card { padding: 16px; border-radius: 8px; }
    .benefit-card.revenue { background: #ecfdf5; border: 1px solid #a7f3d0; }
    .benefit-card.cost { background: #eff6ff; border: 1px solid #bfdbfe; }
    .benefit-card.cashflow { background: #faf5ff; border: 1px solid #e9d5ff; }
    .benefit-card.risk { background: #fff7ed; border: 1px solid #fed7aa; }
    .benefit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .benefit-label { font-weight: 600; font-size: 14px; }
    .benefit-value { font-size: 20px; font-weight: bold; padding: 4px 12px; border-radius: 6px; }
    .benefit-card.revenue .benefit-value { background: #a7f3d0; color: #166534; }
    .benefit-card.cost .benefit-value { background: #bfdbfe; color: #1e40af; }
    .benefit-card.cashflow .benefit-value { background: #e9d5ff; color: #7c3aed; }
    .benefit-card.risk .benefit-value { background: #fed7aa; color: #c2410c; }
    .formula-box { background: white; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; word-break: break-all; }
    .total-summary { background: linear-gradient(135deg, #001278 0%, #02a2fd 100%); color: white; padding: 20px; border-radius: 8px; margin-top: 16px; }
    .total-summary .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .total-summary .total-value { font-size: 28px; font-weight: bold; background: white; color: #001278; padding: 8px 16px; border-radius: 8px; }
    .total-breakdown { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: rgba(255,255,255,0.1); padding: 12px; border-radius: 6px; }
    .breakdown-chip { padding: 4px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; }
    .breakdown-chip.revenue { background: #a7f3d0; color: #166534; }
    .breakdown-chip.cost { background: #bfdbfe; color: #1e40af; }
    .breakdown-chip.cashflow { background: #e9d5ff; color: #7c3aed; }
    .breakdown-chip.risk { background: #fed7aa; color: #c2410c; }
    .breakdown-chip.total { background: white; color: #001278; font-weight: bold; }
    .operator { color: rgba(255,255,255,0.7); }
    .summary-text { background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #001278; }
    .footer { text-align: center; padding: 40px 20px; color: #64748b; font-size: 14px; }
    @media (max-width: 768px) {
      .benefit-grid { grid-template-columns: 1fr; }
      .executive-dashboard { grid-template-columns: 1fr; }
      .metric-box.primary { grid-column: span 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAABGCAYAAAA6qvMsAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAA4aADAAQAAAABAAAARgAAAADamIVBAAANoklEQVR4Ae2dT4gkdxXHd5PNP43QMTlIEpk6iCGnbTEHBXUr4iEIur3gQVCYSnIRPGwHchAUplYEJXhob0GFrREFBWF7VVDwML2Yg3pwJwdBQd0elSSokI5RI8km6+etVb01v3mv/nRXVffs/B681O/3fX9/r36vqrq6Z3PsmCdfAV8BXwFfAV+Bo1yB40d58X7tvgJlFbh27dod6HwJvhu+K8d35saCa/OfHT9+fIDMk6+Ar8AyFaARn4UXobcwet8ysb2tr4CvABWgke6DX1qkC7EZ+yL6CvgKNFABmulj8JsLNKLcDd/TQAreha+ArwDN9IUFmlBMEl89XwFfgYYqQEM9AV+VzqpBb6Dr74YNnQPv5ghVgMY5CX/ZXTLYR+F/wHUocf34ua+Ar0BBBeiuW+BdWO56fVcVbAP+CVyVxI+/G7qF9HNfAasCNEz+899l5rdruuCPwNvwq3AZJZoP/2W9VhWPHekK0EknKcCv4XzjPcUX7yOrMNjIl/Wn4I/A74dl7tJVgE/hZ+YK/NxXwFcgrQDNdDssj6EuvQAgv4zx5CvgK9BmBWi0r7ndl5sP24ztffsKHPkK0GzyNrToC/lJG0XynwnbqKr3eegqQPPJ579d+OGS5O/nM92LJTr7xPi+DeAx+ENwAD8Avxu+H/4s7MlXwFeARil6DEU8p0HVamFxAv4i/PLcev/gRaa33VLVodfzFbjJK3BrxfXJm89Sork+iNJv4a/APcPgHHfVNwyZh30FjlYFaJq74b/AZfRsUWUwvhV+BpYfbhfRHxCeKPLlZb4CR64CNMWgqGtS2fetwiB/G/zzCj5E5dOWH4/7ChzpCtAcPy5poh9oBcLmLvhXJbaZ+LLmw2O+Ar4CVIAueRAu+gma+jiKTVnzZg0oR3lT6slXwFfAqgBN8nS+Y5yx/Hsz+wj5k45O0fQX+4z9xFfAV+BgBeigO+DfGZ207y6Gzjvgvxu6GvzIwYge8RXwFThQAbonVDpIfk1zX16Z+dcVPQsa52392FfAV6CkAnRS4nTTJG+C7AH4dUfHmkoDP5S392NfAV+BkgrQNPfC+b+gj/ImyL4DV6Ukb5sfr91vR1mR/GOrd+aTTMev8uuCtxTcQ2tUAc6ffAH9diWl/2i/DkFffqki/7CuS6+h/7oLdj0nvyeJ+W34b/AGOf03ywHZxxm/E74nPebH8iuZe1Nc1vcwtn/meJBw1AbJXyJfgM/CwcGoNoL+V2GN3mtbeUmVClBU7XNOVuu4io8yHZx9InPoHCPNFh3591o0+rymvwqM5Hbgz7UVu63fjvZJeACP4CssQBpSrgyeVluBrYLwcsH050gv0BPA39JFy6NtNaGbmTSkNGPfFfh5NxWg9iGRhC2SBhxawqOM8xh5BX6zrRp01YSSv5xkf0ds60yW+43KVY5tVtDxKg1XoMsmlNQDeCQDT91VgLtgQLQqDRagG3WXmY8kFTCbkNtvLcLXoymf4bgNW3SaEy13RU/dVSCuEaroc2MNN161agXMJqzqINOjYycpjzlG4PK/hHolk+eO0oCD3NwPW6xAjbtgloXcDf35yarRwbGxJnRzpRF3wYYuns4DA7/p4bQpulyndQ4kB+uJ5WyXCR71WG3/Za80okY9DVwEY1OH2J1SbLe5EEwV3IQK7hqX8DUxDRUBvmSNklcID+AAvk7IsuGUgfAYvlg3X2wKKc1h01C6BB7Dmly+TwzrrtmIszRMLoGRp/iWuu3KYBHC95Zht930+TDiXP/7KfI4SKZBTcFBz9eRkeUGaa0v69GPjRihFcPC8SObT6PYsnFxjHvwFvwyXJfOYxC4Phed48uqjeQVil+OiUwU2lkkLn5a+bIev1MlR4GSRfIUG2wjw+cMvLeo37p2rT2OposMjYRmBn6oYU5cnwXIX03H8CInMcLuCn6sqzPiapRuIuux8vncXS4xPIb4CAzZKuCREXRziTy1pwAJM6I+ne3RVpuQxUSyIoUmCnaoITZCxAKkAQN4WYrxd35JJwPsrQvBfEOnzSiPphrFGrgiLCGu9qJP0onkP3WI+vbRDw2beX0MeaNwa03IIuVqrl1p9nJX4UYXsypnrHVA7KKmkc0jG/1cji8ytjYVomPyqFTkU3SKSOqvkdQ/cQTuPBNvkkOQTVZ5JOcZ8a3msO74RSkPDeF2GssQNw+bL2YovnUSy7LooxDCPUMxMvBDCaeb1GqWPRYVK5t+vlbsB0xG8MYcvDGQRpQXD+MbUPkImwitwNCUWPtI8sMmBtRyEDyC14Ekd21fyufwqKjO+eTR7TE/ncdy4zg37mZIQl1SVLYqkjlUL2bId2wUcBdcTnYpiR4sjaDRlVIHjgJOrmiOwGawmhP40LCRF0yqjRP2+hTdVl7MZLHwb9VpJ9MpO+JDLm4ajcts25C39jiqJPtU1SuVYruWEGcxJDHtivo8uLzin1VJXPTgCF2xcykgztAFrTm6A2SBIS964ZBgoz0e98ArxzfiNgnHhrOQtfcNmQtrd1PRGbmKXcy7bMItimQtvou1thEjMpwOqzagYz9w5tl0MxtUOBZ9Pkos+zTfsSE/y7nrGbJOYfKcEnDbCDo08DnMOkImwRy4MbiE78mNaXejLptQTmJMEc53t7zWI4VKhIVPZsEG61dpgnSDaTlJmtupfyXlORTPR/sHcu4G+6GVzkZG9M0KdYoM28TAW4fNFzNEvrRE9FMFtvI8vseGiAt01l7EGvokuaEkuoFsR8GrQoGhKPEmhiyDt7KBcjxZMa8Ztj3FXnwnCt45xN7ZZS2yP08pwYdgsYIfw0bWtanIZD8mCt4JZDYhSYXLZMCCB9iP4A3FzxbyhBhTRXZYIDmhGgWAwk1TH4cTyyn1DJCFlhxc7JehgBiV30AuE6iibYzejqIrTSYyjYYaCBYbeCdwa4+jNNiYFciJ3zNWEhn4YYF7HSdaFi/uIJ+tDmJUCsH+mqBovcgaGE6kQV16BV+JC3Y5b60JZREsbsZhaCwoNPDDApc1RWfrSO+C2gZrOge5G4ZNO13C38iwPfByirwH6AaKvuVDUW0HarUJ05QnRuonDfywwNM1SjTuMJd1uhsmrFt70grTC1O+LAcaE6F8JXPzN2F6N8wXIxv3ssFNdjzDmtug2KoTweSzWqNErMeNeLLBQ0O2Cjg2gs7xtCFDRW9M0WYK3inUxZ2w0wUtGaxf1Z6TNzF0BwZ+2OAxCWtf3ss6IvnPOhDnISEPLc/TNF8vzXFo5BobeKdw601IIaxNqX2o7nTxSjDrZCmq16GLimAzd/IVsQ2JHXwB3lE4sC3/L8HmHlj+N10X4Z/Cd5XZWPL0DjEy5Jv4DgzZKmAtzx6JRGky2uflbdY4TeUrPbTehKxOexaXRe82tPKZ4Wdg4CrMpkoQbKhCGxwbogsGXgYPUZC8Q4fZL/aGkYaAv4fNS7D8k+2fhP+EzWscl6FRgXFcIOtaJHlqd0P5pU+ErKcklCjYaiCSVGnZbHAqG0Ou6hbJZjtAKNf9Abd8RtHoZcD+gQAOgI7cfc7DRRQ7ZvMpRlPD8Dy4dvLntvkBupHhR+Awr5sfIzsN/1uUcvQW44fyeouO8ZPk/LrDwPWLQqs/4HbjZXPijtzk0rnsA5cmmd06HE9YSZD1om/BAnzK5i9qgD2u0mMrdh0cPxNy1UykAXaQye84t10FcJHLY8oQDuBFSey1O18EHhIn1uJnwZAHjCWPGNboG7JGTYDt0+DPwMcd+Y+w+b2DLTqNMZT8NIoAY02wAmxETO2pS86zS6K7PsSJXAX1rQqQTK07ofjBpuhqna1vh0HGlzOw4jG28q0YX67GF+Ath3eYF5H8PEvbRLLm0wWGHyjKt66MOGMjlqxrX37MV3InrHgeZBnTuutvXV+y6piiokWRyyJNGGA3a3EdcVHOIiN2lQtBnRSLGlDWKw2g0S/Lcq0rJ0ioBUqxOO8PbJVNKHUpoyif7zqMu3gxk61TPjjLd2hJBjR1xOcUXyGsfTgHrkTPo3WmkqaiRA4R8DlFtAh0EaMQnzPDOAbfdwfK6Y1y40aG5DHBkdRHI+0RUNNrHUv3gdTOopX/RE1LrIsm3COwbM6AIo21JJrA8L0rMeBLNf29gv457PscZzVt96njIwZ4FK6bQ+Znj8Hj+BnAai5c5h9E5zOZgXOUz4E/dLCmpiPDUY+cIkO2CtjKU3Ipkq0i1+sx5cXMohsmn7RsmN08kM532UxTBy+b/gaF7ypK/1SwfVC6ceXRqY9gCIfwBqyRXNnH8Ci34WfMtXpMwSsRviYoSg4Bx0jG8CnYImm8CTzGVvIpow+j8Jyh9E18XDVkS8H4TVjTACc9xVEIlqT4Xzlq5++Pqdw9yNcqmv5CL5ak/uQ5xWcA50kutqM8sC7j4+uSSFt5cEJk0/Tz/uVE5eddjNcljy7WusoY1Dkg/hUlh23Oe6TgHvIV8BVosgI04WVYo6DJON6Xr8CRrgAdFsGnhKUQHPuwfGWzA2uUHOmC+cX7CjRdAbpMPvdVJfnqKmg6hyb9dfF2tMl8vS9fgboVkF8sTesaeX1fAV+BggpwZ6t6J0wK3KyNyN8J1+ZU+EQarED23W/UoM/WXN30X1G0VjnveGUV4E74GMHla6d3OUn8i/ku/ByPoPL946Gg/wG43MM9CqEA7AAAAABJRU5ErkJggg==" alt="BlueAlly" class="header-logo" />
      <h1>AI Strategic Assessment</h1>
      <div class="company">${companyName}</div>
      <div class="date">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
    </div>
`;

    // Executive Dashboard
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      html += `
    <div class="card">
      <div class="card-header"><h2>Executive Dashboard</h2></div>
      <div class="card-content">
        <div class="executive-dashboard">
          <div class="metric-box primary">
            <div class="metric-label">Total Annual AI Value Opportunity</div>
            <div class="metric-value">${formatCurrency(dash.totalAnnualValue)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Revenue Benefit</div>
            <div class="metric-value" style="color: #16a34a;">${formatCurrency(dash.totalRevenueBenefit)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Cost Benefit</div>
            <div class="metric-value" style="color: #2563eb;">${formatCurrency(dash.totalCostBenefit)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Cash Flow Benefit</div>
            <div class="metric-value" style="color: #7c3aed;">${formatCurrency(dash.totalCashFlowBenefit)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Risk Benefit</div>
            <div class="metric-value" style="color: #ea580c;">${formatCurrency(dash.totalRiskBenefit)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Monthly Tokens</div>
            <div class="metric-value">${formatNumber(dash.totalMonthlyTokens)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Value per 1M Tokens</div>
            <div class="metric-value">${formatCurrency(dash.valuePerMillionTokens)}</div>
          </div>
        </div>
`;

      // Top Use Cases Table
      if (dash.topUseCases && dash.topUseCases.length > 0) {
        html += `
        <h3 style="margin: 24px 0 16px; color: #001278;">Top Priority Use Cases</h3>
        <table>
          <thead>
            <tr><th>#</th><th>Use Case</th><th>Priority</th><th>Tokens/Month</th><th>Annual Value</th></tr>
          </thead>
          <tbody>
`;
        dash.topUseCases.forEach((uc: any) => {
          html += `            <tr><td>${uc.rank}</td><td>${uc.useCase}</td><td>${uc.priorityScore?.toFixed(0) || 'N/A'}</td><td>${formatNumber(uc.monthlyTokens)}</td><td>${formatCurrency(uc.annualValue)}</td></tr>\n`;
        });
        html += `          </tbody>
        </table>
`;
      }
      html += `      </div>
    </div>
`;
    }

    // Executive Summary
    if (data.summary) {
      html += `
    <div class="card">
      <div class="card-header"><h2>Executive Summary</h2></div>
      <div class="card-content">
        <div class="summary-text">${sanitizeForProse(data.summary)}</div>
      </div>
    </div>
`;
    }

    // Analysis Steps
    data.steps.forEach((step: any) => {
      const isBenefitsStep = step.step === 5;
      
      html += `
    <div class="card">
      <div class="card-header">
        <h2><span class="step-badge">${step.step}</span> ${step.title}</h2>
      </div>
      <div class="card-content">
`;

      if (step.content) {
        html += `        <p style="margin-bottom: 16px; color: #64748b;">${sanitizeForProse(step.content)}</p>\n`;
      }

      if (step.data && step.data.length > 0) {
        // Apply column reordering and normalization
        const reorderedHtmlData = reorderAndFilterColumns(step.data, step.step);
        const allColumns = Object.keys(reorderedHtmlData[0]);
        const columns = allColumns.filter(k => !k.includes('Formula') && !k.includes('Labels') && !HIDDEN_COLUMNS.has(k)).slice(0, isBenefitsStep ? 9 : 6);

        html += `        <table>
          <thead>
            <tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
`;
        reorderedHtmlData.forEach((row: any, idx: number) => {
          html += `            <tr>${columns.map(c => {
            const val = row[c];
            // Format hours as whole numbers
            if (c.toLowerCase().includes('hours') && typeof val === 'number') {
              return `<td>${Math.round(val).toLocaleString()}</td>`;
            }
            return `<td>${String(val || '').substring(0, 60)}</td>`;
          }).join('')}</tr>\n`;
          
          // Add benefit breakdown for Step 5
          if (isBenefitsStep) {
            html += `            <tr><td colspan="${columns.length}" style="padding: 0; background: #f8fafc;">
              <div class="benefit-grid" style="padding: 16px;">
                <div class="benefit-card revenue">
                  <div class="benefit-header">
                    <span class="benefit-label">Grow Revenue</span>
                    <span class="benefit-value">${row['Revenue Benefit ($)'] || '$0'}</span>
                  </div>
                  ${row['Revenue Formula'] ? `<div class="formula-box">${row['Revenue Formula']}</div>` : '<em style="color: #64748b; font-size: 12px;">No revenue impact</em>'}
                </div>
                <div class="benefit-card cost">
                  <div class="benefit-header">
                    <span class="benefit-label">Reduce Cost</span>
                    <span class="benefit-value">${row['Cost Benefit ($)'] || '$0'}</span>
                  </div>
                  ${row['Cost Formula'] ? `<div class="formula-box">${row['Cost Formula']}</div>` : '<em style="color: #64748b; font-size: 12px;">No cost impact</em>'}
                </div>
                <div class="benefit-card cashflow">
                  <div class="benefit-header">
                    <span class="benefit-label">Cash Flow</span>
                    <span class="benefit-value">${row['Cash Flow Benefit ($)'] || '$0'}</span>
                  </div>
                  ${row['Cash Flow Formula'] ? `<div class="formula-box">${row['Cash Flow Formula']}</div>` : '<em style="color: #64748b; font-size: 12px;">No cash flow impact</em>'}
                </div>
                <div class="benefit-card risk">
                  <div class="benefit-header">
                    <span class="benefit-label">Reduce Risk</span>
                    <span class="benefit-value">${row['Risk Benefit ($)'] || '$0'}</span>
                  </div>
                  ${row['Risk Formula'] ? `<div class="formula-box">${row['Risk Formula']}</div>` : '<em style="color: #64748b; font-size: 12px;">No risk impact</em>'}
                </div>
              </div>
              <div class="total-summary" style="margin: 0 16px 16px;">
                <div class="header-row">
                  <strong>Total Annual Value</strong>
                  <span class="total-value">${row['Total Annual Value ($)'] || '$0'}</span>
                </div>
                <div class="total-breakdown">
                  <span class="breakdown-chip revenue">${row['Revenue Benefit ($)'] || '$0'}</span>
                  <span class="operator">+</span>
                  <span class="breakdown-chip cost">${row['Cost Benefit ($)'] || '$0'}</span>
                  <span class="operator">+</span>
                  <span class="breakdown-chip cashflow">${row['Cash Flow Benefit ($)'] || '$0'}</span>
                  <span class="operator">+</span>
                  <span class="breakdown-chip risk">${row['Risk Benefit ($)'] || '$0'}</span>
                  <span class="operator">=</span>
                  <span class="breakdown-chip total">${row['Total Annual Value ($)'] || '$0'}</span>
                </div>
              </div>
            </td></tr>\n`;
          }
        });
        
        html += `          </tbody>
        </table>
`;
      }

      html += `      </div>
    </div>
`;
    });

    // Footer
    html += `
    <div class="footer">
      <p>Prepared by <strong>BlueAlly Insight</strong> | Enterprise AI Advisory</p>
      <p>www.blueally.com</p>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    saveAs(blob, `BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.html`);
  };

  const generateJSON = () => {
    if (!data) return;
    
    const cleanedData = JSON.parse(JSON.stringify(data));
    if (cleanedData.steps) {
      const step6 = cleanedData.steps.find((s: any) => s.step === 6);
      if (step6?.data) {
        for (const row of step6.data) {
          delete row['Annual Token Cost'];
          delete row['Annual Token Cost ($)'];
        }
      }
    }

    const exportData = {
      companyName,
      generatedAt: new Date().toISOString(),
      analysis: cleanedData,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    saveAs(blob, `BlueAlly_AI_Assessment_${companyName.replace(/\s+/g, '_')}.json`);
  };

  const handleDownload = async (format: string) => {
    if (!data) return;

    toast({
      title: "Download Started",
      description: `Generating ${format} report for ${companyName}...`,
    });

    try {
      switch (format) {
        case "PDF": await generateBoardPresentationPDF(data, companyName); break;
        case "Excel": await generateExcel(); break;
        case "Word": generateWord(); break;
        case "Markdown": generateMarkdown(); break;
        case "HTML": generateHTML(); break;
        case "JSON": generateJSON(); break;
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

  const handleShareHTML = async () => {
    if (!reportId) {
      toast({
        title: "Unable to Share",
        description: "Report must be saved before sharing.",
        variant: "destructive",
      });
      return;
    }

    const originalUrl = `${window.location.origin}/reports/${reportId}/html`;
    
    toast({
      title: "Creating Short Link",
      description: "Generating shareable URL...",
    });

    try {
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: originalUrl,
          title: `${companyName || 'Company'} AI Assessment Report`,
        }),
      });
      
      const result = await response.json();
      const shareUrl = result.shortUrl || originalUrl;
      
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link Copied",
        description: result.isShortened 
          ? "Short link copied to clipboard." 
          : "Report URL copied to clipboard.",
      });
    } catch {
      await navigator.clipboard.writeText(originalUrl);
      toast({
        title: "Link Copied",
        description: "Report URL copied to clipboard.",
      });
    }
  };

  const handleShareDashboard = async () => {
    if (!data || !companyName) {
      toast({
        title: "Unable to Share",
        description: "Report must be loaded before sharing.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Creating Share Link",
      description: "Generating shareable dashboard URL...",
    });

    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reportData: {
            companyName,
            analysisData: data,
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create share link');
      }
      
      const result = await response.json();
      await navigator.clipboard.writeText(result.shareUrl);
      
      toast({
        title: "Dashboard Link Copied",
        description: "Shareable dashboard URL copied to clipboard. Link expires in 30 days.",
      });
    } catch (err) {
      toast({
        title: "Share Failed",
        description: "Unable to create shareable link. Please try again.",
        variant: "destructive",
      });
    }
  };

  const analysisSteps = [
    { step: 0, title: "Company Overview", desc: "Gathering company information..." },
    { step: 1, title: "Strategic Anchoring", desc: "Identifying business drivers..." },
    { step: 2, title: "Business Functions & KPIs", desc: "Analyzing 10 KPIs across 5 strategic themes..." },
    { step: 3, title: "Friction Points", desc: "Identifying 10 operational bottlenecks..." },
    { step: 4, title: "AI Use Cases", desc: "Generating 10 AI use cases with 1:1:1 mapping..." },
    { step: 5, title: "Benefit Quantification", desc: "Calculating ROI across 4 drivers..." },
    { step: 6, title: "Readiness & Token Modeling", desc: "Scoring readiness and token costs..." },
    { step: 7, title: "Priority Roadmap", desc: "Computing priority scores and tiers..." },
    { step: 8, title: "Applying Formulas", desc: "Deterministic post-processing..." },
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
              {failedStep && (
                <p className="text-sm font-medium text-red-600 mb-2" data-testid="text-failed-step">
                  Failed at Step {failedStep}/4: {callLabels[failedStep - 1]}
                </p>
              )}
              <p className="text-sm md:text-base text-muted-foreground mb-4 md:mb-6">{error || "Unable to generate analysis"}</p>
              <div className="flex gap-3 flex-wrap justify-center">
                {failedStep && failedStep > 1 && (
                  <Button onClick={() => retryFromStep(failedStep)} variant="default" data-testid="button-retry-step">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry from Step {failedStep}
                  </Button>
                )}
                <Button onClick={() => { setStatus("init"); setError(null); setFailedStep(null); }} variant={failedStep && failedStep > 1 ? "outline" : "default"} data-testid="button-retry">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Start Over
                </Button>
              </div>
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
              {/* Assumptions Drawer Button */}
              <Sheet open={assumptionDrawerOpen} onOpenChange={setAssumptionDrawerOpen}>
                <SheetTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid="button-assumptions"
                    className="h-10 md:h-9 min-w-[44px] px-2 md:px-3 text-xs md:text-sm relative"
                  >
                    <Sliders className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Assumptions</span>
                    {hasUnsavedChanges && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-amber-500 rounded-full" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Sliders className="h-5 w-5" />
                      Assumption Control Panel
                    </SheetTitle>
                    <SheetDescription>
                      Edit key assumptions to see how they affect the analysis. Changes will recalculate all dependent values.
                    </SheetDescription>
                  </SheetHeader>
                  
                  <div className="mt-6">
                    {activeAssumptions?.fields ? (
                      <div className="space-y-4">
                        <Accordion type="multiple" defaultValue={["company_profile", "financial_assumptions", "modeling_parameters"]}>
                          {/* Company Profile */}
                          <AccordionItem value="company_profile">
                            <AccordionTrigger className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-600" />
                                Company Profile
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-2">
                                {activeAssumptions.fields
                                  .filter((f: any) => f.category === "company_profile")
                                  .map((field: any) => (
                                    <div key={field.id} className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs text-muted-foreground">{field.displayName}</Label>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p className="max-w-xs text-xs">{field.description || `Source: ${field.source}`}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={assumptionEdits[field.fieldName] ?? field.value}
                                          onChange={(e) => handleAssumptionEdit(field.fieldName, e.target.value)}
                                          className="h-8 text-sm"
                                        />
                                        {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>

                          {/* Financial Assumptions */}
                          <AccordionItem value="financial_assumptions">
                            <AccordionTrigger className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-green-600" />
                                Financial Assumptions
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-2">
                                {activeAssumptions.fields
                                  .filter((f: any) => f.category === "financial_assumptions")
                                  .map((field: any) => (
                                    <div key={field.id} className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs text-muted-foreground">{field.displayName}</Label>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p className="max-w-xs text-xs">{field.description || `Source: ${field.source}`}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={assumptionEdits[field.fieldName] ?? field.value}
                                          onChange={(e) => handleAssumptionEdit(field.fieldName, e.target.value)}
                                          className="h-8 text-sm"
                                        />
                                        {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>

                          {/* Modeling Parameters */}
                          <AccordionItem value="modeling_parameters">
                            <AccordionTrigger className="text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <Calculator className="h-4 w-4 text-purple-600" />
                                Modeling Parameters
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-2">
                                {activeAssumptions.fields
                                  .filter((f: any) => f.category === "modeling_parameters")
                                  .map((field: any) => (
                                    <div key={field.id} className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs text-muted-foreground">{field.displayName}</Label>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p className="max-w-xs text-xs">{field.description || `Source: ${field.source}`}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={assumptionEdits[field.fieldName] ?? field.value}
                                          onChange={(e) => handleAssumptionEdit(field.fieldName, e.target.value)}
                                          className="h-8 text-sm"
                                        />
                                        {field.unit && <span className="text-xs text-muted-foreground">{field.unit}</span>}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>

                        {/* Apply Changes Button */}
                        {hasUnsavedChanges && (
                          <div className="pt-4 border-t">
                            <Button 
                              onClick={applyAssumptionChanges}
                              disabled={recalculateMutation.isPending}
                              className="w-full"
                            >
                              {recalculateMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Recalculating...
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4 mr-2" />
                                  Apply & Recalculate
                                </>
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Advanced Options Link */}
                        <div className="pt-4 border-t">
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => {
                              setAssumptionDrawerOpen(false);
                              setLocation(`/assumptions/${reportId}`);
                            }}
                          >
                            <Settings2 className="h-4 w-4 mr-2" />
                            Advanced Assumption Panel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Sliders className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No assumptions configured yet.</p>
                        <Button 
                          variant="outline" 
                          className="mt-4"
                          onClick={() => {
                            setAssumptionDrawerOpen(false);
                            setLocation(`/assumptions/${reportId}`);
                          }}
                        >
                          Configure Assumptions
                        </Button>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={regenerateAnalysis}
                disabled={!reportId || status !== "complete"}
                data-testid="button-refresh"
                className="h-10 md:h-9 min-w-[44px] px-2 md:px-3 text-xs md:text-sm"
              >
                <RefreshCw className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Update</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleShareDashboard}
                disabled={!data || status !== "complete"}
                data-testid="button-share"
                className="h-10 md:h-9 min-w-[44px] px-2 md:px-3 text-xs md:text-sm"
              >
                <Share2 className="h-4 w-4 md:mr-2" />
                <span className="hidden sm:inline">Share</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="button-export" className="h-10 md:h-9 min-w-[44px] px-2 md:px-3 text-xs md:text-sm">
                    <Download className="h-4 w-4 md:mr-2" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleDownload("PDF")} data-testid="menu-pdf" className="min-h-[44px] text-sm">
                    <FileText className="mr-2 h-4 w-4" /> Download PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("Excel")} data-testid="menu-excel" className="min-h-[44px] text-sm">
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("Word")} data-testid="menu-word" className="min-h-[44px] text-sm">
                    <FileType className="mr-2 h-4 w-4" /> Download Word
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("Markdown")} data-testid="menu-md" className="min-h-[44px] text-sm">
                    <FileText className="mr-2 h-4 w-4" /> Download Markdown
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("JSON")} data-testid="menu-json" className="min-h-[44px] text-sm">
                    <FileText className="mr-2 h-4 w-4" /> Download JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleShareHTML} data-testid="menu-share-html" className="min-h-[44px] text-sm">
                    <Share2 className="mr-2 h-4 w-4" /> Share HTML Report
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleShareDashboard}
                    data-testid="menu-view-dashboard"
                    disabled={!data}
                    className="min-h-[44px] text-sm"
                  >
                    <LayoutDashboard className="mr-2 h-4 w-4" /> Share Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = reportId
                        ? `/api/assumptions/export/${reportId}?format=excel`
                        : `/api/assumptions/export?format=excel`;
                      window.open(url, '_blank');
                    }}
                    className="min-h-[44px] text-sm"
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Export Assumptions (Excel)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = reportId
                        ? `/api/assumptions/export/${reportId}?format=json`
                        : `/api/assumptions/export?format=json`;
                      window.open(url, '_blank');
                    }}
                    className="min-h-[44px] text-sm"
                  >
                    <FileText className="mr-2 h-4 w-4" /> Export Assumptions (JSON)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {reportId && (
                <WorkflowExportPanel 
                  reportId={reportId} 
                  companyName={companyName}
                  analysisData={data}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-muted/30">
          <div className="flex">
            {/* Persistent Sidebar Navigation - Desktop Only */}
            <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-32 h-[calc(100vh-8rem)] overflow-y-auto border-r bg-background p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Navigation</h3>
                <nav className="space-y-1">
                  {navigationSections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                          isActive 
                            ? 'bg-primary/10 text-primary font-medium' 
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        data-testid={`nav-${section.id}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate">{section.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Quick Actions */}
              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setAssumptionDrawerOpen(true)}
                  >
                    <Sliders className="h-4 w-4 mr-2" />
                    Edit Assumptions
                  </Button>
                  {reportId && (
                    <Link href={`/whatif/${reportId}`}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        What-If Analysis
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </aside>

            {/* Mobile Navigation Sheet */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetContent side="left" className="w-[280px] p-0 lg:hidden">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="text-left">Navigation</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-80px)]">
                  <div className="p-4">
                    <nav className="space-y-1">
                      {navigationSections.map((section) => {
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                          <button
                            key={section.id}
                            onClick={() => {
                              scrollToSection(section.id);
                              setMobileNavOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-3 text-sm rounded-md transition-colors min-h-[44px] ${
                              isActive 
                                ? 'bg-primary/10 text-primary font-medium' 
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                            data-testid={`mobile-nav-${section.id}`}
                          >
                            <Icon className="h-5 w-5 flex-shrink-0" />
                            <span>{section.label}</span>
                          </button>
                        );
                      })}
                    </nav>
                    
                    <div className="mt-6 pt-4 border-t space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start min-h-[44px]"
                        onClick={() => {
                          setMobileNavOpen(false);
                          setAssumptionDrawerOpen(true);
                        }}
                      >
                        <Sliders className="h-4 w-4 mr-2" />
                        Edit Assumptions
                      </Button>
                      {reportId && (
                        <Link href={`/whatif/${reportId}`}>
                          <Button
                            variant="outline"
                            className="w-full justify-start min-h-[44px]"
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <BarChart3 className="h-4 w-4 mr-2" />
                            What-If Analysis
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            {/* Mobile Floating Navigation Button */}
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden fixed bottom-4 left-4 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
              aria-label="Open navigation menu"
              data-testid="button-mobile-nav"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Main Content */}
            <div className="flex-1 p-3 md:p-6">
              <div className="container mx-auto max-w-5xl">
                {/* Executive Dashboard */}
                {data.executiveDashboard && (
                  <Card id="dashboard" className="mb-4 md:mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent scroll-mt-32" data-testid="card-executive-dashboard">
                    <CardHeader className="pb-2 md:pb-6">
                      <CardTitle className="flex items-center gap-2 text-lg md:text-2xl">
                        <Target className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                        Executive Dashboard
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{metricTooltips.totalAnnualValue}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                      tooltip={metricTooltips.revenueBenefit}
                    />
                    <DashboardMetric 
                      icon={<TrendingDown className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Cost Benefit"
                      value={formatCurrency(data.executiveDashboard.totalCostBenefit)}
                      color="text-blue-600"
                      bgColor="bg-blue-50"
                      tooltip={metricTooltips.costBenefit}
                    />
                    <DashboardMetric 
                      icon={<DollarSign className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Cash Flow Benefit"
                      value={formatCurrency(data.executiveDashboard.totalCashFlowBenefit)}
                      color="text-purple-600"
                      bgColor="bg-purple-50"
                      tooltip={metricTooltips.cashFlowBenefit}
                    />
                    <DashboardMetric 
                      icon={<ShieldCheck className="h-4 w-4 md:h-5 md:w-5" />}
                      label="Risk Benefit"
                      value={formatCurrency(data.executiveDashboard.totalRiskBenefit)}
                      color="text-orange-600"
                      bgColor="bg-orange-50"
                      tooltip={metricTooltips.riskBenefit}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                    <div className="p-3 md:p-4 rounded-lg border bg-card">
                      <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground mb-1">
                        Total Annual Value
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{metricTooltips.totalAnnualValue}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="text-lg md:text-2xl font-bold text-primary tabular-nums" data-testid="text-total-value">
                        {formatCurrency(data.executiveDashboard.totalAnnualValue)}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 rounded-lg border bg-card">
                      <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground mb-1">
                        Monthly Tokens
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{metricTooltips.monthlyTokens}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="text-lg md:text-2xl font-bold tabular-nums">
                        {formatNumber(data.executiveDashboard.totalMonthlyTokens)}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 rounded-lg border bg-card">
                      <div className="flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground mb-1">
                        Value per 1M Tokens
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3 w-3 text-muted-foreground hover:text-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{metricTooltips.valuePerToken}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="text-lg md:text-2xl font-bold tabular-nums">
                        {formatCurrency(data.executiveDashboard.valuePerMillionTokens)}
                      </div>
                    </div>
                  </div>

                  {data.executiveDashboard.topUseCases && data.executiveDashboard.topUseCases.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                        <Zap className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                        Use Cases by Priority
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">{metricTooltips.priorityScore}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </h4>
                      <div className="rounded-md border overflow-hidden">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap">#</TableHead>
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap">Use Case</TableHead>
                                <TableHead className="font-semibold text-primary text-xs md:text-sm whitespace-nowrap hidden sm:table-cell">Tier</TableHead>
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
                                    <Badge variant="outline" className={`text-[10px] md:text-xs font-medium whitespace-nowrap ${
                                      uc.priorityTier?.includes('Champions') ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                                      uc.priorityTier?.includes('Quick Win') ? 'bg-teal-50 text-teal-700 border-teal-300' :
                                      uc.priorityTier?.includes('Strategic') ? 'bg-blue-50 text-blue-700 border-blue-300' :
                                      'bg-slate-50 text-slate-600 border-slate-300'
                                    }`}>
                                      {uc.priorityTier || 'N/A'}
                                    </Badge>
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
              <Card id="summary" className="mb-4 md:mb-8 scroll-mt-32" data-testid="card-summary">
                <CardHeader className="pb-2 md:pb-6">
                  <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                    <Brain className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed text-xs md:text-sm">{sanitizeForProse(data.summary)}</p>
                </CardContent>
              </Card>
            )}

            {/* Analysis Steps */}
            <div className="flex flex-col space-y-4 md:space-y-8">
              {data.steps?.map((step: any, index: number) => (
                <div key={index} id={`step-${step.step}`} className="scroll-mt-32">
                  {step.step === 7 && data.vrm && (
                    <>
                      <div
                        className="mb-3 px-3 md:px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-[11px] md:text-xs text-slate-700"
                        data-testid="text-vrm-methodology-report"
                      >
                        <span className="font-semibold text-slate-900">Value-Readiness Matrix v{data.vrm.schemaVersion}</span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span>Sector preset: <span className="font-medium text-slate-900">{data.vrm.sectorPresetLabel}</span></span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span>
                          Weights — Org {Math.round((data.vrm.weights?.orgCapacity ?? 0.35) * 100)}% /
                          Data {Math.round((data.vrm.weights?.dataReadiness ?? 0.30) * 100)}% /
                          Gov {Math.round((data.vrm.weights?.governance ?? 0.20) * 100)}% /
                          Tech {Math.round((data.vrm.weights?.techInfrastructure ?? 0.15) * 100)}%
                        </span>
                        <span className="mx-2 text-slate-400">·</span>
                        <span className="text-slate-500">
                          {data.vrm.quadrantThresholds?.valueFloorBand
                            ? `Champion ≥ ${data.vrm.quadrantThresholds.championMin}, Hard floor V<${data.vrm.quadrantThresholds.valueFloorBand.minNormalizedScore ?? data.vrm.quadrantThresholds.valueFloorBand.minNormalized ?? 4.0} & abs<$${(((data.vrm.quadrantThresholds.valueFloorBand.minAbsoluteAnnualValue ?? data.vrm.quadrantThresholds.valueFloorBand.minAbsoluteAnnual ?? 500_000)/1000)).toFixed(0)}K, TTP ≤ ${data.vrm.quadrantThresholds.maxTimeToPilotWeeks ?? 16} wks`
                            : `Champion ≥ ${data.vrm.quadrantThresholds?.championMin ?? 7.5}, Value floor ${data.vrm.quadrantThresholds?.valueFloor ?? 6.0}, TTP ≤ ${data.vrm.quadrantThresholds?.maxTimeToPilotWeeks ?? 12} wks`}
                        </span>
                      </div>
                      <div className="mb-4">
                        <HowWeScoreReadiness compact />
                      </div>
                      {data.vrm.diagnostic && (
                        <div
                          className="mb-3 px-3 md:px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] md:text-xs text-slate-700"
                          data-testid="text-vrm-diagnostic-report"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-slate-900">Methodology Integrity (v{data.vrm.schemaVersion})</span>
                            <span className="text-slate-500">
                              Prototyping: <strong className="text-slate-900 tabular-nums">{data.vrm.diagnostic.prototypingCandidatesCount}</strong>/{data.vrm.diagnostic.totalUseCases}
                              {' · '}Champ {data.vrm.diagnostic.championCount} / CC {data.vrm.diagnostic.conditionalChampionCount} / QW {data.vrm.diagnostic.quickWinCount} / Strat {data.vrm.diagnostic.strategicCount} / Found {data.vrm.diagnostic.foundationCount}
                            </span>
                          </div>
                          {(data.vrm.diagnostic.warnings || []).length > 0 ? (
                            <div className="space-y-1.5 mt-2">
                              {data.vrm.diagnostic.warnings.map((wn: any, wi: number) => {
                                const cls = wn.severity === 'critical'
                                  ? 'bg-red-50 border-red-300 text-red-800'
                                  : wn.severity === 'warning'
                                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                                    : 'bg-blue-50 border-blue-300 text-blue-800';
                                return (
                                  <div key={wi} className={`rounded-md px-2 py-1.5 border text-[11px] ${cls}`} data-testid={`warning-report-${wn.code}`}>
                                    <span className="font-bold uppercase tracking-wider text-[9px]">{wn.severity}</span>
                                    <span className="font-mono text-[9px] ml-1.5 opacity-70">{wn.code}</span>
                                    <div className="mt-0.5">{wn.message}</div>
                                    {wn.remediation && <div className="mt-0.5 text-[10px] opacity-80"><strong>Recommendation:</strong> {wn.remediation}</div>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="mt-1 text-emerald-700">No methodology integrity warnings.</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <StepCard step={step} />
                  {step.step === 5 && data && (
                    (() => {
                      const showValidation = 
                        data.benefitsCapped === true ||
                        (data.validationSummary?.useCasesCapped ?? 0) > 0 ||
                        (data.validationSummary?.parametersClamped ?? 0) > 0;
                      
                      if (!showValidation || !data.validationSummary) return null;
                      
                      const scaleFactor = data.validationSummary.portfolioScaleFactor ?? 1;
                      const originalTotal = data.validationSummary.originalTotal ?? 0;
                      const validatedTotal = data.validationSummary.validatedTotal ?? 0;
                      const useCasesCapped = data.validationSummary.useCasesCapped ?? 0;
                      const parametersClamped = data.validationSummary.parametersClamped ?? 0;
                      
                      return (
                        <Card className="mt-3 border-blue-200 bg-blue-50/50" data-testid="validation-summary">
                          <CardContent className="pt-4 pb-3">
                            <div className="flex items-center gap-2 mb-3">
                              <Info className="h-4 w-4 text-blue-600" />
                              <h4 className="font-semibold text-sm text-blue-800">Validation Applied</h4>
                            </div>
                            <div className="space-y-2.5">
                              {useCasesCapped > 0 && (
                                <p className="text-xs text-blue-700">
                                  <span className="font-medium">{useCasesCapped} use case{useCasesCapped !== 1 ? 's' : ''} capped</span> to meet CFO-credible limits
                                </p>
                              )}
                              {parametersClamped > 0 && (
                                <p className="text-xs text-blue-700">
                                  <span className="font-medium">{parametersClamped} parameter{parametersClamped !== 1 ? 's' : ''} clamped</span> to valid ranges
                                </p>
                              )}
                              {scaleFactor < 1 && (
                                <p className="text-xs text-blue-700">
                                  <span className="font-medium">Portfolio scaled by {scaleFactor.toFixed(3)}x</span> to meet 3% revenue ceiling
                                </p>
                              )}
                              {originalTotal !== validatedTotal && (
                                <div className="flex items-center gap-1 text-xs text-blue-700 bg-white/60 rounded px-2 py-1">
                                  <span>Original:</span>
                                  <span className="font-medium">${(originalTotal / 1_000_000).toFixed(1)}M</span>
                                  <span className="text-blue-500">→</span>
                                  <span>Validated:</span>
                                  <span className="font-medium">${(validatedTotal / 1_000_000).toFixed(1)}M</span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()
                  )}
                </div>
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
        </div>
      </div>
    </Layout>
  );
}

function DashboardMetric({ icon, label, value, color, bgColor, tooltip }: { 
  icon: React.ReactNode; 
  label: string; 
  value: string; 
  color: string; 
  bgColor: string;
  tooltip?: string;
}) {
  return (
    <div className={`p-2 md:p-4 rounded-lg border ${bgColor}`}>
      <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
        <div className={color}>{icon}</div>
        <span className="text-[10px] md:text-sm text-muted-foreground">{label}</span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className={`text-sm md:text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

const stepTooltips: Record<number, { title: string; description: string }> = {
  0: { 
    title: "Company Overview", 
    description: "General company information including industry, size, revenue estimates, and key business characteristics that inform the AI opportunity analysis." 
  },
  1: { 
    title: "Strategic Anchoring & Business Drivers", 
    description: "Strategic themes anchored to the four primary business drivers: Revenue Growth, Cost Reduction, Cash Flow Improvement, and Risk Mitigation." 
  },
  2: { 
    title: "Business Functions & KPIs", 
    description: "Analysis of key business functions with associated KPIs, baseline values, industry benchmarks, and improvement targets." 
  },
  3: { 
    title: "Friction Points", 
    description: "Identification of high-impact friction points across business functions where AI automation could deliver significant value, quantified by estimated annual cost." 
  },
  4: { 
    title: "AI Use Cases", 
    description: "Specific AI use cases mapped to the 6 standard primitives: Content Creation, Data Analysis, Research & Information Retrieval, Conversational Interfaces, and Workflow Automation." 
  },
  5: { 
    title: "Benefit Quantification", 
    description: "Conservative financial estimates across 4 business drivers with probability-weighted total annual value for each use case." 
  },
  6: { 
    title: "Readiness & Token Modeling",
    description: "Implementation readiness assessment and token economics including runs/month, tokens per run, data readiness, integration complexity, and readiness scoring." 
  },
  7: { 
    title: "Priority Scoring & Roadmap", 
    description: "Priority scoring (0-100) based on value potential, time-to-value, and implementation readiness. Use cases are tiered as Critical, High, or Standard with recommended implementation phases." 
  },
};

function StepCard({ step }: { step: any }) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const hasData = step.data && Array.isArray(step.data) && step.data.length > 0;
  const stepInfo = stepTooltips[step.step];
  
  const formatCurrencyLocal = (value: number): string => {
    const isNegative = value < 0;
    const absValue = Math.abs(value);
    const prefix = isNegative ? '-$' : '$';
    
    if (absValue >= 1000000000) {
      const billions = Math.round(absValue / 1000000000 * 10) / 10;
      return billions === Math.floor(billions) ? `${prefix}${Math.floor(billions)}B` : `${prefix}${billions.toFixed(1)}B`;
    }
    if (absValue >= 1000000) {
      const millions = Math.round(absValue / 1000000 * 10) / 10;
      return millions === Math.floor(millions) ? `${prefix}${Math.floor(millions)}M` : `${prefix}${millions.toFixed(1)}M`;
    }
    if (absValue >= 1000) return `${prefix}${Math.round(absValue).toLocaleString('en-US')}`;
    return `${prefix}${Math.round(absValue)}`;
  };
  
  const formatNumberLocal = (value: number): string => {
    const isNegative = value < 0;
    const absValue = Math.abs(value);
    const prefix = isNegative ? '-' : '';
    
    if (absValue >= 1000000000) {
      const billions = Math.round(absValue / 1000000000 * 10) / 10;
      return billions === Math.floor(billions) ? `${prefix}${Math.floor(billions)}B` : `${prefix}${billions.toFixed(1)}B`;
    }
    if (absValue >= 1000000) {
      const millions = Math.round(absValue / 1000000 * 10) / 10;
      return millions === Math.floor(millions) ? `${prefix}${Math.floor(millions)}M` : `${prefix}${millions.toFixed(1)}M`;
    }
    if (absValue >= 1000) return `${prefix}${Math.round(absValue).toLocaleString('en-US')}`;
    return `${prefix}${Math.round(absValue)}`;
  };
  
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
  const isFrictionStep = step.step === 3;
  const isExpandableStep = isBenefitsStep || isFrictionStep;

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' };
      case 'high': return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' };
      case 'medium': return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
    }
  };

  return (
    <Card data-testid={`card-step-${step.step}`}>
      <CardHeader className="p-3 pb-2 md:p-6 md:pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1 md:mb-2">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs md:text-sm border border-primary/20 flex-shrink-0">
              {step.step}
            </div>
            <CardTitle className="text-sm md:text-xl leading-tight flex items-center gap-1.5 md:gap-2">
              {step.title}
              {stepInfo && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="text-xs font-normal">{stepInfo.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {isExpandableStep && hasData && (
              <div className="flex gap-0.5 md:gap-1">
                <Button variant="ghost" size="sm" onClick={expandAll} className="text-[10px] md:text-xs h-8 md:h-8 min-w-[44px] md:min-w-0 px-2 md:px-2">
                  <span className="hidden sm:inline">Expand All</span>
                  <span className="sm:hidden">+</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} className="text-[10px] md:text-xs h-8 md:h-8 min-w-[44px] md:min-w-0 px-2 md:px-2">
                  <span className="hidden sm:inline">Collapse All</span>
                  <span className="sm:hidden">-</span>
                </Button>
              </div>
            )}
            {getStepBadge(step.step)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        {step.content && (
          <div className="prose prose-sm max-w-none mb-4 md:mb-6 text-muted-foreground">
            <p className="text-xs md:text-sm">{sanitizeForProse(step.content)}</p>
          </div>
        )}
        
        {hasData && isBenefitsStep ? (() => {
          const reorderedBenefitsData = reorderAndFilterColumns(step.data, step.step);
          const benefitsVisibleCols = reorderedBenefitsData.length > 0
            ? Object.keys(reorderedBenefitsData[0]).filter((k: string) =>
                !k.includes('Formula') && !k.includes('Labels') && k !== 'Benefit Formula' && k !== 'Strategic Theme' && !HIDDEN_COLUMNS.has(k)
              )
            : [];
          return (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-6 md:w-8 px-1 md:px-2"></TableHead>
                    {benefitsVisibleCols.map((key: string, i: number) => (
                      <TableHead key={i} className="font-semibold text-primary whitespace-nowrap text-xs md:text-sm px-2 md:px-4 py-2 md:py-3">{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorderedBenefitsData.map((row: any, i: number) => {
                    const isExpanded = expandedRows.has(i);
                    const colCount = benefitsVisibleCols.length + 1;
                    const originalRow = step.data[i];
                    
                    return (
                      <React.Fragment key={i}>
                        <TableRow 
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => toggleRow(i)}
                        >
                          <TableCell className="w-6 md:w-8 p-1 md:p-2">
                            <div className="flex items-center justify-center">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          {benefitsVisibleCols.map((key: string, j: number) => (
                            <TableCell key={j} className={`text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 ${j === 0 ? "font-medium" : ""}`}>
                              {renderCellValue(key, row[key])}
                            </TableCell>
                          ))}
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-primary/5 border-l-4 border-l-primary">
                            <TableCell colSpan={colCount} className="py-2 md:py-4">
                              <div className="flex flex-col gap-2 md:gap-4 px-1 md:px-4">
                                <div className="text-xs md:text-sm font-medium text-primary">Benefit Calculation Breakdown by Driver:</div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                  {/* Revenue Driver */}
                                  <div className="p-3 md:p-4 bg-green-50 rounded-lg border border-green-200">
                                    <div className="flex items-center justify-between mb-2 md:mb-3">
                                      <div className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
                                        <span className="font-semibold text-green-700 text-xs md:text-sm">Grow Revenue</span>
                                      </div>
                                      <div className="text-sm md:text-xl font-bold text-green-800 bg-green-100 px-2 md:px-3 py-1 rounded-md border border-green-300">
                                        {row['Revenue Benefit ($)'] || '$0'}
                                      </div>
                                    </div>
                                    {originalRow['Revenue Formula'] && !originalRow['Revenue Formula'].toLowerCase().includes('no ') ? (
                                      <div className="bg-white/80 rounded-md p-2 md:p-3 border border-green-200">
                                        <div className="text-[9px] md:text-xs text-green-600 font-medium mb-1.5">Calculation:</div>
                                        {renderLabeledFormula(originalRow['Revenue Formula Labels'], originalRow['Revenue Formula'], 'text-green-800')}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] md:text-xs text-green-600 italic">No revenue impact for this use case</div>
                                    )}
                                  </div>

                                  {/* Cost Driver */}
                                  <div className="p-3 md:p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center justify-between mb-2 md:mb-3">
                                      <div className="flex items-center gap-2">
                                        <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
                                        <span className="font-semibold text-blue-700 text-xs md:text-sm">Reduce Cost</span>
                                      </div>
                                      <div className="text-sm md:text-xl font-bold text-blue-800 bg-blue-100 px-2 md:px-3 py-1 rounded-md border border-blue-300">
                                        {row['Cost Benefit ($)'] || '$0'}
                                      </div>
                                    </div>
                                    {originalRow['Cost Formula'] && !originalRow['Cost Formula'].toLowerCase().includes('no ') ? (
                                      <div className="bg-white/80 rounded-md p-2 md:p-3 border border-blue-200">
                                        <div className="text-[9px] md:text-xs text-blue-600 font-medium mb-1.5">Calculation:</div>
                                        {renderLabeledFormula(originalRow['Cost Formula Labels'], originalRow['Cost Formula'], 'text-blue-800')}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] md:text-xs text-blue-600 italic">No cost impact for this use case</div>
                                    )}
                                  </div>

                                  {/* Cash Flow Driver */}
                                  <div className="p-3 md:p-4 bg-purple-50 rounded-lg border border-purple-200">
                                    <div className="flex items-center justify-between mb-2 md:mb-3">
                                      <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
                                        <span className="font-semibold text-purple-700 text-xs md:text-sm">Increase Cash Flow</span>
                                      </div>
                                      <div className="text-sm md:text-xl font-bold text-purple-800 bg-purple-100 px-2 md:px-3 py-1 rounded-md border border-purple-300">
                                        {row['Cash Flow Benefit ($)'] || '$0'}
                                      </div>
                                    </div>
                                    {originalRow['Cash Flow Formula'] && !originalRow['Cash Flow Formula'].toLowerCase().includes('no ') ? (
                                      <div className="bg-white/80 rounded-md p-2 md:p-3 border border-purple-200">
                                        <div className="text-[9px] md:text-xs text-purple-600 font-medium mb-1.5">Calculation:</div>
                                        {renderLabeledFormula(originalRow['Cash Flow Formula Labels'], originalRow['Cash Flow Formula'], 'text-purple-800')}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] md:text-xs text-purple-600 italic">No cash flow impact for this use case</div>
                                    )}
                                  </div>

                                  {/* Risk Driver */}
                                  <div className="p-3 md:p-4 bg-orange-50 rounded-lg border border-orange-200">
                                    <div className="flex items-center justify-between mb-2 md:mb-3">
                                      <div className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 md:h-5 md:w-5 text-orange-600" />
                                        <span className="font-semibold text-orange-700 text-xs md:text-sm">Decrease Risk</span>
                                      </div>
                                      <div className="text-sm md:text-xl font-bold text-orange-800 bg-orange-100 px-2 md:px-3 py-1 rounded-md border border-orange-300">
                                        {row['Risk Benefit ($)'] || '$0'}
                                      </div>
                                    </div>
                                    {originalRow['Risk Formula'] && !originalRow['Risk Formula'].toLowerCase().includes('no ') ? (
                                      <div className="bg-white/80 rounded-md p-2 md:p-3 border border-orange-200">
                                        <div className="text-[9px] md:text-xs text-orange-600 font-medium mb-1.5">Calculation:</div>
                                        {renderLabeledFormula(originalRow['Risk Formula Labels'], originalRow['Risk Formula'], 'text-orange-800')}
                                      </div>
                                    ) : (
                                      <div className="text-[10px] md:text-xs text-orange-600 italic">No risk impact for this use case</div>
                                    )}
                                  </div>
                                </div>

                                {/* Total Summary — shown ONCE with color-coded breakdown */}
                                <div className="bg-white/80 rounded-md p-2 md:p-3 border border-primary/30">
                                  <div className="text-[10px] md:text-sm text-primary font-mono flex flex-wrap items-center gap-1 md:gap-2">
                                    <span className="text-xs font-medium text-primary mr-1">Total:</span>
                                    <span className="bg-green-100 px-1.5 py-0.5 rounded text-green-800">{row['Revenue Benefit ($)'] || '$0'}</span>
                                    <span className="text-muted-foreground">+</span>
                                    <span className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-800">{row['Cost Benefit ($)'] || '$0'}</span>
                                    <span className="text-muted-foreground">+</span>
                                    <span className="bg-purple-100 px-1.5 py-0.5 rounded text-purple-800">{row['Cash Flow Benefit ($)'] || '$0'}</span>
                                    <span className="text-muted-foreground">+</span>
                                    <span className="bg-orange-100 px-1.5 py-0.5 rounded text-orange-800">{row['Risk Benefit ($)'] || '$0'}</span>
                                    <span className="text-muted-foreground">=</span>
                                    <span className="bg-primary/20 px-2 py-0.5 rounded text-primary font-bold text-sm">{row['Total Annual Value ($)'] || '$0'}</span>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>);
        })()
        : hasData && isFrictionStep ? (() => {
          // Use column ordering for friction step
          const frictionReordered = reorderAndFilterColumns(step.data, 3);
          const frictionVisibleCols = frictionReordered.length > 0
            ? Object.keys(frictionReordered[0]).filter((k: string) => !k.includes('Formula') && k !== 'Annual Hours' && k !== 'Hourly Rate' && k !== 'Strategic Theme' && !k.startsWith('_'))
            : [];

          // Build a map from reordered row back to original flat index
          const rowToOriginalIndex = new Map<any, number>();
          frictionReordered.forEach((row: any, i: number) => { rowToOriginalIndex.set(row, i); });

          // Group friction points by Strategic Theme (same pattern as Business Functions)
          const hasStrategicThemes = frictionReordered.some((r: any) => r['Strategic Theme']);
          const themeGroups = hasStrategicThemes ? groupByStrategicTheme(frictionReordered) : null;
          const themeNames = themeGroups ? Array.from(themeGroups.keys()) : [];

          // Render a friction table for a subset of rows
          const renderFrictionTable = (rows: any[]) => (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-6 md:w-8 px-1 md:px-2"></TableHead>
                    {frictionVisibleCols.map((key: string, i: number) => (
                      <TableHead key={i} className="font-semibold text-primary whitespace-nowrap text-xs md:text-sm px-2 md:px-4 py-2 md:py-3">{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any, localIdx: number) => {
                    const globalIdx = rowToOriginalIndex.get(row) ?? localIdx;
                    const isExpanded = expandedRows.has(globalIdx);
                    const colCount = frictionVisibleCols.length + 1;
                    const severityColors = getSeverityColor(row['Severity']);
                    const originalRow = step.data[globalIdx];

                    return (
                      <React.Fragment key={globalIdx}>
                        <TableRow
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => toggleRow(globalIdx)}
                        >
                          <TableCell className="w-6 md:w-8 p-1 md:p-2">
                            <div className="flex items-center justify-center">
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          {frictionVisibleCols.map((key: string, j: number) => (
                            <TableCell key={j} className={`text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 ${j === 0 ? "font-medium" : ""}`}>
                              {key === 'Severity' ? (
                                <Badge className={`${severityColors.bg} ${severityColors.text} ${severityColors.border} border text-[10px] md:text-xs`}>
                                  {row[key] || 'Low'}
                                </Badge>
                              ) : key === 'Friction Type' ? (
                                row[key] ? (
                                  <Badge variant="outline" className="text-[10px] md:text-xs font-normal whitespace-nowrap">
                                    {row[key]}
                                  </Badge>
                                ) : null
                              ) : (
                                renderCellValue(key, row[key])
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-amber-50 border-l-4 border-l-amber-500">
                            <TableCell colSpan={colCount} className="py-2 md:py-4">
                              <div className="flex flex-col gap-2 md:gap-4 px-1 md:px-4">
                                <div className="text-xs md:text-sm font-medium text-amber-700">Friction Cost Calculation:</div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                  <div className="p-3 md:p-4 bg-white rounded-lg border border-amber-200">
                                    <div className="flex items-center justify-between mb-2 md:mb-3">
                                      <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                                        <span className="font-semibold text-amber-700 text-xs md:text-sm">Annual Cost</span>
                                      </div>
                                      <div className="text-sm md:text-xl font-bold text-amber-800 bg-amber-100 px-2 md:px-3 py-1 rounded-md border border-amber-300">
                                        {(originalRow || row)['Estimated Annual Cost ($)'] || '$0'}
                                      </div>
                                    </div>
                                    {(originalRow || row)['Cost Formula'] ? (
                                      <div className="bg-amber-50/80 rounded-md p-2 md:p-3 border border-amber-200">
                                        <div className="text-[9px] md:text-xs text-amber-600 font-medium mb-1">Calculation:</div>
                                        <div className="text-[10px] md:text-sm text-amber-800 font-mono break-all leading-relaxed">
                                          {(originalRow || row)['Cost Formula']}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] md:text-xs text-amber-600 italic">No formula available</div>
                                    )}
                                  </div>

                                  <div className="p-3 md:p-4 bg-white rounded-lg border border-gray-200">
                                    <div className="text-xs md:text-sm font-medium text-gray-700 mb-2">Calculation Inputs</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                                      <div className="text-gray-500">Annual Hours:</div>
                                      <div className="font-medium">{typeof (originalRow || row)['Annual Hours'] === 'number' ? Math.round((originalRow || row)['Annual Hours']).toLocaleString() : (originalRow || row)['Annual Hours'] || 'N/A'}</div>
                                      <div className="text-gray-500">Loaded Hourly Rate:</div>
                                      <div className="font-medium">${typeof (originalRow || row)['Hourly Rate'] === 'number' ? (originalRow || row)['Hourly Rate'] : (originalRow || row)['Hourly Rate'] || 'N/A'}/hr</div>
                                      <div className="text-gray-500">Primary Driver:</div>
                                      <div className="font-medium">{(originalRow || row)['Primary Driver Impact'] || row['Primary Driver Impact'] || 'Cost'}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          );

          return themeGroups && themeNames.length > 1 ? (
            <Accordion type="multiple" defaultValue={themeNames} className="space-y-2">
              {themeNames.map((themeName, themeIdx) => {
                const themeRows = themeGroups.get(themeName) || [];
                const themeColor = getThemeColor(themeIdx);
                return (
                  <AccordionItem key={themeName} value={themeName} className={`border rounded-lg ${themeColor.border}`}>
                    <AccordionTrigger className={`px-3 py-2 text-sm font-semibold ${themeColor.text} ${themeColor.bg} rounded-t-lg hover:no-underline`}>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span>{themeName}</span>
                        <Badge variant="outline" className={`ml-2 text-[10px] ${themeColor.badge}`}>
                          {themeRows.length} {themeRows.length === 1 ? 'item' : 'items'}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="p-0">
                      {renderFrictionTable(themeRows)}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <div className="rounded-md border overflow-hidden">
              {renderFrictionTable(frictionReordered)}
            </div>
          );
        })()
        : hasData && step.step === 4 ? (() => {
          // ===== STEP 4: AI USE CASES WITH PATTERN CARDS =====
          const reorderedData = reorderAndFilterColumns(step.data, step.step);
          const hasStrategicThemes = reorderedData.some((r: any) => r['Strategic Theme']);
          const themeGroups = hasStrategicThemes ? groupByStrategicTheme(reorderedData) : null;
          const themeNames = themeGroups ? Array.from(themeGroups.keys()) : [];

          const getPatternBadgeColor = (pattern: string) => {
            const singleAgent = ['Reflection', 'Tool Use', 'Planning', 'ReAct Loop', 'Prompt Chaining', 'Semantic Router', 'Constitutional Guardrail'];
            if (singleAgent.some(p => pattern?.includes(p))) return 'bg-[#001278] text-white';
            return 'bg-[#02a2fd] text-white'; // multi-agent
          };

          const getEpochBadgeLocal = (flag: string) => epochGetBadge(flag);

          const parseArrayField = (value: unknown): string[] => {
            if (!value) return [];
            if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
            const str = String(value).trim();
            if (!str) return [];
            if (str.startsWith("[")) {
              try {
                const parsed = JSON.parse(str);
                if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v).trim()).filter(Boolean);
              } catch { /* fall through */ }
            }
            return str.split(",").map((s) => s.trim()).filter(Boolean);
          };

          const renderUseCaseCards = (rows: any[]) => (
            <div className="space-y-4">
              {rows.map((row: any, i: number) => {
                const pattern = row['Primary Pattern'] || row['Agentic Pattern'] || '';
                const altPattern = row['Alternative Pattern'] || '';
                const desiredOutcomes = parseArrayField(row['Desired Outcomes']);
                const dataTypes = parseArrayField(row['Data Types']);
                const integrations = parseArrayField(row['Integrations']);

                return (
                  <div key={i} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                    {/* Card Header */}
                    <div className="bg-slate-50 px-4 py-3 border-b flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">{row.ID}</span>
                      <span className="font-semibold text-sm md:text-base text-slate-800 flex-1">{row['Use Case Name']}</span>
                      {pattern && (
                        <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full font-medium ${getPatternBadgeColor(pattern)}`}>
                          {pattern}
                        </span>
                      )}
                      {row['Function'] && (
                        <span className="text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                          {row['Function']}
                        </span>
                      )}
                    </div>
                    {/* Card Body */}
                    <div className="p-4 space-y-3">
                      {row['Description'] && (
                        <p className="text-xs md:text-sm text-slate-600 leading-relaxed">{row['Description']}</p>
                      )}

                      {row['Target Friction'] && (
                        <div className="flex flex-wrap gap-4 text-xs md:text-sm">
                          <div>
                            <span className="text-slate-400 font-medium">Target Friction: </span>
                            <span className="text-slate-700">{row['Target Friction']}</span>
                          </div>
                        </div>
                      )}

                      {/* AI Primitives */}
                      {row['AI Primitives'] && (
                        <div className="flex flex-wrap gap-1.5">
                          {String(row['AI Primitives']).split(',').map((p: string, j: number) => (
                            <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {p.trim()}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Agentic Pattern Analysis */}
                      {(pattern || altPattern) && (
                        <div className="bg-slate-50 rounded-lg p-3 border space-y-2">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Agentic Pattern Analysis</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <div className="text-[10px] text-slate-400 font-medium">PRIMARY PATTERN</div>
                              <span className={`inline-block text-xs px-2.5 py-1 rounded-md font-medium ${getPatternBadgeColor(pattern)}`}>
                                {pattern || 'Not assigned'}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="text-[10px] text-slate-400 font-medium">ALTERNATIVE PATTERN</div>
                              <span className={`inline-block text-xs px-2.5 py-1 rounded-md font-medium ${altPattern ? getPatternBadgeColor(altPattern) + ' opacity-75' : 'bg-slate-200 text-slate-500'}`}>
                                {altPattern || 'None'}
                              </span>
                            </div>
                          </div>
                          {row['Pattern Rationale'] && (
                            <div className="mt-2 pt-2 border-t border-slate-200">
                              <div className="text-[10px] text-slate-400 font-medium mb-1">RATIONALE</div>
                              <p className="text-xs text-slate-600 leading-relaxed">{row['Pattern Rationale']}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* E.P.O.C.H. Flags */}
                      {row['EPOCH Flags'] && (() => {
                        const flags = parseEpochFlags(row['EPOCH Flags']);
                        return flags.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase">E.P.O.C.H.:</span>
                            {flags.map((f: string, j: number) => {
                              const badge = getEpochBadgeLocal(f);
                              return (
                                <span key={j} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${badge.color}`}>
                                  {badge.label}
                                </span>
                              );
                            })}
                          </div>
                        ) : null;
                      })()}

                      {/* Desired Outcomes */}
                      {desiredOutcomes.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Desired Outcomes</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {desiredOutcomes.map((outcome, j) => (
                              <li key={j} className="text-xs text-slate-600 leading-relaxed">{outcome}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Data Types */}
                      {dataTypes.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Data Types</div>
                          <div className="flex flex-wrap gap-1.5">
                            {dataTypes.map((dt, j) => (
                              <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{dt}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Integrations */}
                      {integrations.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Integrations</div>
                          <div className="flex flex-wrap gap-1.5">
                            {integrations.map((intg, j) => (
                              <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">{intg}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* HITL Checkpoint */}
                      {row['Human-in-the-Loop Checkpoint'] && (
                        <div className="text-xs text-blue-600 flex items-center gap-1.5 bg-blue-50 px-2 py-1.5 rounded border border-blue-200">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">HITL:</span> {row['Human-in-the-Loop Checkpoint']}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );

          return (
            <div className="space-y-3">
              {themeGroups ? (
                themeNames.map((theme, ti) => (
                  <div key={ti}>
                    <div className="flex items-center gap-2 mb-3 mt-4">
                      <div className="h-1 w-4 rounded bg-[#001278]"></div>
                      <h4 className="text-sm font-semibold text-[#001278]">{theme}</h4>
                      <span className="text-xs text-slate-400">({themeGroups.get(theme)?.length} use cases)</span>
                    </div>
                    {renderUseCaseCards(themeGroups.get(theme) || [])}
                  </div>
                ))
              ) : (
                renderUseCaseCards(reorderedData)
              )}
            </div>
          );
        })()
        : hasData ? (() => {
          // ===== GENERIC TABLE WITH COLUMN REORDERING + BENCHMARK COLORS + STRATEGIC THEME GROUPING =====
          const reorderedData = reorderAndFilterColumns(step.data, step.step);
          const visibleCols = reorderedData.length > 0
            ? Object.keys(reorderedData[0]).filter(k => !HIDDEN_COLUMNS.has(k) && k !== 'Strategic Theme')
            : [];
          const hasStrategicThemes = reorderedData.some(r => r['Strategic Theme']);
          const isBenchmarkStep = step.step === 2;

          // Group by strategic theme if available
          const themeGroups = hasStrategicThemes ? groupByStrategicTheme(reorderedData) : null;
          const themeNames = themeGroups ? Array.from(themeGroups.keys()) : [];

          const renderTableForRows = (rows: any[]) => (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {visibleCols.map((key: string, i: number) => (
                    <TableHead
                      key={i}
                      className={`font-semibold text-primary whitespace-nowrap text-xs md:text-sm px-2 md:px-4 py-2 md:py-3 ${getBenchmarkCellClass(key)}`}
                    >
                      {key}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any, i: number) => (
                  <TableRow key={i} className="hover:bg-muted/20 transition-colors">
                    {visibleCols.map((key: string, j: number) => (
                      <TableCell
                        key={j}
                        className={`text-xs md:text-sm px-2 md:px-4 py-1.5 md:py-2 ${j === 0 ? "font-medium" : ""} ${key.toLowerCase() === "description" ? "min-w-[200px] md:min-w-[300px] max-w-[300px] md:max-w-[400px] whitespace-normal" : ""} ${getBenchmarkCellClass(key)}`}
                      >
                        {renderCellValue(key, row[key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          );

          return (
          <div className="space-y-3">
            {/* Benchmark legend for Step 2 */}
            {isBenchmarkStep && reorderedData.some(r => r['Benchmark (Avg)'] || r['Benchmark (Industry Best)'] || r['Benchmark (Overall Best)']) && (
              <div className="flex flex-wrap items-center gap-3 text-xs px-1">
                <span className="font-medium text-muted-foreground">Benchmark Legend:</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300"></span> Industry Average</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></span> Industry Best in Class</span>
                <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300"></span> Overall Best in Class</span>
              </div>
            )}

            {/* Grouped by strategic theme if available */}
            {themeGroups && themeNames.length > 1 ? (
              <Accordion type="multiple" defaultValue={themeNames} className="space-y-2">
                {themeNames.map((themeName, themeIdx) => {
                  const themeRows = themeGroups.get(themeName) || [];
                  const themeColor = getThemeColor(themeIdx);
                  return (
                    <AccordionItem key={themeName} value={themeName} className={`border rounded-lg ${themeColor.border}`}>
                      <AccordionTrigger className={`px-3 py-2 text-sm font-semibold ${themeColor.text} ${themeColor.bg} rounded-t-lg hover:no-underline`}>
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4" />
                          <span>{themeName}</span>
                          <Badge variant="outline" className={`ml-2 text-[10px] ${themeColor.badge}`}>{themeRows.length} items</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-0">
                        <div className="overflow-x-auto">
                          {renderTableForRows(themeRows)}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  {renderTableForRows(reorderedData)}
                </div>
              </div>
            )}
          </div>);
        })()
        : null}
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

  // Format Annual Hours as whole numbers
  if (key.toLowerCase().includes('hours') && typeof value === 'number') {
    return Math.round(value).toLocaleString('en-US');
  }
  if (key.toLowerCase().includes('hours') && typeof value === 'string') {
    const num = parseFloat(value.replace(/[,]/g, ''));
    if (!isNaN(num)) {
      return Math.round(num).toLocaleString('en-US');
    }
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
