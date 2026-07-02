import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, TrendingUp, Shield, Banknote, Activity,
  ChevronRight, Clock, Zap, CheckCircle2, Lock, Share2, Download, FileText, Check,
  BarChart3, ScatterChart as ScatterIcon, X, LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from '@/lib/formatters';
import { QuadrantBubbleChart } from '@/components/dashboard/quadrant-bubble-chart';
import { MatrixScorecard } from '@/components/dashboard/matrix-scorecard';
import { MethodologySection } from '@/components/dashboard/methodology-section';
import { UseCaseCards } from '@/components/dashboard/use-case-cards';
import { HowWeScoreReadiness } from '@/components/dashboard/how-we-score-readiness';

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
  danger: '#DC2626',
  teal: '#0D9488',
  gray: '#94A3B8',
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

// Pillar color mapping for insight cards
const PILLAR_COLORS: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  Revenue: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: 'bg-emerald-100' },
  Cost: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: 'bg-blue-100' },
  CashFlow: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'bg-amber-100' },
  Risk: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: 'bg-indigo-100' },
};

interface KPI {
  id: number;
  label: string;
  value: string;
  growth: string;
  iconName: string;
  desc: string;
}

// Value Driver Insight card
interface ValueInsight {
  pillar: string;
  title: string;
  metric: string;
  description: string;
  pctOfTotal: number;
  iconName: string;
}

interface MatrixDataPoint {
  name: string;
  x: number;  // Readiness Score (1-10)
  y: number;  // Normalized Annual Value (1-10)
  z: number;  // TTV bubble score (0-1, higher = faster time-to-value)
  type: string;  // Quadrant label: Champion, Conditional Champion, Strategic, Quick Win, Foundation
  color: string;
  // Enriched fields for consulting-grade bubble chart
  timeToValue?: number;       // months — used to derive TTV bubble score
  priorityTier?: string;      // Tier label — bubble color
  priorityScore?: number;     // 1-10 — tooltip detail
  annualValue?: number;       // raw $ amount — tooltip detail
  readinessScore?: number;  // 1-10 composite
  normalizedValue?: number;   // 1-10 min-max normalized
  organizationalCapacity?: number;    // 1-10 component
  dataAvailabilityQuality?: number;   // 1-10 component
  technicalInfrastructure?: number;   // 1-10 component
  governance?: number;                // 1-10 component
  // VRM v2.0 fields
  quadrantV2?: string;
  quadrantLayer?: number;
  quadrantRationale?: string;
  floorFailureReasons?: string[];
  conditionalChampionMeta?: {
    gaps: Array<{ component: string; current: number; required: number }>;
    proposedSprintWeeks: number;
    reclassificationCriteria: string;
  };
  wave?: string;
  hasNamedSponsor?: boolean | null;
  dataAvailableForEngagement?: boolean | null;
  timeToPilotWeeks?: number | null;
  subComponents?: Record<string, Record<string, number>>;
  // Legacy fields for backward compat
  dataReadiness?: number;
  integrationComplexity?: number;
  changeMgmt?: number;
  monthlyTokens?: number;
  description?: string;
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
    insights?: ValueInsight[];
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
  useCaseDetails?: any[]; // Raw Step 4 data for detailed card layout
  scenarioComparison?: {
    conservative: { annualBenefit: string; npv: string };
    moderate: { annualBenefit: string; npv: string };
    aggressive: { annualBenefit: string; npv: string };
  };
  frictionByTheme?: Record<string, string[]>;
  // VRM v2.0 / v2.1 metadata
  vrm?: {
    schemaVersion: string;
    priorSchemaVersion?: string;
    rubricVersion: string;
    sectorPreset: string;
    sectorPresetLabel: string;
    weights: { orgCapacity: number; dataReadiness: number; governance: number; techInfrastructure: number };
    baselineWeights: { orgCapacity: number; dataReadiness: number; governance: number; techInfrastructure: number };
    quadrantThresholds: { championMin: number; quickStrategicMin: number; valueFloor: number; maxTimeToPilotWeeks: number; valueFloorBand?: { minNormalizedScore: number; minAbsoluteAnnualValue: number } };
    engagementConfig?: any;
    valueNormalization?: string;
    diagnostic?: {
      totalUseCases: number;
      prototypingCandidatesCount: number;
      prototypingCandidatesPct: number;
      championCount: number;
      conditionalChampionCount: number;
      quickWinCount: number;
      strategicCount: number;
      foundationHardCount: number;
      foundationSoftCount: number;
      foundationCount: number;
      medianValueScore: number;
      medianReadinessScore: number;
      hardKnockOutBreakdown: Record<string, number>;
      softBlockerBreakdown: Record<string, number>;
      warnings: Array<{ code: string; severity: string; message: string; remediation?: string }>;
    };
  };
}

