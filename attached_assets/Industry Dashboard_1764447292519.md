# AI Trends Dashboard Specification: 24 Key Metrics from Free Public Sources

Enterprise leaders seeking to track AI developments can build a meaningful dashboard using **24 validated, free, publicly available metrics** across seven categories. This specification identifies the most reliable data sources, their exact URLs, update frequencies, and practical accessibility for dashboard integration.

## The best free sources for enterprise AI tracking

Three sources stand out as foundational: **Stanford HAI's AI Index** provides the most comprehensive annual benchmark across adoption, investment, talent, and capabilities. **Epoch AI** offers the best freely downloadable data on AI advancement and costs with weekly updates. **Indeed Hiring Lab** delivers the only truly machine-readable, regularly-updated employment data via GitHub. These should form the core of any enterprise AI dashboard, supplemented by category-specific sources.

---

## Category 1: AI capability and advancement metrics

Tracking model performance and research velocity helps enterprises understand when AI capabilities cross thresholds relevant to their use cases.

### Metric 1: Papers With Code SOTA Benchmark Rankings
**Definition:** State-of-the-art model performance scores across **11,470+ standardized ML benchmarks** including MMLU, ImageNet, and task-specific leaderboards.

| Attribute | Details |
|-----------|---------|
| Source URL | https://paperswithcode.com/sota |
| Update frequency | Real-time (community-maintained) |
| Data format | Python API (`pip install paperswithcode-client`) and JSON |
| Historical data | Full progress graphs per benchmark |
| Limitations | Rate limits apply; some leaderboards manually maintained |

### Metric 2: Hugging Face Open LLM Leaderboard
**Definition:** Reproducible benchmark scores for open-source language models using standardized evaluation harnesses, covering IFEval, BBH, MATH, GPQA, MUSR, and MMLU-PRO.

| Attribute | Details |
|-----------|---------|
| Source URL | https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard |
| Results dataset | https://huggingface.co/datasets/open-llm-leaderboard/results |
| Update frequency | Daily (real-time model submissions) |
| Data format | Python API via `huggingface_hub` library |
| Historical data | Limited to current snapshot |
| Limitations | 30-day rolling window for download stats; no historical time-series |

### Metric 3: Epoch AI Training Compute Trends
**Definition:** Database of **3,200+ ML models** tracking training compute (FLOP), parameter counts, dataset sizes, and training costs—the most comprehensive free dataset on AI capability growth.

| Attribute | Details |
|-----------|---------|
| Source URL | https://epoch.ai/data/ai-models |
| CSV download | https://epoch.ai/data/all_ai_models.csv |
| Update frequency | Weekly (automated + manual monitoring) |
| Data format | Direct CSV download, Creative Commons BY license |
| Historical data | 1952-present (systematic coverage from 2010) |
| Key insight | Training compute grows **4.4× per year** since 2010 |

### Metric 4: arXiv AI Paper Submissions
**Definition:** Monthly publication volumes in AI-related categories (cs.AI, cs.LG, cs.CL, cs.CV) showing research activity trends.

| Attribute | Details |
|-----------|---------|
| Statistics URL | https://arxiv.org/stats/monthly_submissions |
| Kaggle dataset | https://www.kaggle.com/datasets/Cornell-University/arxiv (1.7M+ papers) |
| Update frequency | Daily submissions; Kaggle dataset weekly |
| Data format | Kaggle JSON download; OAI-PMH bulk access |
| Historical data | Complete back to 1991 |
| Key insight | AI papers doubling every ~23 months |

---

## Category 2: Enterprise AI adoption metrics

Understanding adoption rates across industries and company sizes helps benchmark internal AI initiatives.

### Metric 5: McKinsey State of AI Survey
**Definition:** Annual survey of **1,300-1,500 executives** tracking organizational AI adoption rates, functions deployed, and investment intentions.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai |
| Update frequency | Annual (May/June) |
| Data format | PDF report, interactive web exhibits |
| Historical data | 2017-present (8 annual surveys) |
| Key metrics | 72% adoption rate (2024); 65% using GenAI; 67% increasing investment |
| Limitations | Self-reported; skews toward larger organizations; no raw data export |

### Metric 6: US Census Bureau Business Trends Survey (BTOS)
**Definition:** The most rigorous government measure of AI adoption across **1.2 million US firms**, with biweekly updates.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.census.gov/businessandeconomy/btos |
| Data tables | https://www.census.gov/library/working-papers/2024/adrm/CES-WP-24-16.html |
| Update frequency | Biweekly survey |
| Data format | Downloadable web tables, PDF |
| Historical data | 2023-present (AI questions) |
| Key metrics | 3.8-5.4% of businesses using AI; ~13% of large firms (250+ employees) |

