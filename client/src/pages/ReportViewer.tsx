import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Share2, 
  ArrowLeft, 
  Printer, 
  TrendingUp, 
  DollarSign, 
  PiggyBank, 
  Coins,
  BarChart3,
  FileText,
  Target,
  Lightbulb,
  ChevronDown
} from "lucide-react";
import { type Report } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { 
  StatCard, 
  ValueBreakdownChart, 
  DonutChart, 
  ModernTable, 
  SectionHeader,
  PriorityBadge,
  ValueCell,
  type TableColumn
} from "@/components/report";
import { useEffect, useState } from "react";

interface UseCase {
  name: string;
  value: number;
  priority: string;
  driver: string;
}

interface ExecutiveDashboard {
  totalRevenueBenefit: number;
  totalCostBenefit: number;
  totalCashFlowBenefit: number;
  totalRiskBenefit: number;
  totalAnnualValue: number;
  topUseCases: UseCase[];
}

interface AnalysisData {
  executiveDashboard?: ExecutiveDashboard;
  dashboard?: any;
  steps?: Array<{ step?: number; title?: string; content?: string; html?: string; data?: any }>;
  summary?: string;
}

const useCaseColumns: TableColumn<UseCase>[] = [
  {
    key: 'name',
    header: 'Use Case',
    sortable: true,
    render: (value) => (
      <div className="font-medium text-blueally-slate">{value}</div>
    )
  },
  {
    key: 'driver',
    header: 'Value Driver',
    sortable: true,
    render: (value) => (
      <span className="text-sm text-gray-600">{value}</span>
    )
  },
  {
    key: 'priority',
    header: 'Priority',
    sortable: true,
    align: 'center',
    render: (value) => <PriorityBadge priority={value} />
  },
  {
    key: 'value',
    header: 'Annual Value',
    sortable: true,
    align: 'right',
    render: (value) => <ValueCell value={value} />
  }
];

