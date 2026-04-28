export function generateProfessionalHTMLReport(
  reportData: any,
  companyName: string
): string {
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const {
    analysisData = {
      steps: [],
      executiveDashboard: {},
      summary: '',
      scenarioAnalysis: {},
      multiYearProjection: {},
      executiveSummary: {},
    },
  } = reportData;

  const {
    steps = [],
    executiveDashboard = {},
    summary = '',
    scenarioAnalysis = {},
    multiYearProjection = {},
    executiveSummary: executiveSummaryData = {},
  } = analysisData;

  const {
    totalRevenueBenefit = 0,
    totalCostBenefit = 0,
    totalCashFlowBenefit = 0,
    totalRiskBenefit = 0,
    totalAnnualValue = 0,
    topUseCases = [],
    valuePerMillionTokens = 0,
  } = executiveDashboard;

  // Unified color palette
  const colors = {
    primary: '#0339AF',
    accent: '#4C73E9',
    sky: '#00A3E0',
    navy: '#0F172A',
    success: '#059669',
    warning: '#D97706',
    error: '#DC2626',
    indigo: '#6366F1',
    slate: '#64748B',
    neutral50: '#F8FAFC',
    neutral100: '#F1F5F9',
    neutral200: '#E2E8F0',
    neutral300: '#CBD5E1',
    neutral400: '#94A3B8',
    neutral500: '#64748B',
    neutral600: '#475569',
    neutral700: '#334155',
    neutral800: '#1E293B',
    neutral900: '#0F172A',
    white: '#FFFFFF',
  };

  // Pillar colors for value drivers
  const pillarColors = {
    revenue: { text: '#059669', bg: '#F0FDF4', border: '#BBF7D0' },
    cost: { text: '#0066CC', bg: '#EFF6FF', border: '#BFDBFE' },
    cashflow: { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    risk: { text: '#6366F1', bg: '#EEF2FF', border: '#C7D2FE' },
  };

  // Intelligent currency formatter (handles pre-formatted $XM/$XK/$XB strings)
  const formatCurrency = (value: number | string): string => {
    let numValue: number;
    if (typeof value === 'number') {
      numValue = value;
    } else {
      const str = String(value).trim();
      const m = str.match(/^\$?([\d,.]+)\s*([KkMmBb])?/);
      if (!m) { numValue = 0; }
      else {
        const base = parseFloat(m[1].replace(/,/g, ''));
        const s = m[2]?.toUpperCase();
        numValue = isNaN(base) ? 0 : s === 'B' ? base * 1e9 : s === 'M' ? base * 1e6 : s === 'K' ? base * 1e3 : base;
      }
    }
    if (isNaN(numValue)) return '$0';

    if (numValue >= 1_000_000_000) {
      return `$${(numValue / 1_000_000_000).toFixed(1)}B`;
    }
    if (numValue >= 1_000_000) {
      return `$${(numValue / 1_000_000).toFixed(1)}M`;
    }
    if (numValue >= 1_000) {
      return `$${(numValue / 1_000).toFixed(1)}K`;
    }
    return `$${numValue.toFixed(0)}`;
  };

  // Format numbers with thousands separator
  const formatNumber = (value: any): string => {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  // Calculate % of total
  const pctOfTotal = (value: number): string => {
    if (!totalAnnualValue || totalAnnualValue === 0) return '0%';
    return `${Math.round((value / totalAnnualValue) * 100)}%`;
  };

  // Safe HTML escape
  const escapeHtml = (text: any): string => {
    if (!text) return '';
    const str = String(text);
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return str.replace(/[&<>"']/g, (char) => map[char]);
  };

  // Split long text into multiple <p> tags for readability
  const splitIntoParagraphs = (text: string): string => {
    if (!text) return '<p></p>';
    // First split on double-newlines
    let paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    // For any remaining long paragraphs (>300 chars), split on sentence boundaries
    const result: string[] = [];
    for (const para of paragraphs) {
      if (para.length > 300) {
        // Split on ". " followed by an uppercase letter (sentence boundary)
        const sentences = para.split(/(?<=\.\s)(?=[A-Z])/);
        let chunk = '';
        for (const sentence of sentences) {
          if (chunk.length + sentence.length > 350 && chunk.length > 0) {
            result.push(chunk.trim());
            chunk = sentence;
          } else {
            chunk += sentence;
          }
        }
        if (chunk.trim()) result.push(chunk.trim());
      } else {
        result.push(para.trim());
      }
    }
    return result.map(p => `<p class="body-text">${p}</p>`).join('\n          ');
  };

  // Get step data
  const getStepData = (stepIndex: number): any => {
    return steps[stepIndex] || {};
  };

  // Generate table of contents
  const generateTableOfContents = (): string => {
    const sections = [
      { id: 'executive-summary', title: 'Executive Summary', num: '01' },
      { id: 'financial-sensitivity', title: 'Financial Sensitivity Analysis', num: '02' },
      { id: 'value-drivers', title: 'Value Drivers', num: '03' },
      { id: 'company-overview', title: 'Company Overview', num: '04' },
      { id: 'strategic-anchoring', title: 'Strategic Anchoring & Business Drivers', num: '05' },
      { id: 'business-function', title: 'Business Function Inventory & KPI Baselines', num: '06' },
      { id: 'friction-mapping', title: 'Friction Point Mapping', num: '07' },
      { id: 'use-cases', title: 'AI Use Case Generation', num: '08' },
      { id: 'benefits', title: 'Benefits Quantification', num: '09' },
      { id: 'effort-tokens', title: 'Readiness & Token Modeling', num: '10' },
      { id: 'priority-roadmap', title: 'Priority Scoring & Roadmap', num: '11' },
      { id: 'appendix', title: 'Appendix', num: '12' },
    ];

    return `
      <div class="section toc-section" id="toc">
        <h2 class="section-heading">Table of Contents</h2>
        <nav class="toc-nav">
          ${sections.map((s) => `
            <a href="#${s.id}" class="toc-item">
              <span class="toc-num">${s.num}</span>
              <span class="toc-title">${escapeHtml(s.title)}</span>
              <span class="toc-dots"></span>
            </a>
          `).join('')}
        </nav>
      </div>
    `;
  };

  // Generate executive summary
  const generateExecutiveSummary = (): string => {
    const summaryData = executiveSummaryData || {};
    const narrative = summaryData.context || summary || 'Strategic AI assessment completed.';

    const useCasesHtml =
      topUseCases && topUseCases.length > 0
        ? `
        <div class="subsection">
          <h3 class="subsection-heading">AI Use Cases by Priority</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px;">#</th>
                <th>Use Case</th>
                <th class="text-right">Annual Value</th>
                <th class="text-right">Tier</th>
              </tr>
            </thead>
            <tbody>
              ${topUseCases
                .slice(0, 12)
                .map(
                  (uc: any, idx: number) => `
              <tr>
                <td class="text-center font-semibold" style="color: ${colors.primary};">${idx + 1}</td>
                <td class="font-medium">${escapeHtml(uc.useCase || uc.name || '')}</td>
                <td class="text-right font-semibold">${formatCurrency(uc.annualValue || 0)}</td>
                <td class="text-right"><span class="score-pill">${escapeHtml(uc.priorityTier || 'N/A')}</span></td>
              </tr>
            `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
        : '';

    return `
      <div class="section" id="executive-summary">
        <h2 class="section-heading">Executive Summary</h2>

        <div class="hero-banner">
          <div class="hero-label">Total Annual Value Opportunity</div>
          <div class="hero-value">${formatCurrency(totalAnnualValue)}</div>
          <div class="hero-sub">Value per Million Tokens: ${formatCurrency(valuePerMillionTokens)}</div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card" style="border-left: 4px solid ${pillarColors.revenue.text};">
            <div class="kpi-label">Revenue Enhancement</div>
            <div class="kpi-value" style="color: ${pillarColors.revenue.text};">${formatCurrency(totalRevenueBenefit)}</div>
            <div class="kpi-pct">${pctOfTotal(totalRevenueBenefit)} of total value</div>
          </div>
          <div class="kpi-card" style="border-left: 4px solid ${pillarColors.cost.text};">
            <div class="kpi-label">Cost Optimization</div>
            <div class="kpi-value" style="color: ${pillarColors.cost.text};">${formatCurrency(totalCostBenefit)}</div>
            <div class="kpi-pct">${pctOfTotal(totalCostBenefit)} of total value</div>
          </div>
          <div class="kpi-card" style="border-left: 4px solid ${pillarColors.cashflow.text};">
            <div class="kpi-label">Cash Flow Improvement</div>
            <div class="kpi-value" style="color: ${pillarColors.cashflow.text};">${formatCurrency(totalCashFlowBenefit)}</div>
            <div class="kpi-pct">${pctOfTotal(totalCashFlowBenefit)} of total value</div>
          </div>
          <div class="kpi-card" style="border-left: 4px solid ${pillarColors.risk.text};">
            <div class="kpi-label">Risk Mitigation</div>
            <div class="kpi-value" style="color: ${pillarColors.risk.text};">${formatCurrency(totalRiskBenefit)}</div>
            <div class="kpi-pct">${pctOfTotal(totalRiskBenefit)} of total value</div>
          </div>
        </div>

        <div class="subsection">
          <h3 class="subsection-heading">Executive Overview</h3>
          ${splitIntoParagraphs(escapeHtml(narrative))}
        </div>

        ${useCasesHtml}
      </div>
    `;
  };

  // Generate financial sensitivity analysis
  const generateFinancialSensitivity = (): string => {
    const { conservative = {}, moderate = {}, aggressive = {} } = scenarioAnalysis;

    return `
      <div class="section" id="financial-sensitivity">
        <h2 class="section-heading">Financial Sensitivity Analysis</h2>
        <p class="section-intro">Understanding the range of potential outcomes helps frame investment decisions. The three scenarios below model different adoption speeds and organizational readiness levels.</p>

        <div class="scenario-cards">
          <div class="scenario-card scenario-conservative">
            <div class="scenario-header">
              <span class="scenario-pill" style="background: ${colors.neutral100}; color: ${colors.slate};">Conservative</span>
            </div>
            <p class="scenario-desc">Cautious estimate accounting for organizational friction, slower adoption, and extended timelines.</p>
            <div class="scenario-details">
              <div class="scenario-detail"><span class="detail-label">Adoption</span><span class="detail-value">70% of use cases</span></div>
              <div class="scenario-detail"><span class="detail-label">Timeline</span><span class="detail-value">18-month ramp</span></div>
              <div class="scenario-detail"><span class="detail-label">Realization</span><span class="detail-value">75% of baseline</span></div>
            </div>
            <div class="scenario-metrics">
              <div class="scenario-metric">
                <div class="metric-label">Annual Benefit</div>
                <div class="metric-value" style="color: ${colors.slate};">${formatCurrency((conservative as any).annualBenefit || 0)}</div>
              </div>
              <div class="scenario-metric">
                <div class="metric-label">5-Year NPV</div>
                <div class="metric-value" style="color: ${colors.slate};">${formatCurrency((conservative as any).npv || 0)}</div>
              </div>
            </div>
          </div>

          <div class="scenario-card scenario-base">
            <div class="scenario-header">
              <span class="scenario-pill" style="background: ${colors.primary}; color: white;">Base Case</span>
              <span class="recommended-badge">Recommended</span>
            </div>
            <p class="scenario-desc">Expected outcome based on standard implementation practices and normal change management cadence.</p>
            <div class="scenario-details">
              <div class="scenario-detail"><span class="detail-label">Adoption</span><span class="detail-value">85% of use cases</span></div>
              <div class="scenario-detail"><span class="detail-label">Timeline</span><span class="detail-value">12-month ramp</span></div>
              <div class="scenario-detail"><span class="detail-label">Realization</span><span class="detail-value">100% of baseline</span></div>
            </div>
            <div class="scenario-metrics">
              <div class="scenario-metric">
                <div class="metric-label">Annual Benefit</div>
                <div class="metric-value" style="color: ${colors.primary};">${formatCurrency((moderate as any).annualBenefit || 0)}</div>
              </div>
              <div class="scenario-metric">
                <div class="metric-label">5-Year NPV</div>
                <div class="metric-value" style="color: ${colors.primary};">${formatCurrency((moderate as any).npv || 0)}</div>
              </div>
            </div>
          </div>

          <div class="scenario-card scenario-optimistic">
            <div class="scenario-header">
              <span class="scenario-pill" style="background: #DCFCE7; color: ${colors.success};">Optimistic</span>
            </div>
            <p class="scenario-desc">Best-case outcome with strong executive sponsorship, accelerated adoption, and compounding network effects.</p>
            <div class="scenario-details">
              <div class="scenario-detail"><span class="detail-label">Adoption</span><span class="detail-value">95%+ of use cases</span></div>
              <div class="scenario-detail"><span class="detail-label">Timeline</span><span class="detail-value">9-month ramp</span></div>
              <div class="scenario-detail"><span class="detail-label">Realization</span><span class="detail-value">125% of baseline</span></div>
            </div>
            <div class="scenario-metrics">
              <div class="scenario-metric">
                <div class="metric-label">Annual Benefit</div>
                <div class="metric-value" style="color: ${colors.success};">${formatCurrency((aggressive as any).annualBenefit || 0)}</div>
              </div>
              <div class="scenario-metric">
                <div class="metric-label">5-Year NPV</div>
                <div class="metric-value" style="color: ${colors.success};">${formatCurrency((aggressive as any).npv || 0)}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="comparison-table-wrap">
          <h3 class="subsection-heading">Scenario Comparison Summary</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th class="text-right">Conservative</th>
                <th class="text-right" style="background: #EFF6FF;">Base Case</th>
                <th class="text-right">Optimistic</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="font-semibold">Annual Benefit</td>
                <td class="text-right">${formatCurrency((conservative as any).annualBenefit || 0)}</td>
                <td class="text-right font-semibold" style="background: #F8FAFF;">${formatCurrency((moderate as any).annualBenefit || 0)}</td>
                <td class="text-right">${formatCurrency((aggressive as any).annualBenefit || 0)}</td>
              </tr>
              <tr>
                <td class="font-semibold">5-Year NPV</td>
                <td class="text-right">${formatCurrency((conservative as any).npv || 0)}</td>
                <td class="text-right font-semibold" style="background: #F8FAFF;">${formatCurrency((moderate as any).npv || 0)}</td>
                <td class="text-right">${formatCurrency((aggressive as any).npv || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // Generate value drivers section
  const generateValueDrivers = (): string => {
    const drivers = [
      { label: 'Revenue Growth', value: totalRevenueBenefit, colors: pillarColors.revenue, icon: '&#8599;' },
      { label: 'Cost Reduction', value: totalCostBenefit, colors: pillarColors.cost, icon: '&#8600;' },
      { label: 'Cash Flow Acceleration', value: totalCashFlowBenefit, colors: pillarColors.cashflow, icon: '&#8634;' },
      { label: 'Risk Mitigation', value: totalRiskBenefit, colors: pillarColors.risk, icon: '&#9737;' },
    ];

    return `
      <div class="section" id="value-drivers">
        <h2 class="section-heading">Value Drivers</h2>
        <p class="section-intro">Breakdown of the total value opportunity across four key business impact pillars.</p>
        <div class="driver-grid">
          ${drivers.map(d => `
            <div class="driver-card" style="background: ${d.colors.bg}; border: 1px solid ${d.colors.border};">
              <div class="driver-label" style="color: ${d.colors.text};">${d.label}</div>
              <div class="driver-value" style="color: ${d.colors.text};">${formatCurrency(d.value)}</div>
              <div class="driver-bar-wrap">
                <div class="driver-bar" style="width: ${totalAnnualValue > 0 ? Math.max(2, (d.value / totalAnnualValue) * 100) : 0}%; background: ${d.colors.text};"></div>
              </div>
              <div class="driver-pct" style="color: ${colors.neutral500};">${pctOfTotal(d.value)} of total value</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  // Generate company overview
  const generateCompanyOverview = (): string => {
    const step0 = getStepData(0);
    const content = step0.content || '';

    return `
      <div class="section" id="company-overview">
        <h2 class="section-heading">Company Overview</h2>
        <div class="prose">
          ${splitIntoParagraphs(escapeHtml(content))}
        </div>
      </div>
    `;
  };

  // Generate strategic anchoring table
  const generateStrategicAnchoring = (): string => {
    const step1 = getStepData(1);
    const data = (step1.data as any[]) || [];

    if (!data || data.length === 0) return '';

    return `
      <div class="section" id="strategic-anchoring">
        <h2 class="section-heading">Strategic Anchoring & Business Drivers</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Strategic Theme</th>
                <th>Current State</th>
                <th>Target State</th>
                <th>Primary Driver</th>
                <th>Secondary Driver</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (row: any) => `
              <tr>
                <td class="font-semibold">${escapeHtml(row['Strategic Theme'] || '')}</td>
                <td>${escapeHtml(row['Current State'] || '')}</td>
                <td>${escapeHtml(row['Target State'] || '')}</td>
                <td><span class="tag tag-blue">${escapeHtml(row['Primary Driver Impact'] || row['Primary Driver'] || '')}</span></td>
                <td>${escapeHtml(row['Secondary Driver'] || '')}</td>
              </tr>
            `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // Generate business function inventory
  const generateBusinessFunctionInventory = (): string => {
    const step2 = getStepData(2);
    const data = (step2.data as any[]) || [];

    if (!data || data.length === 0) return '';

    return `
      <div class="section" id="business-function">
        <h2 class="section-heading">Business Function Inventory & KPI Baselines</h2>
        <div class="table-wrap scrollable">
          <table class="data-table compact">
            <thead>
              <tr>
                <th>Strategic Theme</th>
                <th>KPI Name</th>
                <th>Function</th>
                <th>Sub-Function</th>
                <th>Baseline</th>
                <th class="text-center">Direction</th>
                <th>Target</th>
                <th>Industry Best</th>
                <th>Overall Best</th>
                <th>Timeframe</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (row: any) => `
              <tr>
                <td>${escapeHtml(row['Strategic Theme'] || '')}</td>
                <td class="font-medium">${escapeHtml(row['KPI Name'] || '')}</td>
                <td>${escapeHtml(row['Function'] || '')}</td>
                <td>${escapeHtml(row['Sub-Function'] || '')}</td>
                <td>${escapeHtml(row['Baseline Value'] || '')}</td>
                <td class="text-center font-semibold">${escapeHtml(row['Direction'] || '')}</td>
                <td>${escapeHtml(row['Target Value'] || '')}</td>
                <td class="muted">${escapeHtml(row['Benchmark (Industry Best)'] || '')}</td>
                <td class="muted">${escapeHtml(row['Benchmark (Overall Best)'] || '')}</td>
                <td>${escapeHtml(row['Timeframe'] || '')}</td>
              </tr>
            `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // Generate friction point mapping (grouped by strategic theme)
  const generateFrictionMapping = (): string => {
    const step3 = getStepData(3);
    const data = (step3.data as any[]) || [];

    if (!data || data.length === 0) return '';

    // Theme accent colors
    const themeAccents = ['#0339AF', '#059669', '#D97706', '#6366F1', '#DC2626', '#0D9488', '#7C3AED', '#0891B2'];

    const groupedByTheme = data.reduce(
      (acc: any, row: any) => {
        const theme = row['Strategic Theme'] || 'Other';
        if (!acc[theme]) acc[theme] = [];
        acc[theme].push(row);
        return acc;
      },
      {}
    );

    let totalCost = 0;
    let themeIdx = 0;
    const themeHtmls = Object.keys(groupedByTheme)
      .sort()
      .map((theme) => {
        const themeRows = groupedByTheme[theme];
        const themeCost = themeRows.reduce((sum: number, row: any) => {
          const costStr = String(row['Estimated Annual Cost ($)'] || '0').trim();
          const costMatch = costStr.match(/^\$?([\d,.]+)\s*([KkMmBb])?/);
          let cost = 0;
          if (costMatch) {
            const base = parseFloat(costMatch[1].replace(/,/g, ''));
            const s = costMatch[2]?.toUpperCase();
            cost = isNaN(base) ? 0 : s === 'B' ? base * 1e9 : s === 'M' ? base * 1e6 : s === 'K' ? base * 1e3 : base;
          }
          return sum + cost;
        }, 0);
        totalCost += themeCost;
        const accentColor = themeAccents[themeIdx % themeAccents.length];
        themeIdx++;

        return `
          <tr class="theme-group-row">
            <td colspan="7">
              <div class="theme-group-label" style="border-left-color: ${accentColor};">
                <span class="theme-name">${escapeHtml(theme)}</span>
                <span class="theme-cost">${formatCurrency(themeCost)}</span>
              </div>
            </td>
          </tr>
          ${themeRows
            .map(
              (row: any) => `
          <tr>
            <td>${escapeHtml(row['Friction Point'] || '')}</td>
            <td>${escapeHtml(row['Function'] || '')}</td>
            <td>${escapeHtml(row['Sub-Function'] || '')}</td>
            <td>${escapeHtml(row['Role'] || 'N/A')}</td>
            <td class="text-right font-semibold">${formatCurrency(row['Estimated Annual Cost ($)'] || 0)}</td>
            <td class="text-center"><span class="severity-badge severity-${String(row['Severity'] || '').toLowerCase()}">${escapeHtml(row['Severity'] || '')}</span></td>
            <td>${escapeHtml(row['Primary Driver Impact'] || '')}</td>
          </tr>
        `
            )
            .join('')}
        `;
      })
      .join('');

    return `
      <div class="section" id="friction-mapping">
        <h2 class="section-heading">Friction Point Mapping</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Friction Point</th>
                <th>Function</th>
                <th>Sub-Function</th>
                <th>Role</th>
                <th class="text-right">Annual Cost</th>
                <th class="text-center">Severity</th>
                <th>Primary Driver</th>
              </tr>
            </thead>
            <tbody>
              ${themeHtmls}
              <tr class="total-row">
                <td colspan="4" class="text-right font-bold">Total Annual Friction</td>
                <td class="text-right font-bold" style="color: ${colors.error};">${formatCurrency(totalCost)}</td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // Generate use cases table (card-based layout grouped by Strategic Theme)
  const generateUseCasesTable = (): string => {
    const step4 = getStepData(4);
    const data = (step4.data as any[]) || [];

    if (!data || data.length === 0) return '';

    // Single-agent agentic patterns get navy badge; multi-agent patterns get blue badge
    const singleAgentPatterns = [
      'reflection', 'tool use', 'planning', 'react loop', 'react',
      'prompt chaining', 'semantic router', 'constitutional guardrail',
    ];

    const getPatternBadgeClass = (pattern: string): string => {
      const normalized = (pattern || '').trim().toLowerCase();
      return singleAgentPatterns.some(p => normalized.includes(p))
        ? 'uc-badge-navy'
        : 'uc-badge-blue';
    };

    // Parse a field that may be comma-separated string, JSON array, or plain string
    const parseList = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
      const str = String(value).trim();
      if (str.startsWith('[')) {
        try {
          const parsed = JSON.parse(str);
          if (Array.isArray(parsed)) return parsed.map((v: any) => String(v).trim()).filter(Boolean);
        } catch { /* fall through to comma split */ }
      }
      return str.split(',').map(s => s.trim()).filter(Boolean);
    };

    // Group rows by Strategic Theme
    const grouped: Record<string, any[]> = {};
    for (const row of data) {
      const theme = (row['Strategic Theme'] || 'Uncategorized').trim();
      if (!grouped[theme]) grouped[theme] = [];
      grouped[theme].push(row);
    }

    // Build cards for each theme group
    const themeBlocks = Object.entries(grouped).map(([theme, rows]) => {
      const themeDivider = `
        <div class="uc-theme-divider">
          <span class="uc-theme-divider-name">${escapeHtml(theme)}</span>
          <span class="uc-theme-divider-count">${rows.length} use case${rows.length !== 1 ? 's' : ''}</span>
        </div>`;

      const cards = rows.map((row: any) => {
        const id = row['ID'] || '';
        const name = row['Use Case Name'] || row['Use Case'] || '';
        const description = row['Description'] || '';
        const targetFriction = row['Target Friction'] || '';
        const aiPrimitives = parseList(row['AI Primitives']);
        const primaryPattern = (row['Primary Pattern'] || row['Agentic Pattern'] || '').trim();
        const alternativePattern = (row['Alternative Pattern'] || '').trim();
        const patternRationale = (row['Pattern Rationale'] || '').trim();
        const epochFlags = (row['EPOCH Flags'] || '').trim();
        const hitl = row['Human-in-the-Loop Checkpoint'] || '';
        const func = row['Function'] || '';
        const subFunc = row['Sub-Function'] || '';
        const desiredOutcomes = parseList(row['Desired Outcomes']);
        const dataTypes = parseList(row['Data Types']);
        const integrations = parseList(row['Integrations']);

        // --- Header ---
        const headerBadges = [
          primaryPattern
            ? `<span class="${getPatternBadgeClass(primaryPattern)}">${escapeHtml(primaryPattern)}</span>`
            : '',
          func
            ? `<span class="uc-badge-slate">${escapeHtml(func)}${subFunc ? ' / ' + escapeHtml(subFunc) : ''}</span>`
            : '',
        ].filter(Boolean).join(' ');

        const header = `
          <div class="uc-card-header">
            <span class="uc-card-id">${escapeHtml(id)}</span>
            <span class="uc-card-name">${escapeHtml(name)}</span>
            ${headerBadges}
          </div>`;

        // --- Body sections ---
        const descriptionHtml = description
          ? `<div class="uc-description">${escapeHtml(description)}</div>`
          : '';

        const frictionHtml = targetFriction
          ? `<div class="uc-field-row">
              <span class="uc-field-label">Target Friction</span>
              <span class="uc-field-value">${escapeHtml(targetFriction)}</span>
            </div>`
          : '';

        const primitivesHtml = aiPrimitives.length > 0
          ? `<div style="margin-bottom: 10px;">
              <div class="uc-field-label" style="margin-bottom: 6px;">AI Primitives</div>
              <div class="uc-chips">
                ${aiPrimitives.map(p => `<span class="uc-chip-green">${escapeHtml(p)}</span>`).join('')}
              </div>
            </div>`
          : '';

        const patternBoxHtml = (primaryPattern || alternativePattern)
          ? `<div class="uc-pattern-box">
              <div class="uc-pattern-box-header" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                  <div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px;">PRIMARY PATTERN</div>
                  <span class="${getPatternBadgeClass(primaryPattern)}">${escapeHtml(primaryPattern || 'Not assigned')}</span>
                </div>
                <div>
                  <div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:4px;">ALTERNATIVE PATTERN</div>
                  <span class="${alternativePattern ? getPatternBadgeClass(alternativePattern) + '" style="opacity:0.75' : 'uc-badge-slate'}">${escapeHtml(alternativePattern || 'None')}</span>
                </div>
              </div>
              ${patternRationale ? `<div class="uc-pattern-rationale">${escapeHtml(patternRationale)}</div>` : ''}
            </div>`
          : '';

        // --- EPOCH Flags ---
        const epochColorsInline: Record<string, string> = {
          'E': 'background:#fef2f2;color:#b91c1c;border-color:#fecaca',
          'P': 'background:#fff7ed;color:#c2410c;border-color:#fed7aa',
          'O': 'background:#fefce8;color:#a16207;border-color:#fef08a',
          'C': 'background:#faf5ff;color:#7e22ce;border-color:#e9d5ff',
          'H': 'background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe',
        };
        const epochLabelMap: Record<string, string> = {
          'E': 'Empathy', 'P': 'Presence', 'O': 'Opinion', 'C': 'Creativity', 'H': 'Hope'
        };
        const epochHtml = epochFlags
          ? (() => {
              const validKeys = new Set(['E', 'P', 'O', 'C', 'H']);
              const flags = epochFlags.split(',').map((f: string) => f.trim().charAt(0).toUpperCase()).filter((f: string) => validKeys.has(f));
              if (flags.length === 0) return '';
              return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px;">
                <span style="font-size:9px;font-weight:600;color:#94a3b8;text-transform:uppercase;">E.P.O.C.H.:</span>
                ${flags.map((f: string) => `<span style="font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid;font-weight:500;${epochColorsInline[f] || ''}">${epochLabelMap[f]}</span>`).join('')}
              </div>`;
            })()
          : '';

        const outcomesHtml = desiredOutcomes.length > 0
          ? `<div style="margin-bottom: 10px;">
              <div class="uc-field-label" style="margin-bottom: 6px;">Desired Outcomes</div>
              <ul class="uc-outcomes-list">
                ${desiredOutcomes.map(o => `<li>${escapeHtml(o)}</li>`).join('')}
              </ul>
            </div>`
          : '';

        const dataTypesHtml = dataTypes.length > 0
          ? `<div style="margin-bottom: 10px;">
              <div class="uc-field-label" style="margin-bottom: 6px;">Data Types</div>
              <div class="uc-chips">
                ${dataTypes.map(d => `<span class="uc-chip-blue">${escapeHtml(d)}</span>`).join('')}
              </div>
            </div>`
          : '';

        const integrationsHtml = integrations.length > 0
          ? `<div style="margin-bottom: 10px;">
              <div class="uc-field-label" style="margin-bottom: 6px;">Integrations</div>
              <div class="uc-chips">
                ${integrations.map(i => `<span class="uc-chip-slate">${escapeHtml(i)}</span>`).join('')}
              </div>
            </div>`
          : '';

        const hitlHtml = hitl
          ? `<div class="uc-hitl">
              <div class="uc-hitl-label">Human-in-the-Loop Checkpoint</div>
              <div class="uc-hitl-value">${escapeHtml(hitl)}</div>
            </div>`
          : '';

        return `
          <div class="uc-card">
            ${header}
            <div class="uc-card-body">
              ${descriptionHtml}
              ${frictionHtml}
              ${primitivesHtml}
              ${patternBoxHtml}
              ${epochHtml}
              ${outcomesHtml}
              ${dataTypesHtml}
              ${integrationsHtml}
              ${hitlHtml}
            </div>
          </div>`;
      }).join('');

      return themeDivider + cards;
    }).join('');

    return `
      <div class="section" id="use-cases">
        <h2 class="section-heading">AI Use Case Generation</h2>
        <p class="section-intro">${data.length} use cases generated across ${Object.keys(grouped).length} strategic theme${Object.keys(grouped).length !== 1 ? 's' : ''}, each mapped to target friction points with agentic pattern analysis and human oversight checkpoints.</p>
        <div class="uc-cards-container">
          ${themeBlocks}
        </div>
      </div>
    `;
  };

  // Generate benefits quantification
  const generateBenefitsQuantification = (): string => {
    const step5 = getStepData(5);
    const data = (step5.data as any[]) || [];

    if (!data || data.length === 0) return '';

    return `
      <div class="section" id="benefits">
        <h2 class="section-heading">Benefits Quantification by Driver</h2>

        <div class="formula-grid">
          <div class="formula-card" style="border-left-color: ${pillarColors.cost.text};">
            <div class="formula-title">Cost Benefit</div>
            <p class="formula-text">Hours Saved &times; Hourly Rate &times; Benefits Loading &times; Adoption Rate &times; Data Maturity</p>
            <p class="formula-note">Applies 1.35&times; employer loading; conservative adoption &amp; data readiness factors</p>
          </div>
          <div class="formula-card" style="border-left-color: ${pillarColors.revenue.text};">
            <div class="formula-title">Revenue Benefit</div>
            <p class="formula-text">Revenue Uplift % &times; Revenue at Risk &times; Realization Factor &times; Data Maturity</p>
            <p class="formula-note">Market-tested conversion assumptions; reflects gradual adoption curves</p>
          </div>
          <div class="formula-card" style="border-left-color: ${pillarColors.cashflow.text};">
            <div class="formula-title">Cash Flow Benefit</div>
            <p class="formula-text">Annual Revenue &times; (Days Improved / 365) &times; Cost of Capital &times; Realization Factor</p>
            <p class="formula-note">Working capital release at 8% cost of capital; applies to inventory reduction</p>
          </div>
          <div class="formula-card" style="border-left-color: ${pillarColors.risk.text};">
            <div class="formula-title">Probability Weight</div>
            <p class="formula-text">Expected Value = Annual Benefit &times; Probability of Success</p>
            <p class="formula-note">Weighted by implementation confidence and market maturity of AI capability</p>
          </div>
        </div>

        <div class="table-wrap scrollable">
          <table class="data-table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>Use Case</th>
                <th class="text-right">Total Annual Value</th>
                <th class="text-center">Prob. Success</th>
                <th class="text-right">Expected Value</th>
                <th class="text-right">Revenue Benefit</th>
                <th class="text-right">Cost Benefit</th>
                <th class="text-right">Cash Flow</th>
                <th class="text-right">Risk Benefit</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (row: any) => {
                    const totalValue = parseFloat(String(row['Total Annual Value ($)'] || 0).replace(/[^0-9.-]/g, '')) || 0;
                    const prob = row['Probability of Success'] || 0;
                    const probNum = typeof prob === 'number' ? prob : parseFloat(String(prob)) || 0;
                    const expectedValue = totalValue * (probNum > 1 ? probNum / 100 : probNum);
                    return `
              <tr>
                <td class="font-semibold">${escapeHtml(row['ID'] || '')}</td>
                <td class="font-medium">${escapeHtml(row['Use Case'] || '')}</td>
                <td class="text-right font-bold" style="color: ${colors.primary};">${formatCurrency(row['Total Annual Value ($)'] || 0)}</td>
                <td class="text-center">${((probNum > 1 ? probNum / 100 : probNum) * 100).toFixed(0)}%</td>
                <td class="text-right font-semibold">${formatCurrency(expectedValue)}</td>
                <td class="text-right" style="color: ${pillarColors.revenue.text};">${formatCurrency(row['Revenue Benefit ($)'] || 0)}</td>
                <td class="text-right">${formatCurrency(row['Cost Benefit ($)'] || 0)}</td>
                <td class="text-right" style="color: ${pillarColors.cashflow.text};">${formatCurrency(row['Cash Flow Benefit ($)'] || 0)}</td>
                <td class="text-right">${formatCurrency(row['Risk Benefit ($)'] || 0)}</td>
              </tr>`;
                  }
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  // Generate effort & token modeling
  const generateEffortTokenModeling = (): string => {
    const step6 = getStepData(6);
    const data = (step6.data as any[]) || [];

    if (!data || data.length === 0) return '';

    return `
      <div class="section" id="effort-tokens">
        <h2 class="section-heading">Readiness & Token Modeling</h2>
        <div class="table-wrap scrollable">
          <table class="data-table compact">
            <thead>
              <tr>
                <th>ID</th>
                <th>Use Case</th>
                <th class="text-center">Readiness</th>
                <th class="text-center">Org Capacity</th>
                <th class="text-center">Data Quality</th>
                <th class="text-center">Tech Infra</th>
                <th class="text-center">Governance</th>
                <th class="text-center">TTV (mo)</th>
                <th class="text-right">Monthly Tokens</th>
                <th class="text-right">Runs/Mo</th>
                <th class="text-right">Input/Run</th>
                <th class="text-right">Output/Run</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (row: any) => `
              <tr>
                <td class="font-semibold">${escapeHtml(row['ID'] || '')}</td>
                <td class="font-medium">${escapeHtml(row['Use Case'] || row['Use Case Name'] || '')}</td>
                <td class="text-center"><span class="score-pill">${row['Readiness Score'] || row['Feasibility Score'] || row['Effort Score'] || '–'}</span></td>
                <td class="text-center"><span class="score-circle">${row['Organizational Capacity'] || row['Change Mgmt'] || '–'}</span></td>
                <td class="text-center"><span class="score-circle">${row['Data Availability & Quality'] || row['Data Readiness'] || '–'}</span></td>
                <td class="text-center"><span class="score-circle">${row['Technical Infrastructure'] || row['Integration Complexity'] || '–'}</span></td>
                <td class="text-center"><span class="score-circle">${row['Governance'] || '–'}</span></td>
                <td class="text-center">${row['Time To Value'] || row['Time-to-Value'] || '–'}</td>
                <td class="text-right">${formatNumber(row['Monthly Tokens'] || 0)}</td>
                <td class="text-right">${formatNumber(row['Runs/Month'] || 0)}</td>
                <td class="text-right">${formatNumber(row['Input Tokens/Run'] || 0)}</td>
                <td class="text-right">${formatNumber(row['Output Tokens/Run'] || 0)}</td>
              </tr>
            `
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="table-footnote">
          Scoring Scale: All components scored 1&ndash;10 (weighted: Org Capacity 30%, Data Quality 30%, Tech Infra 20%, Governance 20%) |
          TTV = Time-to-Value in months
        </p>
      </div>
    `;
  };

  // Generate priority scoring & roadmap
  const generatePriorityScoringRoadmap = (): string => {
    const step7 = getStepData(7);
    const data = (step7.data as any[]) || [];

    if (!data || data.length === 0) return '';

    // VRM v2.1 — pull metadata block from analysis root (back-compat with v2.0)
    const vrm = (analysisData as any)?.vrm || (reportData as any)?.vrm;
    const sectorPresetLabel = vrm?.sectorPresetLabel || 'Baseline';
    const w = vrm?.weights || { orgCapacity: 0.35, dataReadiness: 0.30, governance: 0.20, techInfrastructure: 0.15 };
    const t = vrm?.quadrantThresholds || { championMin: 7.5, quickStrategicMin: 6.0, valueFloor: 6.0, maxTimeToPilotWeeks: 16 };
    const diagnostic = vrm?.diagnostic;
    const isV21 = (vrm?.schemaVersion || '').startsWith('2.1');

    // Identify Conditional Champions for highlighted block (Quadrant v2.1 first, then legacy)
    const conditionalChamps = data.filter((r: any) =>
      r['Quadrant v2.1'] === 'conditional_champion'
      || r['Quadrant v2'] === 'conditional_champion'
      || (r['Priority Tier'] || '').includes('Conditional Champion'));

    // VRM v2.1 — Methodology Integrity diagnostic block
    const severityBackground: Record<string, string> = {
      critical: 'background:#fef2f2;border:1px solid #fca5a5;color:#7f1d1d;',
      warning: 'background:#fffbeb;border:1px solid #fcd34d;color:#78350f;',
      info: 'background:#eff6ff;border:1px solid #93c5fd;color:#1e3a8a;',
    };
    const diagnosticBlock = !diagnostic ? '' : `
        <div class="appendix-block" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div>
              <strong style="color:#0f172a;font-size:13px;">Methodology Integrity (v${vrm?.schemaVersion || '2.1'})</strong>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">${diagnostic.totalUseCases} use cases · ${diagnostic.prototypingCandidatesCount} prototyping candidates (${diagnostic.prototypingCandidatesPct}%)</div>
            </div>
            <div style="font-size:11px;color:#475569;text-align:right;">
              Champions ${diagnostic.championCount} · CC ${diagnostic.conditionalChampionCount} · QW ${diagnostic.quickWinCount} · Strat ${diagnostic.strategicCount} · Found ${diagnostic.foundationCount}
              <div style="color:#94a3b8;margin-top:2px;">(${diagnostic.foundationHardCount} hard / ${diagnostic.foundationSoftCount} soft)</div>
            </div>
          </div>
          ${(diagnostic.warnings || []).length === 0
            ? `<div style="${severityBackground.info};border-radius:6px;padding:8px;font-size:12px;">No methodology integrity warnings — portfolio passes all v2.1 checks.</div>`
            : (diagnostic.warnings || []).map((wn: any) => `
              <div style="${severityBackground[wn.severity] || severityBackground.info};border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px;">
                <span style="font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:0.04em;">${escapeHtml(wn.severity || 'info')}</span>
                <span style="font-family:monospace;font-size:10px;margin-left:6px;opacity:0.7;">${escapeHtml(wn.code || '')}</span>
                <div style="margin-top:3px;">${escapeHtml(wn.message || '')}</div>
                ${wn.remediation ? `<div style="margin-top:3px;font-size:11px;opacity:0.85;"><strong>Recommendation:</strong> ${escapeHtml(wn.remediation)}</div>` : ''}
              </div>
            `).join('')}
        </div>
    `;

    const conditionalChampionBlock = conditionalChamps.length === 0 ? '' : `
        <div class="appendix-block" style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:16px;margin-top:16px;">
          <h3 class="subsection-heading" style="color:#92400e;margin-top:0;">Conditional Champions — 5-Week Readiness Sprint</h3>
          <p style="margin-bottom:12px;color:#78350f;">No use cases met all Champion floors today. The following items can be promoted to Champion status with a focused readiness sprint addressing the listed gaps:</p>
          ${conditionalChamps.map((r: any) => {
            const meta = r['Conditional Champion Meta'] || {};
            const gaps: any[] = meta.gaps || [];
            return `
              <div style="background:#fff;border-radius:6px;padding:12px;margin-bottom:8px;border-left:4px solid #f59e0b;">
                <strong style="color:#92400e;">${escapeHtml(r['Use Case'] || r['ID'] || '')}</strong>
                <span style="font-size:11px;color:#92400e;margin-left:8px;">${meta.proposedSprintWeeks || 5}-week sprint</span>
                ${gaps.length > 0 ? `
                  <ul style="margin:8px 0 0 20px;font-size:13px;color:#78350f;">
                    ${gaps.map((g: any) => `<li><strong>${escapeHtml(g.component || '')}:</strong> ${g.current} &rarr; ${g.required}</li>`).join('')}
                  </ul>` : ''}
              </div>
            `;
          }).join('')}
        </div>`;

    return `
      <div class="section" id="priority-roadmap">
        <h2 class="section-heading">Priority Scoring & Roadmap</h2>

        <div class="appendix-block" style="background:#f1f5f9;border-radius:8px;padding:14px;margin-bottom:16px;font-size:12px;">
          <strong style="color:#0f172a;">Value-Readiness Matrix v${vrm?.schemaVersion || '2.0'}</strong>
          &nbsp;|&nbsp; Sector preset: <strong>${escapeHtml(sectorPresetLabel)}</strong>
          &nbsp;|&nbsp; Weights: Org ${Math.round(w.orgCapacity * 100)}% / Data ${Math.round(w.dataReadiness * 100)}% / Gov ${Math.round(w.governance * 100)}% / Tech ${Math.round(w.techInfrastructure * 100)}%
          <br/>
          <span style="color:#475569;">${
            isV21 && t.valueFloorBand
              ? `Champion ≥ ${t.championMin}, Strategic/Quick Win ≥ ${t.quickStrategicMin}. Hard floor: legally prohibited OR technically infeasible OR (V&lt;${t.valueFloorBand.minNormalizedScore ?? t.valueFloorBand.minNormalized ?? 4.0} AND abs.&lt;$${(((t.valueFloorBand.minAbsoluteAnnualValue ?? t.valueFloorBand.minAbsoluteAnnual ?? 500000)/1000)).toFixed(0)}K). Soft blockers (no sponsor / data unavailable / TTP&gt;${t.maxTimeToPilotWeeks} wks) flag remediation but do not relegate to Foundation.`
              : `Champion ≥ ${t.championMin}, Strategic/Quick Win ≥ ${t.quickStrategicMin}, Value floor ${t.valueFloor}, Time-to-pilot ≤ ${t.maxTimeToPilotWeeks} wks. Floors also require named sponsor + data availability.`
          }</span>
        </div>

        ${diagnosticBlock}

        <div class="table-wrap scrollable">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Use Case</th>
                <th>Priority Tier (v2)</th>
                <th>Recommended Phase</th>
                <th class="text-center">Priority Score</th>
                <th class="text-center">Readiness Score</th>
                <th class="text-center">Value Score</th>
                <th class="text-center">TTV Score</th>
                <th>Strategic Theme</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (row: any) => {
                    const isConditional = row['Quadrant v2.1'] === 'conditional_champion'
                      || row['Quadrant v2'] === 'conditional_champion'
                      || (row['Priority Tier'] || '').includes('Conditional Champion');
                    const hardReasons: string[] = row['Hard Knock-Out Reasons'] || row['Floor Failure Reasons'] || [];
                    const softBlockers: any[] = row['Soft Blockers'] || [];
                    const tierBadge = isConditional
                      ? `<span class="tag" style="background:#fef3c7;color:#92400e;border:1px dashed #b45309;">${escapeHtml(row['Priority Tier'] || 'Conditional Champion')}</span>`
                      : escapeHtml(row['Priority Tier'] || '');
                    return `
              <tr>
                <td class="font-semibold">${escapeHtml(row['ID'] || '')}</td>
                <td class="font-medium">
                  ${escapeHtml(row['Use Case'] || '')}
                  ${hardReasons.length > 0 ? `<div style="font-size:10px;color:#b91c1c;margin-top:2px;"><strong>⛔ Hard:</strong> ${hardReasons.map(escapeHtml).join('; ')}</div>` : ''}
                  ${softBlockers.length > 0 ? `<div style="font-size:10px;color:#b45309;margin-top:2px;"><strong>⚠ Soft:</strong> ${softBlockers.map((sb: any) => escapeHtml(typeof sb === 'string' ? sb : (sb.message || sb.code || ''))).join('; ')}</div>` : ''}
                </td>
                <td>${tierBadge}</td>
                <td><span class="tag tag-sky">${escapeHtml(row['Recommended Phase'] || '')}</span></td>
                <td class="text-center"><span class="score-pill">${row['Priority Score'] || row['Priority Score (0-100)'] || 0}</span></td>
                <td class="text-center">${row['Readiness Score'] || row['Feasibility Score'] || '–'}</td>
                <td class="text-center">${row['Value Score'] || row['Value Score (0-40)'] || 0}</td>
                <td class="text-center">${row['TTV Score'] || row['TTV Score (0-30)'] || 0}</td>
                <td>${escapeHtml(row['Strategic Theme'] || '')}</td>
              </tr>
            `;
                  }
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="table-footnote">
          Priority Score = (Readiness &times; 0.5) + (Normalized Value &times; 0.5) on 1&ndash;10 scale |
          Quadrants: Champion, Quick Win, Strategic, Foundation, Conditional Champion (gap-named promotion)
        </p>
        ${conditionalChampionBlock}
      </div>
    `;
  };

  // Generate appendix
  const generateAppendix = (): string => {
    return `
      <div class="section" id="appendix">
        <h2 class="section-heading">Appendix</h2>

        <div class="appendix-block">
          <h3 class="subsection-heading">Standardized Roles & Labor Rates</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Role / Function</th>
                <th>Base Hourly Rate</th>
                <th>Benefits Loading</th>
                <th>Fully-Loaded Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Store Associates</td>
                <td>$15–$22</td>
                <td>1.35&times;</td>
                <td>$100/hr</td>
              </tr>
              <tr>
                <td>Professional Services / Sales</td>
                <td>$35–$45</td>
                <td>1.35&times;</td>
                <td>$150/hr</td>
              </tr>
              <tr>
                <td>Merchandising / Supply Chain Analysts</td>
                <td>$40–$52</td>
                <td>1.35&times;</td>
                <td>$175/hr</td>
              </tr>
            </tbody>
          </table>
          <p class="table-footnote">
            Benefits loading (1.35&times;) includes payroll taxes, health insurance, retirement, PTO, and overhead allocation per BlueAlly methodology.
          </p>
        </div>

        <div class="appendix-block">
          <h3 class="subsection-heading">Methodology & Assumptions</h3>

          <p style="margin-bottom: 12px;"><strong>Probability of Success (0.50&ndash;0.95):</strong> Confidence that the use case will deliver projected value at production scale. Derived from maturity of underlying AI technology, availability of training data, organizational readiness, and market precedent. A conversation AI returning 0.85 reflects proven technology; a novel predictive model at 0.60 reflects emerging capability.</p>

          <p style="margin-bottom: 12px;"><strong>Realization Factor (0.80&ndash;0.95):</strong> The fraction of theoretical benefit that survives contact with operational reality. Accounts for adoption lag, process friction, and measurement imprecision. Revenue benefits carry 0.95 (most measurable). Risk benefits carry 0.80 (most uncertain, actuarial nature).</p>

          <p style="margin-bottom: 12px;"><strong>Adoption Rate (0.75&ndash;0.95):</strong> The percentage of eligible users and processes that will adopt the AI solution within the measurement period. Reflects change management readiness, training investment, and cultural fit.</p>

          <p style="margin-bottom: 12px;"><strong>Data Maturity (0.60&ndash;1.00):</strong> Organizational data quality and accessibility scaled from Level 1 (ad-hoc, 0.60) to Level 5 (optimizing, 1.00). Most organizations assess at Level 2 (0.75). Derived from data governance maturity, system integration level, and data quality metrics.</p>

          <p style="margin-bottom: 12px;"><strong>Value Score (1&ndash;10):</strong> Expected Value (Total Annual Value &times; Probability of Success) divided by the Friction Annual Cost of the targeted friction point, then min-max normalized across all use cases to a 1&ndash;10 scale. This directly ties use case value to the friction cost it addresses, providing a deterministic measure of return on friction investment.</p>

          <p style="margin-bottom: 12px;"><strong>Readiness Score (1&ndash;10) — VRM v2.1:</strong> Weighted composite of four BARS-anchored components: Organizational Capacity (35%), Data Availability &amp; Quality (30%), AI-Specific Governance (20%), and Technical Infrastructure (15%). Each component scored 1&ndash;10 against published anchors (1, 3, 5, 7, 10) reflecting enterprise-grade thresholds. Sector presets (regulated, internal-productivity, RAG/fine-tune-heavy) re-weight components to fit context.</p>

          <p style="margin-bottom: 12px;"><strong>Priority Score (1&ndash;10) — VRM v2.1 Three-Layer Logic:</strong> Equal-weighted average of Readiness Score and log-normalized Value Score: (Readiness &times; 0.5) + (Value &times; 0.5). Quadrant placement: <em>Layer 1 hard floors</em> &mdash; legally prohibited OR technically infeasible OR (Value &lt; 4.0 AND absolute annual value &lt; $500K) &rarr; Foundation. <em>Layer 1 soft blockers</em> &mdash; missing sponsor, data unavailable (data-access sprint required), or time-to-pilot &gt; 16 weeks DO NOT relegate to Foundation; they surface as remediation flags so the use case still proceeds to prototyping. <em>Layer 2 default quadrants</em>: Champion (V&ge;7.5 &amp; R&ge;7.5); Strategic (V&ge;7.5 &amp; R&ge;6.0); Quick Win (V&ge;6.0 &amp; R&ge;7.5); else Foundation. <em>Layer 3 Conditional Champion</em> activates only when zero Champions AND zero Quick Wins AND zero Strategic exist; the top above-floor items are promoted with a 4&ndash;12 week readiness sprint sized to their named gaps.</p>

          <h4 style="margin: 16px 0 8px; font-size: 14px;">Standard Benefit Formulas</h4>
          <ul class="assumption-list">
            <li><strong>Cost Benefit:</strong> Hours Saved &times; Loaded Hourly Rate &times; Benefits Loading (1.35&times;) &times; Adoption Rate &times; Data Maturity</li>
            <li><strong>Revenue Benefit:</strong> Revenue Uplift % &times; Revenue at Risk &times; Realization Factor &times; Data Maturity</li>
            <li><strong>Cash Flow Benefit:</strong> Annual Revenue &times; (Days Improved / 365) &times; Cost of Capital &times; Realization Factor</li>
            <li><strong>Risk Benefit:</strong> Risk Reduction % &times; Risk Exposure &times; Realization Factor &times; Data Maturity</li>
            <li><strong>Expected Value:</strong> Total Annual Benefit &times; Probability of Success</li>
          </ul>

          <h4 style="margin: 16px 0 8px; font-size: 14px;">Additional Assumptions</h4>
          <ul class="assumption-list">
            <li><strong>Cost of Capital:</strong> 8% applied to working capital improvements per company WACC proxy</li>
            <li><strong>Token Modeling:</strong> Based on Claude API pricing ($3/1M input, $15/1M output); actual costs scale with usage patterns</li>
            <li><strong>TTV Bubble Sizing:</strong> Score = 1 &minus; MIN(TTV/12, 1). Shorter time-to-value produces larger bubbles on the matrix chart.</li>
          </ul>
        </div>

        <div class="appendix-block">
          <h3 class="subsection-heading">Recommended Next Steps</h3>
          <div class="next-steps-card">
            <h4>Drive Implementation Forward</h4>
            <p>BlueAlly recommends a facilitated workshop with cross-functional leadership to:</p>
            <ul class="next-steps-list">
              <li>Validate use case prioritization and sequencing against strategic roadmap</li>
              <li>Assign executive sponsors and establish governance structures</li>
              <li>Confirm data access, system integration, and change management approach</li>
              <li>Define success metrics and establish baseline tracking</li>
            </ul>
            <div class="contact-box">
              <strong>Contact BlueAlly</strong> to arrange a facilitated workshop and begin a 90-day sprint toward implementation readiness. Typical engagement: 2-week strategy alignment + 4-week pilot design.
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // Build complete HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(companyName)} - BlueAlly AI Strategic Assessment</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800&display=swap" rel="stylesheet">
  <style>
    /* ===== RESET & BASE ===== */
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    html { font-size: 15px; scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: ${colors.neutral700};
      line-height: 1.65;
      background: ${colors.white};
    }

    .report-container { max-width: 960px; margin: 0 auto; }

    @media screen {
      body { background: #E2E8F0; padding: 24px; }
      .report-container {
        background: ${colors.white};
        box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 16px 48px rgba(0,0,0,0.08);
        border-radius: 4px;
        overflow: hidden;
      }
    }

    /* ===== COVER PAGE (BOARDROOM — dark navy) ===== */
    .cover-page {
      background: ${colors.navy};
      padding: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      page-break-after: always;
      overflow: hidden;
    }

    .cover-page::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: ${colors.primary};
    }

    .cover-inner {
      padding: 64px 72px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      flex: 1;
    }

    .cover-brand { margin-bottom: 80px; }

    .cover-tagline {
      font-size: 11px;
      font-weight: 600;
      color: ${colors.accent};
      text-transform: uppercase;
      letter-spacing: 0.2em;
      margin-bottom: 20px;
    }

    .cover-title {
      font-size: 14px;
      font-weight: 400;
      color: rgba(255,255,255,0.5);
      margin-bottom: 12px;
      letter-spacing: 0.02em;
    }

    .cover-company {
      font-size: 56px;
      font-weight: 300;
      color: ${colors.white};
      line-height: 1.1;
      letter-spacing: -1.5px;
      margin-bottom: 48px;
    }

    .cover-value {
      display: inline-block;
      font-size: 40px;
      font-weight: 700;
      color: ${colors.accent};
      letter-spacing: -1px;
    }

    .cover-value-label {
      font-size: 13px;
      font-weight: 400;
      color: rgba(255,255,255,0.45);
      margin-top: 6px;
    }

    .cover-bottom {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 32px 72px 48px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    .cover-meta {
      font-size: 13px;
      color: rgba(255,255,255,0.45);
      line-height: 1.8;
    }

    .cover-meta strong { color: rgba(255,255,255,0.75); font-weight: 500; }

    .cover-confidential {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: 0.15em;
      padding: 6px 16px;
      border: 1px solid rgba(255,255,255,0.15);
    }

    /* ===== TABLE OF CONTENTS ===== */
    .toc-section { padding: 48px 60px; background: ${colors.neutral50}; }

    .toc-nav { margin-top: 24px; }

    .toc-item {
      display: flex;
      align-items: baseline;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid ${colors.neutral200};
      text-decoration: none;
      color: ${colors.neutral700};
      transition: color 0.15s;
    }

    .toc-item:hover { color: ${colors.primary}; }

    .toc-num {
      font-size: 12px;
      font-weight: 600;
      color: ${colors.primary};
      min-width: 24px;
    }

    .toc-title { font-size: 14px; font-weight: 500; }

    .toc-dots { flex: 1; border-bottom: 1px dotted ${colors.neutral300}; margin: 0 8px; min-width: 40px; }

    /* ===== SECTIONS ===== */
    .section { padding: 52px 72px; border-bottom: 1px solid ${colors.neutral200}; }
    .section:last-child { border-bottom: none; }
    .section-alt { background: ${colors.neutral50}; }

    .section-heading {
      font-size: 22px;
      font-weight: 600;
      color: ${colors.navy};
      margin-bottom: 24px;
      letter-spacing: -0.3px;
      border-left: 3px solid ${colors.primary};
      padding-left: 16px;
    }

    .section-label {
      display: block;
      font-size: 10px;
      font-weight: 700;
      color: ${colors.primary};
      text-transform: uppercase;
      letter-spacing: 0.18em;
      margin-bottom: 6px;
      padding-left: 16px;
    }

    .section-intro {
      font-size: 14px;
      color: ${colors.neutral500};
      margin-bottom: 28px;
      margin-top: 4px;
      line-height: 1.7;
      max-width: 680px;
    }

    .subsection { margin-top: 32px; }

    .subsection-heading {
      font-size: 15px;
      font-weight: 700;
      color: ${colors.navy};
      margin-bottom: 16px;
    }

    /* ===== PAGE BREAK INDICATOR ===== */
    .page-break-indicator {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 72px;
      background: ${colors.neutral50};
      border-top: 1px dashed ${colors.neutral300};
      border-bottom: 1px dashed ${colors.neutral300};
    }

    .page-break-line { flex: 1; height: 1px; border-top: 1px dashed ${colors.neutral300}; }

    .page-break-label {
      font-size: 10px;
      font-weight: 600;
      color: ${colors.neutral400};
      text-transform: uppercase;
      letter-spacing: 0.15em;
      white-space: nowrap;
    }

    /* ===== HERO BANNER ===== */
    .hero-banner {
      background: ${colors.navy};
      color: ${colors.white};
      padding: 32px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 28px;
    }

    .hero-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      opacity: 0.8;
      margin-bottom: 8px;
    }

    .hero-value {
      font-size: 48px;
      font-weight: 700;
      letter-spacing: -1px;
      margin-bottom: 4px;
    }

    .hero-sub {
      font-size: 13px;
      opacity: 0.7;
    }

    /* ===== KPI CARDS ===== */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }

    .kpi-card {
      background: ${colors.white};
      border: 1px solid ${colors.neutral200};
      border-radius: 12px;
      padding: 20px;
    }

    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      color: ${colors.neutral500};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .kpi-value {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
      letter-spacing: -0.5px;
    }

    .kpi-pct {
      font-size: 12px;
      color: ${colors.neutral400};
    }

    /* ===== SCENARIO CARDS ===== */
    .scenario-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 32px;
    }

    .scenario-card {
      background: ${colors.white};
      border: 1px solid ${colors.neutral200};
      border-radius: 12px;
      padding: 24px;
    }

    .scenario-conservative { background: ${colors.neutral50}; }
    .scenario-base {
      background: #F8FAFF;
      border: 2px solid ${colors.primary};
      box-shadow: 0 0 0 3px rgba(3, 57, 175, 0.08);
    }
    .scenario-optimistic { background: #F0FDF4; border-color: #BBF7D0; }

    .scenario-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .scenario-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 100px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .recommended-badge {
      font-size: 10px;
      font-weight: 600;
      color: ${colors.primary};
      background: #DBEAFE;
      padding: 2px 8px;
      border-radius: 100px;
    }

    .scenario-desc {
      font-size: 13px;
      color: ${colors.neutral500};
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .scenario-details {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid ${colors.neutral200};
    }

    .scenario-detail {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }

    .detail-label {
      font-size: 12px;
      color: ${colors.neutral400};
      font-weight: 500;
    }

    .detail-value {
      font-size: 12px;
      color: ${colors.neutral700};
      font-weight: 600;
    }

    .scenario-metrics {}

    .scenario-metric {
      padding: 8px 0;
    }

    .metric-label {
      font-size: 11px;
      font-weight: 500;
      color: ${colors.neutral400};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .metric-value {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    /* ===== VALUE DRIVERS ===== */
    .driver-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .driver-card {
      padding: 24px;
      border-radius: 12px;
    }

    .driver-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .driver-value {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
    }

    .driver-bar-wrap {
      height: 4px;
      background: rgba(0,0,0,0.06);
      border-radius: 2px;
      margin-bottom: 8px;
      overflow: hidden;
    }

    .driver-bar {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s;
    }

    .driver-pct {
      font-size: 12px;
    }

    /* ===== TABLES ===== */
    .table-wrap {
      overflow-x: auto;
      margin: 20px 0;
      border-radius: 8px;
      border: 1px solid ${colors.neutral200};
    }

    .table-wrap.scrollable {
      max-height: 600px;
      overflow-y: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .data-table.compact { font-size: 12px; }

    .data-table thead {
      background: ${colors.neutral50};
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .data-table th {
      padding: 12px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      color: ${colors.neutral500};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid ${colors.neutral200};
      white-space: nowrap;
    }

    .data-table td {
      padding: 10px 16px;
      border-bottom: 1px solid ${colors.neutral100};
      color: ${colors.neutral700};
    }

    .data-table tbody tr:nth-child(even) { background: ${colors.neutral50}; }
    .data-table tbody tr:hover { background: #F1F5F9; }

    .desc-cell { font-size: 12px; max-width: 220px; color: ${colors.neutral600}; }

    /* Theme group rows */
    .theme-group-row td { padding: 0; border-bottom: none; background: transparent !important; }
    .theme-group-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      margin: 8px 0 2px;
      border-left: 4px solid ${colors.primary};
      background: ${colors.neutral50};
      border-radius: 0 6px 6px 0;
    }
    .theme-name { font-weight: 700; font-size: 13px; color: ${colors.navy}; }
    .theme-cost { font-weight: 700; font-size: 13px; color: ${colors.error}; }

    .total-row td {
      padding: 14px 16px;
      border-top: 2px solid ${colors.neutral300};
      background: ${colors.neutral50} !important;
    }

    .comparison-table-wrap { margin-top: 28px; }

    /* ===== TAGS & BADGES ===== */
    .tag {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
    }

    .tag-blue { background: #EFF6FF; color: ${colors.primary}; }
    .tag-sky { background: #E0F7FF; color: #0077AA; }

    .severity-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 100px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .severity-critical { background: #FEE2E2; color: ${colors.error}; }
    .severity-high { background: #FEF3C7; color: #92400E; }
    .severity-medium { background: ${colors.neutral100}; color: ${colors.neutral600}; }
    .severity-low { background: #F0FDF4; color: ${colors.success}; }

    .score-pill {
      display: inline-block;
      background: ${colors.navy};
      color: ${colors.white};
      padding: 3px 12px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 700;
    }

    .score-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: ${colors.neutral100};
      color: ${colors.neutral700};
      font-size: 11px;
      font-weight: 700;
    }

    /* ===== FORMULA CARDS ===== */
    .formula-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }

    .formula-card {
      background: ${colors.white};
      padding: 20px;
      border-radius: 8px;
      border: 1px solid ${colors.neutral200};
      border-left: 4px solid ${colors.primary};
    }

    .formula-title {
      font-weight: 700;
      color: ${colors.navy};
      margin-bottom: 6px;
      font-size: 13px;
    }

    .formula-text { font-size: 12px; color: ${colors.neutral700}; margin-bottom: 4px; }
    .formula-note { font-size: 11px; color: ${colors.neutral400}; margin-bottom: 0; }

    /* ===== BODY TEXT ===== */
    .body-text {
      font-size: 14px;
      color: ${colors.neutral600};
      line-height: 1.8;
    }

    .prose p { margin-bottom: 16px; font-size: 14px; color: ${colors.neutral600}; line-height: 1.8; }

    .table-footnote {
      margin-top: 16px;
      font-size: 12px;
      color: ${colors.neutral400};
      line-height: 1.6;
    }

    /* ===== APPENDIX ===== */
    .appendix-block { margin-bottom: 36px; }

    .assumption-list {
      list-style: none;
      margin: 0;
    }

    .assumption-list li {
      padding: 10px 0;
      border-bottom: 1px solid ${colors.neutral100};
      font-size: 13px;
      color: ${colors.neutral600};
      line-height: 1.7;
    }

    .assumption-list li:last-child { border-bottom: none; }

    .next-steps-card {
      background: ${colors.neutral50};
      border: 1px solid ${colors.neutral200};
      border-radius: 12px;
      padding: 28px;
    }

    .next-steps-card h4 {
      font-size: 16px;
      font-weight: 700;
      color: ${colors.navy};
      margin-bottom: 12px;
    }

    .next-steps-card p { font-size: 14px; color: ${colors.neutral600}; margin-bottom: 16px; }

    .next-steps-list {
      margin: 0 0 20px 20px;
      color: ${colors.neutral600};
      font-size: 13px;
      line-height: 2;
    }

    .contact-box {
      background: ${colors.white};
      border: 1px solid ${colors.neutral200};
      border-left: 4px solid ${colors.success};
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: ${colors.neutral600};
    }

    /* ===== FOOTER ===== */
    .report-footer {
      text-align: center;
      padding: 32px 60px;
      border-top: 1px solid ${colors.neutral200};
      background: ${colors.neutral50};
    }

    .footer-brand {
      margin-bottom: 8px;
    }

    .footer-text {
      font-size: 12px;
      color: ${colors.neutral400};
      line-height: 1.8;
    }

    /* ===== UTILITY CLASSES ===== */
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-medium { font-weight: 500; }
    .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; }
    .muted { color: ${colors.neutral400}; font-size: 12px; }

    /* ===== USE CASE CARDS ===== */
    .uc-cards-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .uc-theme-divider {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: ${colors.navy};
      color: ${colors.white};
      padding: 10px 20px;
      border-radius: 8px;
      margin-top: 12px;
    }

    .uc-theme-divider-name {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.2px;
    }

    .uc-theme-divider-count {
      font-size: 11px;
      font-weight: 600;
      background: rgba(255,255,255,0.18);
      padding: 2px 10px;
      border-radius: 100px;
    }

    .uc-card {
      background: ${colors.white};
      border: 1px solid ${colors.neutral200};
      border-radius: 10px;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .uc-card-header {
      background: ${colors.neutral50};
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      border-bottom: 1px solid ${colors.neutral200};
    }

    .uc-card-id {
      font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 11px;
      font-weight: 700;
      color: ${colors.neutral500};
      background: ${colors.neutral200};
      padding: 2px 8px;
      border-radius: 4px;
    }

    .uc-card-name {
      font-size: 14px;
      font-weight: 700;
      color: ${colors.navy};
      flex: 1;
      min-width: 180px;
    }

    .uc-badge-navy {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 10px;
      font-weight: 700;
      background: ${colors.navy};
      color: ${colors.white};
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .uc-badge-blue {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 10px;
      font-weight: 700;
      background: #02a2fd;
      color: ${colors.white};
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .uc-badge-slate {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 10px;
      font-weight: 600;
      background: ${colors.neutral100};
      color: ${colors.neutral600};
    }

    .uc-card-body {
      padding: 16px 20px;
    }

    .uc-description {
      font-size: 13px;
      color: ${colors.neutral600};
      line-height: 1.65;
      margin-bottom: 12px;
    }

    .uc-field-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .uc-field-label {
      font-weight: 600;
      color: ${colors.neutral500};
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .uc-field-value {
      color: ${colors.neutral700};
    }

    .uc-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }

    .uc-chip-green {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
      background: #ECFDF5;
      color: #065F46;
      border: 1px solid #A7F3D0;
    }

    .uc-chip-blue {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
      background: #EFF6FF;
      color: ${colors.primary};
      border: 1px solid #BFDBFE;
    }

    .uc-chip-slate {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 600;
      background: ${colors.neutral100};
      color: ${colors.neutral600};
      border: 1px solid ${colors.neutral200};
    }

    .uc-pattern-box {
      border: 1px solid ${colors.neutral200};
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
      background: ${colors.neutral50};
    }

    .uc-pattern-box-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .uc-pattern-box-label {
      font-size: 11px;
      font-weight: 700;
      color: ${colors.neutral500};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .uc-pattern-rationale {
      font-size: 12px;
      color: ${colors.neutral600};
      line-height: 1.6;
    }

    .uc-outcomes-list {
      list-style: none;
      margin: 0 0 10px;
      padding: 0;
    }

    .uc-outcomes-list li {
      padding: 3px 0;
      font-size: 12px;
      color: ${colors.neutral600};
      line-height: 1.5;
    }

    .uc-outcomes-list li::before {
      content: '\\2022';
      color: ${colors.primary};
      font-weight: 700;
      margin-right: 8px;
    }

    .uc-hitl {
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 12px;
    }

    .uc-hitl-label {
      font-size: 11px;
      font-weight: 700;
      color: ${colors.primary};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .uc-hitl-value {
      font-size: 12px;
      color: ${colors.neutral700};
      line-height: 1.6;
    }

    @media print {
      .uc-card { page-break-inside: avoid; }
      .uc-theme-divider { page-break-after: avoid; }
    }

    /* ===== PRINT ===== */
    @media print {
      @page { size: letter; margin: 0.65in 0.75in; }
      body { background: white; padding: 0; font-size: 10pt; }
      .report-container { max-width: 100%; box-shadow: none; border-radius: 0; }
      .section { page-break-inside: avoid; padding: 32px 48px; }
      .section-alt { page-break-before: always; }
      .cover-page { min-height: 100vh; page-break-after: always; }
      .data-table { page-break-inside: avoid; }
      .table-wrap.scrollable { max-height: none; overflow: visible; }
      a { color: inherit; text-decoration: none; }
      .scenario-cards { page-break-inside: avoid; }
      .page-break-indicator { page-break-after: always; border: none; background: none; }
    }

    /* ===== RESPONSIVE ===== */
    @media (max-width: 768px) {
      .section { padding: 32px 24px; }
      .toc-section { padding: 32px 24px; }
      .cover-inner { padding: 40px 24px; }
      .cover-bottom { padding: 24px; }
      .cover-company { font-size: 36px; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .scenario-cards { grid-template-columns: 1fr; }
      .driver-grid { grid-template-columns: 1fr; }
      .formula-grid { grid-template-columns: 1fr; }
      .hero-value { font-size: 36px; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- Cover Page — Boardroom Dark Navy -->
    <div class="cover-page">
      <div class="cover-inner">
        <div class="cover-brand">
          <img src="https://www.blueally.com/wp-content/uploads/2023/11/blue-header-logo.png" alt="BlueAlly"
            style="height: 32px; width: auto; filter: brightness(0) invert(1); opacity: 0.9;" />
        </div>
        <div>
          <div class="cover-tagline">AI Value Assessment</div>
          <div class="cover-title">Prepared for</div>
          <div class="cover-company">${escapeHtml(companyName)}</div>
          <div class="cover-value">${formatCurrency(totalAnnualValue)}</div>
          <div class="cover-value-label">Total Annual Value Opportunity</div>
        </div>
      </div>
      <div class="cover-bottom">
        <div class="cover-meta">
          <strong>Prepared by BlueAlly AI Consulting</strong><br>
          ${formattedDate}
        </div>
        <div class="cover-confidential">Confidential &amp; Proprietary</div>
      </div>
    </div>

    <!-- Table of Contents -->
    ${generateTableOfContents()}

    <!-- Main Content -->
    ${generateExecutiveSummary()}
    ${generateFinancialSensitivity()}
    ${generateValueDrivers()}
    ${generateCompanyOverview()}
    ${generateStrategicAnchoring()}
    ${generateBusinessFunctionInventory()}
    ${generateFrictionMapping()}
    ${generateUseCasesTable()}
    ${generateBenefitsQuantification()}
    ${generateEffortTokenModeling()}
    ${generatePriorityScoringRoadmap()}
    ${generateAppendix()}

    <!-- Footer -->
    <div class="report-footer">
      <div class="footer-brand"><img src="https://www.blueally.com/wp-content/uploads/2023/11/blue-header-logo.png" alt="BlueAlly" style="height: 24px; width: auto;" /></div>
      <div class="footer-text">
        &copy; ${new Date().getFullYear()} BlueAlly. Confidential &amp; Proprietary.<br>
        This assessment contains forward-looking projections and assumptions subject to substantial business and market risks.
      </div>
    </div>
  </div>
</body>
</html>
  `;

  return html;
}

// ============================================================
//  EDITORIAL HTML REPORT
//  White cover with navy sidebar, narrative-led, curated
// ============================================================
export function generateEditorialHTMLReport(
  reportData: any,
  companyName: string
): string {
  const now = new Date();
  const formattedMonth = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const { analysisData = {} } = reportData;
  const {
    steps = [],
    executiveDashboard = {},
    summary = '',
    scenarioAnalysis = {},
    executiveSummary: executiveSummaryData = {},
  } = analysisData;

  const {
    totalRevenueBenefit = 0,
    totalCostBenefit = 0,
    totalCashFlowBenefit = 0,
    totalRiskBenefit = 0,
    totalAnnualValue = 0,
    topUseCases = [],
  } = executiveDashboard;

  const escHtml = (text: any): string => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const fmtCurrency = (value: number | string): string => {
    let n: number;
    if (typeof value === 'number') {
      n = value;
    } else {
      const m = String(value).trim().match(/^\$?([\d,.]+)\s*([KkMmBb])?/);
      if (!m) return '$0';
      const base = parseFloat(m[1].replace(/,/g, ''));
      const s = m[2]?.toUpperCase();
      n = isNaN(base) ? 0 : s === 'B' ? base * 1e9 : s === 'M' ? base * 1e6 : s === 'K' ? base * 1e3 : base;
    }
    if (isNaN(n) || n === 0) return '$0';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const pct = (value: number): number => {
    if (!totalAnnualValue || totalAnnualValue === 0) return 0;
    return Math.round((value / totalAnnualValue) * 100);
  };

  // Extract top 5 use cases for recommendation cards
  const allUseCases: any[] = [];
  if (topUseCases && topUseCases.length > 0) {
    topUseCases.forEach((uc: any) => allUseCases.push(uc));
  } else {
    steps.forEach((step: any) => {
      (step.useCases || step.use_cases || []).forEach((uc: any) => allUseCases.push(uc));
    });
  }
  const recommendations = allUseCases.slice(0, 5);

  // Tier badge color map
  const tierStyles: Record<string, string> = {
    'Champions': 'background:#0F172A;color:#fff;',
    'Quick Wins': 'background:#059669;color:#fff;',
    'Strategic Investments': 'background:#0339AF;color:#fff;',
    'Foundation Builders': 'background:#64748B;color:#fff;',
    'Foundation': 'background:#64748B;color:#fff;',
    'Strategic': 'background:#0339AF;color:#fff;',
  };

  const tierBadge = (tier: string): string => {
    const style = tierStyles[tier] || 'background:#64748B;color:#fff;';
    return `<span style="display:inline-block;${style}font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;padding:3px 10px;">${escHtml(tier)}</span>`;
  };

  // EPOCH flags — E P O C H
  const epochHtml = (epochObj: any): string => {
    if (!epochObj || typeof epochObj !== 'object') return '';
    const flagDefs = [
      { key: 'E', label: 'E', title: 'Empathy' },
      { key: 'P', label: 'P', title: 'Presence' },
      { key: 'O', label: 'O', title: 'Opinion' },
      { key: 'C', label: 'C', title: 'Creativity' },
      { key: 'H', label: 'H', title: 'Hope' },
    ];
    return flagDefs.map(({ key, label, title }) => {
      const active = epochObj[key] === true;
      const style = active
        ? 'background:#0F172A;color:#fff;border-color:#0F172A;'
        : 'background:transparent;color:#94A3B8;border-color:#CBD5E1;';
      return `<span title="${title}" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1px solid;font-size:9px;font-weight:700;${style}">${label}</span>`;
    }).join('');
  };

  // Pull narrative text
  const narrativeText = executiveSummaryData?.executiveSummary
    || executiveSummaryData?.narrativeSummary
    || summary
    || `Our assessment identified a portfolio of high-impact AI opportunities for ${companyName}. These use cases span revenue generation, cost reduction, cash flow improvement, and risk mitigation — all areas where AI-driven transformation can deliver measurable enterprise value within 12–24 months.`;

  // Pull quoted highlight sentence
  const quotedSentence = (() => {
    const text = narrativeText;
    const sentences = text.split(/(?<=[.!?])\s+/);
    const best = sentences.find((s: string) => s.length > 60 && s.length < 200) || sentences[0] || '';
    return best.trim().replace(/^"|"$/g, '');
  })();

  // Scenarios
  const scenarios: any = scenarioAnalysis || {};
  const conservativeValue = scenarios.conservative?.totalValue || (totalAnnualValue * 0.60);
  const baseValue = scenarios.base?.totalValue || totalAnnualValue;
  const aggressiveValue = scenarios.aggressive?.totalValue || (totalAnnualValue * 1.30);
  const conservative5yr = scenarios.conservative?.fiveYearNPV || (conservativeValue * 3.5);
  const base5yr = scenarios.base?.fiveYearNPV || (baseValue * 3.8);
  const aggressive5yr = scenarios.aggressive?.fiveYearNPV || (aggressiveValue * 4.0);

  // Next steps
  const nextSteps = [
    { num: '01', title: 'Executive Alignment Session', body: `Schedule a 2-hour review with the C-suite and key leaders to secure consensus on the base case financial targets and prioritize the top use cases for initial proof-of-concept.` },
    { num: '02', title: 'Data Readiness Assessment', body: `Initiate a targeted technical deep dive into the specific data repositories required for priority initiatives to validate structural and governance readiness.` },
    { num: '03', title: 'Establish AI Governance Council', body: `Formalize a cross-functional steering committee (IT, Risk, Compliance, Business) to oversee deployment, manage risk frameworks, and monitor value realization.` },
    { num: '04', title: 'Launch Quick Win Pilot', body: `Begin execution of the highest-priority Quick Win initiative to demonstrate tangible ROI within the current fiscal quarter and build organizational momentum.` },
  ];

  const ucCards = recommendations.map((uc: any, i: number) => {
    const ucName = uc.name || uc.title || uc.useCaseName || `Initiative ${i + 1}`;
    const ucTier = uc.priorityTier || uc.tier || '';
    const ucValue = fmtCurrency(uc.totalBenefit || uc.annualBenefit || uc.value || 0);
    const ucRationale = uc.description || uc.rationale || uc.businessCase || '';
    const epochObj = uc.epochFlags || uc.epoch || {};
    return `
      <div style="position:relative;padding-left:72px;border-left:none;">
        <div style="position:absolute;left:0;top:0;font-size:72px;font-weight:800;color:#F1F5F9;line-height:1;letter-spacing:-3px;user-select:none;">${i + 1}</div>
        <div style="position:relative;z-index:1;padding-top:12px;">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;">
            ${tierBadge(ucTier)}
            <span style="font-size:11px;font-weight:700;color:#0339AF;background:#EFF6FF;padding:3px 10px;letter-spacing:0.08em;">VALUE: ${ucValue}</span>
            <div style="margin-left:auto;display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #E2E8F0;background:#F8FAFC;">
              <span style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.1em;margin-right:6px;">EPOCH</span>
              ${epochHtml(epochObj)}
            </div>
          </div>
          <h4 style="font-size:22px;font-weight:700;color:#0F172A;margin-bottom:10px;letter-spacing:-0.3px;">${escHtml(ucName)}</h4>
          <p style="font-size:15px;color:#475569;line-height:1.75;">${escHtml(ucRationale.slice(0, 400))}${ucRationale.length > 400 ? '…' : ''}</p>
        </div>
      </div>`;
  }).join('<div style="height:48px;"></div>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(companyName)} — AI Value Assessment (Editorial)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 15px; -webkit-font-smoothing: antialiased; }
    body { font-family: 'Inter', system-ui, sans-serif; color: #334155; background: #fff; line-height: 1.7; }
    @media screen { body { background: #E2E8F0; } .report-wrap { max-width: 900px; margin: 24px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.14); } }
    .report-wrap { background: #fff; overflow: hidden; }

    /* Cover */
    .cover { display: flex; min-height: 100vh; }
    .cover-sidebar { width: 128px; background: #0F172A; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 32px 0; }
    .cover-sidebar img { transform: rotate(-90deg); width: 160px; max-width: none; filter: brightness(0) invert(1); opacity: 0.9; }
    .cover-content { flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding: 80px 80px 64px; }
    .cover-headline { font-size: 18px; font-weight: 300; color: #64748B; letter-spacing: -0.2px; margin-bottom: 20px; }
    .cover-company-name { font-size: 64px; font-weight: 900; color: #0F172A; letter-spacing: -2px; line-height: 1; margin-bottom: 0; }
    .cover-meta-bar { border-top: 2px solid #E2E8F0; padding-top: 28px; }
    .cover-meta-month { font-size: 13px; color: #94A3B8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 6px; }
    .cover-meta-by { font-size: 17px; color: #334155; }

    /* Page break */
    .pb-indicator { display: flex; align-items: center; gap: 16px; padding: 20px 80px; background: #F8FAFC; border-top: 1px dashed #CBD5E1; border-bottom: 1px dashed #CBD5E1; }
    .pb-line { flex: 1; height: 0; border-top: 1px dashed #CBD5E1; }
    .pb-label { font-size: 9px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.2em; white-space: nowrap; }

    /* Content sections */
    .content-wrap { max-width: 720px; margin: 0 auto; padding: 72px 80px; }
    .section { margin-bottom: 80px; }
    .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; color: #0339AF; border-bottom: 1px solid rgba(3,57,175,0.15); padding-bottom: 12px; margin-bottom: 40px; }
    
    /* Narrative */
    .narrative-grid { display: grid; grid-template-columns: 7fr 5fr; gap: 40px; align-items: start; }
    .narrative-text { font-size: 16px; color: #475569; line-height: 1.8; }
    .pull-quote { background: #EFF6FF; border-left: 4px solid #0339AF; padding: 28px; border-radius: 0 20px 0 20px; }
    .pull-quote blockquote { font-size: 18px; font-style: italic; color: #0F172A; line-height: 1.5; }

    /* Value at a glance */
    .value-hero { background: #EFF6FF; padding: 56px 40px; text-align: center; margin-bottom: 40px; }
    .value-hero-label { font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 16px; }
    .value-hero-num { font-size: 72px; font-weight: 900; color: #0339AF; letter-spacing: -3px; line-height: 1; margin-bottom: 12px; }
    .value-hero-sub { font-size: 16px; color: #64748B; max-width: 480px; margin: 0 auto; }
    .pillar-row { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }
    .pillar-label { width: 160px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; flex-shrink: 0; }
    .pillar-track { flex: 1; height: 44px; background: #F1F5F9; position: relative; overflow: hidden; }
    .pillar-fill { position: absolute; top: 0; left: 0; height: 100%; transition: width 0.8s; }
    .pillar-val { position: absolute; top: 0; left: 0; right: 0; height: 100%; display: flex; align-items: center; padding: 0 12px; font-size: 13px; font-weight: 700; font-family: monospace; }

    /* Recommendations */
    .rec-card { position: relative; padding-left: 72px; margin-bottom: 48px; }

    /* Scenario table */
    .scenario-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 2px solid #0F172A; border-bottom: 2px solid #0F172A; }
    .scenario-col { padding: 40px 28px; text-align: center; border-right: 1px solid #E2E8F0; }
    .scenario-col:last-child { border-right: none; }
    .scenario-col.base { background: #F8FAFC; position: relative; }
    .scenario-name { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #64748B; margin-bottom: 28px; }
    .scenario-name.base { color: #0339AF; }
    .scenario-badge { position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); background: #0339AF; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 14px; white-space: nowrap; }
    .scenario-value { font-size: 36px; font-weight: 800; color: #0F172A; letter-spacing: -1px; margin-bottom: 6px; }
    .scenario-value.base { font-size: 48px; color: #0339AF; }
    .scenario-value-label { font-size: 11px; color: #94A3B8; margin-bottom: 20px; }
    .scenario-npv { font-size: 18px; font-weight: 600; color: #334155; }
    .scenario-npv-label { font-size: 11px; color: #94A3B8; }

    /* Next steps */
    .step-row { display: flex; gap: 24px; margin-bottom: 32px; align-items: flex-start; }
    .step-num { font-size: 48px; font-weight: 300; color: #0339AF; line-height: 1; flex-shrink: 0; width: 64px; }
    .step-title { font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px; }
    .step-body { font-size: 15px; color: #475569; line-height: 1.7; }

    /* Footer */
    .report-footer { margin-top: 48px; padding: 40px 80px; border-top: 1px solid #E2E8F0; background: #F8FAFC; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .footer-copy { font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em; }

    @media print {
      @page { size: letter; margin: 0.65in 0.75in; }
      body { background: white; }
      .report-wrap { max-width: 100%; box-shadow: none; margin: 0; }
      .cover { min-height: 100vh; page-break-after: always; }
      .pb-indicator { page-break-after: always; display: none; }
      .section { page-break-inside: avoid; }
    }

    @media (max-width: 680px) {
      .cover { flex-direction: column; }
      .cover-sidebar { width: 100%; height: 80px; }
      .cover-sidebar img { transform: none; width: auto; height: 24px; }
      .cover-content { padding: 40px 24px; }
      .cover-company-name { font-size: 40px; }
      .content-wrap { padding: 48px 24px; }
      .narrative-grid { grid-template-columns: 1fr; }
      .scenario-grid { grid-template-columns: 1fr; }
      .value-hero-num { font-size: 52px; }
    }
  </style>
</head>
<body>
  <div class="report-wrap">
    <!-- Cover Page -->
    <div class="cover">
      <div class="cover-sidebar">
        <img src="https://www.blueally.com/wp-content/uploads/2023/11/blue-header-logo.png" alt="BlueAlly" />
      </div>
      <div class="cover-content">
        <div>
          <div class="cover-headline">AI Transformation Assessment</div>
          <div class="cover-company-name">${escHtml(companyName)}</div>
        </div>
        <div class="cover-meta-bar">
          <div class="cover-meta-month">${formattedMonth}</div>
          <div class="cover-meta-by">Prepared by BlueAlly AI Consulting</div>
        </div>
      </div>
    </div>

    <!-- Page Break -->
    <div class="pb-indicator">
      <div class="pb-line"></div>
      <div class="pb-label">Page Break</div>
      <div class="pb-line"></div>
    </div>

    <!-- Main Content -->
    <div class="content-wrap">

      <!-- 01. Executive Summary -->
      <div class="section">
        <div class="section-label">01 &nbsp; Executive Summary</div>
        <div class="narrative-grid">
          <div class="narrative-text">${escHtml(narrativeText)}</div>
          <div class="pull-quote">
            <blockquote>"${escHtml(quotedSentence)}"</blockquote>
          </div>
        </div>
      </div>

      <!-- 02. Value Opportunity -->
      <div class="section">
        <div class="section-label">02 &nbsp; Value Opportunity</div>
        <div class="value-hero">
          <div class="value-hero-label">Total Annual AI Value Opportunity</div>
          <div class="value-hero-num">${fmtCurrency(totalAnnualValue)}</div>
          <div class="value-hero-sub">Identified across ${recommendations.length > 0 ? allUseCases.length : 'multiple'} high-feasibility use cases ready for immediate or near-term implementation.</div>
        </div>

        <!-- Pillar breakdown -->
        <div>
          ${totalRevenueBenefit > 0 ? `
          <div class="pillar-row">
            <div class="pillar-label">Revenue</div>
            <div class="pillar-track">
              <div class="pillar-fill" style="width:${pct(totalRevenueBenefit)}%;background:#059669;"></div>
              <div class="pillar-val" style="color:${pct(totalRevenueBenefit) > 20 ? '#fff' : '#059669'};">${fmtCurrency(totalRevenueBenefit)}</div>
            </div>
          </div>` : ''}
          ${totalCostBenefit > 0 ? `
          <div class="pillar-row">
            <div class="pillar-label">Cost Reduction</div>
            <div class="pillar-track">
              <div class="pillar-fill" style="width:${pct(totalCostBenefit)}%;background:#0339AF;"></div>
              <div class="pillar-val" style="color:${pct(totalCostBenefit) > 20 ? '#fff' : '#0339AF'};">${fmtCurrency(totalCostBenefit)}</div>
            </div>
          </div>` : ''}
          ${totalCashFlowBenefit > 0 ? `
          <div class="pillar-row">
            <div class="pillar-label">Cash Flow</div>
            <div class="pillar-track">
              <div class="pillar-fill" style="width:${pct(totalCashFlowBenefit)}%;background:#D97706;"></div>
              <div class="pillar-val" style="color:${pct(totalCashFlowBenefit) > 20 ? '#fff' : '#D97706'};">${fmtCurrency(totalCashFlowBenefit)}</div>
            </div>
          </div>` : ''}
          ${totalRiskBenefit > 0 ? `
          <div class="pillar-row">
            <div class="pillar-label">Risk Mitigation</div>
            <div class="pillar-track">
              <div class="pillar-fill" style="width:${pct(totalRiskBenefit)}%;background:#4F46E5;"></div>
              <div class="pillar-val" style="color:${pct(totalRiskBenefit) > 20 ? '#fff' : '#4F46E5'};">${fmtCurrency(totalRiskBenefit)}</div>
            </div>
          </div>` : ''}
        </div>
      </div>

      ${recommendations.length > 0 ? `
      <!-- 03. Priority Initiatives -->
      <div class="section">
        <div class="section-label">03 &nbsp; Priority Initiatives</div>
        ${ucCards}
      </div>` : ''}

      <!-- 04. Financial Scenario Analysis -->
      <div class="section">
        <div class="section-label">04 &nbsp; Financial Scenario Analysis</div>
        <div class="scenario-grid">
          <div class="scenario-col">
            <div class="scenario-name">Conservative</div>
            <div class="scenario-value-label">Annual Benefit</div>
            <div class="scenario-value">${fmtCurrency(conservativeValue)}</div>
            <div style="height:16px;"></div>
            <div class="scenario-npv-label">5-Year NPV</div>
            <div class="scenario-npv">${fmtCurrency(conservative5yr)}</div>
          </div>
          <div class="scenario-col base">
            <div class="scenario-badge">Recommended Target</div>
            <div class="scenario-name base">Base Case</div>
            <div class="scenario-value-label">Annual Benefit</div>
            <div class="scenario-value base">${fmtCurrency(baseValue)}</div>
            <div style="height:16px;"></div>
            <div class="scenario-npv-label">5-Year NPV</div>
            <div class="scenario-npv" style="color:#0339AF;">${fmtCurrency(base5yr)}</div>
          </div>
          <div class="scenario-col">
            <div class="scenario-name">Optimistic</div>
            <div class="scenario-value-label">Annual Benefit</div>
            <div class="scenario-value">${fmtCurrency(aggressiveValue)}</div>
            <div style="height:16px;"></div>
            <div class="scenario-npv-label">5-Year NPV</div>
            <div class="scenario-npv">${fmtCurrency(aggressive5yr)}</div>
          </div>
        </div>
      </div>

      <!-- 05. Recommended Next Steps -->
      <div class="section">
        <div class="section-label">05 &nbsp; Recommended Next Steps</div>
        ${nextSteps.map(s => `
        <div class="step-row">
          <div class="step-num">${s.num}</div>
          <div>
            <div class="step-title">${s.title}</div>
            <div class="step-body">${s.body}</div>
          </div>
        </div>`).join('')}
      </div>

    </div><!-- end content-wrap -->

    <!-- Footer -->
    <div class="report-footer">
      <img src="https://www.blueally.com/wp-content/uploads/2023/11/blue-header-logo.png" alt="BlueAlly" style="height:20px;width:auto;opacity:0.4;filter:grayscale(1);" />
      <div class="footer-copy">&copy; ${now.getFullYear()} BlueAlly. Confidential &amp; Proprietary. This assessment contains forward-looking projections.</div>
    </div>
  </div>
</body>
</html>`;
}