### Metric 7: Deloitte State of GenAI in Enterprise
**Definition:** Quarterly survey of **2,700+ leaders across 14 countries** tracking ROI metrics, deployment rates, and industry-specific adoption.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.deloitte.com/us/en/what-we-do/capabilities/applied-artificial-intelligence/content/state-of-generative-ai-in-enterprise.html |
| Industry cuts | https://www.deloitte.com/us/en/what-we-do/capabilities/applied-artificial-intelligence/articles/stateofai-industry-cuts.html |
| Update frequency | Quarterly (Q1-Q4 reports) |
| Data format | Downloadable PDF, web summaries |
| Historical data | 2018-present |
| Key metrics | 74% meeting/exceeding ROI expectations; 26% heavily investing in agentic AI |

---

## Category 3: AI cost and economics metrics

Tracking API pricing, compute costs, and efficiency trends informs build-vs-buy decisions and budget planning.

### Metric 8: LLM API Pricing (Multi-Provider)
**Definition:** Per-token pricing for major LLM APIs, updated with each model release.

| Provider | Pricing URL | Current Flagship (Nov 2025) |
|----------|-------------|----------------------------|
| OpenAI | https://openai.com/api/pricing/ | GPT-5: $1.25/$10 per 1M tokens |
| Anthropic | https://docs.claude.com/en/docs/about-claude/pricing | Claude Sonnet 4.5: $3/$15 per 1M tokens |
| Google | https://ai.google.dev/gemini-api/docs/pricing | Gemini 2.5 Pro: $1.25/$10 per 1M tokens |
| AWS Bedrock | https://aws.amazon.com/bedrock/pricing/ | Multi-model marketplace |

**Update frequency:** Changes with model releases (several times per year)
**Historical trend:** API prices declining **80-90% annually** for equivalent capability
**Limitation:** No historical archive maintained; requires manual tracking

### Metric 9: Artificial Analysis LLM Comparison
**Definition:** Real-time comparison of **100+ AI models** across price, quality, speed, and latency from **500+ API endpoints**.

| Attribute | Details |
|-----------|---------|
| Source URL | https://artificialanalysis.ai |
| Models page | https://artificialanalysis.ai/models |
| Providers leaderboard | https://artificialanalysis.ai/leaderboards/providers |
| Update frequency | Daily/real-time |
| Data format | Interactive web dashboard |
| Key metrics | Quality Index, blended price, tokens/second, time-to-first-token |
| Limitations | No bulk data export |

### Metric 10: Epoch AI Inference Price Trends
**Definition:** Historical tracking of the **cost to achieve benchmark performance levels**, showing inference economics improvement.

| Attribute | Details |
|-----------|---------|
| Source URL | https://epoch.ai/data-insights/llm-inference-price-trends |
| Update frequency | Continuously updated |
| Data format | Interactive charts, methodology documentation |
| Historical data | 2023-present |
| Key insight | Inference prices falling **9× to 900× per year** depending on benchmark |

### Metric 11: Cloud GPU Pricing Tracker
**Definition:** Hourly rates for GPU instances across major cloud providers.

| Provider | H100 Price (2025) | URL |
|----------|-------------------|-----|
| AWS EC2 P5 | ~$3.59-3.90/GPU-hr | https://aws.amazon.com/ec2/instance-types/ |
| Google Cloud | ~$3.00/GPU-hr | https://cloud.google.com/vertex-ai/generative-ai/pricing |
| Lambda Labs | ~$2.49-2.99/GPU-hr | https://lambdalabs.com/service/gpu-cloud |
| CoreWeave | ~$2.21-4.25/GPU-hr | https://www.coreweave.com/pricing |

**Historical trend:** H100 prices dropped from ~$7.50 (2023) to ~$3.00 (2025)—**60% reduction**

---

## Category 4: AI investment and funding metrics

Tracking capital flows reveals market momentum and competitive dynamics.

### Metric 12: Stanford HAI Investment Data
**Definition:** Comprehensive annual data on private AI investment, funding rounds, and geographic distribution—the most authoritative free source.

| Attribute | Details |
|-----------|---------|
| Source URL | https://hai.stanford.edu/ai-index/2025-ai-index-report |
| Economy chapter | https://hai.stanford.edu/ai-index/2024-ai-index-report/economy |
| Update frequency | Annual (April release) |
| Data format | 500+ page PDF, web chapters, some CSV appendices |
| Historical data | 2013-present |
| Key 2024 metrics | US: $109.1B private investment; GenAI: $33.9B; US 12× China investment |

