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
  DollarSign, ShieldCheck, Zap, Target
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, HeadingLevel } from 'docx';

export default function Report() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const companyName = params.get("company") || "Unknown Company";
  const { toast } = useToast();

  const [status, setStatus] = useState<"init" | "researching" | "benchmarking" | "critiquing" | "complete">("init");
  const [data, setData] = useState<any>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "init") {
      fetchAnalysis();
    }
  }, []);

  const fetchAnalysis = async () => {
    try {
      setStatus("researching");
      setProgress(10);
      setError(null);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate analysis");
      }

      setProgress(40);
      setStatus("benchmarking");
      await new Promise(r => setTimeout(r, 500));
      
      setProgress(70);
      setStatus("critiquing");
      await new Promise(r => setTimeout(r, 500));

      const result = await response.json();
      
      setProgress(100);
      setReportId(result.id);
      setData(result.data);
      setStatus("complete");

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
        description: "Unable to generate analysis. Please try again.",
      });
    }
  };

  const regenerateAnalysis = async () => {
    if (!reportId) return;

    try {
      setStatus("researching");
      setProgress(10);
      setError(null);

      const response = await fetch(`/api/regenerate/${reportId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName }),
      });

      if (!response.ok) {
        throw new Error("Failed to regenerate analysis");
      }

      setProgress(40);
      setStatus("benchmarking");
      await new Promise(r => setTimeout(r, 500));
      
      setProgress(70);
      setStatus("critiquing");
      await new Promise(r => setTimeout(r, 500));

      const result = await response.json();
      
      setProgress(100);
      setData(result.data);
      setStatus("complete");

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

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toFixed(0);
  };

  // PDF Generation
  const generatePDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setTextColor(26, 115, 232);
    doc.text(`Insight AI Report: ${companyName}`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);
    
    // Executive Dashboard
    if (data.executiveDashboard) {
      const dash = data.executiveDashboard;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text("Executive Dashboard", 14, 45);
      
      doc.setFontSize(10);
      doc.text(`Total Annual Value: ${formatCurrency(dash.totalAnnualValue)}`, 14, 55);
      doc.text(`Revenue Benefit: ${formatCurrency(dash.totalRevenueBenefit)}`, 14, 62);
      doc.text(`Cost Benefit: ${formatCurrency(dash.totalCostBenefit)}`, 100, 55);
      doc.text(`Cash Flow Benefit: ${formatCurrency(dash.totalCashFlowBenefit)}`, 100, 62);
    }
    
    let yPos = 80;

    data.steps.forEach((step: any) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(`Step ${step.step}: ${step.title}`, 14, yPos);
      yPos += 8;

      if (step.data && step.data.length > 0) {
        const columns = Object.keys(step.data[0]);
        const rows = step.data.map((row: any) => Object.values(row));
        
        autoTable(doc, {
          startY: yPos,
          head: [columns],
          body: rows,
          theme: 'striped',
          headStyles: { fillColor: [26, 115, 232] },
          margin: { top: 10 },
          styles: { fontSize: 8, cellPadding: 2 },
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
      } else {
        doc.setFontSize(10);
        doc.setTextColor(100);
        const lines = doc.splitTextToSize(step.content || '', 180);
        doc.text(lines, 14, yPos);
        yPos += lines.length * 5 + 10;
      }
    });

    doc.save(`${companyName}_Insight_AI_Report.pdf`);
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

  const handleDownload = (format: string) => {
    if (!data) return;

    toast({
      title: "Download Started",
      description: `Generating ${format} report for ${companyName}...`,
    });

    try {
      switch (format) {
        case "PDF": generatePDF(); break;
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
              
              <h2 className="text-2xl font-bold mb-2" data-testid="text-loading-title">Generating Strategic Report for {companyName}</h2>
              <p className="text-muted-foreground mb-8">Executing 8-Step AI Analysis Framework...</p>
              
              <div className="w-full max-w-md space-y-6">
                <Step 
                  active={status === "researching"} 
                  completed={["benchmarking", "critiquing", "complete"].includes(status)}
                  label="Steps 0-3: Discovery & Mapping" 
                  subLabel="Analyzing business functions, KPIs, and friction points..."
                />
                <Step 
                  active={status === "benchmarking"} 
                  completed={["critiquing", "complete"].includes(status)}
                  label="Steps 4-5: AI Use Cases & Benefits" 
                  subLabel="Generating use cases with driver quantification..."
                />
                <Step 
                  active={status === "critiquing"} 
                  completed={false}
                  label="Steps 6-7: Scoring & Roadmap" 
                  subLabel="Calculating priority scores and implementation plan..."
                />
              </div>
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
  const hasData = step.data && Array.isArray(step.data) && step.data.length > 0;
  
  const getStepBadge = (stepNum: number) => {
    switch(stepNum) {
      case 4: return <Badge variant="secondary" className="gap-1"><Brain className="h-3 w-3" /> AI Primitives</Badge>;
      case 5: return <Badge variant="secondary" className="gap-1"><DollarSign className="h-3 w-3" /> Benefits</Badge>;
      case 6: return <Badge variant="secondary" className="gap-1"><Calculator className="h-3 w-3" /> Token Model</Badge>;
      case 7: return <Badge variant="secondary" className="gap-1"><Target className="h-3 w-3" /> Priority</Badge>;
      default: return null;
    }
  };

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
          {getStepBadge(step.step)}
        </div>
      </CardHeader>
      <CardContent>
        {step.content && (
          <div className="prose prose-sm max-w-none mb-6 text-muted-foreground">
            <p>{step.content}</p>
          </div>
        )}
        
        {hasData && (
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
        )}
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
