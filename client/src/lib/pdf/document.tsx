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
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
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

function UseCasesTable({ useCases }: { useCases: any[] }) {
  const columnWidths = ['35%', '20%', '20%', '15%', '10%'];
  
  if (!useCases || useCases.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Use Cases</Text>
        <Text style={styles.paragraph}>No use cases available.</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>AI Use Cases</Text>
      <Text style={styles.sectionSubtitle}>
        Prioritized opportunities ranked by impact and feasibility
      </Text>
      
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableCellHeader, { width: columnWidths[0] }]}>Use Case</Text>
          <Text style={[styles.tableCellHeader, { width: columnWidths[1] }]}>Department</Text>
          <Text style={[styles.tableCellHeader, styles.tableCellNumber, { width: columnWidths[2] }]}>Annual Impact</Text>
          <Text style={[styles.tableCellHeader, styles.tableCellNumber, { width: columnWidths[3] }]}>ROI</Text>
          <Text style={[styles.tableCellHeader, { width: columnWidths[4] }]}>Priority</Text>
        </View>
        
        {useCases.slice(0, 10).map((uc, idx) => (
          <View 
            key={idx} 
            style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
          >
            <Text style={[styles.tableCell, { width: columnWidths[0] }]}>
              {uc.name || uc.useCase || `Use Case ${idx + 1}`}
            </Text>
            <Text style={[styles.tableCell, { width: columnWidths[1] }]}>
              {uc.department || uc.function || 'General'}
            </Text>
            <Text style={[styles.tableCell, styles.tableCellNumber, { width: columnWidths[2] }]}>
              {formatCurrency(uc.annualImpact || uc.annualValue || 0)}
            </Text>
            <Text style={[styles.tableCell, styles.tableCellNumber, { width: columnWidths[3] }]}>
              {formatPercent(uc.roi || 0)}
            </Text>
            <Text style={[styles.tableCell, { width: columnWidths[4] }]}>
              {uc.tier || uc.priority || 'Medium'}
            </Text>
          </View>
        ))}
      </View>
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
          <UseCasesTable useCases={data.sections.useCases} />
        </ContentPage>
      )}
    </Document>
  );
}