function ScrollNavigation({ sections }: { sections: { id: string; label: string }[] }) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id || '');

  useEffect(() => {
    const handleScroll = () => {
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 150 && rect.bottom >= 150) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav className="hidden lg:flex gap-1 bg-white/80 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm border border-gray-100">
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => scrollToSection(section.id)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            activeSection === section.id
              ? 'bg-blueally-navy text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          data-testid={`nav-${section.id}`}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

function ExecutiveSummaryCard({ summary }: { summary: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="bg-gradient-to-br from-blueally-navy via-blueally-royal to-blue-500 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden"
      data-testid="executive-summary"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/20 rounded-lg">
            <Lightbulb className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-heading font-bold">Executive Summary</h3>
        </div>
        <p className="text-lg leading-relaxed text-blue-100">
          {summary}
        </p>
      </div>
    </motion.div>
  );
}

function StepCard({ 
  step, 
  index, 
  total 
}: { 
  step: { step?: number; title?: string; content?: string; html?: string; data?: any }; 
  index: number;
  total: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Card className="border-0 shadow-card hover:shadow-card-hover transition-all duration-300 overflow-hidden group">
        <div className="h-1.5 bg-gradient-to-r from-blueally-navy via-blueally-royal to-blueally-cyan" />
        <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blueally-navy text-white font-bold text-sm shadow-sm group-hover:scale-110 transition-transform duration-300">
              {index + 1}
            </div>
            <div>
              <CardTitle className="text-xl text-blueally-navy font-heading">
                {step.title || `Analysis Section ${index + 1}`}
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">Step {index + 1} of {total}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 prose prose-slate max-w-none prose-headings:text-blueally-navy prose-a:text-blueally-royal prose-strong:text-blueally-slate">
          <div 
            dangerouslySetInnerHTML={{ 
              __html: step.content || step.html || "<p class='text-gray-500 italic'>No content available</p>" 
            }} 
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function ReportViewer() {
  const [, params] = useRoute("/reports/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: [`/api/reports/${id}`],
    enabled: !!id,
  });

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Shareable report link copied to clipboard.",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-blueally-light p-8 space-y-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full bg-gray-200" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-64 bg-gray-200" />
              <Skeleton className="h-4 w-48 bg-gray-200" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40 w-full bg-gray-200 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80 w-full bg-gray-200 rounded-xl" />
            <Skeleton className="h-80 w-full bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blueally-light to-blue-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="max-w-md w-full border-red-200 shadow-lg">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Report Not Found
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-6 text-gray-600">The report you are looking for does not exist or has been removed.</p>
              <Button 
                onClick={() => setLocation("/")} 
                variant="outline" 
                className="w-full"
                data-testid="button-return-home"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return Home
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const analysis = report.analysisData as AnalysisData;
  const dashboard = analysis?.executiveDashboard || analysis?.dashboard;
  const steps = analysis?.steps || [];
  const summary = analysis?.summary;

  const valueBreakdownData = dashboard ? [
    { name: 'Revenue', value: dashboard.totalRevenueBenefit || 0 },
    { name: 'Cost', value: dashboard.totalCostBenefit || 0 },
    { name: 'Cash Flow', value: dashboard.totalCashFlowBenefit || 0 },
    { name: 'Risk', value: dashboard.totalRiskBenefit || 0 },
  ].filter(item => item.value > 0) : [];

  const totalValue = dashboard?.totalAnnualValue || 
    valueBreakdownData.reduce((sum, item) => sum + item.value, 0);

  const topUseCases = dashboard?.topUseCases || [];

  const navigationSections = [
    { id: 'dashboard', label: 'Dashboard' },
    ...(summary ? [{ id: 'summary', label: 'Summary' }] : []),
    ...(topUseCases.length > 0 ? [{ id: 'use-cases', label: 'Use Cases' }] : []),
    ...(steps.length > 0 ? [{ id: 'analysis', label: 'Analysis' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-blueally-light via-white to-blueally-light font-sans text-slate-800">
      <header className="bg-gradient-to-r from-blueally-navy via-blueally-navy to-blueally-royal text-white shadow-xl sticky top-0 z-50 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                className="text-white hover:bg-white/10 rounded-full"
                onClick={() => setLocation("/")}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <div className="h-8 w-px bg-white/20" />
              <div>
                <h1 className="text-xl font-heading font-bold tracking-tight">
                  BlueAlly Insight
                </h1>
                <div className="text-xs text-blue-200">
                  Strategic AI Opportunity Assessment for{" "}
                  <span className="text-white font-semibold">{report.companyName}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ScrollNavigation sections={navigationSections} />
              
              <div className="hidden md:flex gap-2 ml-4">
                <Button 
                  onClick={handleCopyLink} 
                  className="bg-blueally-green hover:bg-green-600 text-white border-none shadow-md rounded-full"
                  data-testid="button-share-link"
                >
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
                <Button 
                  onClick={handlePrint} 
                  variant="outline" 
                  className="text-blueally-navy border-white bg-white hover:bg-gray-100 rounded-full"
                  data-testid="button-print"
                >
                  <Printer className="w-4 h-4 mr-2" /> Print
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-br from-blueally-navy via-blueally-royal to-blue-500 text-white py-16 print:py-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">
              AI Value Assessment Report
            </h1>
            <p className="text-xl text-blue-100 mb-2">
              {report.companyName}
            </p>
            <p className="text-sm text-blue-200">
              Generated on {new Date(report.createdAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </motion.div>
        </div>
        
        <motion.div 
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 print:hidden"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <ChevronDown className="w-6 h-6 text-white/50" />
        </motion.div>
      </section>

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-16 print:p-4 print:max-w-none print:space-y-8">
        
        <section id="dashboard" className="scroll-mt-24 space-y-8">
          <SectionHeader 
            title="Executive Dashboard"
            subtitle="Key performance indicators and value drivers at a glance"
            icon={BarChart3}
            accentColor="navy"
            size="lg"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              value={totalValue}
              label="Total Annual Value"
              description="Combined AI opportunity value"
              icon={DollarSign}
              color="navy"
              prefix="$"
            />
            <StatCard
              value={dashboard?.totalRevenueBenefit || 0}
              label="Revenue Benefit"
              description="New revenue opportunities"
              icon={TrendingUp}
              color="green"
              prefix="$"
            />
            <StatCard
              value={dashboard?.totalCostBenefit || 0}
              label="Cost Benefit"
              description="Operational savings"
              icon={PiggyBank}
              color="royal"
              prefix="$"
            />
            <StatCard
              value={dashboard?.totalCashFlowBenefit || 0}
              label="Cash Flow Benefit"
              description="Working capital improvement"
              icon={Coins}
              color="orange"
              prefix="$"
            />
          </div>

          {valueBreakdownData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ValueBreakdownChart
                data={valueBreakdownData}
                title="Value Distribution by Driver"
                height={280}
              />
              <DonutChart
                data={valueBreakdownData}
                title="Value Composition"
                totalLabel="Total Value"
                height={280}
              />
            </div>
          )}
        </section>

        {summary && (
          <section id="summary" className="scroll-mt-24">
            <ExecutiveSummaryCard summary={summary} />
          </section>
        )}

        {topUseCases.length > 0 && (
          <section id="use-cases" className="scroll-mt-24 space-y-6">
            <SectionHeader 
              title="Priority Use Cases"
              subtitle="Highest-value AI opportunities identified for your organization"
              icon={Target}
              accentColor="green"
            />
            
            <ModernTable
              data={topUseCases}
              columns={useCaseColumns}
              title="Top AI Opportunities Ranked by Value"
              striped
              hoverable
            />
          </section>
        )}

        {steps.length > 0 && (
          <section id="analysis" className="scroll-mt-24 space-y-8">
            <SectionHeader 
              title="Detailed Analysis"
              subtitle="Step-by-step breakdown of the AI assessment methodology and findings"
              icon={FileText}
              accentColor="royal"
            />
            
            <div className="space-y-6">
              {steps.map((step, index) => (
                <StepCard 
                  key={index} 
                  step={step} 
                  index={index}
                  total={steps.length}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="bg-gradient-to-br from-slate-900 to-blueally-navy text-white py-16 mt-16 print:hidden relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h3 className="text-2xl font-heading font-bold mb-2">BlueAlly</h3>
            <p className="text-blue-300 text-lg mb-6">Conquer Complexity.</p>
            <div className="flex justify-center gap-4 mb-8">
              <Button 
                onClick={handleCopyLink}
                className="bg-blueally-green hover:bg-green-600 rounded-full"
              >
                <Share2 className="w-4 h-4 mr-2" /> Share Report
              </Button>
              <Button 
                onClick={handlePrint}
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 rounded-full"
              >
                <Printer className="w-4 h-4 mr-2" /> Export PDF
              </Button>
            </div>
            <p className="text-slate-400 text-sm">
              © {new Date().getFullYear()} BlueAlly. All rights reserved.
            </p>
          </motion.div>
        </div>
      </footer>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:py-8 { padding-top: 2rem; padding-bottom: 2rem; }
          .print\\:p-4 { padding: 1rem; }
          .print\\:max-w-none { max-width: none; }
          .print\\:space-y-8 > :not([hidden]) ~ :not([hidden]) { margin-top: 2rem; }
          
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          
          section { page-break-inside: avoid; }
          
          .shadow-card, .shadow-xl, .shadow-lg, .shadow-md, .shadow-sm { box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}
