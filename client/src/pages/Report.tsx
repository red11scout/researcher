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
  Loader2, CheckCircle2, Download, 
  RefreshCw, FileSpreadsheet, FileText, FileType, ChevronRight, 
  ArrowLeft, Brain, Calculator
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, BorderStyle, HeadingLevel } from 'docx';

// Refined Mock Data Generation based on specific user requirements
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
        type: "grid",
        data: [
          { label: "Company Name", value: company },
          { label: "Ticker Symbol", value: "TECH" },
          { label: "Sector", value: "Technology" },
          { label: "Market Cap", value: "$450B" },
          { label: "Employees", value: "12,500+" },
          { label: "Founded", value: "2005" },
          { label: "CEO", value: "Jane Doe" },
          { label: "Key Competitors", value: "Competitor A, Competitor B" }
        ]
      },
      {
        id: 1,
        title: "Business Functions & KPIs",
        description: "Performance metrics with industry benchmarks and improvement targets.",
        type: "table",
        columns: ["Metric Name", "Baseline", "Target", "Industry Benchmark", "Direction", "Desired Improvement"],
        data: [
          { col1: "Revenue Growth", col2: "12%", col3: "18%", col4: "15% (Top Quartile)", col5: "Increase", col6: "+6% YoY" },
          { col1: "OpEx Ratio", col2: "45%", col3: "38%", col4: "40% (Median)", col5: "Decrease", col6: "-7% Efficiency" },
          { col1: "Employee Retention", col2: "82%", col3: "90%", col4: "88% (Tech Avg)", col5: "Increase", col6: "+8% Retention" },
          { col1: "Customer Churn", col2: "8%", col3: "5%", col4: "6% (SaaS Avg)", col5: "Decrease", col6: "-3% Churn" },
          { col1: "Cash Conversion", col2: "60 days", col3: "45 days", col4: "50 days (Best in Class)", col5: "Decrease", col6: "-15 Days" }
        ]
      },
      {
        id: 2,
        title: "Workflows & Data Sources",
        description: "Mapping key operational processes to their data origins.",
        type: "table",
        columns: ["Workflow Name", "Process Steps", "Primary Data Sources", "Owner"],
        data: [
          { col1: "Lead to Cash", col2: "Lead Gen -> Qualify -> Close -> Bill -> Collect", col3: "Salesforce, Netsuite, Stripe", col4: "CRO" },
          { col1: "Hire to Retire", col2: "Recruit -> Onboard -> Payroll -> Offboard", col3: "Workday, Greenhouse, ADP", col4: "CHRO" },
          { col1: "Procure to Pay", col2: "Requisition -> PO -> Receive -> Pay", col3: "Coupa, SAP, Bank Portal", col4: "CFO" },
          { col1: "Issue to Resolution", col2: "Ticket -> Triage -> Fix -> Verify", col3: "Jira, Zendesk, Github", col4: "CTO" }
        ]
      },
      {
        id: 3,
        title: "Friction Point Identification",
        description: "Locating bottlenecks within business functions.",
        type: "table",
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
        title: "AI Use Case Generation",
        description: "10 prioritized AI opportunities using standard primitives.",
        type: "table",
        columns: ["Use Case Name", "AI Primitive", "Description", "Target Workflow"],
        data: [
          { col1: "Contract Analysis", col2: "Extraction", col3: "Extract key terms from PDF contracts.", col4: "Lead to Cash" },
          { col1: "Customer Support Auto-Response", col2: "Generation", col3: "Draft responses to L1 tickets.", col4: "Issue to Resolution" },
          { col1: "Resume Screening", col2: "Classification", col3: "Rank candidates by job fit.", col4: "Hire to Retire" },
          { col1: "Code Refactoring", col2: "Rewriting", col3: "Convert legacy code to modern syntax.", col4: "Issue to Resolution" },
          { col1: "Meeting Summarization", col2: "Summarization", col3: "Transcribe and summarize sales calls.", col4: "Lead to Cash" },
          { col1: "Inventory Prediction", col2: "Forecasting", col3: "Predict stock needs by region.", col4: "Procure to Pay" },
          { col1: "Marketing Copy Gen", col2: "Generation", col3: "Create ad variations at scale.", col4: "Lead to Cash" },
          { col1: "Invoice Processing", col2: "Extraction", col3: "Extract data from vendor invoices.", col4: "Procure to Pay" },
          { col1: "Employee Onboarding Q&A", col2: "Q&A", col3: "Chatbot for policy questions.", col4: "Hire to Retire" },
          { col1: "Competitor Intel", col2: "Summarization", col3: "Digest news on competitors.", col4: "Lead to Cash" }
        ]
      },
      {
        id: 5,
        title: "Token & Cost Modeling",
        description: "Calculated token assumptions for each use case.",
        type: "table",
        columns: ["Use Case", "Input Tokens/Run", "Output Tokens/Run", "Runs/Year", "Est. Annual Cost"],
        data: [
          { col1: "Contract Analysis", col2: "15,000", col3: "500", col4: "2,000", col5: "$310" },
          { col1: "Customer Support Auto-Response", col2: "1,000", col3: "300", col4: "50,000", col5: "$650" },
          { col1: "Resume Screening", col2: "2,000", col3: "100", col4: "10,000", col5: "$210" },
          { col1: "Code Refactoring", col2: "4,000", col3: "4,000", col4: "5,000", col5: "$400" },
          { col1: "Meeting Summarization", col2: "8,000", col3: "500", col4: "3,000", col5: "$255" },
          { col1: "Inventory Prediction", col2: "500", col3: "50", col4: "12,000", col5: "$66" },
          { col1: "Marketing Copy Gen", col2: "500", col3: "200", col4: "20,000", col5: "$140" },
          { col1: "Invoice Processing", col2: "1,000", col3: "100", col4: "15,000", col5: "$165" },
          { col1: "Employee Onboarding Q&A", col2: "500", col3: "200", col4: "5,000", col5: "$35" },
          { col1: "Competitor Intel", col2: "10,000", col3: "1,000", col4: "1,000", col5: "$110" }
        ]
      },
      {
        id: 6,
        title: "ROI & Prioritization",
        description: "Ranking use cases by calculated financial impact.",
        type: "table",
        columns: ["Use Case", "Annual Benefit", "Annual Cost", "ROI Multiple", "Priority"],
        data: [
          { col1: "Invoice Processing", col2: "$150,000", col3: "$165", col4: "909x", col5: "Critical" },
          { col1: "Customer Support Auto-Response", col2: "$250,000", col3: "$650", col4: "384x", col5: "Critical" },
          { col1: "Contract Analysis", col2: "$80,000", col3: "$310", col4: "258x", col5: "High" },
          { col1: "Meeting Summarization", col2: "$60,000", col3: "$255", col4: "235x", col5: "High" },
          { col1: "Inventory Prediction", col2: "$120,000", col3: "$66", col4: "1,818x", col5: "Critical" },
          { col1: "Resume Screening", col2: "$40,000", col3: "$210", col4: "190x", col5: "Medium" },
          { col1: "Marketing Copy Gen", col2: "$25,000", col3: "$140", col4: "178x", col5: "Medium" },
          { col1: "Code Refactoring", col2: "$50,000", col3: "$400", col4: "125x", col5: "Medium" },
          { col1: "Employee Onboarding Q&A", col2: "$10,000", col3: "$35", col4: "285x", col5: "Low" },
          { col1: "Competitor Intel", col2: "$15,000", col3: "$110", col4: "136x", col5: "Low" }
        ]
      },
      {
        id: 7,
        title: "Implementation Roadmap",
        description: "Timeline for deploying high-priority AI solutions.",
        type: "table",
        columns: ["Phase", "Initiative", "Owner", "Timeline"],
        data: [
          { col1: "Q3 2025", col2: "Invoice Processing Pilot", col3: "CFO", col4: "3 Months" },
          { col1: "Q4 2025", col2: "Support Auto-Response MVP", col3: "CTO", col4: "4 Months" },
          { col1: "Q1 2026", col2: "Inventory Prediction Rollout", col3: "COO", col4: "6 Months" },
          { col1: "Q2 2026", col2: "Contract Analysis Scale-up", col3: "Legal", col4: "9 Months" }
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

      // Simulate progress updates
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

  // PDF Generation
  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(26, 115, 232); // Primary Blue
    doc.text(`Insight AI Report: ${companyName}`, 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);
    
    let yPos = 40;

    data.steps.forEach((step: any) => {
      // Add new page if we're running out of space
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(`${step.id}. ${step.title}`, 14, yPos);
      yPos += 8;
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(step.description, 14, yPos);
      yPos += 10;

      if (step.type === 'table') {
        const tableColumn = step.columns;
        const tableRows = step.data.map((row: any) => Object.values(row));
        
        autoTable(doc, {
          startY: yPos,
          head: [tableColumn],
          body: tableRows,
          theme: 'striped',
          headStyles: { fillColor: [26, 115, 232] },
          margin: { top: 10 },
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 15;
      } else {
        // Grid View for Overview
        step.data.forEach((item: any) => {
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`${item.label}: ${item.value}`, 14, yPos);
            yPos += 6;
        });
        yPos += 10;
      }
    });

    doc.save(`${companyName}_Insight_AI_Report.pdf`);
  };

  // Excel Generation
  const generateExcel = () => {
    const wb = XLSX.utils.book_new();
    
    data.steps.forEach((step: any) => {
      let wsData = [];
      
      if (step.type === 'grid') {
         wsData = step.data.map((item: any) => ({ Label: item.label, Value: item.value }));
      } else {
         wsData = step.data.map((row: any) => {
           const newRow: any = {};
           step.columns.forEach((col: string, index: number) => {
             newRow[col] = Object.values(row)[index];
           });
           return newRow;
         });
      }

      const ws = XLSX.utils.json_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, step.title.substring(0, 30)); // Sheet names max 31 chars
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

    data.steps.forEach((step: any) => {
      children.push(
        new Paragraph({
          text: `${step.id}. ${step.title}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 100 },
        })
      );
      
      children.push(
        new Paragraph({
          text: step.description,
          spacing: { after: 200 },
        })
      );

      if (step.type === 'table') {
        const tableRows = [
          new DocxTableRow({
            children: step.columns.map((col: string) => 
              new DocxTableCell({
                children: [new Paragraph({ text: col, style: "strong" })],
                width: { size: 100 / step.columns.length, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                },
              })
            ),
          }),
          ...step.data.map((row: any) => 
            new DocxTableRow({
              children: Object.values(row).map((val: any) => 
                new DocxTableCell({
                  children: [new Paragraph({ text: String(val) })],
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
                  },
                })
              ),
            })
          )
        ];

        children.push(new DocxTable({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      } else {
        step.data.forEach((item: any) => {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `${item.label}: `, bold: true }),
              new TextRun({ text: item.value }),
            ]
          }));
        });
      }
      
      children.push(new Paragraph({ text: "" })); // Spacer
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: children,
      }],
    });

    Packer.toBlob(doc).then((blob) => {
      saveAs(blob, `${companyName}_Insight_AI_Report.docx`);
    });
  };

  // Markdown Generation
  const generateMarkdown = () => {
    let mdContent = `# Insight AI Report: ${companyName}\n`;
    mdContent += `Generated on ${new Date().toLocaleDateString()}\n\n`;
    
    data.steps.forEach((step: any) => {
      mdContent += `## ${step.id}. ${step.title}\n`;
      mdContent += `${step.description}\n\n`;
      
      if (step.type === 'table') {
        mdContent += `| ${step.columns.join(' | ')} |\n`;
        mdContent += `| ${step.columns.map(() => '---').join(' | ')} |\n`;
        step.data.forEach((row: any) => {
          mdContent += `| ${Object.values(row).join(' | ')} |\n`;
        });
        mdContent += `\n`;
      } else {
        step.data.forEach((item: any) => {
          mdContent += `- **${item.label}**: ${item.value}\n`;
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
        case "PDF":
          generatePDF();
          break;
        case "Excel":
          generateExcel();
          break;
        case "Word":
          generateWord();
          break;
        case "Markdown":
          generateMarkdown();
          break;
        default:
          break;
      }
      
      toast({
        title: "Download Complete",
        description: `Your ${format} report is ready.`,
        variant: "default",
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
              
              <h2 className="text-2xl font-bold mb-2">Generating Strategic Report for {companyName}</h2>
              <p className="text-muted-foreground mb-8">Executing 8-Step AI Analysis Framework...</p>
              
              <div className="w-full max-w-md space-y-6">
                <Step 
                  active={status === "researching"} 
                  completed={["benchmarking", "critiquing", "complete"].includes(status)}
                  label="Steps 0-3: Intelligence & Data" 
                  subLabel="Scanning KPIs, workflows, and friction points..."
                />
                <Step 
                  active={status === "benchmarking"} 
                  completed={["critiquing", "complete"].includes(status)}
                  label="Steps 4-5: AI Modeling" 
                  subLabel="Generating use cases and token cost models..."
                />
                <Step 
                  active={status === "critiquing"} 
                  completed={false}
                  label="Steps 6-7: ROI & Roadmap" 
                  subLabel="Prioritizing high-impact initiatives..."
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
            <Button 
              variant="outline" 
              size="sm" 
              onClick={regenerateAnalysis}
              disabled={!reportId || status !== "complete"}
            >
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
  // Handle both AI-generated data and mock data formats
  const hasData = step.data && step.data.length > 0;
  const isProseOnly = !hasData || (typeof step.data === 'string');
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm border border-primary/20">
              {step.step}
            </div>
            <CardTitle className="text-xl">{step.title}</CardTitle>
          </div>
          {step.step === 6 && <Badge variant="secondary" className="gap-1"><Calculator className="h-3 w-3" /> Token Model</Badge>}
          {step.step === 5 && <Badge variant="secondary" className="gap-1"><Brain className="h-3 w-3" /> AI Primitives</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {/* Display content text */}
        {step.content && (
          <div className="prose prose-sm max-w-none mb-6 text-muted-foreground">
            <p>{step.content}</p>
          </div>
        )}
        
        {/* Display data table if available */}
        {hasData && !isProseOnly && (
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
                      {Object.values(row).map((value: any, j: number) => (
                        <TableCell key={j} className={j === 0 ? "font-medium" : ""}>
                          {String(value)}
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