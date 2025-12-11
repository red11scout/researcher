import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Dashboard from "@/components/Dashboard";
import { mapReportToDashboardData } from "@/lib/dashboardMapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function DashboardPage() {
  const [, params] = useRoute("/dashboard/:reportId");
  const [, setLocation] = useLocation();
  const reportId = params?.reportId;

  const { data: report, isLoading, error } = useQuery<any>({
    queryKey: [`/api/reports/${reportId}`],
    enabled: !!reportId,
  });

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

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md w-full border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600">Report Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-gray-600">
              The report you are looking for does not exist or has been removed.
            </p>
            <Button 
              onClick={() => setLocation("/")} 
              variant="outline"
              data-testid="button-return-home"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dashboardData = mapReportToDashboardData(report);

  return <Dashboard data={dashboardData} />;
}
