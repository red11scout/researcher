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
  Loader2, CheckCircle2, AlertTriangle, FileText, Download, 
  RefreshCw, FileSpreadsheet, FileType, ChevronRight, 
  TrendingUp, Users, Globe, DollarSign, ExternalLink,
  MoreHorizontal, ArrowLeft, ShieldCheck
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
  Line
} from "recharts";

// Mock Data Generation
const generateMockData = (company: string) => {
  return {
    overview: {
      founded: "2005",
      headquarters: "San Francisco, CA",
      employees: "5,000+",
      industry: "Technology",
      description: `${company} is a leading technology company focused on innovative solutions. They have established a strong market presence through continuous R&D and strategic acquisitions. Their primary focus is on scalable software infrastructure and consumer-facing applications.`,
      mission: "To organize the world's information and make it universally accessible and useful."
    },
    financials: [
      { year: '2020', revenue: 450, profit: 120 },
      { year: '2021', revenue: 580, profit: 160 },
      { year: '2022', revenue: 720, profit: 210 },
      { year: '2023', revenue: 890, profit: 290 },
      { year: '2024', revenue: 1100, profit: 350 },
    ],
    risks: [
      { level: "High", category: "Regulatory", description: "Increasing scrutiny from antitrust regulators in key markets." },
      { level: "Medium", category: "Competition", description: "Emerging startups in the AI sector posing threat to market share." },
      { level: "Low", category: "Operational", description: "Supply chain dependencies for hardware components." }
    ],
    competitors: [
      { name: "Competitor A", marketShare: 25 },
      { name: "Competitor B", marketShare: 15 },
      { name: "Competitor C", marketShare: 10 },
      { name: `${company}`, marketShare: 40 },
      { name: "Others", marketShare: 10 },
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
    // Researching
    setStatus("researching");
    setProgress(10);
    await new Promise(r => setTimeout(r, 1500));
    setProgress(40);
    
    // Benchmarking
    setStatus("benchmarking");
    await new Promise(r => setTimeout(r, 1500));
    setProgress(70);

    // Critiquing
    setStatus("critiquing");
    await new Promise(r => setTimeout(r, 1500));
    setProgress(100);
    
    // Complete
    setData(generateMockData(companyName));
    setStatus("complete");
  };

  const handleDownload = (format: string) => {
    toast({
      title: "Download Started",
      description: `Generating ${format} report for ${companyName}...`,
    });
    // Simulate download delay
    setTimeout(() => {
      toast({
        title: "Download Complete",
        description: `Your ${format} report is ready.`,
        variant: "default", // Success style
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
              
              <h2 className="text-2xl font-bold mb-2">Generating Report for {companyName}</h2>
              
              <div className="w-full max-w-md space-y-6 mt-8">
                <Step 
                  active={status === "researching"} 
                  completed={["benchmarking", "critiquing"].includes(status)}
                  label="Gathering Intelligence" 
                  subLabel="Scanning public records, news, and financial data..."
                />
                <Step 
                  active={status === "benchmarking"} 
                  completed={status === "critiquing"}
                  label="Benchmarking & Analysis" 
                  subLabel="Comparing against industry standards and competitors..."
                />
                <Step 
                  active={status === "critiquing"} 
                  completed={false}
                  label="Critical Review" 
                  subLabel="AI self-correction and conservative estimation..."
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
               <p className="text-xs text-muted-foreground">Report Generated: {new Date().toLocaleDateString()}</p>
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
          <div className="container mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Executive Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-primary" />
                    Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="leading-relaxed text-muted-foreground">
                    {data.overview.description}
                  </p>
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Headquarters</div>
                      <div className="font-medium">{data.overview.headquarters}</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Employees</div>
                      <div className="font-medium">{data.overview.employees}</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Founded</div>
                      <div className="font-medium">{data.overview.founded}</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">Industry</div>
                      <div className="font-medium">{data.overview.industry}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Financial Performance (Estimated)
                  </CardTitle>
                  <CardDescription>Revenue vs Profit Growth (in Millions)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.financials}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Revenue" />
                        <Bar dataKey="profit" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Profit" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 italic">
                    *Estimates based on industry benchmarks and available public data. Claude AI applies a conservative multiple to revenue projections.
                  </p>
                </CardContent>
              </Card>

              {/* Risk Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Risk Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.risks.map((risk: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className={`mt-1 h-2 w-2 rounded-full ${
                          risk.level === 'High' ? 'bg-red-500' : 
                          risk.level === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{risk.category}</span>
                            <Badge variant="secondary" className="text-[10px] h-5">{risk.level} Risk</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{risk.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-6">
               <Card className="bg-primary text-primary-foreground border-none">
                 <CardHeader>
                   <CardTitle className="text-lg">AI Critique</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="flex items-start gap-3">
                     <ShieldCheck className="h-5 w-5 mt-1 opacity-80" />
                     <div className="text-sm opacity-90 leading-relaxed">
                       This report was generated with a conservative bias. Revenue estimates for 2024 have been adjusted down by 5% to account for market volatility. Competitor analysis focuses on direct threats only.
                     </div>
                   </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardHeader>
                   <CardTitle className="text-lg">Market Share</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="space-y-4">
                     {data.competitors.map((comp: any, i: number) => (
                       <div key={i}>
                         <div className="flex justify-between text-sm mb-1">
                           <span>{comp.name}</span>
                           <span className="font-medium">{comp.marketShare}%</span>
                         </div>
                         <div className="h-2 bg-secondary rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-primary transition-all duration-1000" 
                             style={{ width: `${comp.marketShare}%` }}
                           />
                         </div>
                       </div>
                     ))}
                   </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardHeader>
                   <CardTitle className="text-lg">Sources</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <ul className="space-y-3">
                     {[1, 2, 3].map((i) => (
                       <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors">
                         <ExternalLink className="h-3 w-3" />
                         <span>Annual Report 202{i+2}</span>
                       </li>
                     ))}
                     <li className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary cursor-pointer transition-colors">
                       <ExternalLink className="h-3 w-3" />
                       <span>SEC Filings (Edgar)</span>
                     </li>
                   </ul>
                 </CardContent>
               </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
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