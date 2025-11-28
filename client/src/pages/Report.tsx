import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Loader2, CheckCircle2, AlertTriangle, FileText, Download, 
  RefreshCw, FileSpreadsheet, FileType, ChevronRight, 
  TrendingUp, Users, Globe, DollarSign, ExternalLink,
  MoreHorizontal, ArrowLeft, ShieldCheck, Target, 
  Briefcase, Zap, Layers, PieChart, ListChecks,
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";

// Mock Data Generation based on User Requirements for Steps 0-7
const generateMockData = (company: string) => {
  return {
    overview: {
      founded: "2005",
      headquarters: "San Francisco, CA",
      employees: "5,000+",
      industry: "Technology",
      description: `${company} is a leading technology company focused on innovative solutions. They have established a strong market presence through continuous R&D and strategic acquisitions.`,
    },
    steps: [
      {
        id: 0,
        title: "Company Overview",
        description: "High-level snapshot of the organization's current standing.",
        data: [
          { label: "Company Name", value: company },
          { label: "Ticker Symbol", value: "TECH" },
          { label: "Sector", value: "Technology" },
          { label: "Market Cap", value: "$450B" },
          { label: "Employees", value: "12,500+" },
          { label: "Founded", value: "2005" },
          { label: "CEO", value: "Jane Doe" },
          { label: "Key Competitors", value: "Competitor A, Competitor B, Competitor C" }
        ]
      },
      {
        id: 1,
        title: "Strategic Anchors",
        description: "Mapping initiatives to the four key business drivers.",
        columns: ["Business Driver", "Strategic Initiative", "Priority", "Target Metric"],
        data: [
          { col1: "Grow Revenue", col2: "Enterprise AI Expansion", col3: "Critical", col4: "+15% YoY Growth" },
          { col1: "Decrease Cost", col2: "Supply Chain Automation", col3: "High", col4: "-8% OpEx Reduction" },
          { col1: "Increase Cash Flow", col2: "SaaS Subscription Shift", col3: "Medium", col4: "+20% ARR" },
          { col1: "Reduce Risk", col2: "Data Sovereignty Compliance", col3: "High", col4: "100% GDPR Compliance" }
        ]
      },
      {
        id: 2,
        title: "Inventory Business Functions",
        description: "Cataloging key operational functions for analysis.",
        columns: ["Function ID", "Department", "Primary Responsibility", "Headcount Est."],
        data: [
          { col1: "BF-01", col2: "Human Resources", col3: "Talent Acquisition & Retention", col4: "150" },
          { col1: "BF-02", col2: "Information Technology", col3: "Infrastructure & Security", col4: "400" },
          { col1: "BF-03", col2: "Marketing", col3: "Brand Awareness & Lead Gen", col4: "250" },
          { col1: "BF-04", col2: "Operations", col3: "Logistics & Supply Chain", col4: "300" },
          { col1: "BF-05", col2: "Sales", col3: "Revenue Generation", col4: "500" },
          { col1: "BF-06", col2: "Procurement", col3: "Vendor Management", col4: "80" },
          { col1: "BF-07", col2: "Finance", col3: "Accounting & FP&A", col4: "120" },
          { col1: "BF-08", col2: "Legal", col3: "Compliance & IP Protection", col4: "45" }
        ]
      },
      {
        id: 3,
        title: "Friction Point Identification",
        description: "Locating bottlenecks within business functions.",
        columns: ["Function", "Friction Point", "Severity", "Operational Impact"],
        data: [
          { col1: "HR", col2: "High Engineering Turnover", col3: "High", col4: "Delayed Product Roadmap" },
          { col1: "IT", col2: "Legacy Billing System", col3: "Medium", col4: "Invoicing Errors (2%)" },
          { col1: "Sales", col2: "Long Sales Cycle (>9mo)", col3: "High", col4: "Missed Quarterly Targets" },
          { col1: "Operations", col2: "Siloed Inventory Data", col3: "Critical", col4: "Stockouts in EU Region" },
          { col1: "Marketing", col2: "Rising CAC", col3: "Medium", col4: "Lower ROI on Ad Spend" }
        ]
      },
      {
        id: 4,
        title: "Root Cause Analysis",
        description: "Diagnosing the underlying reasons for identified friction.",
        columns: ["Friction Point", "Root Cause (Primary)", "Root Cause (Secondary)", "Confidence"],
        data: [
          { col1: "High Engineering Turnover", col2: "Below Market Compensation", col3: "Lack of Career Growth Path", col4: "95%" },
          { col1: "Legacy Billing System", col2: "Technical Debt", col3: "Deprioritized Maintenance", col4: "85%" },
          { col1: "Long Sales Cycle", col2: "Complex Approval Process", col3: "Lack of Sales Enablement", col4: "90%" },
          { col1: "Siloed Inventory Data", col2: "Incompatible ERP Modules", col3: "Manual Entry Processes", col4: "98%" }
        ]
      },
      {
        id: 5,
        title: "Proposed Solutions",
        description: "AI-generated strategies to mitigate friction points.",
        columns: ["Friction Point", "Proposed Solution", "Implementation Type", "Difficulty"],
        data: [
          { col1: "High Engineering Turnover", col2: "Equity Refresh Program", col3: "Policy Change", col4: "Low" },
          { col1: "Legacy Billing System", col2: "Migrate to Stripe Billing", col3: "Technology Upgrade", col4: "High" },
          { col1: "Long Sales Cycle", col2: "Implement CPQ Software", col3: "Tool Implementation", col4: "Medium" },
          { col1: "Siloed Inventory Data", col2: "Unified Data Warehouse", col3: "Infrastructure Project", col4: "High" }
        ]
      },
      {
        id: 6,
        title: "Impact Analysis",
        description: "Quantifying the potential value of solutions.",
        columns: ["Solution", "Revenue Impact", "Cost Savings", "Risk Reduction"],
        data: [
          { col1: "Equity Refresh Program", col2: "Neutral", col3: "$2M (Recruiting Costs)", col4: "High (IP Retention)" },
          { col1: "Migrate to Stripe Billing", col2: "+$5M (Churn Reduction)", col3: "$500k (Maintenance)", col4: "Medium" },
          { col1: "Implement CPQ Software", col2: "+$12M (Faster Close)", col3: "Neutral", col4: "Low" },
          { col1: "Unified Data Warehouse", col2: "+$8M (Optimization)", col3: "$1.5M (Efficiency)", col4: "High" }
        ]
      },
      {
        id: 7,
        title: "Implementation Roadmap",
        description: "Timeline and ownership for execution.",
        columns: ["Phase", "Initiative", "Owner", "Timeline"],
        data: [
          { col1: "Q3 2025", col2: "Equity Refresh Rollout", col3: "CHRO", col4: "3 Months" },
          { col1: "Q4 2025", col2: "Data Warehouse MVP", col3: "CTO", col4: "4 Months" },
          { col1: "Q1 2026", col2: "CPQ Implementation", col3: "CRO", col4: "6 Months" },
          { col1: "Q2 2026", col2: "Billing Migration", col3: "CIO", col4: "9 Months" }
        ]
      }
    ]
  };
};

