export interface TimeSeriesPoint {
  date: string;
  value: number;
  series?: string;
}

export interface ComparisonItem {
  label: string;
  value: number;
  change?: number;
  color?: string;
}

export interface Milestone {
  date: string;
  title: string;
  description: string;
}

export interface MetricConfig {
  id: string;
  title: string;
  category: string;
  source: string;
  sourceUrl: string;
  refreshFrequency: string;
  description: string;
  chartType: 'area' | 'bar' | 'line' | 'donut' | 'table' | 'timeline' | 'stat';
  unit?: string;
  timeSeries?: TimeSeriesPoint[];
  comparison?: ComparisonItem[];
  milestones?: Milestone[];
  currentValue?: string | number;
  trend?: { value: string; direction: 'up' | 'down' | 'stable' };
}

export interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  metrics: MetricConfig[];
}

export const AI_DASHBOARD_CATEGORIES: CategoryConfig[] = [
  {
    id: 'capability',
    title: 'AI Capability & Advancement',
    description: 'Track model performance, research velocity, and training compute trends',
    icon: 'Brain',
    color: 'purple',
    gradient: 'from-purple-600 to-indigo-600',
    metrics: [
      {
        id: 'sota-benchmarks',
        title: 'SOTA Benchmark Rankings',
        category: 'capability',
        source: 'Papers With Code',
        sourceUrl: 'https://paperswithcode.com/sota',
        refreshFrequency: 'Real-time',
        description: '11,470+ standardized ML benchmarks including MMLU, ImageNet',
        chartType: 'bar',
        comparison: [
          { label: 'GPT-5', value: 92.4, color: '#10b981' },
          { label: 'Claude 4', value: 89.7, color: '#8b5cf6' },
          { label: 'Gemini 2.5', value: 88.2, color: '#3b82f6' },
          { label: 'Llama 4', value: 84.1, color: '#f59e0b' },
          { label: 'Mistral Large', value: 81.5, color: '#ef4444' },
        ]
      },
      {
        id: 'training-compute',
        title: 'Training Compute Growth',
        category: 'capability',
        source: 'Epoch AI',
        sourceUrl: 'https://epoch.ai/data/ai-models',
        refreshFrequency: 'Weekly',
        description: '3,200+ ML models tracking FLOP, parameters, and costs',
        chartType: 'area',
        currentValue: '4.4×',
        trend: { value: 'per year', direction: 'up' },
        timeSeries: [
          { date: '2020', value: 1e20 },
          { date: '2021', value: 4.4e20 },
          { date: '2022', value: 1.9e21 },
          { date: '2023', value: 8.4e21 },
          { date: '2024', value: 3.7e22 },
          { date: '2025', value: 1.6e23 },
        ]
      },
      {
        id: 'arxiv-papers',
        title: 'AI Paper Submissions',
        category: 'capability',
        source: 'arXiv',
        sourceUrl: 'https://arxiv.org/stats/monthly_submissions',
        refreshFrequency: 'Daily',
        description: 'Monthly publications in cs.AI, cs.LG, cs.CL, cs.CV',
        chartType: 'area',
        currentValue: '23 mo',
        trend: { value: 'doubling time', direction: 'up' },
        timeSeries: [
          { date: 'Jan', value: 12400 },
          { date: 'Feb', value: 13200 },
          { date: 'Mar', value: 14800 },
          { date: 'Apr', value: 15100 },
          { date: 'May', value: 16500 },
          { date: 'Jun', value: 17200 },
          { date: 'Jul', value: 18400 },
          { date: 'Aug', value: 19100 },
          { date: 'Sep', value: 20800 },
          { date: 'Oct', value: 21500 },
          { date: 'Nov', value: 22900 },
        ]
      },
      {
        id: 'llm-leaderboard',
        title: 'Open LLM Leaderboard',
        category: 'capability',
        source: 'Hugging Face',
        sourceUrl: 'https://huggingface.co/spaces/open-llm-leaderboard',
        refreshFrequency: 'Daily',
        description: 'Reproducible scores across IFEval, BBH, MATH, GPQA',
        chartType: 'table',
        comparison: [
          { label: 'Qwen2.5-72B', value: 78.4, change: 2.1 },
          { label: 'Llama-3.3-70B', value: 76.8, change: 1.8 },
          { label: 'Mixtral-8x22B', value: 74.2, change: 0.5 },
          { label: 'Yi-34B', value: 71.1, change: -0.3 },
          { label: 'Falcon-180B', value: 68.9, change: 0.2 },
        ]
      }
    ]
  },
  {
    id: 'adoption',
    title: 'Enterprise AI Adoption',
    description: 'Benchmark organizational AI initiatives against industry trends',
    icon: 'Building2',
    color: 'blue',
    gradient: 'from-blue-600 to-cyan-600',
    metrics: [
      {
        id: 'enterprise-adoption',
        title: 'Enterprise Adoption Rate',
        category: 'adoption',
        source: 'McKinsey',
        sourceUrl: 'https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai',
        refreshFrequency: 'Annual',
        description: '1,300-1,500 executives surveyed annually',
        chartType: 'stat',
        currentValue: '72%',
        trend: { value: '+5% YoY', direction: 'up' }
      },
      {
        id: 'genai-usage',
        title: 'GenAI Usage by Function',
        category: 'adoption',
        source: 'McKinsey',
        sourceUrl: 'https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai',
        refreshFrequency: 'Annual',
        description: 'Organizational deployment rates by business function',
        chartType: 'bar',
        comparison: [
          { label: 'Marketing', value: 78, color: '#3b82f6' },
          { label: 'Customer Service', value: 71, color: '#06b6d4' },
          { label: 'Software Dev', value: 68, color: '#8b5cf6' },
          { label: 'Sales', value: 54, color: '#10b981' },
          { label: 'HR', value: 42, color: '#f59e0b' },
          { label: 'Finance', value: 38, color: '#ef4444' },
        ]
      },
      {
        id: 'btos-adoption',
        title: 'US Business AI Usage',
        category: 'adoption',
        source: 'US Census BTOS',
        sourceUrl: 'https://www.census.gov/businessandeconomy/btos',
        refreshFrequency: 'Biweekly',
        description: '1.2 million US firms surveyed',
        chartType: 'area',
        timeSeries: [
          { date: 'Q1 2023', value: 2.8 },
          { date: 'Q2 2023', value: 3.2 },
          { date: 'Q3 2023', value: 3.5 },
          { date: 'Q4 2023', value: 3.8 },
          { date: 'Q1 2024', value: 4.2 },
          { date: 'Q2 2024', value: 4.6 },
          { date: 'Q3 2024', value: 5.0 },
          { date: 'Q4 2024', value: 5.4 },
        ]
      },
      {
        id: 'roi-expectations',
        title: 'ROI Achievement',
        category: 'adoption',
        source: 'Deloitte',
        sourceUrl: 'https://www.deloitte.com/us/en/what-we-do/capabilities/applied-artificial-intelligence',
        refreshFrequency: 'Quarterly',
        description: '2,700+ leaders across 14 countries',
        chartType: 'donut',
        comparison: [
          { label: 'Exceeding', value: 34, color: '#10b981' },
          { label: 'Meeting', value: 40, color: '#3b82f6' },
          { label: 'Below', value: 18, color: '#f59e0b' },
          { label: 'Not Tracking', value: 8, color: '#6b7280' },
        ]
      }
    ]
  },
  {
    id: 'cost',
    title: 'AI Cost & Economics',
    description: 'API pricing, compute costs, and efficiency trends for budget planning',
    icon: 'DollarSign',
    color: 'green',
    gradient: 'from-emerald-600 to-teal-600',
    metrics: [
      {
        id: 'llm-pricing',
        title: 'LLM API Pricing (per 1M tokens)',
        category: 'cost',
        source: 'Multiple Providers',
        sourceUrl: 'https://openai.com/api/pricing/',
        refreshFrequency: 'With releases',
        description: 'Input/Output token pricing for flagship models',
        chartType: 'table',
        comparison: [
          { label: 'GPT-5 (OpenAI)', value: 1.25, change: -80 },
          { label: 'Claude 4.5 Sonnet', value: 3.00, change: -70 },
          { label: 'Gemini 2.5 Pro', value: 1.25, change: -85 },
          { label: 'Llama 3.3 70B', value: 0.80, change: -60 },
          { label: 'Mistral Large', value: 2.00, change: -65 },
        ]
      },
      {
        id: 'inference-costs',
        title: 'Inference Price Decline',
        category: 'cost',
        source: 'Epoch AI',
        sourceUrl: 'https://epoch.ai/data-insights/llm-inference-price-trends',
        refreshFrequency: 'Continuous',
        description: 'Cost to achieve benchmark performance levels',
        chartType: 'area',
        currentValue: '9-900×',
        trend: { value: 'decline/year', direction: 'down' },
        timeSeries: [
          { date: 'Jan 2023', value: 100 },
          { date: 'Apr 2023', value: 72 },
          { date: 'Jul 2023', value: 45 },
          { date: 'Oct 2023', value: 28 },
          { date: 'Jan 2024', value: 18 },
          { date: 'Apr 2024', value: 11 },
          { date: 'Jul 2024', value: 6 },
          { date: 'Oct 2024', value: 3.5 },
          { date: 'Jan 2025', value: 2 },
        ]
      },
      {
        id: 'gpu-pricing',
        title: 'Cloud GPU Pricing (H100)',
        category: 'cost',
        source: 'Multiple Providers',
        sourceUrl: 'https://lambdalabs.com/service/gpu-cloud',
        refreshFrequency: 'Monthly',
        description: 'Hourly rates per H100 GPU across cloud providers',
        chartType: 'bar',
        comparison: [
          { label: 'CoreWeave', value: 2.21, color: '#10b981' },
          { label: 'Lambda Labs', value: 2.49, color: '#22c55e' },
          { label: 'Google Cloud', value: 3.00, color: '#3b82f6' },
          { label: 'AWS P5', value: 3.59, color: '#f59e0b' },
          { label: 'Azure NC H100', value: 3.95, color: '#ef4444' },
        ]
      },
      {
        id: 'model-quality',
        title: 'Quality vs Cost Index',
        category: 'cost',
        source: 'Artificial Analysis',
        sourceUrl: 'https://artificialanalysis.ai',
        refreshFrequency: 'Daily',
        description: '100+ models across price, quality, speed metrics',
        chartType: 'stat',
        currentValue: '500+',
        trend: { value: 'API endpoints tracked', direction: 'stable' }
      }
    ]
  },
  {
    id: 'investment',
    title: 'AI Investment & Funding',
    description: 'Capital flows, funding rounds, and market momentum',
    icon: 'TrendingUp',
    color: 'amber',
    gradient: 'from-amber-500 to-orange-500',
    metrics: [
      {
        id: 'private-investment',
        title: 'Private AI Investment',
        category: 'investment',
        source: 'Stanford HAI',
        sourceUrl: 'https://hai.stanford.edu/ai-index/2025-ai-index-report',
        refreshFrequency: 'Annual',
        description: 'Comprehensive funding data from AI Index Report',
        chartType: 'area',
        currentValue: '$109.1B',
        trend: { value: '+28% YoY', direction: 'up' },
        timeSeries: [
          { date: '2019', value: 38.2 },
          { date: '2020', value: 45.8 },
          { date: '2021', value: 93.5 },
          { date: '2022', value: 78.4 },
          { date: '2023', value: 85.2 },
          { date: '2024', value: 109.1 },
        ]
      },
      {
        id: 'genai-funding',
        title: 'GenAI Funding Share',
        category: 'investment',
        source: 'Stanford HAI',
        sourceUrl: 'https://hai.stanford.edu/ai-index/2024-ai-index-report/economy',
        refreshFrequency: 'Annual',
        description: 'Generative AI portion of total AI investment',
        chartType: 'donut',
        comparison: [
          { label: 'GenAI', value: 33.9, color: '#f59e0b' },
          { label: 'Traditional ML', value: 42.8, color: '#3b82f6' },
          { label: 'Robotics/CV', value: 18.6, color: '#8b5cf6' },
          { label: 'Other AI', value: 13.8, color: '#6b7280' },
        ]
      },
      {
        id: 'geo-distribution',
        title: 'Investment by Region',
        category: 'investment',
        source: 'Stanford HAI',
        sourceUrl: 'https://hai.stanford.edu/ai-index/2025-ai-index-report',
        refreshFrequency: 'Annual',
        description: 'Geographic distribution of AI funding',
        chartType: 'bar',
        comparison: [
          { label: 'United States', value: 109.1, color: '#3b82f6' },
          { label: 'China', value: 9.1, color: '#ef4444' },
          { label: 'United Kingdom', value: 5.2, color: '#8b5cf6' },
          { label: 'Israel', value: 3.8, color: '#10b981' },
          { label: 'Germany', value: 2.4, color: '#f59e0b' },
        ]
      },
      {
        id: 'unicorns',
        title: 'New AI Unicorns',
        category: 'investment',
        source: 'CB Insights',
        sourceUrl: 'https://cbinsights.com/research/report/ai-trends-2024/',
        refreshFrequency: 'Quarterly',
        description: 'Companies reaching $1B+ valuation',
        chartType: 'stat',
        currentValue: '32',
        trend: { value: 'in 2024', direction: 'up' }
      }
    ]
  },
  {
    id: 'talent',
    title: 'AI Talent & Workforce',
    description: 'Labor market signals, skills gaps, and salary benchmarks',
    icon: 'Users',
    color: 'rose',
    gradient: 'from-rose-500 to-pink-500',
    metrics: [
      {
        id: 'job-postings',
        title: 'AI Job Postings Index',
        category: 'talent',
        source: 'Indeed Hiring Lab',
        sourceUrl: 'https://data.indeed.com/',
        refreshFrequency: 'Weekly',
        description: '591 AI-related terms tracked daily',
        chartType: 'area',
        timeSeries: [
          { date: 'Jan', value: 100 },
          { date: 'Feb', value: 108 },
          { date: 'Mar', value: 125 },
          { date: 'Apr', value: 142 },
          { date: 'May', value: 168 },
          { date: 'Jun', value: 195 },
          { date: 'Jul', value: 218 },
          { date: 'Aug', value: 245 },
          { date: 'Sep', value: 278 },
          { date: 'Oct', value: 312 },
          { date: 'Nov', value: 350 },
        ]
      },
      {
        id: 'salaries',
        title: 'Median AI Salaries',
        category: 'talent',
        source: 'BLS',
        sourceUrl: 'https://www.bls.gov/oes/tables.htm',
        refreshFrequency: 'Annual',
        description: 'Official US employment stats for 800+ occupations',
        chartType: 'bar',
        comparison: [
          { label: 'ML Engineer', value: 158900, color: '#8b5cf6' },
          { label: 'Data Scientist', value: 134870, color: '#3b82f6' },
          { label: 'AI Researcher', value: 145200, color: '#10b981' },
          { label: 'Data Engineer', value: 118500, color: '#f59e0b' },
          { label: 'Data Analyst', value: 103500, color: '#6b7280' },
        ]
      },
      {
        id: 'developer-tools',
        title: 'AI Tool Adoption',
        category: 'talent',
        source: 'Stack Overflow',
        sourceUrl: 'https://survey.stackoverflow.co/2024/',
        refreshFrequency: 'Annual',
        description: '49,000-65,000 developers surveyed',
        chartType: 'stat',
        currentValue: '84%',
        trend: { value: 'using/planning AI tools', direction: 'up' }
      },
      {
        id: 'skills-growth',
        title: 'AI Skills on Profiles',
        category: 'talent',
        source: 'LinkedIn',
        sourceUrl: 'https://economicgraph.linkedin.com/workforce-data',
        refreshFrequency: 'Monthly',
        description: 'Professional network skills analysis',
        chartType: 'stat',
        currentValue: '+140%',
        trend: { value: 'since 2022', direction: 'up' }
      }
    ]
  },
  {
    id: 'infrastructure',
    title: 'AI Infrastructure',
    description: 'Hardware capacity, cloud scaling, and compute constraints',
    icon: 'Server',
    color: 'slate',
    gradient: 'from-slate-600 to-zinc-600',
    metrics: [
      {
        id: 'nvidia-revenue',
        title: 'NVIDIA Data Center Revenue',
        category: 'infrastructure',
        source: 'NVIDIA IR',
        sourceUrl: 'https://investor.nvidia.com/financial-info/financial-reports/',
        refreshFrequency: 'Quarterly',
        description: '~80% AI chip market share',
        chartType: 'area',
        currentValue: '$51.2B',
        trend: { value: '+66% YoY', direction: 'up' },
        timeSeries: [
          { date: 'Q1 FY24', value: 14.5 },
          { date: 'Q2 FY24', value: 18.4 },
          { date: 'Q3 FY24', value: 22.6 },
          { date: 'Q4 FY24', value: 27.4 },
          { date: 'Q1 FY25', value: 35.1 },
          { date: 'Q2 FY25', value: 42.4 },
          { date: 'Q3 FY25', value: 51.2 },
        ]
      },
      {
        id: 'supercomputers',
        title: 'Top Supercomputer Performance',
        category: 'infrastructure',
        source: 'Top500',
        sourceUrl: 'https://www.top500.org/',
        refreshFrequency: 'Bi-annual',
        description: 'World\'s 500 most powerful systems',
        chartType: 'stat',
        currentValue: '1.74 EF/s',
        trend: { value: 'El Capitan (June 2025)', direction: 'up' }
      },
      {
        id: 'energy-demand',
        title: 'Data Center Energy Demand',
        category: 'infrastructure',
        source: 'IEA',
        sourceUrl: 'https://www.iea.org/reports/energy-and-ai',
        refreshFrequency: 'Annual',
        description: 'Global projections with AI breakdowns',
        chartType: 'area',
        timeSeries: [
          { date: '2024', value: 415 },
          { date: '2025', value: 485 },
          { date: '2026', value: 565 },
          { date: '2027', value: 660 },
          { date: '2028', value: 770 },
          { date: '2029', value: 855 },
          { date: '2030', value: 945 },
        ]
      },
      {
        id: 'ai-energy-share',
        title: 'AI Share of DC Energy',
        category: 'infrastructure',
        source: 'IEA',
        sourceUrl: 'https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai',
        refreshFrequency: 'Annual',
        description: 'AI portion growing from 15% to 35-50%',
        chartType: 'donut',
        comparison: [
          { label: 'AI Workloads', value: 35, color: '#8b5cf6' },
          { label: 'Traditional', value: 45, color: '#3b82f6' },
          { label: 'Storage', value: 12, color: '#10b981' },
          { label: 'Cooling', value: 8, color: '#6b7280' },
        ]
      }
    ]
  },
  {
    id: 'regulation',
    title: 'AI Regulation & Policy',
    description: 'Regulatory developments and compliance requirements',
    icon: 'Scale',
    color: 'indigo',
    gradient: 'from-indigo-600 to-violet-600',
    metrics: [
      {
        id: 'policy-initiatives',
        title: 'Global AI Policy Initiatives',
        category: 'regulation',
        source: 'OECD AI Observatory',
        sourceUrl: 'https://oecd.ai/en/dashboards/overview',
        refreshFrequency: 'Continuous',
        description: '1,000+ initiatives from 70+ countries',
        chartType: 'stat',
        currentValue: '1,000+',
        trend: { value: 'active policies', direction: 'up' }
      },
      {
        id: 'eu-ai-act',
        title: 'EU AI Act Timeline',
        category: 'regulation',
        source: 'EU AI Act',
        sourceUrl: 'https://artificialintelligenceact.eu/implementation-timeline/',
        refreshFrequency: 'Ongoing',
        description: 'World\'s first horizontal AI regulation',
        chartType: 'timeline',
        milestones: [
          { date: 'Aug 2024', title: 'Entry into Force', description: 'Act officially entered into force' },
          { date: 'Feb 2025', title: 'Prohibitions Apply', description: 'Banned practices enforced' },
          { date: 'Aug 2025', title: 'GPAI Rules', description: 'General-purpose AI obligations' },
          { date: 'Aug 2026', title: 'Most Provisions', description: 'Majority of rules apply' },
          { date: 'Aug 2027', title: 'Full Application', description: 'All provisions enforced' },
        ]
      },
      {
        id: 'ai-patents',
        title: 'AI Patent Filings',
        category: 'regulation',
        source: 'USPTO',
        sourceUrl: 'https://www.uspto.gov/ip-policy/economic-research/research-datasets/',
        refreshFrequency: 'Periodic',
        description: '13.2 million patents classified (1976-2023)',
        chartType: 'area',
        timeSeries: [
          { date: '2018', value: 28500 },
          { date: '2019', value: 35200 },
          { date: '2020', value: 42800 },
          { date: '2021', value: 52400 },
          { date: '2022', value: 64100 },
          { date: '2023', value: 78500 },
        ]
      },
      {
        id: 'countries-with-strategy',
        title: 'National AI Strategies',
        category: 'regulation',
        source: 'OECD',
        sourceUrl: 'https://oecd.ai/en/dashboards/national',
        refreshFrequency: 'Continuous',
        description: 'Countries with formal AI strategies',
        chartType: 'stat',
        currentValue: '70+',
        trend: { value: 'countries', direction: 'up' }
      }
    ]
  }
];

export const EXECUTIVE_METRICS = [
  { 
    id: 'adoption-rate', 
    label: 'Enterprise AI Adoption', 
    value: '72%', 
    change: '+5%',
    trend: 'up' as const,
    source: 'McKinsey 2024'
  },
  { 
    id: 'private-investment', 
    label: 'Private AI Investment', 
    value: '$109.1B', 
    change: '+28%',
    trend: 'up' as const,
    source: 'Stanford HAI'
  },
  { 
    id: 'inference-decline', 
    label: 'Inference Cost Decline', 
    value: '90%',
    change: 'per year',
    trend: 'down' as const,
    source: 'Epoch AI'
  },
  { 
    id: 'genai-funding', 
    label: 'GenAI Share of Funding', 
    value: '48%', 
    change: '+12%',
    trend: 'up' as const,
    source: 'Crunchbase'
  },
  { 
    id: 'developer-adoption', 
    label: 'Developers Using AI', 
    value: '84%', 
    change: '+18%',
    trend: 'up' as const,
    source: 'Stack Overflow'
  },
  { 
    id: 'roi-meeting', 
    label: 'Meeting ROI Goals', 
    value: '74%', 
    change: '+8%',
    trend: 'up' as const,
    source: 'Deloitte Q4'
  },
];