// VRM v2.1 — Methodology Integrity Panel
const MethodologyIntegrityPanel = ({ diagnostic, schemaVersion }: { diagnostic: NonNullable<NonNullable<DashboardData['vrm']>['diagnostic']>; schemaVersion: string }) => {
  if (!diagnostic) return null;

  const severityStyle = (sev: string) => {
    switch (sev) {
      case 'critical': return { bg: 'bg-red-900/40', border: 'border-red-500/50', text: 'text-red-200', dot: 'bg-red-400', label: 'Critical' };
      case 'warning': return { bg: 'bg-amber-900/40', border: 'border-amber-500/50', text: 'text-amber-100', dot: 'bg-amber-400', label: 'Warning' };
      case 'info':
      default: return { bg: 'bg-blue-900/30', border: 'border-blue-500/40', text: 'text-blue-100', dot: 'bg-blue-400', label: 'Info' };
    }
  };

  return (
    <section
      className="mb-4 md:mb-6 px-4 md:px-5 py-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm"
      data-testid="panel-methodology-integrity"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm md:text-base font-semibold text-white">Methodology Integrity</h3>
          <p className="text-[11px] md:text-xs text-slate-400 mt-0.5">Schema v{schemaVersion} · {diagnostic.totalUseCases} use cases analyzed</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400 uppercase tracking-wider">Prototyping Candidates</p>
          <p className="text-lg md:text-xl font-bold text-white tabular-nums" data-testid="text-prototyping-candidates">
            {diagnostic.prototypingCandidatesCount}
            <span className="text-xs text-slate-500 ml-1">/ {diagnostic.totalUseCases}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 text-[11px]">
        <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-2 py-1.5">
          <div className="text-emerald-300/80">Champions</div>
          <div className="font-semibold text-emerald-100 tabular-nums">{diagnostic.championCount}</div>
        </div>
        <div className="rounded-lg bg-amber-900/30 border border-amber-700/40 px-2 py-1.5">
          <div className="text-amber-300/80">Conditional Champ.</div>
          <div className="font-semibold text-amber-100 tabular-nums">{diagnostic.conditionalChampionCount}</div>
        </div>
        <div className="rounded-lg bg-teal-900/30 border border-teal-700/40 px-2 py-1.5">
          <div className="text-teal-300/80">Quick Wins</div>
          <div className="font-semibold text-teal-100 tabular-nums">{diagnostic.quickWinCount}</div>
        </div>
        <div className="rounded-lg bg-blue-900/30 border border-blue-700/40 px-2 py-1.5">
          <div className="text-blue-300/80">Strategic</div>
          <div className="font-semibold text-blue-100 tabular-nums">{diagnostic.strategicCount}</div>
        </div>
        <div className="rounded-lg bg-slate-700/40 border border-slate-600/40 px-2 py-1.5">
          <div className="text-slate-300/80">Foundation</div>
          <div className="font-semibold text-slate-100 tabular-nums">
            {diagnostic.foundationCount}
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              ({diagnostic.foundationHardCount} hard · {diagnostic.foundationSoftCount} soft)
            </span>
          </div>
        </div>
      </div>

      {diagnostic.warnings && diagnostic.warnings.length > 0 ? (
        <div className="space-y-2" data-testid="list-diagnostic-warnings">
          {diagnostic.warnings.map((w, i) => {
            const s = severityStyle(w.severity);
            return (
              <div
                key={`${w.code}-${i}`}
                className={`rounded-lg border ${s.border} ${s.bg} px-3 py-2`}
                data-testid={`warning-${w.code}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${s.text}`}>{s.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{w.code}</span>
                    </div>
                    <p className={`text-xs ${s.text} mt-0.5 leading-relaxed`}>{w.message}</p>
                    {w.remediation && (
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        <span className="font-semibold">Recommendation: </span>{w.remediation}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-900/20 border border-emerald-700/40 px-3 py-2 text-xs text-emerald-100">
          No methodology integrity warnings — portfolio passes all v2.1 diagnostic checks.
        </div>
      )}
    </section>
  );
};

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
      { id: 1, label: "Revenue Growth", value: "$20.4M", growth: "+25%", iconName: "TrendingUp", desc: "Commercial Lending & Wealth" },
      { id: 2, label: "Cost Reduction", value: "$24.9M", growth: "-31%", iconName: "Activity", desc: "Back-office Automation" },
      { id: 3, label: "Cash Flow", value: "$9.8M", growth: "+12%", iconName: "Banknote", desc: "Cycle Time Optimization" },
      { id: 4, label: "Risk Mitigation", value: "$26.0M", growth: "-32%", iconName: "Shield", desc: "AML & Fraud Detection" }
    ],
    insights: [
      { pillar: "Revenue", title: "Revenue Growth", metric: "$20.4M", description: "25% of total value from commercial lending and wealth management uplift.", pctOfTotal: 25, iconName: "TrendingUp" },
      { pillar: "Cost", title: "Cost Reduction", metric: "$24.9M", description: "31% of total value from back-office automation and document processing.", pctOfTotal: 31, iconName: "Activity" },
      { pillar: "CashFlow", title: "Cash Flow Acceleration", metric: "$9.8M", description: "12% of total value from cycle time optimization across lending operations.", pctOfTotal: 12, iconName: "Banknote" },
      { pillar: "Risk", title: "Risk Mitigation", metric: "$26.0M", description: "32% of total value from enhanced AML, fraud detection, and compliance.", pctOfTotal: 32, iconName: "Shield" },
    ],
  },
  priorityMatrix: {
    title: "Value-Readiness Matrix",
    description: "Initiatives mapped by Business Value vs. Implementation Readiness.\nBubble size indicates Implementation Readiness (larger = more ready).",
    data: [
      { name: 'Auto Credit Memo', x: 35, y: 85, z: 4, type: 'Strategic Bet', color: BRAND.primary },
      { name: 'AML Alert Triage', x: 70, y: 75, z: 3, type: 'Champion', color: BRAND.success },
      { name: 'Portfolio Stress Test', x: 30, y: 70, z: 4, type: 'Strategic Bet', color: BRAND.primary },
      { name: 'Wealth Advisor Suite', x: 65, y: 68, z: 3, type: 'Champion', color: BRAND.success },
      { name: 'Banking Copilot', x: 55, y: 50, z: 3, type: 'Quick Win', color: BRAND.teal },
      { name: 'Legacy Code Docs', x: 80, y: 20, z: 2, type: 'Quick Win', color: BRAND.teal },
    ]
  },
  useCases: {
    title: "Use Case Discovery",
    description: "Explore the high-impact engines of the AI Strategy.",
    items: [
      { id: 'UC-01', title: 'Wealth Advisor Productivity Suite', value: '$9.8M', impact: 'Reclaims 18 hrs/week per advisor', tokens: '31.3M / mo', complexity: 'Medium', tags: ['Sales', 'Growth'] },
      { id: 'UC-02', title: 'Intelligent AML Alert Triage', value: '$9.2M', impact: 'Reduces false positives by 70%', tokens: '67.8M / mo', complexity: 'High', tags: ['Risk', 'Compliance'] },
      { id: 'UC-03', title: 'Automated Credit Memo', value: '$19.4M', impact: 'Reduces cycle time to 18 days', tokens: '3.1M / mo', complexity: 'Critical', tags: ['Lending', 'Efficiency'] },
      { id: 'UC-04', title: 'Continuous Stress Testing', value: '$10.2M', impact: 'Weekly vs. Quarterly cadence', tokens: '90.8k / mo', complexity: 'High', tags: ['Risk', 'Analytics'] }
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

  if (isNaN(numericValue)) {
    return <span className="tabular-nums">&mdash;</span>;
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
  onViewEditorialReport?: () => void;
  isSharedView?: boolean;
}

const StickyHeader = ({ clientName, onShareUrl, onViewHTMLReport, onViewEditorialReport, isSharedView }: StickyHeaderProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);

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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-2 md:py-3' : 'bg-transparent py-3 md:py-6'}`}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
    >
      <div className="max-w-[1600px] mx-auto px-3 md:px-6 flex justify-between items-center">
        <div className="flex items-center gap-2 md:gap-4">
          <img src="https://www.blueally.com/wp-content/uploads/2023/11/blue-header-logo.png" alt="BlueAlly" className="h-8 md:h-10 w-auto" />
          <div className="h-6 w-px bg-gray-300 hidden md:block"></div>
          <div className="text-gray-500 font-medium hidden md:block">{clientName} Assessment</div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          {/* Share button is owner-only — generates a fresh /shared/:id link
              from /api/share. In a shared view the URL is already in the
              public viewer's address bar; rendering a Share button there
              would silently no-op (onShareUrl is undefined) and look like
              a broken control. */}
          {!isSharedView && (
            <button
              onClick={handleShare}
              className="p-2 rounded-full border border-gray-300 hover:bg-gray-100 transition-colors flex items-center gap-2 min-w-[40px] min-h-[40px] justify-center"
              data-testid="button-share-url"
              title="Copy shareable link"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4 text-gray-600" />}
              <span className="hidden md:inline text-sm text-gray-600">{copied ? 'Copied!' : 'Share'}</span>
            </button>
          )}
          {/* Report export dropdown */}
          <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setReportMenuOpen(false); }}>
            <button
              onClick={() => setReportMenuOpen(o => !o)}
              className="bg-[#0339AF] hover:bg-[#4C73E9] text-white px-3 md:px-5 py-2 rounded-full font-semibold text-xs md:text-sm transition-colors shadow-lg flex items-center gap-1 md:gap-2 min-h-[40px]"
              data-testid="button-html-report"
              aria-haspopup="true"
            >
              <span className="hidden sm:inline">Export Report</span>
              <span className="sm:hidden">Report</span>
              <FileText className="w-4 h-4" />
              <ChevronRight className={`w-3 h-3 transition-transform ${reportMenuOpen ? 'rotate-90' : ''}`} />
            </button>
            {reportMenuOpen && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50 min-w-[220px]">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Choose Format</span>
                </div>
                <button
                  onClick={() => { onViewHTMLReport?.(); setReportMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-3 group"
                  data-testid="button-boardroom-report"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0F172A] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Boardroom Report</div>
                    <div className="text-xs text-gray-500">Data-dense, full detail</div>
                  </div>
                </button>
                <button
                  onClick={() => { onViewEditorialReport?.(); setReportMenuOpen(false); }}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-3 group border-t border-gray-100"
                  data-testid="button-editorial-report"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0339AF] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-gray-900">Editorial Report</div>
                    <div className="text-xs text-gray-500">Narrative-led, curated</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          {!isSharedView && <LogoutButton />}
        </div>
      </div>
    </motion.header>
  );
};

function LogoutButton() {
  const { logout } = useAuth();
  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };
  return (
    <button
      onClick={handleLogout}
      className="p-2 rounded-full border border-gray-300 hover:bg-red-50 hover:border-red-300 transition-colors flex items-center gap-2 min-w-[40px] min-h-[40px] justify-center"
      data-testid="button-dashboard-logout"
      title="Logout"
    >
      <LogOut className="w-4 h-4 text-gray-600" />
    </button>
  );
}

interface HeroSectionProps {
  data: DashboardData['hero'];
  clientName: string;
}

const HeroSection = ({ data, clientName }: HeroSectionProps) => {
  return (
    <section className="relative min-h-screen flex flex-col justify-center items-center text-center px-4 md:px-6 overflow-hidden bg-gradient-to-b from-slate-50 to-white pt-20 md:pt-0">
      <FlywheelBackground />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="z-10 max-w-6xl"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs md:text-sm font-semibold mb-4 md:mb-6 border border-blue-100">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          AI Strategic Assessment
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight text-[#0F172A] mb-4 md:mb-8 leading-tight">
          {data.titlePrefix} <span className="text-[#0339AF]">{data.titleHighlight}</span> for <br/>{clientName}
        </h1>

        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 mt-4 md:mt-8">
          <div className="text-center md:text-left">
            <p className="text-gray-500 text-xs md:text-sm font-semibold uppercase tracking-wider mb-1">Total Value Opportunity</p>
            <div className="text-5xl sm:text-6xl md:text-8xl font-bold text-[#0339AF] tracking-tighter">
              <AnimatedCounter value={data.totalValue} prefix="$" suffix={data.valueSuffix} />
            </div>
          </div>

          <div className="hidden md:block h-24 w-px bg-gray-200"></div>

          <div className="text-center md:text-left max-w-md px-4 md:px-0">
            <p className="text-base md:text-lg text-gray-600 leading-relaxed">
              {sanitizeForProse(data.description)}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 text-gray-400"
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
  const insights = data.insights || [];
  const hasInsights = insights.length > 0;

  return (
    <section className="py-16 md:py-28 bg-white relative">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6">
        <div className="mb-8 md:mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-2 md:mb-4">{data.title}</h2>
        </div>

        {/* Structured Insight Cards — replaces wordy paragraph */}
        {hasInsights ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
            {insights.map((insight, idx) => {
              const colors = PILLAR_COLORS[insight.pillar] || PILLAR_COLORS.Cost;
              const IconComponent = ICON_MAP[insight.iconName] || Activity;

              return (
                <motion.div
                  key={insight.pillar}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  className={`group relative p-6 md:p-8 rounded-2xl border ${colors.border} ${colors.bg} hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 overflow-hidden`}
                >
                  {/* Decorative bar on left */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${colors.text.replace('text-', 'bg-')}`} />

                  <div className="relative z-10 pl-2">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2 md:p-3 rounded-lg ${colors.icon} ${colors.text}`}>
                        <IconComponent className="w-5 h-5 md:w-6 md:h-6" />
                      </div>
                      <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">{insight.title}</h3>
                    </div>

                    <div className={`text-3xl md:text-4xl font-bold ${colors.text} mb-3`}>
                      {insight.metric}
                    </div>

                    {/* Progress bar showing % of total */}
                    <div className="w-full h-1.5 bg-gray-200 rounded-full mb-3">
                      <motion.div
                        className={`h-full rounded-full ${colors.text.replace('text-', 'bg-')}`}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${insight.pctOfTotal}%` }}
                        transition={{ duration: 1, delay: idx * 0.15 }}
                        viewport={{ once: true }}
                      />
                    </div>

                    <p className="text-sm text-gray-600 leading-relaxed">
                      {insight.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Fallback: KPI grid for backward compatibility */
          <>
            <p className="text-gray-600 max-w-2xl text-sm md:text-base mb-8">
              {sanitizeForProse(data.description)}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {data.kpis.map((kpi, idx) => {
                const IconComponent = ICON_MAP[kpi.iconName] || Activity;

                return (
                  <motion.div
                    key={kpi.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    className="group p-5 md:p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <IconComponent className="w-16 md:w-24 h-16 md:h-24 text-[#0339AF]" />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-3 md:mb-4">
                        <div className={`p-2 md:p-3 rounded-lg ${kpi.label.includes('Risk') ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                          <IconComponent className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <span className={`text-sm font-bold ${kpi.growth.startsWith('+') ? 'text-emerald-600' : 'text-blue-600'}`}>
                          {kpi.growth}
                        </span>
                      </div>
                      <h3 className="text-gray-500 font-medium text-sm mb-1">{kpi.label}</h3>
                      <div className="text-3xl md:text-4xl font-bold text-[#0F172A] mb-3 md:mb-4">{kpi.value}</div>
                      <div className="h-px w-full bg-slate-200 mb-3 md:mb-4"></div>
                      <p className="text-sm text-gray-600">{kpi.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

interface PriorityMatrixProps {
  data: DashboardData['priorityMatrix'];
  vrm?: DashboardData['vrm'];
}

// Detail drawer for clicked use case
const UseCaseDetailDrawer = ({ point, onClose }: { point: MatrixDataPoint; onClose: () => void }) => {
  const scoreBar = (label: string, value: number, max: number, color: string) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200 font-semibold">{value}/{max}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-700 rounded-full">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="fixed right-0 top-0 bottom-0 w-full sm:w-[380px] bg-[#0F172A] border-l border-slate-700 z-[60] overflow-y-auto shadow-2xl"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-lg font-bold text-white leading-tight">{point.name}</h3>
            {point.priorityTier && (
              <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full ${
                point.priorityTier.includes('Champion') ? 'bg-emerald-700/80 text-white' :
                point.priorityTier.includes('Quick Win') ? 'bg-teal-600/80 text-white' :
                point.priorityTier.includes('Strategic') ? 'bg-blue-700/80 text-white' :
                'bg-slate-500/50 text-white'
              }`}>
                {point.priorityTier}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quadrant placement */}
        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
          <p className="text-sm font-semibold text-slate-300 mb-1">Quadrant: {point.type}</p>
          <p className="text-xs text-slate-500">
            {point.type === 'Champion' && 'High value and high readiness. Execute immediately.'}
            {point.type === 'Strategic' && 'High value but lower readiness. Worth the investment with planning.'}
            {point.type === 'Quick Win' && 'Lower value but high readiness. Fast time-to-value.'}
            {point.type === 'Foundation' && 'Building blocks for future AI maturity. Invest strategically.'}
          </p>
        </div>

        {/* Key metrics */}
        {point.annualValue != null && point.annualValue > 0 && (
          <div className="mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Annual Value</p>
            <p className="text-2xl font-bold text-white">{format.currencyAuto(point.annualValue)}</p>
          </div>
        )}

        {/* Score bars */}
        <div className="mb-6">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Scoring Breakdown</p>
          {scoreBar('Value Score', Math.round(point.y * 10) / 10, 10, '#059669')}
          {scoreBar('Readiness', Math.round(point.x * 10) / 10, 10, '#0339AF')}
          {point.priorityScore != null && point.priorityScore > 0 && scoreBar('Priority Score', Math.round(point.priorityScore * 10) / 10, 10, '#4C73E9')}
          {point.timeToValue != null && scoreBar('Time to Value', point.timeToValue, 24, '#0D9488')}
        </div>

        {/* Readiness Components */}
        {(point.organizationalCapacity || point.dataAvailabilityQuality || point.technicalInfrastructure || point.governance) && (
          <div className="mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Readiness Components</p>
            {point.organizationalCapacity != null && scoreBar('Organizational Capacity', point.organizationalCapacity, 10, '#38BDF8')}
            {point.dataAvailabilityQuality != null && scoreBar('Data Availability & Quality', point.dataAvailabilityQuality, 10, '#F59E0B')}
            {point.technicalInfrastructure != null && scoreBar('Technical Infrastructure', point.technicalInfrastructure, 10, '#A78BFA')}
            {point.governance != null && scoreBar('Governance', point.governance, 10, '#10B981')}
          </div>
        )}

        {/* Tokens */}
        {point.monthlyTokens != null && point.monthlyTokens > 0 && (
          <div className="mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Monthly Tokens</p>
            <p className="text-sm font-mono text-slate-300">{format.tokensPerMonth(point.monthlyTokens)}</p>
          </div>
        )}

        {/* Description */}
        {point.description && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Description</p>
            <p className="text-sm text-slate-400 leading-relaxed">{point.description}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const PriorityMatrix = ({ data, vrm }: PriorityMatrixProps) => {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [selectedPoint, setSelectedPoint] = useState<MatrixDataPoint | null>(null);

  return (
    <section className="py-16 md:py-28 bg-[#0F172A] text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')" }}></div>

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-12">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-4 text-white">{data.title}</h2>
            <p className="text-slate-400 max-w-xl whitespace-pre-line text-sm md:text-base">
              {sanitizeForProse(data.description)}
            </p>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 mt-4 md:mt-0 bg-white/5 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'chart'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ScatterIcon className="w-3.5 h-3.5" />
              Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Scorecard
            </button>
          </div>
        </div>

        {/* VRM v2.0/v2.1 — Methodology header */}
        {vrm && (
          <div
            className="mb-3 md:mb-4 px-3 md:px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm text-[11px] md:text-xs text-slate-300"
            data-testid="text-vrm-methodology"
          >
            <span className="font-semibold text-slate-100">Value-Readiness Matrix v{vrm.schemaVersion}</span>
            <span className="mx-2 text-slate-500">·</span>
            <span>Sector preset: <span className="font-medium text-slate-100">{vrm.sectorPresetLabel}</span></span>
            <span className="mx-2 text-slate-500">·</span>
            <span>
              Weights — Org {Math.round(vrm.weights.orgCapacity * 100)}% /
              Data {Math.round(vrm.weights.dataReadiness * 100)}% /
              Gov {Math.round(vrm.weights.governance * 100)}% /
              Tech {Math.round(vrm.weights.techInfrastructure * 100)}%
            </span>
            <span className="mx-2 text-slate-500">·</span>
            <span className="text-slate-400">
              {vrm.quadrantThresholds.valueFloorBand
                ? `Champion ≥ ${vrm.quadrantThresholds.championMin}, Hard floor V<${vrm.quadrantThresholds.valueFloorBand.minNormalizedScore ?? 4.0} & abs<$${(((vrm.quadrantThresholds.valueFloorBand.minAbsoluteAnnualValue ?? 500_000)/1000)).toFixed(0)}K, TTP ≤ ${vrm.quadrantThresholds.maxTimeToPilotWeeks ?? 16} wks`
                : `Champion ≥ ${vrm.quadrantThresholds.championMin}, Value floor ${vrm.quadrantThresholds.valueFloor}, TTP ≤ ${vrm.quadrantThresholds.maxTimeToPilotWeeks} wks`}
            </span>
            {vrm.valueNormalization && (
              <>
                <span className="mx-2 text-slate-500">·</span>
                <span className="text-slate-400">Value norm: {vrm.valueNormalization}</span>
              </>
            )}
          </div>
        )}

        {/* VRM v2.1 — Methodology Integrity Panel (renders only when diagnostic exists) */}
        {vrm?.diagnostic && (
          <MethodologyIntegrityPanel
            diagnostic={vrm.diagnostic}
            schemaVersion={vrm.schemaVersion}
          />
        )}

        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <div className="min-w-[500px] md:min-w-0 w-full bg-white/5 rounded-2xl p-3 md:p-6 border border-white/10 backdrop-blur-sm">
            {viewMode === 'chart' ? (
              <QuadrantBubbleChart
                data={data.data}
                onBubbleClick={(point) => setSelectedPoint(point)}
                vrmConfig={vrm ? {
                  valueFloorBand: vrm.quadrantThresholds.valueFloorBand,
                  championMin: vrm.quadrantThresholds.championMin,
                  quickStrategicMin: vrm.quadrantThresholds.quickStrategicMin,
                } : undefined}
              />
            ) : (
              <MatrixScorecard
                data={data.data}
                onRowClick={(point) => setSelectedPoint(point)}
              />
            )}
          </div>
        </div>

        {/* Quadrant labels below chart */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 md:mt-6">
          <div className="bg-[#0339AF]/10 border border-[#0339AF]/20 rounded-lg p-3 text-center">
            <p className="text-sm font-bold text-[#4C73E9]">Strategic Bets</p>
            <p className="text-xs text-slate-400">High Value + Low Readiness</p>
          </div>
          <div className="bg-[#059669]/10 border border-[#059669]/20 rounded-lg p-3 text-center">
            <p className="text-sm font-bold text-[#059669]">Champions</p>
            <p className="text-xs text-slate-400">High Value + High Readiness</p>
          </div>
          <div className="bg-[#94A3B8]/10 border border-[#94A3B8]/20 rounded-lg p-3 text-center">
            <p className="text-sm font-bold text-[#94A3B8]">Foundation</p>
            <p className="text-xs text-slate-400">Low Value + Low Readiness</p>
          </div>
          <div className="bg-[#0D9488]/10 border border-[#0D9488]/20 rounded-lg p-3 text-center">
            <p className="text-sm font-bold text-[#0D9488]">Quick Wins</p>
            <p className="text-xs text-slate-400">Low Value + High Readiness</p>
          </div>
        </div>
      </div>

      {/* Detail drawer */}
      <AnimatePresence>
        {selectedPoint && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[55]"
              onClick={() => setSelectedPoint(null)}
            />
            <UseCaseDetailDrawer
              point={selectedPoint}
              onClose={() => setSelectedPoint(null)}
            />
          </>
        )}
      </AnimatePresence>
    </section>
  );
};

interface UseCaseCarouselProps {
  data: DashboardData['useCases'];
  clientName: string;
}

const UseCaseCarousel = ({ data, clientName }: UseCaseCarouselProps) => {
  return (
    <section className="py-16 md:py-28 bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-12 gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A]">{data.title}</h2>
            <p className="text-gray-600 mt-2 text-sm md:text-base">{sanitizeForProse(data.description.replace('Synovus', clientName))}</p>
          </div>
          <div className="hidden sm:flex gap-2">
            <button className="p-2 rounded-full border border-gray-300 hover:bg-white transition-colors"><ChevronRight className="rotate-180 w-5 h-5 text-gray-600" /></button>
            <button className="p-2 rounded-full border border-gray-300 hover:bg-white transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 md:gap-6 sm:overflow-x-auto pb-4 md:pb-8 sm:snap-x">
          {data.items.map((uc) => (
            <div key={uc.id} className="w-full sm:min-w-[300px] md:min-w-[350px] lg:min-w-[400px] sm:w-auto bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col snap-center hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-3 md:mb-4">
                <span className="bg-blue-50 text-[#0339AF] text-xs font-bold px-2 py-1 rounded uppercase tracking-wide">{uc.id}</span>
                <span className={`text-xs px-2 py-1 rounded-full border ${uc.complexity === 'Critical' ? 'border-red-200 text-red-600 bg-red-50' : uc.complexity === 'High' ? 'border-amber-200 text-amber-600 bg-amber-50' : 'border-slate-200 text-slate-500'}`}>
                  {uc.complexity}
                </span>
              </div>

              <h3 className="text-lg md:text-xl font-bold text-[#0F172A] mb-2">{uc.title}</h3>
              <p className="text-gray-600 text-sm mb-4 md:mb-6 flex-grow">{uc.impact}</p>

              <div className="bg-slate-50 rounded-lg p-3 md:p-4 mb-4 md:mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Projected Value</span>
                  <span className="text-base md:text-lg font-bold text-[#0339AF]">{uc.value}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Est. Tokens</span>
                  <span className="text-xs md:text-sm font-mono text-gray-700">{uc.tokens}</span>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
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

interface FrictionPointsProps {
  data: DashboardData['frictionByTheme'];
}

const FrictionPoints = ({ data }: FrictionPointsProps) => {
  if (!data || Object.keys(data).length === 0) return null;

  const themeColors: Record<string, { bg: string; text: string; border: string }> = {
    'Organizational': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    'Technical': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'Operational': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    'Data': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    'Process': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    'Change': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
    'Strategic': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    'Other': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  };

  const getThemeColors = (theme: string) => {
    return themeColors[theme] || themeColors['Other'];
  };

  return (
    <section className="py-16 md:py-28 bg-white">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6">
        <div className="mb-6 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-2">Implementation Friction Points</h2>
          <p className="text-gray-600 text-sm md:text-base max-w-2xl">
            Key challenges and constraints organized by strategic theme
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {Object.entries(data).map((entry, idx) => {
            const [theme, points] = entry;
            const colors = getThemeColors(theme);

            return (
              <motion.div
                key={theme}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                viewport={{ once: true }}
                className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-5 md:p-6`}
              >
                <h3 className={`text-lg font-bold ${colors.text} mb-4 flex items-center gap-2`}>
                  <div className={`w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`}></div>
                  {theme}
                </h3>

                <ul className="space-y-2 md:space-y-3">
                  {Array.isArray(points) && points.map((point, pidx) => (
                    <li key={pidx} className="flex items-start gap-2 text-gray-700 text-sm md:text-base">
                      <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${colors.text.replace('text-', 'bg-')}`}></span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

interface FinancialSensitivityAnalysisProps {
  data: DashboardData['scenarioComparison'];
}

const FinancialSensitivityAnalysis = ({ data }: FinancialSensitivityAnalysisProps) => {
  if (!data) return null;

  const scenarios = [
    {
      key: 'conservative',
      label: 'Conservative',
      description: 'Cautious estimate accounting for organizational friction and extended timelines.',
      adoption: '70% of identified use cases',
      timeline: '18-month ramp with extended learning curve',
      realization: '75% of projected baseline value',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-300',
      textColor: 'text-slate-700',
      pillColor: 'bg-slate-600',
      accentColor: '#64748B',
    },
    {
      key: 'moderate',
      label: 'Base Case',
      description: 'Expected outcome based on standard implementation practices.',
      adoption: '85% of identified use cases',
      timeline: '12-month ramp with standard change management',
      realization: '100% of projected baseline value',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      textColor: 'text-blue-700',
      pillColor: 'bg-[#0339AF]',
      accentColor: '#0339AF',
      isHighlight: true,
    },
    {
      key: 'aggressive',
      label: 'Optimistic',
      description: 'Best-case with strong leadership backing and accelerated adoption.',
      adoption: '95%+ of identified use cases',
      timeline: '9-month ramp with strong exec sponsorship',
      realization: '125% of baseline with network effects',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-300',
      textColor: 'text-emerald-700',
      pillColor: 'bg-emerald-600',
      accentColor: '#059669',
    },
  ];

  return (
    <section className="py-16 md:py-28 bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6">
        <div className="mb-6 md:mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A] mb-2">Financial Sensitivity Analysis</h2>
          <p className="text-gray-600 text-sm md:text-base max-w-2xl">
            This analysis models three adoption scenarios to provide a range of expected outcomes, reflecting different assumptions about organizational readiness and benefit realization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {scenarios.map((scenario, idx) => {
            const scenarioData = data[scenario.key as keyof typeof data];
            if (!scenarioData) return null;

            return (
              <motion.div
                key={scenario.key}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                viewport={{ once: true }}
                className={`rounded-2xl border-2 p-6 md:p-8 ${scenario.bgColor} ${scenario.borderColor} ${scenario.isHighlight ? 'ring-2 ring-offset-2 ring-blue-400 shadow-lg' : 'shadow-sm'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className={`inline-block ${scenario.pillColor} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                    {scenario.label}
                  </span>
                  {scenario.isHighlight && (
                    <span className="text-xs font-semibold text-[#0339AF] uppercase tracking-wide">
                      Recommended
                    </span>
                  )}
                </div>

                <p className="text-gray-600 text-xs md:text-sm mb-4">
                  {scenario.description}
                </p>

                {/* Scenario definitions */}
                <div className="space-y-2 mb-6 md:mb-8">
                  <div className="flex gap-2 text-xs">
                    <span className="font-semibold text-gray-500 min-w-[70px]">Adoption:</span>
                    <span className="text-gray-700">{scenario.adoption}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="font-semibold text-gray-500 min-w-[70px]">Timeline:</span>
                    <span className="text-gray-700">{scenario.timeline}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="font-semibold text-gray-500 min-w-[70px]">Realization:</span>
                    <span className="text-gray-700">{scenario.realization}</span>
                  </div>
                </div>

                <div className="h-px bg-gray-200 mb-6"></div>

                <div className="space-y-4 md:space-y-6">
                  {/* Annual Benefit */}
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold tracking-wide mb-2">
                      Annual Benefit
                    </p>
                    <p className={`text-2xl md:text-3xl font-bold ${scenario.textColor}`}>
                      {scenarioData.annualBenefit}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Year 1 projected value
                    </p>
                  </div>

                  {/* 5-Year NPV */}
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold tracking-wide mb-2">
                      5-Year NPV
                    </p>
                    <p className={`text-2xl md:text-3xl font-bold ${scenario.textColor}`}>
                      {scenarioData.npv}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Net present value at 10% discount
                    </p>
                  </div>

                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

interface CTASectionProps {
  totalValue: string;
  valueSuffix: string;
  onViewHTMLReport?: () => void;
  onViewEditorialReport?: () => void;
  onDownloadWorkshopPDF?: () => void;
}

const CTASection = ({ totalValue, valueSuffix, onViewHTMLReport, onViewEditorialReport, onDownloadWorkshopPDF }: CTASectionProps) => {
  return (
    <section className="py-16 md:py-32 bg-[#0339AF] text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 text-center relative z-10">
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-8 tracking-tight text-white">Ready to activate the Flywheel?</h2>
        <p className="text-blue-100 text-base md:text-lg lg:text-xl mb-8 md:mb-12 max-w-2xl mx-auto">
          The ${totalValue}{valueSuffix} opportunity is real. The next step is a 3-Day Use Case Workshop to transform this assessment into pilot-ready roadmaps.
        </p>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 md:gap-4 mb-4">
          <button
            onClick={onViewHTMLReport}
            className="w-full sm:w-auto bg-white text-[#0339AF] px-6 md:px-8 py-3 md:py-4 rounded-full font-bold text-base md:text-lg hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-2 min-h-[48px]"
            data-testid="button-html-report-cta"
          >
            <FileText className="w-5 h-5" />
            Boardroom Report
          </button>
          <button
            onClick={onViewEditorialReport}
            className="w-full sm:w-auto bg-white/10 border border-white/40 text-white px-6 md:px-8 py-3 md:py-4 rounded-full font-bold text-base md:text-lg hover:bg-white/20 hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center gap-2 min-h-[48px]"
            data-testid="button-editorial-report-cta"
          >
            <FileText className="w-5 h-5" />
            Editorial Report
          </button>
        </div>
        <div className="flex justify-center mb-8 md:mb-12">
          <button
            onClick={onDownloadWorkshopPDF}
            className="w-full sm:w-auto px-6 md:px-8 py-3 md:py-4 rounded-full font-semibold text-white border border-white/30 hover:bg-white/10 transition-all flex items-center justify-center gap-2 min-h-[48px]"
            data-testid="button-workshop-details"
          >
            <Download className="w-5 h-5" />
            Workshop Details
          </button>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4 md:gap-8 text-blue-200 text-sm">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Executive Alignment
          </div>
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 90-Day Pilot Cycle
          </div>
          <div className="flex items-center justify-center gap-2">
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
  onViewEditorialReport?: () => void;
  isSharedView?: boolean;
}

export default function Dashboard({ data = DEFAULT_DATA, onShareUrl, onDownloadWorkshopPDF, onViewHTMLReport, onViewEditorialReport, isSharedView }: DashboardProps) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-200">
      <StickyHeader clientName={data.clientName} onShareUrl={onShareUrl} onViewHTMLReport={onViewHTMLReport} onViewEditorialReport={onViewEditorialReport} isSharedView={isSharedView} />
      <HeroSection data={data.hero} clientName={data.clientName} />
      <ExecutiveSummary data={data.executiveSummary} />
      {data.scenarioComparison && <FinancialSensitivityAnalysis data={data.scenarioComparison} />}
      <section className="px-4 md:px-6 max-w-[1600px] mx-auto w-full">
        <HowWeScoreReadiness compact />
      </section>
      <PriorityMatrix data={data.priorityMatrix} vrm={data.vrm} />
      {data.useCaseDetails && data.useCaseDetails.length > 0 ? (
        <section className="py-16 md:py-28 bg-slate-50">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6">
            <div className="mb-6 md:mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-[#0F172A]">{data.useCases.title}</h2>
              <p className="text-gray-600 mt-2 text-sm md:text-base">{sanitizeForProse(data.useCases.description.replace('Synovus', data.clientName))}</p>
            </div>
            <UseCaseCards data={data.useCaseDetails} />
          </div>
        </section>
      ) : (
        <UseCaseCarousel data={data.useCases} clientName={data.clientName} />
      )}
      {data.frictionByTheme && <FrictionPoints data={data.frictionByTheme} />}
      <MethodologySection />
      <CTASection
        totalValue={data.hero.totalValue}
        valueSuffix={data.hero.valueSuffix}
        onViewHTMLReport={onViewHTMLReport}
        onViewEditorialReport={onViewEditorialReport}
        onDownloadWorkshopPDF={onDownloadWorkshopPDF}
      />

      <footer className="bg-slate-900 text-slate-500 py-8 md:py-12 border-t border-slate-800">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 text-center md:text-left">
            <img src="https://www.blueally.com/wp-content/uploads/2023/11/header-logo.png" alt="BlueAlly" className="h-6 w-auto" />
            <span className="text-xs md:text-sm">&copy; {new Date().getFullYear()} BlueAlly. Confidential &amp; Proprietary.</span>
          </div>
          <div className="flex gap-4 md:gap-6">
            <a href="#" className="hover:text-white transition-colors text-sm">Privacy</a>
            <a href="#" className="hover:text-white transition-colors text-sm">Terms</a>
            <a href="#" className="hover:text-white transition-colors text-sm">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export type { DashboardData, KPI, MatrixDataPoint, UseCase, ValueInsight };