export default function Report() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const companyName = params.get("company") || "Unknown Company";
  const { toast } = useToast();

  const [status, setStatus] = useState<"init" | "researching" | "benchmarking" | "critiquing" | "complete">("init");
  const [data, setData] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (status === "init") {
      setStatus("researching");
      simulateProcess();
    }
  }, []);

  const simulateProcess = async () => {
    setStatus("researching");
    setProgress(10);
    await new Promise(r => setTimeout(r, 1000));
    setProgress(40);
    setStatus("benchmarking");
    await new Promise(r => setTimeout(r, 1000));
    setProgress(70);
    setStatus("critiquing");
    await new Promise(r => setTimeout(r, 1000));
    setProgress(100);
    setData(generateMockData(companyName));
    setStatus("complete");
  };

  const handleDownload = (format: string) => {
    toast({
      title: "Download Started",
      description: `Generating ${format} report for ${companyName}...`,
    });
    setTimeout(() => {
      toast({
        title: "Download Complete",
        description: `Your ${format} report is ready.`,
        variant: "default",
      });
    }, 1000);
  };

  if (status !== "complete") {
    return (
      <Layout>
        <div className="container max-w-3xl mx-auto px-4 py-20">
          <Card className="border-none shadow-lg">
            <CardContent className="pt-12 pb-12 flex flex-col items-center text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse"></div>
                <div className="relative bg-background p-4 rounded-full border shadow-sm">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                </div>
              </div>
              
              <h2 className="text-2xl font-bold mb-2">Generating Strategic Report for {companyName}</h2>
              <p className="text-muted-foreground mb-8">Executing Steps 0-7 Analysis Framework...</p>
              
              <div className="w-full max-w-md space-y-6">
                <Step 
                  active={status === "researching"} 
                  completed={["benchmarking", "critiquing", "complete"].includes(status)}
                  label="Steps 0-2: Intelligence Gathering" 
                  subLabel="Analyzing company, anchors, and business functions..."
                />
                <Step 
                  active={status === "benchmarking"} 
                  completed={["critiquing", "complete"].includes(status)}
                  label="Steps 3-5: Diagnosis & Strategy" 
                  subLabel="Identifying friction, root causes, and solutions..."
                />
                <Step 
                  active={status === "critiquing"} 
                  completed={false}
                  label="Steps 6-7: Value & Roadmap" 
                  subLabel="Quantifying impact and planning implementation..."
                />
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
        <div className="border-b bg-background sticky top-16 z-40 px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
               <ArrowLeft className="h-4 w-4" />
             </Button>
             <div>
               <h1 className="text-xl font-bold flex items-center gap-2">
                 {companyName}
                 <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-normal">Verified</Badge>
               </h1>
               <p className="text-xs text-muted-foreground">Full 8-Step Strategic Analysis</p>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStatus("researching")}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Update
            </Button>
            <DropdownMenuDemo onDownload={handleDownload} />
          </div>
        </div>

        <div className="flex-1 bg-muted/30 p-6">
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col space-y-8">
              {data.steps.map((step: any, index: number) => (
                <StepCard key={index} step={step} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StepCard({ step }: { step: any }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-primary/20">
            {step.id}
          </div>
          <CardTitle className="text-xl">Step {step.id}: {step.title}</CardTitle>
        </div>
        <CardDescription>{step.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {step.id === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {step.data.map((item: any, i: number) => (
              <div key={i} className="bg-muted/30 p-3 rounded-lg border">
                <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-medium">{item.label}</div>
                <div className="font-medium text-sm">{item.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {step.columns.map((col: string, i: number) => (
                    <TableHead key={i} className="font-semibold text-primary">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {step.data.map((row: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.col1}</TableCell>
                    <TableCell>{row.col2}</TableCell>
                    <TableCell>{row.col3}</TableCell>
                    <TableCell>{row.col4}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
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
        <div className="font-medium leading-none mb-1">{label}</div>
        <div className="text-sm text-muted-foreground">{subLabel}</div>
      </div>
    </div>
  );
}

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function DropdownMenuDemo({ onDownload }: { onDownload: (f: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Choose Format</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDownload("PDF")}>
          <FileText className="mr-2 h-4 w-4" />
          <span>PDF Document</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload("Word")}>
          <FileType className="mr-2 h-4 w-4" />
          <span>Word Document</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload("Excel")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          <span>Excel Workbook</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDownload("Markdown")}>
          <ChevronRight className="mr-2 h-4 w-4" />
          <span>Markdown Raw</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}