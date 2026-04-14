import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, FileText, RefreshCw, Trash2, Calendar, Loader2, Database, ArrowRight, Zap, X, CheckCircle2, Download } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface SavedReport {
  id: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  analysisData: any;
}

interface BulkUpdateJob {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
  progress: number;
  currentCompanyId: string | null;
  companyIds: string[];
  completedCompanies: Array<{id: string; name: string; status: string}>;
  failedCompanies: Array<{id: string; name: string; error: string}>;
}

interface BulkExportJob {
  id: string;
  status: 'pending' | 'generating' | 'ready' | 'expired' | 'failed' | 'cancelled';
  progress: number;
  format: string;
  reportType: string;
  companyIds: string[];
  completedCompanies: Array<{id: string; name: string; filename: string}>;
  failedCompanies: Array<{id: string; name: string; error: string}>;
  downloadUrl?: string;
  fileSize?: number;
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

  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkUpdateJob, setBulkUpdateJob] = useState<BulkUpdateJob | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'docx' | 'xlsx' | 'md' | 'json'>('pdf');
  const [exportReportType, setExportReportType] = useState('overview');
  const [bulkExportJob, setBulkExportJob] = useState<BulkExportJob | null>(null);

  useEffect(() => {
    fetchReports();
    checkActiveJob();
    checkActiveExportJob();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.shiftKey) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement instanceof HTMLInputElement || 
                               activeElement instanceof HTMLTextAreaElement;
        if (!isInputFocused) {
          e.preventDefault();
          handleSelectAll();
        }
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reports, searchTerm]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (bulkUpdateJob && (bulkUpdateJob.status === 'pending' || bulkUpdateJob.status === 'in_progress')) {
      setIsPolling(true);
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/bulk-update/status/${bulkUpdateJob.id}`);
          if (response.ok) {
            const job = await response.json();
            setBulkUpdateJob(job);
            
            if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
              setIsPolling(false);
              if (job.status === 'completed') {
                toast({
                  title: "Bulk Update Complete",
                  description: `Successfully updated ${job.completedCompanies.length} companies.`,
                });
                fetchReports();
                clearSelection();
              } else if (job.status === 'cancelled') {
                toast({
                  title: "Update Cancelled",
                  description: "The bulk update was cancelled.",
                });
              } else if (job.status === 'failed') {
                toast({
                  title: "Update Failed",
                  description: "Some companies failed to update.",
                  variant: "destructive",
                });
              }
            }
          }
        } catch (error) {
          console.error("Failed to poll job status:", error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [bulkUpdateJob?.id, bulkUpdateJob?.status]);

  const checkActiveJob = async () => {
    try {
      const response = await fetch("/api/bulk-update/active");
      if (response.ok) {
        const jobs = await response.json();
        // API returns an array of active jobs, take the first one if exists
        if (Array.isArray(jobs) && jobs.length > 0) {
          const job = jobs[0];
          if (job.status === 'pending' || job.status === 'in_progress') {
            setBulkUpdateJob(job);
          }
        }
      }
    } catch (error) {
      console.error("Failed to check for active job:", error);
    }
  };

  const checkActiveExportJob = async () => {
    try {
      const response = await fetch("/api/bulk-export/active");
      if (response.ok) {
        const jobs = await response.json();
        // API returns an array of active export jobs, take the first one if exists
        if (Array.isArray(jobs) && jobs.length > 0) {
          const job = jobs[0];
          if (job.status === 'pending' || job.status === 'generating' || job.status === 'ready') {
            setBulkExportJob(job);
          }
        }
      }
    } catch (error) {
      console.error("Failed to check for active export job:", error);
    }
  };

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

  const handleSelectReport = (reportId: string, checked: boolean) => {
    const newSelected = new Set(selectedReports);
    if (checked) {
      newSelected.add(reportId);
    } else {
      newSelected.delete(reportId);
    }
    setSelectedReports(newSelected);
    setSelectAll(newSelected.size === filteredReports.length && filteredReports.length > 0);
  };

  const handleSelectAll = useCallback(() => {
    const filtered = reports.filter(report =>
      report.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (selectedReports.size === filtered.length) {
      setSelectedReports(new Set());
      setSelectAll(false);
    } else {
      setSelectedReports(new Set(filtered.map(r => r.id)));
      setSelectAll(true);
    }
  }, [reports, searchTerm, selectedReports.size]);

  const clearSelection = () => {
    setSelectedReports(new Set());
    setSelectAll(false);
  };

  const startBulkUpdate = async () => {
    setShowBulkModal(false);
    
    try {
      const response = await fetch("/api/bulk-update/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds: Array.from(selectedReports) }),
      });

      if (response.ok) {
        const { jobId } = await response.json();
        // Fetch the full job status to get proper shape
        const statusResponse = await fetch(`/api/bulk-update/status/${jobId}`);
        if (statusResponse.ok) {
          const fullJob = await statusResponse.json();
          setBulkUpdateJob(fullJob);
        }
        toast({
          title: "Bulk Update Started",
          description: `Updating ${selectedReports.size} companies...`,
        });
      } else {
        throw new Error("Failed to start bulk update");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start bulk update. Please try again.",
        variant: "destructive",
      });
    }
  };

  const cancelBulkUpdate = async () => {
    if (!bulkUpdateJob) return;

    try {
      const response = await fetch(`/api/bulk-update/cancel/${bulkUpdateJob.id}`, {
        method: "POST",
      });

      if (response.ok) {
        setBulkUpdateJob(prev => prev ? { ...prev, status: 'cancelled' } : null);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel update. Please try again.",
        variant: "destructive",
      });
    }
  };

  const closeProgressModal = () => {
    if (bulkUpdateJob?.status === 'completed' || bulkUpdateJob?.status === 'cancelled' || bulkUpdateJob?.status === 'failed') {
      setBulkUpdateJob(null);
    }
  };

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (bulkExportJob && (bulkExportJob.status === 'pending' || bulkExportJob.status === 'generating')) {
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/bulk-export/status/${bulkExportJob.id}`);
          if (response.ok) {
            const job = await response.json();
            setBulkExportJob(job);
            
            if (job.status === 'ready' || job.status === 'cancelled' || job.status === 'failed' || job.status === 'expired') {
              if (job.status === 'ready') {
                toast({
                  title: "Export Ready",
                  description: `Your export is ready for download.`,
                });
              } else if (job.status === 'cancelled') {
                toast({
                  title: "Export Cancelled",
                  description: "The bulk export was cancelled.",
                });
              } else if (job.status === 'failed') {
                toast({
                  title: "Export Failed",
                  description: "Some reports failed to export.",
                  variant: "destructive",
                });
              }
            }
          }
        } catch (error) {
          console.error("Failed to poll export job status:", error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [bulkExportJob?.id, bulkExportJob?.status]);

  const startBulkExport = async () => {
    setShowExportModal(false);
    
    try {
      const response = await fetch("/api/bulk-export/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          reportIds: Array.from(selectedReports),
          format: exportFormat,
          reportType: exportReportType
        }),
      });

      if (response.ok) {
        const { jobId } = await response.json();
        const statusResponse = await fetch(`/api/bulk-export/status/${jobId}`);
        if (statusResponse.ok) {
          const fullJob = await statusResponse.json();
          setBulkExportJob(fullJob);
        }
        toast({
          title: "Export Started",
          description: `Exporting ${selectedReports.size} reports as ${exportFormat.toUpperCase()}...`,
        });
      } else {
        throw new Error("Failed to start bulk export");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start bulk export. Please try again.",
        variant: "destructive",
      });
    }
  };

  const cancelBulkExport = async () => {
    if (!bulkExportJob) return;

    try {
      const response = await fetch(`/api/bulk-export/cancel/${bulkExportJob.id}`, {
        method: "POST",
      });

      if (response.ok) {
        setBulkExportJob(prev => prev ? { ...prev, status: 'cancelled' } : null);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel export. Please try again.",
        variant: "destructive",
      });
    }
  };

  const closeExportProgressModal = () => {
    if (bulkExportJob?.status === 'ready' || bulkExportJob?.status === 'cancelled' || bulkExportJob?.status === 'failed' || bulkExportJob?.status === 'expired') {
      setBulkExportJob(null);
      clearSelection();
    }
  };

  const handleExportDownload = () => {
    if (bulkExportJob?.id) {
      window.location.href = `/api/bulk-export/download/${bulkExportJob.id}`;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        selectedReports.delete(reportToDelete.id);
        setSelectedReports(new Set(selectedReports));
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
        const millions = Math.round(value / 1000000 * 10) / 10;
        return millions === Math.floor(millions) ? `$${Math.floor(millions)}M` : `$${millions.toFixed(1)}M`;
      } else if (value >= 1000) {
        return `$${Math.round(value / 1000)}K`;
      }
      return value ? `$${Math.round(value)}` : "N/A";
    } catch {
      return "N/A";
    }
  };

  const filteredReports = reports.filter(report =>
    report.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isJobActive = bulkUpdateJob && (bulkUpdateJob.status === 'pending' || bulkUpdateJob.status === 'in_progress');
  const isExportJobActive = bulkExportJob && (bulkExportJob.status === 'pending' || bulkExportJob.status === 'generating');

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
      <div className="container mx-auto max-w-6xl px-3 md:px-4 py-4 md:py-8 pb-24">
        <div className="flex flex-col gap-4 mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight" data-testid="heading-saved-reports">Saved Reports</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1">Access and manage your generated AI assessments.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search" 
              placeholder="Search companies..." 
              className="pl-9 bg-background h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-reports"
            />
          </div>
        </div>

        {reports.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 md:py-16">
              <Database className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg md:text-xl font-semibold mb-2">No Saved Reports Yet</h3>
              <p className="text-sm md:text-base text-muted-foreground text-center max-w-md mb-6 px-4">
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
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredReports.map((report) => (
                <Card 
                  key={report.id} 
                  data-testid={`card-report-${report.id}`}
                  className={selectedReports.has(report.id) ? "bg-primary/10 border-primary/30" : ""}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <Checkbox
                        checked={selectedReports.has(report.id)}
                        onCheckedChange={(checked) => handleSelectReport(report.id, checked as boolean)}
                        className="mt-1"
                        data-testid={`checkbox-report-mobile-${report.id}`}
                      />
                      <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
                        <Link href={`/report?company=${encodeURIComponent(report.companyName)}`} className="flex items-center gap-3 hover:text-primary transition-colors flex-1 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                            {report.companyName.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{report.companyName}</div>
                            <div className="text-xs text-muted-foreground">AI Strategic Assessment</div>
                          </div>
                        </Link>
                        <Badge variant="secondary" className="font-mono text-green-700 bg-green-50 border-green-200 flex-shrink-0">
                          {getTotalValue(report)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 ml-7">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created: {formatDate(report.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Updated: {formatDate(report.updatedAt)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 pt-3 border-t ml-7">
                      <Link href={`/report?company=${encodeURIComponent(report.companyName)}`} className="w-full">
                        <Button variant="default" className="w-full gap-2 min-h-[44px]" data-testid={`button-view-mobile-${report.id}`}>
                          <FileText className="h-4 w-4" />
                          View Report
                        </Button>
                      </Link>
                      <Link href={`/whatif/${report.id}`} className="w-full">
                        <Button variant="outline" className="w-full gap-2 min-h-[44px] border-primary text-primary hover:bg-primary/10" data-testid={`button-whatif-mobile-${report.id}`}>
                          <Zap className="h-4 w-4" />
                          What-If Analysis
                        </Button>
                      </Link>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => handleRegenerate(report)}
                          disabled={regeneratingId === report.id}
                          className="flex-1 gap-2 min-h-[44px]"
                          data-testid={`button-update-mobile-${report.id}`}
                        >
                          {regeneratingId === report.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Update
                        </Button>
                        <Button 
                          variant="outline" 
                          className="min-h-[44px] min-w-[44px] text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                          onClick={() => {
                            setReportToDelete(report);
                            setDeleteDialogOpen(true);
                          }}
                          data-testid={`button-delete-mobile-${report.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop Table View */}
            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectAll && filteredReports.length > 0}
                          onCheckedChange={() => handleSelectAll()}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Total AI Value</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
                      <TableRow 
                        key={report.id} 
                        className={`group ${selectedReports.has(report.id) ? "bg-primary/10" : ""}`} 
                        data-testid={`row-report-${report.id}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedReports.has(report.id)}
                            onCheckedChange={(checked) => handleSelectReport(report.id, checked as boolean)}
                            data-testid={`checkbox-report-${report.id}`}
                          />
                        </TableCell>
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
                            <Link href={`/whatif/${report.id}`}>
                              <Button variant="ghost" size="sm" className="gap-1 text-primary hover:text-primary hover:bg-primary/10" data-testid={`button-whatif-${report.id}`}>
                                <Zap className="h-4 w-4" />
                                What-If
                              </Button>
                            </Link>
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
          </>
        )}

        {filteredReports.length === 0 && reports.length > 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No reports found matching "{searchTerm}"
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {selectedReports.size > 0 && !isJobActive && !isExportJobActive && (
        <div 
          className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white shadow-lg rounded-lg p-4 border flex items-center gap-4 z-50"
          data-testid="floating-action-bar"
        >
          <span className="text-sm font-medium" data-testid="text-selected-count">
            {selectedReports.size} {selectedReports.size === 1 ? 'company' : 'companies'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
              data-testid="button-clear-selection"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportModal(true)}
              data-testid="button-export-selected"
            >
              <Download className="h-4 w-4 mr-1" />
              Export Selected
            </Button>
            <Button
              size="sm"
              onClick={() => setShowBulkModal(true)}
              data-testid="button-update-selected"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Update Selected
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Update Confirmation Modal */}
      <AlertDialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-bulk-confirm-title">
              Update research for {selectedReports.size} {selectedReports.size === 1 ? 'company' : 'companies'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will refresh the AI analysis for all selected companies with the latest data.
              <div className="mt-2 text-sm bg-muted p-3 rounded-md">
                <strong>Estimated time:</strong> ~{selectedReports.size * 2} minutes ({selectedReports.size} × 2 min per company)
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startBulkUpdate} data-testid="button-bulk-start">
              Start Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress Modal */}
      <Dialog open={!!bulkUpdateJob} onOpenChange={(open) => !open && closeProgressModal()}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-progress">
          <DialogHeader>
            <DialogTitle>
              {isJobActive ? "Updating Companies..." : 
               bulkUpdateJob?.status === 'completed' ? "Update Complete" :
               bulkUpdateJob?.status === 'cancelled' ? "Update Cancelled" : "Update Failed"}
            </DialogTitle>
            <DialogDescription>
              {isJobActive ? (
                <>Updating company {(bulkUpdateJob?.completedCompanies.length ?? 0) + 1} of {bulkUpdateJob?.companyIds.length ?? 0}</>
              ) : bulkUpdateJob?.status === 'completed' ? (
                `Successfully updated ${bulkUpdateJob?.completedCompanies.length} companies.`
              ) : bulkUpdateJob?.status === 'cancelled' ? (
                `Cancelled after updating ${bulkUpdateJob?.completedCompanies.length} companies.`
              ) : (
                `Failed. Updated ${bulkUpdateJob?.completedCompanies.length} companies before error.`
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(bulkUpdateJob?.progress ?? 0)}%</span>
              </div>
              <Progress value={bulkUpdateJob?.progress ?? 0} className="h-2" />
            </div>
            
            {bulkUpdateJob && (bulkUpdateJob.completedCompanies.length > 0 || bulkUpdateJob.failedCompanies.length > 0) && (
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                {bulkUpdateJob.completedCompanies.map((company, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{company.name}</span>
                  </div>
                ))}
                {bulkUpdateJob.failedCompanies.map((company, index) => (
                  <div key={`failed-${index}`} className="flex items-center gap-2 text-sm text-destructive">
                    <X className="h-4 w-4" />
                    <span>{company.name} (failed)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            {isJobActive ? (
              <Button variant="destructive" onClick={cancelBulkUpdate} data-testid="button-cancel-job">
                Cancel Update
              </Button>
            ) : (
              <Button onClick={closeProgressModal} data-testid="button-close-progress">
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
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

      {/* Export Configuration Modal */}
      <AlertDialog open={showExportModal} onOpenChange={setShowExportModal}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-export-title">
              Export {selectedReports.size} {selectedReports.size === 1 ? 'Company' : 'Companies'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose the export format and report type for your selected companies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Export Format</Label>
              <RadioGroup 
                value={exportFormat} 
                onValueChange={(value) => setExportFormat(value as typeof exportFormat)}
                className="grid grid-cols-2 gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pdf" id="format-pdf" />
                  <Label htmlFor="format-pdf" className="cursor-pointer">PDF</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="docx" id="format-docx" />
                  <Label htmlFor="format-docx" className="cursor-pointer">Word (.docx)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="xlsx" id="format-xlsx" />
                  <Label htmlFor="format-xlsx" className="cursor-pointer">Excel (.xlsx)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="md" id="format-md" />
                  <Label htmlFor="format-md" className="cursor-pointer">Markdown</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="json" id="format-json" />
                  <Label htmlFor="format-json" className="cursor-pointer">JSON</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Report Type</Label>
              <Select value={exportReportType} onValueChange={setExportReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="overview">Company Overview</SelectItem>
                  <SelectItem value="executive">Executive Summary</SelectItem>
                  <SelectItem value="detailed">Detailed Analysis</SelectItem>
                  <SelectItem value="financial">Financial Impact</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-muted p-3 rounded-md text-sm">
              <strong>Preview:</strong> Export {selectedReports.size} {selectedReports.size === 1 ? 'report' : 'reports'} as .{exportFormat} {selectedReports.size === 1 ? 'file' : 'files'}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-export-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startBulkExport} data-testid="button-export-start">
              <Download className="h-4 w-4 mr-1" />
              Start Export
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Progress Modal */}
      <Dialog open={!!bulkExportJob} onOpenChange={(open) => !open && closeExportProgressModal()}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-export-progress">
          <DialogHeader>
            <DialogTitle>
              {isExportJobActive ? "Exporting Reports..." : 
               bulkExportJob?.status === 'ready' ? "Export Ready" :
               bulkExportJob?.status === 'cancelled' ? "Export Cancelled" : 
               bulkExportJob?.status === 'expired' ? "Export Expired" : "Export Failed"}
            </DialogTitle>
            <DialogDescription>
              {isExportJobActive ? (
                <>Generating report {(bulkExportJob?.completedCompanies.length ?? 0) + 1} of {bulkExportJob?.companyIds.length ?? 0}</>
              ) : bulkExportJob?.status === 'ready' ? (
                <>Your export is ready for download. {bulkExportJob?.fileSize ? `(${formatFileSize(bulkExportJob.fileSize)})` : ''}</>
              ) : bulkExportJob?.status === 'cancelled' ? (
                `Export cancelled after generating ${bulkExportJob?.completedCompanies.length} reports.`
              ) : bulkExportJob?.status === 'expired' ? (
                "This export has expired. Please start a new export."
              ) : (
                `Export failed. Generated ${bulkExportJob?.completedCompanies.length} reports before error.`
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(bulkExportJob?.progress ?? 0)}%</span>
              </div>
              <Progress value={bulkExportJob?.progress ?? 0} className="h-2" />
            </div>
            
            {bulkExportJob && (bulkExportJob.completedCompanies.length > 0 || bulkExportJob.failedCompanies.length > 0) && (
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                {bulkExportJob.completedCompanies.map((company, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{company.name}</span>
                  </div>
                ))}
                {bulkExportJob.failedCompanies.map((company, index) => (
                  <div key={`failed-${index}`} className="flex items-center gap-2 text-sm text-destructive">
                    <X className="h-4 w-4" />
                    <span>{company.name} (failed)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isExportJobActive ? (
              <Button variant="destructive" onClick={cancelBulkExport} data-testid="button-cancel-export">
                Cancel Export
              </Button>
            ) : bulkExportJob?.status === 'ready' ? (
              <>
                <Button variant="outline" onClick={closeExportProgressModal} data-testid="button-close-export">
                  Close
                </Button>
                <Button onClick={handleExportDownload} data-testid="button-download-export">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </>
            ) : (
              <Button onClick={closeExportProgressModal} data-testid="button-close-export">
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
