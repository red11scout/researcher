import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Share2, Download, TrendingUp, DollarSign, Target, Zap, AlertCircle, Clock } from 'lucide-react';
import { format } from '@/lib/formatters';
import { 
  BenefitsChart, 
  PriorityMatrix, 
  TimelineChart, 
  UseCasesTable,
  ShareModal,
  CTASection 
} from '@/components/dashboard';
import { Logo } from '@/components/brand/logo';

interface DashboardData {
  company?: { name: string; industry?: string };
  companyName?: string;
  totals?: {
    annualImpact: number;
    avgRoi: number;
    useCaseCount: number;
    criticalCount: number;
  };
  executiveDashboard?: {
    totalAnnualValue: number;
    totalRevenueBenefit: number;
    totalCostBenefit: number;
    totalCashFlowBenefit: number;
    totalRiskBenefit: number;
    topUseCases: any[];
  };
  useCases?: any[];
  steps?: any[];
}

export default function SharedDashboard() {
  const [, params] = useRoute('/shared/:shareId');
  const [, setLocation] = useLocation();
  const shareId = params?.shareId;
  const [showShareModal, setShowShareModal] = useState(false);

  const { data, isLoading, error } = useQuery<{
    data: DashboardData;
    createdAt: string;
    expiresAt: string;
    viewCount: number;
  }>({
    queryKey: [`/api/share/${shareId}`],
    enabled: !!shareId,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="bg-white border-b border-slate-200 py-4 px-6">
          <Logo variant="dark" className="h-8" />
        </header>
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <Skeleton className="h-12 w-1/3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    const isExpired = (error as any)?.message?.includes('expired');
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              {isExpired ? (
                <Clock className="w-8 h-8 text-amber-500" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-500" />
              )}
              <CardTitle className={isExpired ? 'text-amber-600' : 'text-red-600'}>
                {isExpired ? 'Link Expired' : 'Dashboard Not Found'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-600">
              {isExpired 
                ? 'This dashboard link has expired. Share links are valid for 30 days.'
                : 'The dashboard you are looking for does not exist or has been removed.'}
            </p>
            <Button 
              onClick={() => setLocation('/')} 
              variant="outline"
              data-testid="button-return-home"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Create New Assessment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dashboardData = data.data;
  const companyName = dashboardData.company?.name || dashboardData.companyName || 'Company';
  const industry = dashboardData.company?.industry || '';
  
  const dashboard = dashboardData.executiveDashboard;
  const useCases = dashboard?.topUseCases || dashboardData.useCases || [];
  
  const totals = dashboardData.totals || {
    annualImpact: dashboard?.totalAnnualValue || 0,
    avgRoi: 0,
    useCaseCount: useCases.length,
    criticalCount: useCases.filter((uc: any) => uc.tier === 'Critical' || uc.priority === 'Critical').length,
  };

  const benefits = {
    revenue: dashboard?.totalRevenueBenefit || 0,
    cost: dashboard?.totalCostBenefit || 0,
    cash: dashboard?.totalCashFlowBenefit || 0,
    risk: dashboard?.totalRiskBenefit || 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Logo variant="dark" className="h-8" />
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowShareModal(true)}
              data-testid="button-share"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-r from-brand-navy to-brand-blue text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-8">
            <p className="text-white/70 text-sm font-medium uppercase tracking-wide mb-2">
              AI Opportunity Assessment
            </p>
            <h1 className="text-3xl font-bold" data-testid="text-company-name">{companyName}</h1>
            {industry && <p className="text-white/70 mt-1">{industry}</p>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-white/70" />
                <span className="text-white/70 text-sm">Total Annual Impact</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-annual-impact">
                {format.currencyAuto(totals.annualImpact)}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-white/70" />
                <span className="text-white/70 text-sm">Average ROI</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-avg-roi">
                {totals.avgRoi > 0 ? `${Math.round(totals.avgRoi)}%` : 'N/A'}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-white/70" />
                <span className="text-white/70 text-sm">Use Cases</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-usecase-count">
                {totals.useCaseCount}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-white/70" />
                <span className="text-white/70 text-sm">Critical Priority</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-critical-count">
                {totals.criticalCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-6">
              Benefits by Category
            </h2>
            <BenefitsChart data={benefits} />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-6">
              Priority Distribution
            </h2>
            <PriorityMatrix useCases={useCases} />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">
            Use Cases by Priority
          </h2>
          <UseCasesTable useCases={useCases} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">
            Implementation Roadmap
          </h2>
          <TimelineChart useCases={useCases} />
        </div>
      </section>

      <CTASection companyName={companyName} />

      <footer className="bg-slate-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <Logo variant="white" className="h-6 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">
            © 2024 BlueAlly AI Consulting. All rights reserved.
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Views: {data.viewCount} | Created: {new Date(data.createdAt).toLocaleDateString()}
          </p>
        </div>
      </footer>

      <ShareModal 
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        reportData={dashboardData}
      />
    </div>
  );
}