### Metric 13: Crunchbase News AI Funding
**Definition:** Weekly and quarterly tracking of AI startup funding rounds from the leading startup database.

| Attribute | Details |
|-----------|---------|
| AI section | https://news.crunchbase.com/sections/ai/ |
| Weekly top 10 | https://news.crunchbase.com/venture/ |
| Update frequency | Weekly (deals), quarterly (market reports) |
| Data format | Web articles with charts |
| Key insight | 48% of global VC funding went to AI in 2025 |
| Limitations | Granular data requires Pro subscription ($49/mo); free tier is summaries only |

### Metric 14: CB Insights State of AI (Summaries)
**Definition:** Quarterly research reports with key AI investment statistics and market analysis.

| Attribute | Details |
|-----------|---------|
| Source URL | https://cbinsights.com/research/report/ai-trends-2024/ |
| Update frequency | Quarterly |
| Data format | TL;DR summaries free; full reports paywalled |
| Key metrics | $100.4B AI funding in 2024; 32 new AI unicorns; 74% early-stage deals |
| Limitations | Full data requires enterprise subscription |

---

## Category 5: AI talent and workforce metrics

Labor market signals indicate skills gaps, salary benchmarks, and talent availability.

### Metric 15: Indeed Hiring Lab AI Job Postings
**Definition:** Daily job posting index with AI-specific keyword tracking across **591 AI-related terms**—the only fully downloadable employment dataset.

| Attribute | Details |
|-----------|---------|
| Data portal | https://data.indeed.com/ |
| GitHub (raw CSV) | https://github.com/hiring-lab/job_postings_tracker |
| FRED integration | https://fred.stlouisfed.org/series/IHLIDXUS |
| Update frequency | Weekly (daily granularity) |
| Data format | CSV, JSON (Creative Commons 4.0 license) |
| Historical data | February 2020-present |
| Key metrics | 2% AI-related postings; GenAI postings up 3.5× YoY |

### Metric 16: BLS Occupational Employment Statistics
**Definition:** Official US employment counts and wages for **800+ occupations** including data scientists and computer researchers.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.bls.gov/oes/tables.htm |
| Update frequency | Annual (May data released following spring) |
| Data format | Downloadable XLS/CSV |
| Historical data | 1988-present |
| Key occupations | Data Scientists (15-2051): 245,900 jobs, $103,500 median; Database Architects: $134,870 median |
| Limitations | 12-18 month data lag; no "ML Engineer" occupation code |

### Metric 17: Stack Overflow Developer Survey
**Definition:** Annual survey of **49,000-65,000 developers** tracking AI tool adoption, sentiment, and technology usage.

| Attribute | Details |
|-----------|---------|
| Source URL | https://survey.stackoverflow.co/2024/ |
| Raw data download | https://survey.stackoverflow.co/ |
| Update frequency | Annual (May survey, summer release) |
| Data format | **Raw CSV downloadable** for analysis |
| Historical data | 15 years of surveys |
| Key metrics | 84% using/planning AI tools (2025); 33% trust AI output; ChatGPT 82% usage |

### Metric 18: LinkedIn Economic Graph Reports
**Definition:** Monthly workforce reports and annual AI skills analysis from the world's largest professional network.

| Attribute | Details |
|-----------|---------|
| Workforce data | https://economicgraph.linkedin.com/workforce-data |
| Work Change Report | https://economicgraph.linkedin.com/research/work-change-report |
| Update frequency | Monthly (US workforce); annual (AI reports) |
| Data format | PDF reports, web visualizations |
| Key metrics | AI skills on profiles up 140% since 2022; AI hiring up 323% over 8 years |
| Limitations | No bulk data download; reports only |

---

## Category 6: AI infrastructure metrics

Hardware capacity and cloud infrastructure trends indicate AI scaling constraints and opportunities.

### Metric 19: NVIDIA Data Center Revenue
**Definition:** Quarterly financial data serving as the primary proxy for AI GPU market demand—NVIDIA controls **~80% of AI chip market**.

| Attribute | Details |
|-----------|---------|
| Investor relations | https://investor.nvidia.com/financial-info/financial-reports/ |
| Update frequency | Quarterly (fiscal year ends January) |
| Data format | SEC filings, press releases, earnings transcripts |
| Historical data | Full history via SEC EDGAR |
| Q3 FY26 metrics | $57B revenue; $51.2B Data Center segment (+66% YoY) |
| Limitations | Does not break out AI-specific GPU units |

