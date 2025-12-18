import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import Dashboard from '@/components/Dashboard';
import { mapReportToDashboardData } from '@/lib/dashboardMapper';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseFormattedValue } from '@/lib/formatters';
import { Logo } from '@/components/brand/logo';
import { generateBoardPresentationPDF } from '@/lib/pdfGenerator';

const formatCurrency = (value: number | string): string => {
  if (typeof value === 'string') {
    if (value.startsWith('$')) return value;
    const num = parseFormattedValue(value);
    if (num === 0 && value !== '0' && value !== '$0') return value;
    return format.currencyAuto(num);
  }
  return format.currencyAuto(value);
};

interface SharedDashboardResponse {
  data: any;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
}

export default function SharedDashboard() {
  const [, params] = useRoute('/shared/:shareId');
  const [, setLocation] = useLocation();
  const shareId = params?.shareId;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<SharedDashboardResponse>({
    queryKey: [`/api/share/${shareId}`],
    enabled: !!shareId,
    retry: false,
  });

  const handleViewHTMLReport = () => {
    if (!data?.data) return;
    
    const reportData = data.data;
    const companyName = reportData.companyName || reportData.company?.name || 'Company';
    const analysisData = reportData.analysisData || reportData;
    
    // Generate HTML report content
    const generateHTMLContent = () => {
      const steps = analysisData.steps || [];
      const dashboard = analysisData.executiveDashboard || {};
      
      const stepsHTML = steps.map((step: any) => `
        <div class="step-section">
          <h2>Step ${step.step}: ${step.title}</h2>
          ${step.content ? `<p>${step.content}</p>` : ''}
          ${step.data && step.data.length > 0 ? `
            <table>
              <thead>
                <tr>${Object.keys(step.data[0]).map((col: string) => `<th>${col}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${step.data.map((row: any) => `
                  <tr>${Object.values(row).map((val: any) => `<td>${val || ''}</td>`).join('')}</tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
        </div>
      `).join('');
      
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${companyName} - AI Strategic Assessment</title>
          <style>
            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 1200px; margin: 0 auto; padding: 40px 20px; background: #f8fafc; color: #0f172a; }
            .header { background: linear-gradient(135deg, #003366 0%, #0066CC 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; }
            .header h1 { margin: 0 0 10px 0; font-size: 2.5rem; }
            .header p { margin: 0; opacity: 0.9; }
            .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
            .metric { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .metric-label { font-size: 0.875rem; color: #64748b; margin-bottom: 8px; }
            .metric-value { font-size: 1.5rem; font-weight: 700; color: #0339AF; }
            .step-section { background: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .step-section h2 { color: #003366; margin-top: 0; border-bottom: 2px solid #0066CC; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.875rem; }
            th { background: #003366; color: white; padding: 12px; text-align: left; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>BlueAlly AI Strategic Assessment</h1>
            <p>${companyName}</p>
          </div>
          <div class="dashboard">
            <div class="metric">
              <div class="metric-label">Total Annual Value</div>
              <div class="metric-value">${formatCurrency(dashboard.totalAnnualValue || 0)}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Revenue Growth</div>
              <div class="metric-value">${formatCurrency(dashboard.totalRevenueBenefit || 0)}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Cost Reduction</div>
              <div class="metric-value">${formatCurrency(dashboard.totalCostBenefit || 0)}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Cash Flow</div>
              <div class="metric-value">${formatCurrency(dashboard.totalCashFlowBenefit || 0)}</div>
            </div>
          </div>
          ${stepsHTML}
          <footer style="text-align: center; color: #64748b; padding: 40px 0; font-size: 0.875rem;">
            © 2025 BlueAlly. Confidential & Proprietary.
          </footer>
        </body>
        </html>
      `;
    };
    
    const htmlContent = generateHTMLContent();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    
    toast({
      title: "Opening HTML Report",
      description: "The detailed HTML report is opening in a new tab.",
    });
  };

  const handleDownloadPDF = async () => {
    if (!data?.data) return;
    
    const reportData = data.data;
    const companyName = reportData.companyName || reportData.company?.name || 'Company';
    const analysisData = reportData.analysisData || reportData;
    
    toast({
      title: "Download Started",
      description: "Generating board-presentation quality PDF...",
    });
    
    try {
      await generateBoardPresentationPDF(analysisData, companyName);
      toast({
        title: "PDF Downloaded",
        description: `${companyName} AI Assessment has been downloaded.`,
      });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({
        title: "Download Failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 space-y-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-16 w-1/3 bg-gray-200" />
          <Skeleton className="h-96 w-full bg-gray-200" />
          <Skeleton className="h-64 w-full bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    const errorMessage = (error as any)?.message || '';
    const isExpired = errorMessage.includes('expired');
    
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

  const reportData = data.data;
  const companyName = reportData.companyName || reportData.company?.name || 'Company';
  
  // The stored data has structure: {companyName, analysisData: {...}}
  // We need to extract the analysisData property for the mapper
  const analysisData = reportData.analysisData || reportData;
  
  const report = {
    id: shareId || '',
    companyName: companyName,
    analysisData: analysisData,
    createdAt: data.createdAt,
    updatedAt: data.createdAt,
  };

  const dashboardData = mapReportToDashboardData(report);

  return (
    <Dashboard 
      data={dashboardData}
      onDownloadPDF={handleDownloadPDF}
      onViewHTMLReport={handleViewHTMLReport}
    />
  );
}
