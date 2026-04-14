import { useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import Dashboard from '@/components/Dashboard';
import { mapReportToDashboardData } from '@/lib/dashboardMapper';
import { generateProfessionalHTMLReport, generateEditorialHTMLReport } from '@/lib/htmlReportGenerator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseFormattedValue } from '@/lib/formatters';
import { Logo } from '@/components/brand/logo';

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

    const htmlContent = generateProfessionalHTMLReport(reportData, companyName);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');

    toast({
      title: "Opening Boardroom Report",
      description: "The data-dense Boardroom report is opening in a new tab.",
    });
  };

  const handleViewEditorialReport = () => {
    if (!data?.data) return;

    const reportData = data.data;
    const companyName = reportData.companyName || reportData.company?.name || 'Company';

    const htmlContent = generateEditorialHTMLReport(reportData, companyName);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');

    toast({
      title: "Opening Editorial Report",
      description: "The narrative-led Editorial report is opening in a new tab.",
    });
  };

  const handleDownloadWorkshopPDF = () => {
    // Download the BlueAlly AI Workshop Preview PDF
    const link = document.createElement('a');
    link.href = '/attached_assets/BlueAlly_AI_Workshop_Preview_1766077840782.pdf';
    link.download = 'BlueAlly_AI_Workshop_Preview.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Workshop Details Downloaded",
      description: "BlueAlly AI Workshop Preview PDF has been downloaded.",
    });
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
              onClick={() => window.open('https://www.blueally.com', '_blank')}
              variant="outline"
              data-testid="button-learn-more"
            >
              Learn More About BlueAlly
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
      onDownloadWorkshopPDF={handleDownloadWorkshopPDF}
      onViewHTMLReport={handleViewHTMLReport}
      onViewEditorialReport={handleViewEditorialReport}
    />
  );
}
