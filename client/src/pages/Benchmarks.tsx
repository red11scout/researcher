import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Target
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

const industryData = [
  { month: 'Jan', tech: 100, finance: 80, retail: 60 },
  { month: 'Feb', tech: 120, finance: 85, retail: 55 },
  { month: 'Mar', tech: 115, finance: 90, retail: 65 },
  { month: 'Apr', tech: 140, finance: 88, retail: 70 },
  { month: 'May', tech: 155, finance: 95, retail: 75 },
  { month: 'Jun', tech: 170, finance: 100, retail: 80 },
];

export default function Benchmarks() {
  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold tracking-tight">Industry Benchmarks</h1>
          <p className="text-muted-foreground mt-1">Live market performance indicators and sector analysis.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MetricCard 
            title="SaaS Multiples" 
            value="8.4x" 
            trend="+0.2x" 
            trendUp={true} 
            description="Average revenue multiple"
          />
          <MetricCard 
            title="Cost of Capital" 
            value="4.2%" 
            trend="-0.1%" 
            trendUp={false} 
            description="Weighted average (WACC)"
          />
          <MetricCard 
            title="Market Volatility" 
            value="Low" 
            trend="Stable" 
            trendUp={true} 
            description="VIX Index < 15"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sector Performance (YTD)</CardTitle>
              <CardDescription>Relative growth indices across key industries</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={industryData}>
                    <defs>
                      <linearGradient id="colorTech" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="tech" 
                      stroke="hsl(var(--primary))" 
                      fillOpacity={1} 
                      fill="url(#colorTech)" 
                      name="Technology"
                      strokeWidth={2}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="finance" 
                      stroke="hsl(var(--chart-2))" 
                      fillOpacity={0.1} 
                      fill="hsl(var(--chart-2))" 
                      name="Finance"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Key Indicators</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <IndicatorItem label="Inflation Rate" value="3.2%" status="down" />
                <IndicatorItem label="Unemployment" value="3.8%" status="stable" />
                <IndicatorItem label="GDP Growth" value="2.1%" status="up" />
                <IndicatorItem label="Interest Rates" value="5.25%" status="stable" />
              </CardContent>
            </Card>
            
            <Card className="bg-slate-900 text-white">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-400" />
                  Analyst Sentiment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">Bullish</div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Market sentiment remains positive driven by AI adoption and resilient consumer spending. Tech sector expected to outperform.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function MetricCard({ title, value, trend, trendUp, description }: any) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-2">
          <div className="text-sm font-medium text-muted-foreground">{title}</div>
          <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trendUp ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
            {trend}
          </div>
        </div>
        <div className="text-3xl font-bold mb-1">{value}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  );
}

function IndicatorItem({ label, value, status }: any) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <span className="font-bold">{value}</span>
        {status === 'up' && <ArrowUpRight className="h-4 w-4 text-green-500" />}
        {status === 'down' && <ArrowDownRight className="h-4 w-4 text-red-500" />}
        {status === 'stable' && <Activity className="h-4 w-4 text-muted-foreground" />}
      </div>
    </div>
  );
}