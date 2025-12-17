import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Copy, Printer, ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { type Report } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { format, parseFormattedValue } from '@/lib/formatters';

const formatCurrency = (value: number | string): string => {
  if (typeof value === 'string') {
    if (value.startsWith('$')) return value;
    const num = parseFormattedValue(value);
    if (num === 0 && value !== '0' && value !== '$0') return value;
    return format.currencyAuto(num);
  }
  return format.currencyAuto(value);
};

const formatNumber = (value: number | string): string => {
  if (typeof value === 'string') {
    const num = parseFormattedValue(value);
    if (num === 0 && value !== '0') return value;
    return format.number(num, { compact: true });
  }
  return format.number(value, { compact: true });
};

export default function HTMLReportViewer() {
  const [, params] = useRoute("/reports/:id/html");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;
  const [copied, setCopied] = useState(false);

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: [`/api/reports/${id}`],
    enabled: !!id,
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({
        title: "Link Copied",
        description: "Shareable report link copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy Failed",
        description: "Unable to copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingCard}>
          <Loader2 style={{ width: 48, height: 48, color: '#001278', animation: 'spin 1s linear infinite' }} />
          <h2 style={{ marginTop: 16, color: '#001278', fontSize: 20, fontWeight: 600 }}>Loading Report...</h2>
          <p style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>Fetching your strategic assessment</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorCard}>
          <h2 style={{ color: '#dc2626', fontSize: 24, fontWeight: 600, marginBottom: 12 }}>Report Not Found</h2>
          <p style={{ color: '#64748b', marginBottom: 24 }}>The report you are looking for does not exist or has been removed.</p>
          <button
            onClick={() => setLocation("/")}
            style={styles.backButton}
            data-testid="button-return-home"
          >
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const analysis = report.analysisData as any;
  const companyName = report.companyName;

  return (
    <div style={styles.body}>
      <style>{printStyles}</style>
      
      {/* Floating Toolbar */}
      <div style={styles.toolbar} className="no-print">
        <button
          onClick={() => setLocation("/")}
          style={styles.toolbarButton}
          data-testid="button-back"
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
        </button>
        <button
          onClick={handleCopyLink}
          style={styles.toolbarButtonPrimary}
          data-testid="button-copy-link"
        >
          {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
          <span style={{ marginLeft: 8 }}>{copied ? 'Copied!' : 'Copy Link'}</span>
        </button>
        <button
          onClick={handlePrint}
          style={styles.toolbarButton}
          data-testid="button-print"
        >
          <Printer style={{ width: 16, height: 16 }} />
          <span style={{ marginLeft: 8 }}>Print</span>
        </button>
      </div>

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>BLUEALLY AI STRATEGIC ASSESSMENT</h1>
          <div style={styles.headerCompany} data-testid="text-company-name">{companyName}</div>
          <div style={styles.headerDate}>
            {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Executive Dashboard */}
        {analysis.executiveDashboard && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardHeaderTitle}>Executive Dashboard</h2>
            </div>
            <div style={styles.cardContent}>
              <div style={styles.executiveDashboard}>
                <div style={{ ...styles.metricBox, ...styles.metricBoxPrimary }}>
                  <div style={styles.metricLabel}>Total Annual AI Value Opportunity</div>
                  <div style={{ ...styles.metricValue, fontSize: 32 }}>
                    {formatCurrency(analysis.executiveDashboard.totalAnnualValue)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Revenue Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#16a34a' }}>
                    {formatCurrency(analysis.executiveDashboard.totalRevenueBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Cost Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#2563eb' }}>
                    {formatCurrency(analysis.executiveDashboard.totalCostBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Cash Flow Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#7c3aed' }}>
                    {formatCurrency(analysis.executiveDashboard.totalCashFlowBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Risk Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#ea580c' }}>
                    {formatCurrency(analysis.executiveDashboard.totalRiskBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Monthly Tokens</div>
                  <div style={styles.metricValue}>
                    {formatNumber(analysis.executiveDashboard.totalMonthlyTokens)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Value per 1M Tokens</div>
                  <div style={styles.metricValue}>
                    {formatCurrency(analysis.executiveDashboard.valuePerMillionTokens)}
                  </div>
                </div>
              </div>

              {/* Top Use Cases Table */}
              {analysis.executiveDashboard.topUseCases && analysis.executiveDashboard.topUseCases.length > 0 && (
                <>
                  <h3 style={styles.sectionSubtitle}>Top Priority Use Cases</h3>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Use Case</th>
                        <th style={styles.th}>Priority</th>
                        <th style={styles.th}>Tokens/Month</th>
                        <th style={styles.th}>Annual Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.executiveDashboard.topUseCases.map((uc: any, idx: number) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{uc.rank}</td>
                          <td style={styles.td}>{uc.useCase}</td>
                          <td style={styles.td}>{uc.priorityScore?.toFixed(0) || 'N/A'}</td>
                          <td style={styles.td}>{formatNumber(uc.monthlyTokens)}</td>
                          <td style={styles.td}>{formatCurrency(uc.annualValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        )}

        {/* Executive Summary */}
        {analysis.summary && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardHeaderTitle}>Executive Summary</h2>
            </div>
            <div style={styles.cardContent}>
              <div style={styles.summaryText}>{analysis.summary}</div>
            </div>
          </div>
        )}

        {/* Analysis Steps */}
        {analysis.steps?.map((step: any, stepIdx: number) => {
          const isBenefitsStep = step.step === 5;
          const columns = step.data && step.data.length > 0
            ? Object.keys(step.data[0]).filter(k => !k.includes('Formula')).slice(0, 6)
            : [];

          return (
            <div key={stepIdx} style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardHeaderTitle}>
                  <span style={styles.stepBadge}>{step.step}</span>
                  {step.title}
                </h2>
              </div>
              <div style={styles.cardContent}>
                {step.content && (
                  <p style={styles.stepContent}>{step.content}</p>
                )}

                {step.data && step.data.length > 0 && (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {columns.map((col, colIdx) => (
                          <th key={colIdx} style={styles.th}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {step.data.map((row: any, rowIdx: number) => (
                        <>
                          <tr key={rowIdx} style={styles.tr}>
                            {columns.map((col, colIdx) => (
                              <td key={colIdx} style={styles.td}>
                                {String(row[col] || '').substring(0, 60)}
                              </td>
                            ))}
                          </tr>
                          {isBenefitsStep && (
                            <tr key={`benefit-${rowIdx}`}>
                              <td colSpan={columns.length} style={{ padding: 0, background: '#f8fafc' }}>
                                <div style={styles.benefitGrid}>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitRevenue }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Grow Revenue</span>
                                      <span style={{ ...styles.benefitValue, background: '#a7f3d0', color: '#166534' }}>
                                        {row['Revenue Benefit ($)'] || '$0'}
                                      </span>
                                    </div>
                                    {row['Revenue Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Revenue Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No revenue impact</em>
                                    )}
                                  </div>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitCost }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Reduce Cost</span>
                                      <span style={{ ...styles.benefitValue, background: '#bfdbfe', color: '#1e40af' }}>
                                        {row['Cost Benefit ($)'] || '$0'}
                                      </span>
                                    </div>
                                    {row['Cost Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Cost Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No cost impact</em>
                                    )}
                                  </div>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitCashflow }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Cash Flow</span>
                                      <span style={{ ...styles.benefitValue, background: '#e9d5ff', color: '#7c3aed' }}>
                                        {row['Cash Flow Benefit ($)'] || '$0'}
                                      </span>
                                    </div>
                                    {row['Cash Flow Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Cash Flow Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No cash flow impact</em>
                                    )}
                                  </div>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitRisk }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Reduce Risk</span>
                                      <span style={{ ...styles.benefitValue, background: '#fed7aa', color: '#c2410c' }}>
                                        {row['Risk Benefit ($)'] || '$0'}
                                      </span>
                                    </div>
                                    {row['Risk Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Risk Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No risk impact</em>
                                    )}
                                  </div>
                                </div>
                                <div style={styles.totalSummary}>
                                  <div style={styles.totalHeaderRow}>
                                    <strong>Total Annual Value</strong>
                                    <span style={styles.totalValue}>{row['Total Annual Value ($)'] || '$0'}</span>
                                  </div>
                                  <div style={styles.totalBreakdown}>
                                    <span style={{ ...styles.breakdownChip, background: '#a7f3d0', color: '#166534' }}>
                                      {row['Revenue Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>+</span>
                                    <span style={{ ...styles.breakdownChip, background: '#bfdbfe', color: '#1e40af' }}>
                                      {row['Cost Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>+</span>
                                    <span style={{ ...styles.breakdownChip, background: '#e9d5ff', color: '#7c3aed' }}>
                                      {row['Cash Flow Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>+</span>
                                    <span style={{ ...styles.breakdownChip, background: '#fed7aa', color: '#c2410c' }}>
                                      {row['Risk Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>=</span>
                                    <span style={{ ...styles.breakdownChip, background: 'white', color: '#001278', fontWeight: 'bold' }}>
                                      {row['Total Annual Value ($)'] || '$0'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div style={styles.footer}>
          <p>Prepared by <strong>BlueAlly Insight</strong> | Enterprise AI Advisory</p>
          <p>www.blueally.com</p>
        </div>
      </div>
    </div>
  );
}

const printStyles = `
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    background: '#f8fafc',
    color: '#1e293b',
    lineHeight: 1.6,
    minHeight: '100vh',
  },
  container: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '40px 20px',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
  },
  loadingCard: {
    background: 'white',
    padding: 40,
    borderRadius: 12,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    textAlign: 'center' as const,
  },
  errorContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
  },
  errorCard: {
    background: 'white',
    padding: 40,
    borderRadius: 12,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    textAlign: 'center' as const,
    maxWidth: 400,
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: '#001278',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  toolbar: {
    position: 'fixed' as const,
    top: 20,
    right: 20,
    display: 'flex',
    gap: 8,
    zIndex: 1000,
    background: 'white',
    padding: 8,
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  toolbarButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#f1f5f9',
    color: '#1e293b',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'background 0.2s',
  },
  toolbarButtonPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  header: {
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    padding: 40,
    textAlign: 'center' as const,
    borderRadius: 12,
    marginBottom: 30,
  },
  headerTitle: {
    fontSize: 28,
    marginBottom: 10,
    fontWeight: 700,
    letterSpacing: 1,
  },
  headerCompany: {
    fontSize: 20,
    fontWeight: 500,
    marginBottom: 8,
  },
  headerDate: {
    opacity: 0.9,
    fontSize: 14,
  },
  card: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    marginBottom: 24,
    overflow: 'hidden',
  },
  cardHeader: {
    background: '#f1f5f9',
    padding: '16px 24px',
    borderBottom: '1px solid #e2e8f0',
  },
  cardHeaderTitle: {
    fontSize: 18,
    color: '#001278',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: 0,
    fontWeight: 600,
  },
  stepBadge: {
    background: '#001278',
    color: 'white',
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cardContent: {
    padding: 24,
  },
  executiveDashboard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  metricBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 16,
    textAlign: 'center' as const,
  },
  metricBoxPrimary: {
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    gridColumn: 'span 2',
    border: 'none',
  },
  metricLabel: {
    fontSize: 12,
    textTransform: 'uppercase' as const,
    opacity: 0.8,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  sectionSubtitle: {
    margin: '24px 0 16px',
    color: '#001278',
    fontSize: 16,
    fontWeight: 600,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
  },
  th: {
    background: '#001278',
    color: 'white',
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontWeight: 600,
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
  },
  tr: {
    transition: 'background 0.2s',
  },
  summaryText: {
    background: '#f8fafc',
    padding: 20,
    borderRadius: 8,
    borderLeft: '4px solid #001278',
    whiteSpace: 'pre-wrap' as const,
  },
  stepContent: {
    marginBottom: 16,
    color: '#64748b',
  },
  benefitGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    padding: 16,
  },
  benefitCard: {
    padding: 16,
    borderRadius: 8,
  },
  benefitRevenue: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
  },
  benefitCost: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
  },
  benefitCashflow: {
    background: '#faf5ff',
    border: '1px solid #e9d5ff',
  },
  benefitRisk: {
    background: '#fff7ed',
    border: '1px solid #fed7aa',
  },
  benefitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitLabel: {
    fontWeight: 600,
    fontSize: 14,
  },
  benefitValue: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: '4px 12px',
    borderRadius: 6,
  },
  formulaBox: {
    background: 'white',
    padding: 12,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all' as const,
  },
  totalSummary: {
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    padding: 20,
    borderRadius: 8,
    margin: '0 16px 16px',
  },
  totalHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: 'bold',
    background: 'white',
    color: '#001278',
    padding: '8px 16px',
    borderRadius: 8,
  },
  totalBreakdown: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    alignItems: 'center',
    background: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 6,
  },
  breakdownChip: {
    padding: '4px 10px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  operator: {
    color: 'rgba(255,255,255,0.7)',
  },
  footer: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#64748b',
    fontSize: 14,
  },
};
