import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  ZAxis, Cell 
} from 'recharts';
import { 
  ArrowRight, TrendingUp, Shield, Banknote, Activity, 
  ChevronRight, Clock, Zap, CheckCircle2, Lock, Share2, Download, FileText, Check
} from 'lucide-react';
import { format } from '@/lib/formatters';

// Sanitize text to remove markdown artifacts for professional prose display
function sanitizeForProse(text: string): string {
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
}

const BRAND = {
  primary: '#0339AF',
  accent: '#4C73E9',
  dark: '#0F172A',
  light: '#F8FAFC',
  success: '#059669',
  warning: '#D97706',
  danger: '#DC2626'
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TrendingUp,
  Shield,
  Banknote,
  Activity,
  Zap,
  Clock,
  Lock
};

interface KPI {
  id: number;
  label: string;
  value: string;
  growth: string;
  iconName: string;
  desc: string;
}

interface MatrixDataPoint {
  name: string;
  x: number;
  y: number;
  z: number;
  type: string;
  color: string;
}

interface UseCase {
  id: string;
  title: string;
  value: string;
  impact: string;
  tokens: string;
  complexity: string;
  tags: string[];
}

interface DashboardData {
  clientName: string;
  reportDate: string;
  hero: {
    titlePrefix: string;
    titleHighlight: string;
    totalValue: string;
    valueSuffix: string;
    description: string;
  };
  executiveSummary: {
    title: string;
    description: string;
    kpis: KPI[];
  };
  priorityMatrix: {
    title: string;
    description: string;
    data: MatrixDataPoint[];
  };
  useCases: {
    title: string;
    description: string;
    items: UseCase[];
  };
}

const DEFAULT_DATA: DashboardData = {
  clientName: "Synovus Bank",
  reportDate: "December 11, 2025",
  hero: {
    titlePrefix: "Unlocking",
    titleHighlight: "Momentum",
    totalValue: "81.1",
    valueSuffix: "M",
    description: "We identified 10 high-impact AI use cases focused on back-office optimization and risk mitigation to drive efficiency."
  },
  executiveSummary: {
    title: "Value Drivers",
    description: "Our analysis projects $81.1M in annual value across four strategic pillars, with a heavy concentration in risk mitigation and cost reduction.",
    kpis: [
      { 
        id: 1, 
        label: "Revenue Growth", 
        value: "$20.4M", 
        growth: "+25%", 
        iconName: "TrendingUp", 
        desc: "Commercial Lending & Wealth" 
      },
      { 
        id: 2, 
        label: "Cost Reduction", 
        value: "$24.9M", 
        growth: "-31%", 
        iconName: "Activity", 
        desc: "Back-office Automation" 
      },
      { 
        id: 3, 
        label: "Cash Flow", 
        value: "$9.8M", 
        growth: "+12%", 
        iconName: "Banknote", 
        desc: "Cycle Time Optimization" 
      },
      { 
        id: 4, 
        label: "Risk Mitigation", 
        value: "$26.0M", 
        growth: "-32%", 
        iconName: "Shield", 
        desc: "AML & Fraud Detection" 
      }
    ]
  },
  priorityMatrix: {
    title: "Strategic Priority Matrix",
    description: "We mapped the top initiatives by Value (Y) vs. Time-to-Value (X).\nSize represents Implementation Complexity (Smaller = Easier).",
    data: [
      { name: 'Auto Credit Memo', x: 14, y: 19.4, z: 4, type: 'High Value', color: BRAND.primary }, 
      { name: 'AML Alert Triage', x: 11, y: 9.2, z: 3, type: 'Quick Win', color: BRAND.accent },
      { name: 'Portfolio Stress Test', x: 15, y: 10.2, z: 4, type: 'Strategic', color: BRAND.primary },
      { name: 'Wealth Advisor Suite', x: 9, y: 9.8, z: 3, type: 'Quick Win', color: BRAND.success },
      { name: 'Banking Copilot', x: 12, y: 7.1, z: 3, type: 'Balanced', color: BRAND.accent },
      { name: 'Legacy Code Docs', x: 6, y: 1.7, z: 2, type: 'Low Hanging Fruit', color: BRAND.success },
    ]
  },
  useCases: {
    title: "Use Case Discovery",
    description: "Explore the high-impact engines of the AI Strategy.",
    items: [
      {
        id: 'UC-01',
        title: 'Wealth Advisor Productivity Suite',
        value: '$9.8M',
        impact: 'Reclaims 18 hrs/week per advisor',
        tokens: '31.3M / mo',
        complexity: 'Medium',
        tags: ['Sales', 'Growth']
      },
      {
        id: 'UC-02',
        title: 'Intelligent AML Alert Triage',
        value: '$9.2M',
        impact: 'Reduces false positives by 70%',
        tokens: '67.8M / mo',
        complexity: 'High',
        tags: ['Risk', 'Compliance']
      },
      {
        id: 'UC-03',
        title: 'Automated Credit Memo',
        value: '$19.4M',
        impact: 'Reduces cycle time to 18 days',
        tokens: '3.1M / mo',
        complexity: 'Critical',
        tags: ['Lending', 'Efficiency']
      },
      {
        id: 'UC-04',
        title: 'Continuous Stress Testing',
        value: '$10.2M',
        impact: 'Weekly vs. Quarterly cadence',
        tokens: '90.8k / mo',
        complexity: 'High',
        tags: ['Risk', 'Analytics']
      }
    ]
  }
};

