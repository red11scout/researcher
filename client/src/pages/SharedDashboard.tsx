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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import workshopPdfUrl from '@assets/BlueAlly_AI_Workshop_Preview_1765480873162.pdf';
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
  const [, setLocation] = useLocation();
  const shareId = params?.shareId;
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<SharedDashboardResponse>({
    queryKey: [`/api/share/${shareId}`],
    enabled: !!shareId,
    retry: false,
  });

  const handleDownloadWorkshop = () => {
    const link = document.createElement('a');
    link.href = workshopPdfUrl;
    link.download = 'BlueAlly_AI_Workshop_Preview.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Downloading Workshop Details",
      description: "The AI Workshop preview PDF is being downloaded.",
    });
  };

  const handleDownloadPDF = async () => {
    if (!data?.data) return;
    
    const reportData = data.data;
    const companyName = reportData.companyName || reportData.company?.name || 'Company';
    // Extract analysisData - handle both nested and flat structures
    const analysisData = reportData.analysisData || reportData;
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;

      const brandBlue = [3, 57, 175] as [number, number, number];
      const darkGray = [51, 51, 51] as [number, number, number];
      const lightGray = [128, 128, 128] as [number, number, number];

      doc.setFillColor(...brandBlue);
      doc.rect(0, 0, pageWidth, 35, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text('BlueAlly', margin, 20);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('AI Strategic Assessment', margin, 28);

      yPos = 50;

      doc.setTextColor(...darkGray);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(companyName, margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(...lightGray);
      doc.setFont('helvetica', 'normal');
      const date = new Date(data.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.text(`Generated: ${date}`, margin, yPos);
      yPos += 20;

      const dashboard = analysisData.executiveDashboard;
      if (dashboard) {
        doc.setFontSize(16);
        doc.setTextColor(...brandBlue);
        doc.setFont('helvetica', 'bold');
        doc.text('Executive Dashboard', margin, yPos);
        yPos += 10;

        doc.setFontSize(28);
        doc.setTextColor(...darkGray);
        doc.text(`Total Value: ${formatCurrency(dashboard.totalAnnualValue || 0)}`, margin, yPos);
        yPos += 15;

        const valueData = [
          ['Revenue Growth', formatCurrency(dashboard.totalRevenueBenefit || 0)],
          ['Cost Reduction', formatCurrency(dashboard.totalCostBenefit || 0)],
          ['Cash Flow', formatCurrency(dashboard.totalCashFlowBenefit || 0)],
          ['Risk Mitigation', formatCurrency(dashboard.totalRiskBenefit || 0)],
        ];

        autoTable(doc, {
          startY: yPos,
          head: [['Value Driver', 'Annual Benefit']],
          body: valueData,
          theme: 'striped',
          headStyles: { fillColor: brandBlue, fontSize: 10 },
          bodyStyles: { fontSize: 10 },
          margin: { left: margin, right: margin },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      if (dashboard?.topUseCases?.length > 0) {
        if (yPos > pageHeight - 80) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(16);
        doc.setTextColor(...brandBlue);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Use Cases', margin, yPos);
        yPos += 10;

        const useCaseData = dashboard.topUseCases.map((uc: any) => [
          uc.useCase,
          formatCurrency(uc.annualValue || 0),
          uc.priorityScore?.toString() || 'N/A',
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Use Case', 'Annual Value', 'Priority Score']],
          body: useCaseData,
          theme: 'striped',
          headStyles: { fillColor: brandBlue, fontSize: 10 },
          bodyStyles: { fontSize: 9 },
          columnStyles: {
            0: { cellWidth: 100 },
            1: { cellWidth: 35 },
            2: { cellWidth: 30 },
          },
          margin: { left: margin, right: margin },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      if (analysisData.summary) {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(16);
        doc.setTextColor(...brandBlue);
        doc.setFont('helvetica', 'bold');
        doc.text('Executive Summary', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        doc.setTextColor(...darkGray);
        doc.setFont('helvetica', 'normal');
        
        const summaryLines = doc.splitTextToSize(analysisData.summary, pageWidth - 2 * margin);
        doc.text(summaryLines, margin, yPos);
      }

      const addFooter = () => {
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(...lightGray);
          doc.text(
            `© 2025 BlueAlly. Confidential & Proprietary. Page ${i} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }
      };
      addFooter();

      const filename = `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_AI_Assessment.pdf`;
      doc.save(filename);

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
      onDownloadWorkshop={handleDownloadWorkshop}
    />
  );
}