### Metric 20: Top500 Supercomputer Rankings
**Definition:** Bi-annual ranking of world's **500 most powerful systems** with performance benchmarks, power efficiency, and architecture details.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.top500.org/ |
| Latest list | https://www.top500.org/lists/top500/list/2025/06/ |
| GREEN500 | https://top500.org/lists/green500/ |
| Update frequency | Bi-annual (June ISC, November SC conferences) |
| Data format | **CSV/Excel export available**; full API access |
| Historical data | Complete archive since June 1993 |
| Top system | El Capitan: 1.742 EFlop/s (June 2025) |

### Metric 21: IEA Data Center Energy Consumption
**Definition:** Global projections of data center electricity demand with AI-specific breakdowns from the International Energy Agency.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.iea.org/reports/energy-and-ai |
| AI energy demand | https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai |
| Update frequency | Annual |
| Data format | PDF reports, interactive web visualizations |
| Key projections | 2024: 415 TWh → 2030: 945 TWh; AI share growing from 15% to 35-50% |
| Limitations | All figures are estimates; no standardized reporting globally |

---

## Category 7: AI regulation and policy metrics

Tracking regulatory developments helps enterprises prepare for compliance requirements.

### Metric 22: OECD AI Policy Observatory
**Definition:** Live database of **1,000+ AI policy initiatives** from **70+ countries** with searchable national strategies, regulations, and governance frameworks.

| Attribute | Details |
|-----------|---------|
| Main dashboard | https://oecd.ai/en/dashboards/overview |
| National tracker | https://oecd.ai/en/dashboards/national |
| Live data | https://oecd.ai/en/data |
| Update frequency | Continuous (live database) |
| Data format | Interactive web dashboards |
| Limitations | No bulk CSV export; dashboard browsing only |

### Metric 23: EU AI Act Implementation Timeline
**Definition:** Comprehensive tracking of enforcement dates and compliance requirements for the world's first horizontal AI regulation.

| Attribute | Details |
|-----------|---------|
| Implementation tracker | https://artificialintelligenceact.eu/implementation-timeline/ |
| Full act text | https://www.euaiact.com/implementation-timeline |
| National plans | https://artificialintelligenceact.eu/national-implementation-plans/ |
| Update frequency | Ongoing as deadlines approach |
| Data format | Web timelines, PDF documents |
| Key dates | Feb 2025: Prohibitions apply; Aug 2026: Most provisions; Aug 2027: Full application |

### Metric 24: USPTO AI Patent Dataset
**Definition:** Machine learning-classified dataset identifying AI-related content across **13.2 million US patents** (1976-2023) with 8 technology subcategories.

| Attribute | Details |
|-----------|---------|
| Source URL | https://www.uspto.gov/ip-policy/economic-research/research-datasets/artificial-intelligence-patent-dataset |
| Download portal | https://developer.uspto.gov/product/artificial-intelligence-patent-dataset-stata-dta-and-ms-excel-csv |
| Update frequency | Periodic (AIPD 2023 latest version) |
| Data format | **Stata (.dta), CSV/TSV** (1+ GB download) |
| Historical data | 1976-2023 |
| Limitations | Model predictions; definition of AI differs from other datasets |

---

## Implementation recommendations for dashboard construction

**Tier 1 sources (automated data feeds possible):**
- Indeed Hiring Lab (GitHub CSV)
- Epoch AI datasets (direct CSV links)
- Stack Overflow survey (annual CSV download)
- USPTO AIPD (bulk download)
- Top500 (CSV export/API)
- BLS OEWS (Excel downloads)

**Tier 2 sources (web scraping or manual tracking required):**
- Papers With Code (Python API available)
- Hugging Face (Python API available)
- Artificial Analysis (no API, web dashboard)
- LLM API pricing pages (manual monitoring)

**Tier 3 sources (PDF report extraction):**
- Stanford HAI AI Index (annual PDF)
- McKinsey/Deloitte surveys (periodic PDFs)
- IEA reports (annual PDFs)

**Recommended refresh cadence:**
| Frequency | Metrics |
|-----------|---------|
| Daily/Weekly | LLM leaderboards, API pricing, job postings |
| Monthly | LinkedIn workforce, cloud pricing |
| Quarterly | Investment tracking, NVIDIA financials, adoption surveys |
| Annually | Stanford HAI Index, BLS employment, arXiv trends |

This specification enables construction of a comprehensive AI trends dashboard entirely from free, publicly available sources, providing enterprise leaders with actionable intelligence across the full AI landscape without requiring expensive analyst subscriptions.