interface AnimatedCounterProps {
  value: string;
  prefix?: string;
  suffix?: string;
  formatter?: (v: number) => string;
}

const AnimatedCounter = ({ value, prefix = "", suffix = "", formatter = format.number }: AnimatedCounterProps) => {
  const [displayValue, setDisplayValue] = useState(0);
  const numericValue = parseFloat(value);
  
  useEffect(() => {
    if (isNaN(numericValue)) return;
    
    let start = 0;
    const end = numericValue;
    const duration = 2000;
    const increment = end / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(start);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [numericValue]);

  // Handle null/undefined/NaN with em-dash
  if (isNaN(numericValue)) {
    return <span className="tabular-nums">—</span>;
  }

  return (
    <span className="tabular-nums">{prefix}{formatter(displayValue)}{suffix}</span>
  );
};

const FlywheelBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-10">
    <motion.svg 
      viewBox="0 0 100 100" 
      className="absolute top-1/2 left-1/2 w-[150vh] h-[150vh] -translate-x-1/2 -translate-y-1/2"
      animate={{ rotate: 360 }}
      transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
    >
      <circle cx="50" cy="50" r="45" stroke={BRAND.primary} strokeWidth="0.5" fill="none" strokeDasharray="4 4" />
      <circle cx="50" cy="50" r="35" stroke={BRAND.accent} strokeWidth="0.5" fill="none" />
      <circle cx="50" cy="50" r="25" stroke={BRAND.primary} strokeWidth="1" fill="none" strokeDasharray="1 2" />
      <path d="M50 5 L50 95 M5 50 L95 50" stroke={BRAND.primary} strokeWidth="0.2" />
    </motion.svg>
  </div>
);

interface StickyHeaderProps {
  clientName: string;
  onShareUrl?: () => void;
  onViewHTMLReport?: () => void;
}

const StickyHeader = ({ clientName, onShareUrl, onViewHTMLReport }: StickyHeaderProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleShare = () => {
    if (onShareUrl) {
      onShareUrl();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-6'}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
    >
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="font-bold text-2xl tracking-tighter text-[#0339AF]">BlueAlly</div>
          <div className="h-6 w-px bg-gray-300 hidden md:block"></div>
          <div className="text-gray-500 font-medium hidden md:block">{clientName} Assessment</div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleShare}
            className="p-2 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors flex items-center gap-2"
            data-testid="button-share-url"
            title="Copy shareable link"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4 text-gray-600" />}
            <span className="hidden md:inline text-sm text-gray-600">{copied ? 'Copied!' : 'Share'}</span>
          </button>
          <button 
            onClick={onViewHTMLReport}
            className="bg-[#0339AF] hover:bg-[#4C73E9] text-white px-6 py-2 rounded-full font-semibold text-sm transition-colors shadow-lg flex items-center gap-2 group"
            data-testid="button-html-report"
          >
            Detailed HTML Report
            <FileText className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.header>
  );
};

interface HeroSectionProps {
  data: DashboardData['hero'];
  clientName: string;
}

