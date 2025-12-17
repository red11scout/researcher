import { pdf } from '@react-pdf/renderer';
import { AssessmentPDF, ReportData } from './document';

export async function generatePDF(reportData: ReportData): Promise<Blob> {
  const doc = <AssessmentPDF data={reportData} />;
  const blob = await pdf(doc).toBlob();
  return blob;
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function generateAndDownloadPDF(reportData: ReportData) {
  const companySlug = reportData.company.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `ai-assessment-${companySlug}-${dateStr}.pdf`;
  
  const blob = await generatePDF(reportData);
  downloadPDF(blob, filename);
}
