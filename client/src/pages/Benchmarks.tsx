import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  TrendingUp, 
  TrendingDown,
  Users, 
  DollarSign, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  Building2,
  Server,
  Scale,
  ExternalLink,
  RefreshCw,
  Zap,
  Sparkles,
  BarChart3,
  ChevronRight,
  Info,
  Clock,
  Globe
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  Legend
} from "recharts";
import { AI_DASHBOARD_CATEGORIES, EXECUTIVE_METRICS, type CategoryConfig, type MetricConfig } from "@/lib/ai-metrics-data";

const CATEGORY_ICONS: Record<string, any> = {
  Brain, Building2, DollarSign, TrendingUp, Users, Server, Scale
};

const ICON_MAP: Record<string, any> = {
  'Brain': Brain,
  'Building2': Building2,
  'DollarSign': DollarSign,
  'TrendingUp': TrendingUp,
  'Users': Users,
  'Server': Server,
  'Scale': Scale,
};

export default function Benchmarks() {
  const [activeCategory, setActiveCategory] = useState('capability');
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100">
        <div className="container mx-auto max-w-7xl px-4 py-6 md:py-10">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 bg-clip-text text-transparent">
                AI Trends Dashboard
              </h1>
            </div>
            <p className="text-slate-600 mt-2 max-w-2xl">
              24 validated metrics from free public sources tracking AI capability, adoption, costs, investment, talent, infrastructure, and regulation.
            </p>
          </motion.div>

          <ExecutiveOverview />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-10"
          >
            <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
              <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-6">
                {AI_DASHBOARD_CATEGORIES.map((cat) => {
                  const Icon = ICON_MAP[cat.icon] || Brain;
                  return (
                    <TabsTrigger
                      key={cat.id}
                      value={cat.id}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-300 data-[state=active]:border-transparent data-[state=active]:shadow-lg ${
                        activeCategory === cat.id
                          ? `bg-gradient-to-r ${cat.gradient} text-white`
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                      data-testid={`tab-${cat.id}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-medium text-sm hidden sm:inline">{cat.title.split(' ').slice(0, 2).join(' ')}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <AnimatePresence mode="wait">
                {AI_DASHBOARD_CATEGORIES.map((category) => (
                  <TabsContent key={category.id} value={category.id} className="mt-0">
                    <CategorySection category={category} />
                  </TabsContent>
                ))}
              </AnimatePresence>
            </Tabs>
          </motion.div>

          <DataSources />
        </div>
      </div>
    </Layout>
  );
}

function ExecutiveOverview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold text-slate-800">Executive Overview</h2>
        <Badge variant="outline" className="ml-2 text-xs">Live Metrics</Badge>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {EXECUTIVE_METRICS.map((metric, index) => (
          <motion.div
            key={metric.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + index * 0.05, duration: 0.3 }}
          >
            <Card className="relative overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 group bg-white">
              <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-white opacity-80" />
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${
                metric.trend === 'up' ? 'from-emerald-500 to-teal-500' : 
                metric.trend === 'down' ? 'from-blue-500 to-cyan-500' : 
                'from-slate-400 to-slate-500'
              }`} />
              <CardContent className="relative p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500 leading-tight line-clamp-2">
                    {metric.label}
                  </span>
                  <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    metric.trend === 'up' ? 'bg-emerald-100 text-emerald-700' :
                    metric.trend === 'down' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {metric.trend === 'up' ? <ArrowUpRight className="h-2.5 w-2.5" /> :
                     metric.trend === 'down' ? <ArrowDownRight className="h-2.5 w-2.5" /> : null}
                    {metric.change}
                  </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
                  {metric.value}
                </div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Globe className="h-2.5 w-2.5" />
                  {metric.source}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function CategorySection({ category }: { category: CategoryConfig }) {
  const Icon = ICON_MAP[category.icon] || Brain;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`border-0 shadow-lg overflow-hidden mb-6`}>
        <div className={`h-2 bg-gradient-to-r ${category.gradient}`} />
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${category.gradient} shadow-lg`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">{category.title}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {category.metrics.map((metric, index) => (
          <motion.div
            key={metric.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
          >
            <MetricCard metric={metric} gradient={category.gradient} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function MetricCard({ metric, gradient }: { metric: MetricConfig; gradient: string }) {
  return (
    <Card className="h-full border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold text-slate-800 group-hover:text-slate-900 transition-colors">
              {metric.title}
            </CardTitle>
            <CardDescription className="text-xs mt-1 line-clamp-1">
              {metric.description}
            </CardDescription>
          </div>
          {metric.currentValue && (
            <div className="text-right ml-4">
              <div className="text-2xl font-bold text-slate-900">{metric.currentValue}</div>
              {metric.trend && (
                <div className={`text-xs font-medium flex items-center justify-end gap-1 ${
                  metric.trend.direction === 'up' ? 'text-emerald-600' :
                  metric.trend.direction === 'down' ? 'text-blue-600' : 'text-slate-500'
                }`}>
                  {metric.trend.direction === 'up' && <TrendingUp className="h-3 w-3" />}
                  {metric.trend.direction === 'down' && <TrendingDown className="h-3 w-3" />}
                  {metric.trend.value}
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[180px]">
          {metric.chartType === 'area' && metric.timeSeries && (
            <AreaChartViz data={metric.timeSeries} gradient={gradient} />
          )}
          {metric.chartType === 'bar' && metric.comparison && (
            <BarChartViz data={metric.comparison} />
          )}
          {metric.chartType === 'donut' && metric.comparison && (
            <DonutChartViz data={metric.comparison} />
          )}
          {metric.chartType === 'table' && metric.comparison && (
            <ComparisonTable data={metric.comparison} showChange={metric.id.includes('pricing') || metric.id.includes('leaderboard')} />
          )}
          {metric.chartType === 'stat' && (
            <StatDisplay metric={metric} />
          )}
          {metric.chartType === 'timeline' && metric.milestones && (
            <TimelineViz milestones={metric.milestones} />
          )}
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-slate-50">
              <Clock className="h-2.5 w-2.5 mr-1" />
              {metric.refreshFrequency}
            </Badge>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <a 
                href={metric.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 transition-colors"
              >
                {metric.source}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">View source data</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}

function AreaChartViz({ data, gradient }: { data: any[]; gradient: string }) {
  const gradientId = `area-gradient-${Math.random().toString(36).substr(2, 9)}`;
  const isDescending = data.length >= 2 && data[0].value > data[data.length - 1].value;
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isDescending ? "#3b82f6" : "#8b5cf6"} stopOpacity={0.4} />
            <stop offset="95%" stopColor={isDescending ? "#3b82f6" : "#8b5cf6"} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis 
          dataKey="date" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 10, fill: '#64748b' }}
          interval="preserveStartEnd"
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 10, fill: '#64748b' }}
          width={40}
          tickFormatter={(value) => {
            if (value >= 1e23) return `${(value / 1e23).toFixed(0)}e23`;
            if (value >= 1e21) return `${(value / 1e21).toFixed(0)}e21`;
            if (value >= 1e9) return `${(value / 1e9).toFixed(0)}B`;
            if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
            if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
            return value;
          }}
        />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            fontSize: '12px'
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={isDescending ? "#3b82f6" : "#8b5cf6"}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarChartViz({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
        <YAxis 
          type="category" 
          dataKey="label" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fontSize: 10, fill: '#334155' }}
          width={55}
        />
        <RechartsTooltip
          contentStyle={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            fontSize: '12px'
          }}
        />
        <Bar 
          dataKey="value" 
          radius={[0, 4, 4, 0]}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || '#8b5cf6'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DonutChartViz({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={2}
          dataKey="value"
          nameKey="label"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color || '#8b5cf6'} />
          ))}
        </Pie>
        <RechartsTooltip
          contentStyle={{
            backgroundColor: 'white',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            fontSize: '12px'
          }}
          formatter={(value: any, name: any) => [`${value}%`, name]}
        />
        <Legend 
          verticalAlign="middle" 
          align="right"
          layout="vertical"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '10px', paddingLeft: '10px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ComparisonTable({ data, showChange }: { data: any[]; showChange?: boolean }) {
  return (
    <div className="space-y-2 h-full overflow-auto">
      {data.map((item, index) => (
        <div 
          key={index}
          className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 w-4">#{index + 1}</span>
            <span className="text-sm font-medium text-slate-700">{item.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">
              {typeof item.value === 'number' && item.value >= 1000 
                ? `$${(item.value / 1000).toFixed(0)}K` 
                : item.value < 10 
                  ? `$${item.value.toFixed(2)}`
                  : item.value.toFixed(1)}
            </span>
            {showChange && item.change !== undefined && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                item.change < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {item.change > 0 ? '+' : ''}{item.change}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatDisplay({ metric }: { metric: MetricConfig }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full blur-xl" />
        <div className="relative text-5xl md:text-6xl font-bold bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800 bg-clip-text text-transparent">
          {metric.currentValue}
        </div>
      </div>
      {metric.trend && (
        <div className={`flex items-center gap-1 text-sm font-medium ${
          metric.trend.direction === 'up' ? 'text-emerald-600' :
          metric.trend.direction === 'down' ? 'text-blue-600' : 'text-slate-500'
        }`}>
          {metric.trend.direction === 'up' && <TrendingUp className="h-4 w-4" />}
          {metric.trend.direction === 'down' && <TrendingDown className="h-4 w-4" />}
          {metric.trend.value}
        </div>
      )}
    </div>
  );
}

function TimelineViz({ milestones }: { milestones: any[] }) {
  return (
    <div className="h-full overflow-auto">
      <div className="relative pl-6">
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-purple-500 via-blue-500 to-emerald-500" />
        {milestones.map((milestone, index) => (
          <div key={index} className="relative mb-3 last:mb-0">
            <div className={`absolute left-[-18px] top-1 w-3 h-3 rounded-full border-2 border-white shadow ${
              index === 0 ? 'bg-purple-500' : 
              index === milestones.length - 1 ? 'bg-emerald-500' : 'bg-blue-500'
            }`} />
            <div className="bg-slate-50 rounded-lg p-2.5 hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                  {milestone.date}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-800">{milestone.title}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{milestone.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataSources() {
  const tiers = [
    { 
      name: 'Automated Feeds',
      description: 'Direct CSV/API access',
      sources: ['Indeed Hiring Lab', 'Epoch AI', 'Stack Overflow', 'USPTO', 'Top500', 'BLS'],
      color: 'emerald'
    },
    { 
      name: 'API Available',
      description: 'Python APIs or scraping',
      sources: ['Papers With Code', 'Hugging Face', 'Artificial Analysis', 'Provider Pricing'],
      color: 'blue'
    },
    { 
      name: 'Manual Tracking',
      description: 'PDF reports extraction',
      sources: ['Stanford HAI', 'McKinsey', 'Deloitte', 'IEA Reports'],
      color: 'amber'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      className="mt-12"
    >
      <div className="flex items-center gap-2 mb-4">
        <Info className="h-5 w-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-800">Data Sources by Accessibility</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier, index) => (
          <Card key={tier.name} className="border-slate-200">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full bg-${tier.color}-500`} />
                <CardTitle className="text-sm">{tier.name}</CardTitle>
              </div>
              <CardDescription className="text-xs">{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {tier.sources.map((source) => (
                  <Badge 
                    key={source} 
                    variant="outline" 
                    className={`text-[10px] bg-${tier.color}-50 border-${tier.color}-200 text-${tier.color}-700`}
                  >
                    {source}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-start gap-3">
          <RefreshCw className="h-5 w-5 text-slate-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Recommended Refresh Cadence</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-600">
              <div><span className="font-medium text-emerald-600">Daily/Weekly:</span> LLM leaderboards, API pricing, job postings</div>
              <div><span className="font-medium text-blue-600">Monthly:</span> LinkedIn workforce, cloud pricing</div>
              <div><span className="font-medium text-purple-600">Quarterly:</span> Investment tracking, NVIDIA financials</div>
              <div><span className="font-medium text-amber-600">Annually:</span> Stanford HAI Index, BLS employment</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