const HeroSection = ({ data, clientName }: HeroSectionProps) => {
  return (
    <section className="relative h-screen flex flex-col justify-center items-center text-center px-6 overflow-hidden bg-gradient-to-b from-slate-50 to-white">
      <FlywheelBackground />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 max-w-4xl"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold mb-6 border border-blue-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          AI Strategic Assessment
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[#0F172A] mb-8 leading-tight">
          {data.titlePrefix} <span className="text-[#0339AF]">{data.titleHighlight}</span> for <br/>{clientName}
        </h1>
        
        <div className="flex flex-col md:flex-row items-center justify-center gap-12 mt-8">
          <div className="text-left">
            <p className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-1">Total Value Opportunity</p>
            <div className="text-6xl md:text-8xl font-bold text-[#0339AF] tracking-tighter">
              <AnimatedCounter value={data.totalValue} prefix="$" suffix={data.valueSuffix} />
            </div>
          </div>
          
          <div className="hidden md:block h-24 w-px bg-gray-200"></div>
          
          <div className="text-left max-w-xs">
            <p className="text-lg text-gray-600 leading-relaxed">
              {sanitizeForProse(data.description)}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div 
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-gray-400"
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <div className="text-xs font-medium mb-2 uppercase tracking-widest text-center">Explore Analysis</div>
        <ChevronRight className="w-6 h-6 rotate-90 mx-auto" />
      </motion.div>
    </section>
  );
};

interface ExecutiveSummaryProps {
  data: DashboardData['executiveSummary'];
}

const ExecutiveSummary = ({ data }: ExecutiveSummaryProps) => {
  return (
    <section className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-[#0F172A] mb-4">{data.title}</h2>
          <p className="text-gray-600 max-w-2xl">
            {sanitizeForProse(data.description)}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {data.kpis.map((kpi, idx) => {
            const IconComponent = ICON_MAP[kpi.iconName] || Activity;
            
            return (
              <motion.div 
                key={kpi.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                viewport={{ once: true }}
                className="group p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <IconComponent className="w-24 h-24 text-[#0339AF]" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-3 rounded-lg ${kpi.label.includes('Risk') ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <span className={`text-sm font-bold ${kpi.growth.startsWith('+') ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {kpi.growth}
                    </span>
                  </div>
                  
                  <h3 className="text-gray-500 font-medium text-sm mb-1">{kpi.label}</h3>
                  <div className="text-4xl font-bold text-[#0F172A] mb-4">{kpi.value}</div>
                  <div className="h-px w-full bg-slate-200 mb-4"></div>
                  <p className="text-sm text-gray-600">{kpi.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

interface PriorityMatrixProps {
  data: DashboardData['priorityMatrix'];
}

const PriorityMatrix = ({ data }: PriorityMatrixProps) => {
  return (
    <section className="py-24 bg-[#0F172A] text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}></div>
      
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl font-bold mb-4 text-white">{data.title}</h2>
            <p className="text-slate-400 max-w-xl whitespace-pre-line">
              {sanitizeForProse(data.description)}
            </p>
          </div>
          <div className="flex gap-4 mt-6 md:mt-0">
            <div className="flex items-center gap-2 text-sm text-slate-400"><div className="w-3 h-3 rounded-full bg-[#0339AF]"></div>High Value</div>
            <div className="flex items-center gap-2 text-sm text-slate-400"><div className="w-3 h-3 rounded-full bg-[#059669]"></div>Quick Win</div>
          </div>
        </div>

        <div className="h-[500px] w-full bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-sm">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Time to Value" 
                unit=" mo" 
                stroke="#94a3b8"
                label={{ value: 'Time to Value (Months)', position: 'insideBottom', offset: -10, fill: '#94a3b8' }} 
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Annual Value" 
                unit="M" 
                stroke="#94a3b8"
                label={{ value: 'Annual Value ($M)', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} 
              />
              <ZAxis type="number" dataKey="z" range={[100, 500]} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const point = payload[0].payload;
                    return (
                      <div className="bg-white p-4 rounded-lg shadow-xl border border-slate-200 text-slate-900">
                        <p className="font-bold text-lg mb-1">{point.name}</p>
                        <p className="text-sm text-blue-600 font-semibold">{point.type}</p>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <p className="text-xs text-slate-500">Value: ${point.y}M</p>
                        <p className="text-xs text-slate-500">Timeline: {point.x} Months</p>
                        <p className="text-xs text-slate-500">Complexity Score: {point.z}/5</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Initiatives" data={data.data} fill="#8884d8">
                {data.data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};

interface UseCaseCarouselProps {
  data: DashboardData['useCases'];
  clientName: string;
}

const UseCaseCarousel = ({ data, clientName }: UseCaseCarouselProps) => {
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h2 className="text-3xl font-bold text-[#0F172A]">{data.title}</h2>
            <p className="text-gray-600 mt-2">{sanitizeForProse(data.description.replace('Synovus', clientName))}</p>
          </div>
          <div className="flex gap-2">
            <button className="p-2 rounded-full border border-gray-300 hover:bg-white transition-colors"><ChevronRight className="rotate-180 w-5 h-5 text-gray-600" /></button>
            <button className="p-2 rounded-full border border-gray-300 hover:bg-white transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
          </div>
        </div>

        <div className="flex gap-6 overflow-x-auto pb-8 snap-x">
          {data.items.map((uc) => (
            <div key={uc.id} className="min-w-[350px] md:min-w-[400px] bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col snap-center hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-blue-50 text-[#0339AF] text-xs font-bold px-2 py-1 rounded uppercase tracking-wide">{uc.id}</span>
                <span className={`text-xs px-2 py-1 rounded-full border ${uc.complexity === 'Critical' ? 'border-red-200 text-red-600 bg-red-50' : 'border-slate-200 text-slate-500'}`}>
                  {uc.complexity}
                </span>
              </div>
              
              <h3 className="text-xl font-bold text-[#0F172A] mb-2">{uc.title}</h3>
              <p className="text-gray-600 text-sm mb-6 flex-grow">{uc.impact}</p>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Projected Value</span>
                  <span className="text-lg font-bold text-[#0339AF]">{uc.value}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Est. Tokens</span>
                  <span className="text-sm font-mono text-gray-700">{uc.tokens}</span>
                </div>
              </div>

              <div className="flex gap-2">
                {uc.tags.map(tag => (
                  <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

interface CTASectionProps {
  totalValue: string;
  valueSuffix: string;
  onViewHTMLReport?: () => void;
  onDownloadWorkshopPDF?: () => void;
}

const CTASection = ({ totalValue, valueSuffix, onViewHTMLReport, onDownloadWorkshopPDF }: CTASectionProps) => {
  return (
    <section className="py-32 bg-[#0339AF] text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
      
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        <h2 className="text-4xl md:text-5xl font-bold mb-8 tracking-tight text-white">Ready to activate the Flywheel?</h2>
        <p className="text-blue-100 text-lg md:text-xl mb-12 max-w-2xl mx-auto">
          The ${totalValue}{valueSuffix} opportunity is real. The next step is a 3-Day Use Case Workshop to transform this assessment into pilot-ready roadmaps.
        </p>
        
        <div className="flex flex-col md:flex-row justify-center items-center gap-4">
          <button 
            onClick={onViewHTMLReport}
            className="bg-white text-[#0339AF] px-8 py-4 rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2"
            data-testid="button-html-report-cta"
          >
            Detailed HTML Report
            <FileText className="w-5 h-5" />
          </button>
          <button 
            onClick={onDownloadWorkshopPDF}
            className="px-8 py-4 rounded-full font-semibold text-white border border-white/30 hover:bg-white/10 transition-all flex items-center gap-2"
            data-testid="button-workshop-details"
          >
            <Download className="w-5 h-5" />
            Workshop Details
          </button>
        </div>
        
        <div className="mt-16 flex justify-center gap-8 text-blue-200 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Executive Alignment
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 90-Day Pilot Cycle
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> ROI-Focused
          </div>
        </div>
      </div>
    </section>
  );
};

interface DashboardProps {
  data?: DashboardData;
  onShareUrl?: () => void;
  onDownloadWorkshopPDF?: () => void;
  onViewHTMLReport?: () => void;
}

export default function Dashboard({ data = DEFAULT_DATA, onShareUrl, onDownloadWorkshopPDF, onViewHTMLReport }: DashboardProps) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-200">
      <StickyHeader clientName={data.clientName} onShareUrl={onShareUrl} onViewHTMLReport={onViewHTMLReport} />
      <HeroSection data={data.hero} clientName={data.clientName} />
      <ExecutiveSummary data={data.executiveSummary} />
      <PriorityMatrix data={data.priorityMatrix} />
      <UseCaseCarousel data={data.useCases} clientName={data.clientName} />
      <CTASection 
        totalValue={data.hero.totalValue} 
        valueSuffix={data.hero.valueSuffix} 
        onViewHTMLReport={onViewHTMLReport}
        onDownloadWorkshopPDF={onDownloadWorkshopPDF}
      />
      
      <footer className="bg-slate-900 text-slate-500 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm">© 2025 BlueAlly. Confidential & Proprietary.</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export type { DashboardData, KPI, MatrixDataPoint, UseCase };
