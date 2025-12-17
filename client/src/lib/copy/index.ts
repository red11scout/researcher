export const copy = {
  brand: {
    name: 'BlueAlly',
    tagline: 'Enterprise AI Transformation',
    legal: '© 2024 BlueAlly AI Consulting. All rights reserved.',
    confidential: 'Confidential — Prepared exclusively for',
  },

  hero: {
    title: 'AI Opportunity Assessment',
    subtitle: 'Quantified impact. Strategic roadmap. Clear priorities.',
    cta: 'Begin Assessment',
    description: 'Transform strategic uncertainty into actionable intelligence. Identify high-impact AI opportunities, quantify their value, and build a prioritized implementation roadmap.',
  },

  sections: {
    overview: {
      title: 'Company Intelligence',
      subtitle: 'Foundation for strategic analysis',
    },
    strategy: {
      title: 'Strategic Anchors',
      subtitle: 'Business drivers that shape AI priorities',
    },
    kpis: {
      title: 'Performance Baselines',
      subtitle: 'Current metrics that anchor impact projections',
    },
    friction: {
      title: 'Friction Points',
      subtitle: 'Operational bottlenecks ripe for AI intervention',
    },
    useCases: {
      title: 'AI Use Cases',
      subtitle: 'Targeted opportunities ranked by impact and feasibility',
    },
    benefits: {
      title: 'Quantified Benefits',
      subtitle: 'Revenue, cost, cash flow, and risk impact',
    },
    tokens: {
      title: 'Token Economics',
      subtitle: 'Infrastructure costs at projected scale',
    },
    priority: {
      title: 'Implementation Priority',
      subtitle: 'Weighted scoring drives sequencing',
    },
    whatIf: {
      title: 'Scenario Modeling',
      subtitle: 'Adjust assumptions, see impact in real time',
    },
    dashboard: {
      title: 'Executive Dashboard',
      subtitle: 'Key metrics at a glance',
    },
  },

  actions: {
    generate: 'Generate Assessment',
    regenerate: 'Regenerate',
    export: 'Export Report',
    exportPdf: 'Download PDF',
    exportWord: 'Download Word',
    exportExcel: 'Download Excel',
    exportMarkdown: 'Download Markdown',
    viewDashboard: 'Open Dashboard',
    shareDashboard: 'Share Dashboard',
    copyLink: 'Copy Link',
    startOver: 'New Assessment',
    saveProgress: 'Save Draft',
    continue: 'Continue',
    cancel: 'Cancel',
    confirm: 'Confirm',
    apply: 'Apply Changes',
    reset: 'Reset to Default',
    expand: 'Show More',
    collapse: 'Show Less',
    edit: 'Edit',
    delete: 'Delete',
    download: 'Download',
    print: 'Print',
    refresh: 'Refresh',
  },

  status: {
    loading: {
      default: 'Processing...',
      analyzing: 'Analyzing strategic context...',
      extracting: 'Extracting business drivers...',
      mapping: 'Mapping friction points...',
      generating: 'Generating use cases...',
      quantifying: 'Quantifying benefits...',
      modeling: 'Building token model...',
      scoring: 'Calculating priority scores...',
      compiling: 'Compiling final assessment...',
      exporting: 'Preparing export...',
      saving: 'Saving...',
    },
    success: {
      generated: 'Assessment complete',
      exported: 'Export ready',
      saved: 'Changes saved',
      copied: 'Copied to clipboard',
      shared: 'Share link created',
    },
    error: {
      default: 'Something went wrong. Please try again.',
      network: 'Network error. Check your connection.',
      timeout: 'Request timed out. Retry with simpler input.',
      validation: 'Please check your input and try again.',
      auth: 'Session expired. Please refresh the page.',
      apiLimit: 'API limit reached. Please wait a moment.',
      generation: 'Analysis interrupted. Adjust input and retry.',
      export: 'Export failed. Please try again.',
    },
  },

  empty: {
    noCompany: 'Enter company details to begin your assessment.',
    noUseCases: 'No use cases identified. Try adding more context about business challenges.',
    noBenefits: 'Benefits will populate once use cases are generated.',
    noTokens: 'Token estimates require defined use cases.',
    noPriority: 'Priority scoring follows benefits quantification.',
    noHistory: 'Previous assessments will appear here.',
    noResults: 'No results match your criteria.',
  },

  tooltips: {
    roi: '36-month return on investment, calculated as (Total Benefits - Total Costs) / Total Costs',
    npv: 'Net present value using 10% discount rate over 36-month horizon',
    payback: 'Months until cumulative benefits exceed cumulative costs',
    confidence: 'Estimate reliability based on data quality and assumptions',
    tokenCost: 'Monthly inference cost at projected transaction volume',
    priorityScore: 'Weighted composite of impact (40%), feasibility (30%), strategic fit (30%)',
    tier: 'Critical: Deploy immediately. High: Next quarter. Medium: This year. Low: Evaluate.',
    revenue: 'Direct revenue increase from AI implementation',
    cost: 'Operational cost reduction from automation and efficiency',
    cash: 'Working capital improvement from faster cycles',
    risk: 'Risk mitigation value from improved accuracy and compliance',
  },

  form: {
    company: {
      name: { label: 'Company Name', placeholder: 'Acme Corporation' },
      industry: { label: 'Industry', placeholder: 'Select industry...' },
      size: { label: 'Company Size', placeholder: 'Select size...' },
      revenue: { label: 'Annual Revenue', placeholder: '$100,000,000' },
      employees: { label: 'Employee Count', placeholder: '5,000' },
      description: { label: 'Company Description', placeholder: 'Describe core business, products, and market position...' },
      challenges: { label: 'Key Challenges', placeholder: 'Primary operational challenges and strategic priorities...' },
    },
  },

  dashboard: {
    metrics: {
      totalImpact: 'Total Annual Impact',
      avgRoi: 'Average ROI',
      useCaseCount: 'Use Cases Identified',
      criticalCount: 'Critical Priority',
    },
    cta: {
      title: 'Ready to implement?',
      subtitle: 'BlueAlly transforms assessment into execution.',
      primary: 'Schedule Consultation',
      secondary: 'Download Full Report',
    },
    share: {
      title: 'Share This Dashboard',
      subtitle: 'Anyone with the link can view this dashboard for 30 days.',
      copied: 'Link copied!',
      expires: 'Expires',
    },
  },

  pdf: {
    cover: {
      title: 'AI Opportunity Assessment',
      preparedFor: 'Prepared for',
      preparedBy: 'Prepared by BlueAlly AI Consulting',
      date: 'Assessment Date',
    },
    header: {
      confidential: 'Confidential',
    },
    footer: {
      page: 'Page',
      of: 'of',
    },
    executive: {
      title: 'Executive Summary',
      keyFindings: 'Key Findings',
      topOpportunities: 'Top Opportunities',
      recommendation: 'Strategic Recommendation',
    },
  },

  validation: {
    required: 'This field is required',
    minLength: (min: number) => `Minimum ${min} characters`,
    maxLength: (max: number) => `Maximum ${max} characters`,
    invalidEmail: 'Enter a valid email address',
    invalidNumber: 'Enter a valid number',
    invalidUrl: 'Enter a valid URL',
    positive: 'Must be a positive number',
    range: (min: number, max: number) => `Must be between ${min} and ${max}`,
  },
};

export function getCopy(path: string, fallback: string = ''): string {
  return path.split('.').reduce((obj: any, key) => obj?.[key], copy) ?? fallback;
}
