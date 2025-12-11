import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Share2, Download, ArrowLeft, Printer } from "lucide-react";
import { type Report } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function ReportViewer() {
  const [, params] = useRoute("/reports/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: [`/api/reports/${id}`],
    enabled: !!id,
  });

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Shareable report link copied to clipboard.",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-blueally-light p-8 space-y-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-12 w-1/3 bg-gray-200" />
          <Skeleton className="h-64 w-full bg-gray-200" />
          <Skeleton className="h-64 w-full bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blueally-light">
        <Card className="max-w-md w-full border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Report Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-gray-600">The report you are looking for does not exist or has been removed.</p>
            <Button onClick={() => setLocation("/")} variant="outline" data-testid="button-return-home">
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const analysis = report.analysisData as any; 

  return (
    <div className="min-h-screen bg-blueally-light font-sans text-slate-800">
      <header className="bg-blueally-navy text-white shadow-lg sticky top-0 z-50 print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              className="text-white hover:bg-blueally-royal/50"
              onClick={() => setLocation("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">BlueAlly Insight</h1>
              <div className="text-xs text-blue-200">
                Strategic AI Opportunity Assessment for <span className="text-white font-semibold">{report.companyName}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleCopyLink} 
              variant="secondary" 
              className="bg-blueally-green text-white hover:bg-green-700 border-none shadow-md hover-elevate"
              data-testid="button-share-link"
            >
              <Share2 className="w-4 h-4 mr-2" /> Share Link
            </Button>
            <Button 
              onClick={handlePrint} 
              variant="outline" 
              className="text-blueally-navy border-white bg-white hover:bg-gray-100"
              data-testid="button-print"
            >
              <Printer className="w-4 h-4 mr-2" /> Print / PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-12 print:p-0 print:max-w-none">
        
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b-2 border-blueally-royal pb-4">
            <h2 className="text-3xl font-heading font-bold text-blueally-navy">Executive Dashboard</h2>
            <span className="text-sm text-gray-500">Generated: {new Date(report.createdAt).toLocaleDateString()}</span>
          </div>
          
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
             <p className="text-gray-600 italic">Render Executive Dashboard Component Here...</p>
             <pre className="mt-4 p-4 bg-gray-50 text-xs overflow-auto max-h-40 rounded">
               {JSON.stringify(analysis.dashboard || analysis.summary, null, 2)}
             </pre>
          </div>
        </section>

        <section className="space-y-8">
           <div className="grid gap-6">
              {analysis.steps?.map((step: any, index: number) => (
                <Card key={index} className="border-t-4 border-t-blueally-royal shadow-sm overflow-hidden break-inside-avoid">
                  <CardHeader className="bg-slate-50">
                    <CardTitle className="text-xl text-blueally-navy">
                      Step {index + 1}: {step.title || "Analysis Section"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 prose max-w-none text-gray-700">
                    <div dangerouslySetInnerHTML={{ __html: step.content || step.html || "<p>No content available</p>" }} />
                  </CardContent>
                </Card>
              ))}
           </div>
        </section>

      </main>

      <footer className="bg-slate-900 text-slate-400 py-12 mt-12 print:hidden">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p>© 2025 BlueAlly. All rights reserved.</p>
          <p className="text-sm mt-2">Conquer Complexity.</p>
        </div>
      </footer>
    </div>
  );
}
