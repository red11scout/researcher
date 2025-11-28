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
  MoreHorizontal, ArrowLeft, ShieldCheck, Target, 
  Briefcase, Zap, Layers, PieChart
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

// Mock Data Generation based on User Requirements
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
    ],
    // New Data Points based on "Image" Requirements
    drivers: [
      { name: 'Revenue', value: 85, fullMark: 100 },
      { name: 'Cost Efficiency', value: 65, fullMark: 100 },
      { name: 'Cash Flow', value: 75, fullMark: 100 },
      { name: 'Risk Mgmt', value: 90, fullMark: 100 },
    ],
    strategicInitiatives: [
      { 
        driver: "Grow Revenue", 
        initiative: "Enterprise AI Expansion", 
        details: "Launch dedicated enterprise-tier AI models to capture B2B market share.",
        impact: "High" 
      },
      { 
        driver: "Decrease Cost", 
        initiative: "Automated Supply Chain", 
        details: "Implement machine learning for inventory prediction to reduce holding costs.",
        impact: "Medium" 
      },
      { 
        driver: "Increase Cash Flow", 
        initiative: "Subscription Optimization", 
        details: "Revise pricing tiers to encourage annual prepayments.",
        impact: "Medium" 
      },
      { 
        driver: "Reduce Risk", 
        initiative: "Data Sovereignty Compliance", 
        details: "Establish regional data centers to meet EU and APAC regulations.",
        impact: "Critical" 
      }
    ],
    frictionPoints: [
      { function: "HR", issue: "Talent Retention", severity: "High", description: "High turnover in engineering due to aggressive competitor poaching." },
      { function: "IT", issue: "Legacy Systems", severity: "Medium", description: "Technical debt in billing infrastructure slowing down product launches." },
      { function: "Sales", issue: "Cycle Length", severity: "Medium", description: "Enterprise sales cycles extending beyond 6 months due to budget scrutiny." },
      { function: "Operations", issue: "Siloed Data", severity: "High", description: "Lack of unified data layer preventing cross-departmental insights." },
      { function: "Marketing", issue: "CAC Increase", severity: "Medium", description: "Rising ad costs on primary channels reducing ROI." },
      { function: "Procurement", issue: "Single Source", severity: "Low", description: "Dependency on single chip supplier for data centers." },
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
              
              <h2 className="text-2xl font-bold mb-2">Generating Report for {companyName}</h2>
              
              <div className="w-full max-w-md space-y-6 mt-8">
                <Step 
                  active={status === "researching"} 
                  completed={["benchmarking", "critiquing", "complete"].includes(status)}
                  label="Gathering Intelligence" 
                  subLabel="Scanning public records, news, and financial data..."
                />
                <Step 
                  active={status === "benchmarking"} 
                  completed={["critiquing", "complete"].includes(status)}
                  label="Benchmarking & Analysis" 
                  subLabel="Comparing against industry standards and competitors..."
                />
                <Step 
                  active={status === "critiquing"} 
                  completed={status === "complete"}
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
          <div className="container mx-auto max-w-6xl">
            
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="mb-6 w-full justify-start bg-transparent border-b rounded-none h-auto p-0">
                <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Overview</TabsTrigger>
                <TabsTrigger value="strategy" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Strategic Initiatives</TabsTrigger>
                <TabsTrigger value="friction" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Friction Points</TabsTrigger>
                <TabsTrigger value="financials" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2">Financials</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Executive Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                         <p className="leading-relaxed text-muted-foreground mb-6">{data.overview.description}</p>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatBox label="Founded" value={data.overview.founded} />
                            <StatBox label="HQ" value={data.overview.headquarters} />
                            <StatBox label="Employees" value={data.overview.employees} />
                            <StatBox label="Industry" value={data.overview.industry} />
                         </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Business Driver Alignment</CardTitle>
                        <CardDescription>Strategic focus distribution across key drivers</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[300px] w-full flex justify-center">
                           <ResponsiveContainer width="100%" height="100%">
                             <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data.drivers}>
                               <PolarGrid />
                               <PolarAngleAxis dataKey="name" />
                               <PolarRadiusAxis angle={30} domain={[0, 100]} />
                               <Radar name={companyName} dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.4} />
                             </RadarChart>
                           </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-6">
                     <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
                       <CardHeader>
                         <CardTitle className="text-blue-700 dark:text-blue-400 flex items-center gap-2">
                           <ShieldCheck className="h-5 w-5" />
                           AI Critique
                         </CardTitle>
                       </CardHeader>
                       <CardContent>
                         <p className="text-sm text-blue-900/80 dark:text-blue-200/80 leading-relaxed">
                           This report was generated with a conservative bias. Revenue estimates have been adjusted down by 5% to account for market volatility. The analysis prioritizes verified public filings over news speculation.
                         </p>
                       </CardContent>
                     </Card>
                     <Card>
                       <CardHeader>
                         <CardTitle>Market Share</CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-4">
                         {data.competitors.map((comp: any, i: number) => (
                           <div key={i}>
                             <div className="flex justify-between text-sm mb-1">
                               <span>{comp.name}</span>
                               <span className="font-medium">{comp.marketShare}%</span>
                             </div>
                             <div className="h-2 bg-secondary rounded-full overflow-hidden">
                               <div className="h-full bg-primary" style={{ width: `${comp.marketShare}%` }} />
                             </div>
                           </div>
                         ))}
                       </CardContent>
                     </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="strategy" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {data.strategicInitiatives.map((item: any, i: number) => (
                    <Card key={i} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <Badge variant="outline" className="mb-2">{item.driver}</Badge>
                          <Badge className={item.impact === 'Critical' ? 'bg-red-100 text-red-800 hover:bg-red-100' : 'bg-blue-100 text-blue-800 hover:bg-blue-100'}>
                            {item.impact} Impact
                          </Badge>
                        </div>
                        <CardTitle className="text-lg">{item.initiative}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground">{item.details}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="friction" className="space-y-6">
                <Card>
                   <CardHeader>
                     <CardTitle>Operational Friction Points</CardTitle>
                     <CardDescription>Identified bottlenecks across business functions</CardDescription>
                   </CardHeader>
                   <CardContent>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                       {data.frictionPoints.map((fp: any, i: number) => (
                         <div key={i} className="p-4 rounded-lg border bg-card">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold flex items-center gap-2">
                                <Layers className="h-4 w-4 text-muted-foreground" />
                                {fp.function}
                              </div>
                              <div className={`h-2 w-2 rounded-full ${
                                fp.severity === 'High' ? 'bg-red-500' : 
                                fp.severity === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                              }`} />
                            </div>
                            <div className="font-medium text-sm mb-1">{fp.issue}</div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{fp.description}</p>
                         </div>
                       ))}
                     </div>
                   </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="financials">
                 <Card>
                  <CardHeader>
                    <CardTitle>Financial Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.financials}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="year" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip cursor={{ fill: 'transparent' }} />
                          <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="profit" fill="hsl(var(--chart-2))" name="Profit" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                 </Card>
              </TabsContent>
            </Tabs>

          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatBox({ label, value }: { label: string, value: string }) {
  return (
    <div className="bg-muted/30 p-3 rounded-lg border">
      <div className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{label}</div>
      <div className="font-medium text-sm md:text-base truncate" title={value}>{value}</div>
    </div>
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