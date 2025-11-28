import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, FileText, RefreshCw, Download, Trash2, Calendar, Loader2, Database, ArrowRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface SavedReport {
  id: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  analysisData: any;
}

export default function SavedReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<SavedReport | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/reports");
      if (response.ok) {
        const data = await response.json();
        setReports(data);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      toast({
        title: "Error",
        description: "Failed to load saved reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (report: SavedReport) => {
    try {
      setRegeneratingId(report.id);
      toast({
        title: "Regenerating Analysis",
        description: `Updating analysis for ${report.companyName}...`,
      });

      const response = await fetch(`/api/regenerate/${report.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: report.companyName }),
      });

      if (response.ok) {
        toast({
          title: "Analysis Updated",
          description: `${report.companyName} analysis has been refreshed with latest data.`,
        });
        fetchReports();
      } else {
        throw new Error("Failed to regenerate");
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not regenerate the analysis. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleDelete = async () => {
    if (!reportToDelete) return;
    
    try {
      const response = await fetch(`/api/reports/${reportToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Report Deleted",
          description: `${reportToDelete.companyName} report has been removed.`,
        });
        setReports(reports.filter(r => r.id !== reportToDelete.id));
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Could not delete the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTotalValue = (report: SavedReport) => {
    try {
      const value = report.analysisData?.executiveDashboard?.totalAnnualValue;
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      } else if (value >= 1000) {
        return `$${Math.round(value / 1000)}K`;
      }
      return value ? `$${value}` : "N/A";
    } catch {
      return "N/A";
    }
  };

  const filteredReports = reports.filter(report =>
    report.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading saved reports...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight" data-testid="heading-saved-reports">Saved Reports</h1>
            <p className="text-muted-foreground mt-1">Access and manage your generated AI assessments. Update analyses anytime.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search companies..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-reports"
            />
          </div>
        </div>

        {reports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Database className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Saved Reports Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Generate your first AI assessment to see it saved here. Reports are automatically saved and can be updated anytime.
              </p>
              <Link href="/">
                <Button data-testid="button-create-first">
                  Create Your First Report
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Total AI Value</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report) => (
                    <TableRow key={report.id} className="group" data-testid={`row-report-${report.id}`}>
                      <TableCell className="font-medium">
                        <Link href={`/report?company=${encodeURIComponent(report.companyName)}`} className="flex items-center gap-3 hover:text-primary transition-colors">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {report.companyName.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold">{report.companyName}</div>
                            <div className="text-xs text-muted-foreground">AI Strategic Assessment</div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-green-700 bg-green-50 border-green-200">
                          {getTotalValue(report)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Calendar className="h-3 w-3" />
                          {formatDate(report.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Calendar className="h-3 w-3" />
                          {formatDate(report.updatedAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleRegenerate(report)}
                            disabled={regeneratingId === report.id}
                            className="gap-1"
                            data-testid={`button-update-${report.id}`}
                          >
                            {regeneratingId === report.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            Update
                          </Button>
                          <Link href={`/report?company=${encodeURIComponent(report.companyName)}`}>
                            <Button variant="ghost" size="sm" className="gap-1" data-testid={`button-view-${report.id}`}>
                              <FileText className="h-4 w-4" />
                              View
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setReportToDelete(report);
                              setDeleteDialogOpen(true);
                            }}
                            data-testid={`button-delete-${report.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {filteredReports.length === 0 && reports.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No reports found matching "{searchTerm}"
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the AI assessment for <strong>{reportToDelete?.companyName}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
