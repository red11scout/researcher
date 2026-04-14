import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { pdfConfig } from './config';

const { colors, fonts, spacing, page } = pdfConfig;

const styles = StyleSheet.create({
  page: {
    paddingTop: page.margins.top,
    paddingBottom: page.margins.bottom,
    paddingLeft: page.margins.left,
    paddingRight: page.margins.right,
    fontFamily: fonts.family,
    fontSize: fonts.sizes.body,
    color: colors.textSecondary,
    backgroundColor: colors.white,
  },
  
  coverPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  coverTitle: {
    fontSize: fonts.sizes.displayXl,
    fontWeight: fonts.weights.bold,
    color: colors.brandNavy,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: fonts.sizes.h2,
    color: colors.textTertiary,
    marginBottom: spacing.xxl,
    textAlign: 'center',
  },
  coverCompany: {
    fontSize: fonts.sizes.h1,
    fontWeight: fonts.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  coverMeta: {
    fontSize: fonts.sizes.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  coverFooter: {
    position: 'absolute',
    bottom: page.margins.bottom,
    left: 0,
    right: 0,
    textAlign: 'center',
  },

  header: {
    position: 'absolute',
    top: 24,
    left: page.margins.left,
    right: page.margins.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerText: {
    fontSize: fonts.sizes.caption,
    color: colors.textMuted,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: page.margins.left,
    right: page.margins.right,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  footerText: {
    fontSize: fonts.sizes.tiny,
    color: colors.textMuted,
  },
  pageNumber: {
    fontSize: fonts.sizes.tiny,
    color: colors.textMuted,
  },

  section: {
    marginBottom: spacing.section,
  },
  sectionTitle: {
    fontSize: fonts.sizes.h1,
    fontWeight: fonts.weights.bold,
    color: colors.brandNavy,
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    fontSize: fonts.sizes.body,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  
  h2: {
    fontSize: fonts.sizes.h2,
    fontWeight: fonts.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  h3: {
    fontSize: fonts.sizes.h3,
    fontWeight: fonts.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  paragraph: {
    fontSize: fonts.sizes.body,
    lineHeight: fonts.lineHeights.relaxed,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  
  table: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tableRowAlt: {
    backgroundColor: colors.tableRowAlt,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.tableHeader,
    borderBottomWidth: 2,
    borderBottomColor: colors.borderDefault,
  },
  tableCell: {
    padding: spacing.sm,
    fontSize: fonts.sizes.bodySm,
  },
  tableCellHeader: {
    padding: spacing.sm,
    fontSize: fonts.sizes.bodySm,
    fontWeight: fonts.weights.semibold,
    color: colors.textPrimary,
  },
  tableCellNumber: {
    textAlign: 'right',
  },

  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: spacing.lg,
  },
  metricCard: {
    width: '48%',
    marginRight: '2%',
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgLight,
    borderRadius: 4,
  },
  metricLabel: {
    fontSize: fonts.sizes.caption,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: fonts.sizes.h2,
    fontWeight: fonts.weights.bold,
    color: colors.brandNavy,
  },

  summaryBox: {
    backgroundColor: colors.bgLight,
    padding: spacing.lg,
    borderRadius: 4,
    marginVertical: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.brandNavy,
  },
  
  bulletList: {
    marginLeft: spacing.md,
    marginBottom: spacing.md,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  bullet: {
    width: 16,
    fontSize: fonts.sizes.body,
    color: colors.brandBlue,
  },
  bulletText: {
    flex: 1,
    fontSize: fonts.sizes.body,
    color: colors.textSecondary,
    lineHeight: fonts.lineHeights.normal,
  },
});

function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (value >= 1_000_000_000) {
      const billions = Math.round(value / 1_000_000_000 * 10) / 10;
      return billions === Math.floor(billions) ? `$${Math.floor(billions)}B` : `$${billions.toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      const millions = Math.round(value / 1_000_000 * 10) / 10;
      return millions === Math.floor(millions) ? `$${Math.floor(millions)}M` : `$${millions.toFixed(1)}M`;
    }
    if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export interface ReportData {
  company: {
    name: string;
    industry?: string;
    revenue?: number;
  };
  generatedAt: Date;
  sections: {
    overview?: any;
    strategy?: any;
    kpis?: any;
    friction?: any;
    useCases?: any[];
    benefits?: any;
    tokens?: any;
    priority?: any[];
  };
  totals: {
    annualImpact: number;
    avgRoi: number;
    useCaseCount: number;
    criticalCount: number;
  };
}

function CoverPage({ data }: { data: ReportData }) {
  return (
    <Page size="A4" style={[styles.page, styles.coverPage]}>
      <Text style={styles.coverTitle}>AI Opportunity</Text>
      <Text style={styles.coverTitle}>Assessment</Text>
      <Text style={styles.coverSubtitle}>Strategic Analysis & Implementation Roadmap</Text>
      <View style={{ marginTop: 40 }}>
        <Text style={styles.coverCompany}>{data.company.name}</Text>
        {data.company.industry && (
          <Text style={styles.coverMeta}>{data.company.industry}</Text>
        )}
        <Text style={styles.coverMeta}>
          {new Date(data.generatedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>
      <View style={styles.coverFooter}>
        <Text style={styles.coverMeta}>Prepared by BlueAlly AI Consulting</Text>
        <Text style={[styles.coverMeta, { marginTop: 4, fontSize: 9, color: colors.textMuted }]}>
          Confidential
        </Text>
      </View>
    </Page>
  );
}

function ContentPage({ 
  children, 
  companyName,
}: { 
  children: React.ReactNode;
  companyName: string;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        <Text style={styles.headerText}>BlueAlly AI Consulting</Text>
        <Text style={styles.headerText}>Confidential</Text>
      </View>
      
      <View style={{ flex: 1, paddingTop: 20 }}>
        {children}
      </View>
      
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>
          {companyName} | AI Opportunity Assessment
        </Text>
        <Text 
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </Page>
  );
}

function ExecutiveSummary({ data }: { data: ReportData }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Executive Summary</Text>
      <Text style={styles.sectionSubtitle}>
        Key findings from AI opportunity analysis
      </Text>
      
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Annual Impact</Text>
          <Text style={styles.metricValue}>
            {formatCurrency(data.totals.annualImpact, true)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Average ROI</Text>
          <Text style={styles.metricValue}>
            {formatPercent(data.totals.avgRoi)}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Use Cases Identified</Text>
          <Text style={styles.metricValue}>
            {data.totals.useCaseCount}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Critical Priority</Text>
          <Text style={styles.metricValue}>
            {data.totals.criticalCount}
          </Text>
        </View>
      </View>
      
      <View style={styles.summaryBox}>
        <Text style={styles.h3}>Strategic Recommendation</Text>
        <Text style={styles.paragraph}>
          Based on comprehensive analysis of {data.company.name}'s operations, 
          we have identified {data.totals.useCaseCount} high-impact AI opportunities 
          with combined annual value potential of {formatCurrency(data.totals.annualImpact, true)}.
          {data.totals.criticalCount > 0 && ` ${data.totals.criticalCount} use cases 
          are marked Critical priority for immediate implementation.`}
        </Text>
      </View>
    </View>
  );
}

const SINGLE_AGENT_PATTERNS = [
  'Reflection', 'Tool Use', 'Planning', 'ReAct Loop',
  'Prompt Chaining', 'Semantic Router', 'Constitutional Guardrail',
];

const cardStyles = StyleSheet.create({
  themeDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  themeLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#001278',
  },
  themeLabel: {
    fontSize: fonts.sizes.caption,
    fontWeight: fonts.weights.bold,
    color: '#001278',
    paddingHorizontal: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
    gap: 4,
  },
  ucId: {
    fontSize: fonts.sizes.caption,
    fontFamily: 'Courier',
    color: colors.textTertiary,
    marginRight: spacing.sm,
  },
  ucName: {
    fontSize: fonts.sizes.bodySm,
    fontWeight: fonts.weights.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  badgeBase: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 4,
  },
  badgeNavy: {
    backgroundColor: '#001278',
  },
  badgeBlue: {
    backgroundColor: '#02a2fd',
  },
  badgeFunction: {
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  badgeText: {
    fontSize: fonts.sizes.tiny,
    color: colors.white,
    fontWeight: fonts.weights.semibold,
  },
  badgeFunctionText: {
    fontSize: fonts.sizes.tiny,
    color: colors.textSecondary,
    fontWeight: fonts.weights.semibold,
  },
  description: {
    fontSize: fonts.sizes.bodySm,
    color: colors.textSecondary,
    lineHeight: fonts.lineHeights.normal,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontSize: fonts.sizes.caption,
    fontWeight: fonts.weights.semibold,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: fonts.sizes.bodySm,
    color: colors.textSecondary,
    lineHeight: fonts.lineHeights.normal,
  },
  fieldRow: {
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: spacing.sm,
  },
  chip: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  chipText: {
    fontSize: fonts.sizes.tiny,
    color: '#065f46',
    fontWeight: fonts.weights.semibold,
  },
  rationaleBox: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 3,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.bgLight,
  },
  hitlBox: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 3,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: '#eff6ff',
  },
  outcomeBullet: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: spacing.xs,
  },
  outcomeDot: {
    width: 12,
    fontSize: fonts.sizes.bodySm,
    color: '#36bf78',
  },
  outcomeText: {
    flex: 1,
    fontSize: fonts.sizes.bodySm,
    color: colors.textSecondary,
    lineHeight: fonts.lineHeights.normal,
  },
});

function UseCaseCards({ useCases }: { useCases: any[] }) {
  if (!useCases || useCases.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Use Cases</Text>
        <Text style={styles.paragraph}>No use cases available.</Text>
      </View>
    );
  }

  const limited = useCases.slice(0, 12);

  // Group by Strategic Theme if present
  const hasThemes = limited.some(
    (uc) => uc['Strategic Theme'] || uc.strategicTheme,
  );

  type GroupEntry = { theme: string; items: any[] };
  let groups: GroupEntry[];

  if (hasThemes) {
    const themeMap = new Map<string, any[]>();
    for (const uc of limited) {
      const theme =
        uc['Strategic Theme'] || uc.strategicTheme || 'Uncategorized';
      if (!themeMap.has(theme)) themeMap.set(theme, []);
      themeMap.get(theme)!.push(uc);
    }
    groups = Array.from(themeMap.entries()).map(([theme, items]) => ({
      theme,
      items,
    }));
  } else {
    groups = [{ theme: '', items: limited }];
  }

  const isSingleAgent = (pattern: string | undefined) => {
    if (!pattern) return true;
    return SINGLE_AGENT_PATTERNS.some(
      (p) => pattern.toLowerCase().includes(p.toLowerCase()),
    );
  };

  const parseList = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'string') {
      return val
        .split(/[,;]/)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>AI Use Cases</Text>
      <Text style={styles.sectionSubtitle}>
        Prioritized opportunities with agentic implementation patterns
      </Text>

      {groups.map((group, gi) => (
        <View key={gi}>
          {group.theme !== '' && (
            <View style={cardStyles.themeDivider}>
              <View style={cardStyles.themeLine} />
              <Text style={cardStyles.themeLabel}>{group.theme}</Text>
              <View style={cardStyles.themeLine} />
            </View>
          )}

          {group.items.map((uc: any, idx: number) => {
            const ucId =
              uc['ID'] || uc.id || uc.ucId || `UC-${gi + 1}.${idx + 1}`;
            const ucName =
              uc['Use Case Name'] ||
              uc.name ||
              uc.useCase ||
              `Use Case ${idx + 1}`;
            const description =
              uc['Description'] || uc.description || '';
            const friction =
              uc['Target Friction'] || uc.targetFriction || '';
            const primitivesRaw =
              uc['AI Primitives'] || uc.aiPrimitives || '';
            const primitives = parseList(primitivesRaw);
            const pattern =
              uc['Primary Pattern'] || uc['Agentic Pattern'] || uc.agenticPattern || '';
            const altPattern =
              uc['Alternative Pattern'] || '';
            const epochFlags =
              uc['EPOCH Flags'] || '';
            const rationale =
              uc['Pattern Rationale'] || uc.patternRationale || '';
            const hitl =
              uc['Human-in-the-Loop Checkpoint'] ||
              uc.humanInTheLoopCheckpoint ||
              uc.hitlCheckpoint ||
              '';
            const func = uc['Function'] || uc.function || uc.department || '';
            const outcomesRaw =
              uc['Desired Outcomes'] || uc.desiredOutcomes || '';
            const outcomes = parseList(outcomesRaw);
            const dataTypesRaw =
              uc['Data Types'] || uc.dataTypes || '';
            const dataTypes = parseList(dataTypesRaw);
            const integrationsRaw =
              uc['Integrations'] || uc.integrations || '';
            const integrations = parseList(integrationsRaw);
            const singleAgent = isSingleAgent(pattern);

            return (
              <View key={idx} style={cardStyles.card} wrap={false}>
                {/* Header row: ID, Name, Pattern badge, Function badge */}
                <View style={cardStyles.cardHeaderRow}>
                  <Text style={cardStyles.ucId}>{ucId}</Text>
                  <Text style={cardStyles.ucName}>{ucName}</Text>
                  {pattern !== '' && (
                    <View
                      style={[
                        cardStyles.badgeBase,
                        singleAgent
                          ? cardStyles.badgeNavy
                          : cardStyles.badgeBlue,
                      ]}
                    >
                      <Text style={cardStyles.badgeText}>{pattern}</Text>
                    </View>
                  )}
                  {func !== '' && (
                    <View
                      style={[cardStyles.badgeBase, cardStyles.badgeFunction]}
                    >
                      <Text style={cardStyles.badgeFunctionText}>{func}</Text>
                    </View>
                  )}
                </View>

                {/* Description */}
                {description !== '' && (
                  <Text style={cardStyles.description}>{description}</Text>
                )}

                {/* Target Friction */}
                {friction !== '' && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>Target Friction</Text>
                    <Text style={cardStyles.fieldValue}>{friction}</Text>
                  </View>
                )}

                {/* AI Primitives chips */}
                {primitives.length > 0 && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>AI Primitives</Text>
                    <View style={cardStyles.chipsRow}>
                      {primitives.map((p: string, pi: number) => (
                        <View key={pi} style={cardStyles.chip}>
                          <Text style={cardStyles.chipText}>{p}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Agentic Pattern Analysis */}
                {(pattern !== '' || altPattern !== '') && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>Agentic Pattern Analysis</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>PRIMARY</Text>
                        <View style={[cardStyles.badgeBase, singleAgent ? cardStyles.badgeNavy : cardStyles.badgeBlue]}>
                          <Text style={cardStyles.badgeText}>{pattern || 'Not assigned'}</Text>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 7, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>ALTERNATIVE</Text>
                        <View style={[cardStyles.badgeBase, altPattern ? (isSingleAgent(altPattern) ? cardStyles.badgeNavy : cardStyles.badgeBlue) : cardStyles.badgeFunction]}>
                          <Text style={altPattern ? cardStyles.badgeText : cardStyles.badgeFunctionText}>{altPattern || 'None'}</Text>
                        </View>
                      </View>
                    </View>
                    {rationale !== '' && (
                      <View style={[cardStyles.rationaleBox, { marginTop: 4 }]}>
                        <Text style={cardStyles.fieldValue}>{rationale}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* EPOCH Flags */}
                {epochFlags !== '' && (() => {
                  const epochLabelMap: Record<string, string> = { 'E': 'Empathy', 'P': 'Presence', 'O': 'Opinion', 'C': 'Creativity', 'H': 'Hope' };
                  const validKeys = new Set(['E', 'P', 'O', 'C', 'H']);
                  const parsedFlags = epochFlags.split(',').map(f => f.trim().charAt(0).toUpperCase()).filter(f => validKeys.has(f));
                  return parsedFlags.length > 0 ? (
                    <View style={[cardStyles.fieldRow, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }]}>
                      <Text style={{ fontSize: 7, fontWeight: 600, color: '#94a3b8' }}>E.P.O.C.H.:</Text>
                      {parsedFlags.map((key: string, fi: number) => (
                        <View key={fi} style={{ backgroundColor: '#f1f5f9', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 7, color: '#475569' }}>{epochLabelMap[key]}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null;
                })()}

                {/* HITL Checkpoint */}
                {hitl !== '' && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>
                      Human-in-the-Loop Checkpoint
                    </Text>
                    <View style={cardStyles.hitlBox}>
                      <Text style={cardStyles.fieldValue}>{hitl}</Text>
                    </View>
                  </View>
                )}

                {/* Desired Outcomes */}
                {outcomes.length > 0 && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>Desired Outcomes</Text>
                    {outcomes.map((o: string, oi: number) => (
                      <View key={oi} style={cardStyles.outcomeBullet}>
                        <Text style={cardStyles.outcomeDot}>&#8226;</Text>
                        <Text style={cardStyles.outcomeText}>{o}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Data Types */}
                {dataTypes.length > 0 && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>Data Types</Text>
                    <View style={cardStyles.chipsRow}>
                      {dataTypes.map((dt: string, di: number) => (
                        <View key={di} style={[cardStyles.chip, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                          <Text style={[cardStyles.chipText, { color: '#1d4ed8' }]}>{dt}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Integrations */}
                {integrations.length > 0 && (
                  <View style={cardStyles.fieldRow}>
                    <Text style={cardStyles.fieldLabel}>Integrations</Text>
                    <View style={cardStyles.chipsRow}>
                      {integrations.map((intg: string, ii: number) => (
                        <View key={ii} style={[cardStyles.chip, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
                          <Text style={[cardStyles.chipText, { color: '#475569' }]}>{intg}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function AssessmentPDF({ data }: { data: ReportData }) {
  return (
    <Document
      title={`AI Assessment - ${data.company.name}`}
      author="BlueAlly AI Consulting"
      subject="AI Opportunity Assessment"
      creator="BlueAlly Insight"
    >
      <CoverPage data={data} />
      
      <ContentPage companyName={data.company.name}>
        <ExecutiveSummary data={data} />
      </ContentPage>
      
      {data.sections.useCases && data.sections.useCases.length > 0 && (
        <ContentPage companyName={data.company.name}>
          <UseCaseCards useCases={data.sections.useCases} />
        </ContentPage>
      )}
    </Document>
  );
}
