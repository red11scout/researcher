import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Upload,
  FileText,
  Play,
  Pause,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Trash2,
  Edit2,
  AlertTriangle,
  RotateCcw,
  Eye,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ParsedCompany {
  id: string;
  company_name: string;
  investor_group?: string;
  priority?: string;
  isDuplicate?: boolean;
  existsInReports?: boolean;
}

interface ValidationResult {
  totalCompanies: number;
  duplicatesRemoved: number;
  existingInReports: number;
}

interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'cancelled' | 'failed';
  progress: number;
  totalCompanies: number;
  pendingQueue: Array<{ name: string; group?: string; priority?: number }>;
  activeQueue: Array<{ name: string; group?: string; priority?: number }>;
  completedQueue: Array<{ name: string; reportId?: string; duration?: number }>;
  failedQueue: Array<{ name: string; error?: string; attempts?: number; willRetry?: boolean }>;
  config: { batchSize?: number; skipExisting?: boolean };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface HistoryJob extends BatchJob {
  duration?: number;
  successRate?: number;
}

export default function BatchResearch() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState("new-batch");
  const [parsedCompanies, setParsedCompanies] = useState<ParsedCompany[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [batchSize, setBatchSize] = useState<string>("3");
  const [skipExisting, setSkipExisting] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [existingReports, setExistingReports] = useState<Set<string>>(new Set());
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  
  const [activeJob, setActiveJob] = useState<BatchJob | null>(null);
  const [activeJobs, setActiveJobs] = useState<BatchJob[]>([]);
  const [historyJobs, setHistoryJobs] = useState<HistoryJob[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetchExistingReports();
    fetchActiveJobs();
    fetchHistory();
  }, []);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (activeJob && (activeJob.status === 'pending' || activeJob.status === 'processing')) {
      pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/batch-research/status/${activeJob.id}`);
          if (response.ok) {
            const job = await response.json();
            setActiveJob(job);

            if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
              toast({
                title: job.status === 'completed' ? "Batch Complete" : 
                       job.status === 'cancelled' ? "Batch Cancelled" : "Batch Failed",
                description: job.status === 'completed' 
                  ? `Successfully processed ${(job.completedQueue || []).length} companies.`
                  : job.status === 'cancelled'
                  ? "The batch research was cancelled."
                  : "Some companies failed to process.",
                variant: job.status === 'failed' ? "destructive" : undefined,
              });
              fetchHistory();
              fetchActiveJobs();
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
  }, [activeJob?.id, activeJob?.status]);

  const fetchExistingReports = async () => {
    setIsLoadingReports(true);
    try {
      const response = await fetch("/api/reports");
      if (response.ok) {
        const reports = await response.json();
        const names = new Set<string>(
          reports.map((r: any) => r.companyName.toLowerCase().trim())
        );
        setExistingReports(names);
      }
    } catch (error) {
      console.error("Failed to fetch existing reports:", error);
    } finally {
      setIsLoadingReports(false);
    }
  };

  const fetchActiveJobs = async () => {
    try {
      const response = await fetch("/api/batch-research/active");
      if (response.ok) {
        const jobs = await response.json();
        setActiveJobs(jobs);
        if (jobs.length > 0 && !activeJob) {
          const runningJob = jobs.find((j: BatchJob) => 
            j.status === 'pending' || j.status === 'processing'
          );
          if (runningJob) {
            setActiveJob(runningJob);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch active jobs:", error);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch("/api/batch-research/history");
      if (response.ok) {
        const jobs = await response.json();
        setHistoryJobs(jobs);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const normalizeCompanyName = (name: string): string => {
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'");
  };

  const parseCSV = (content: string): ParsedCompany[] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    const headerLine = lines[0].toLowerCase();
    const hasHeader = headerLine.includes('company') || 
                      headerLine.includes('name') ||
                      headerLine.includes('investor') ||
                      headerLine.includes('priority');
    
    const startIndex = hasHeader ? 1 : 0;
    const companies: ParsedCompany[] = [];
    const seen = new Set<string>();

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      const companyName = normalizeCompanyName(parts[0] || '');
      
      if (!companyName) continue;

      const normalizedLower = companyName.toLowerCase();
      const isDuplicate = seen.has(normalizedLower);
      seen.add(normalizedLower);

      companies.push({
        id: `csv-${i}-${Date.now()}`,
        company_name: companyName,
        investor_group: parts[1] || undefined,
        priority: parts[2] || undefined,
        isDuplicate,
        existsInReports: existingReports.has(normalizedLower),
      });
    }

    return companies;
  };

  const parseTextInput = (text: string): ParsedCompany[] => {
    const lines = text.includes(',') && !text.includes('\n')
      ? text.split(',')
      : text.split(/\r?\n/);
    
    const companies: ParsedCompany[] = [];
    const seen = new Set<string>();

    lines.forEach((line, i) => {
      const companyName = normalizeCompanyName(line);
      if (!companyName) return;

      const normalizedLower = companyName.toLowerCase();
      const isDuplicate = seen.has(normalizedLower);
      seen.add(normalizedLower);

      companies.push({
        id: `text-${i}-${Date.now()}`,
        company_name: companyName,
        isDuplicate,
        existsInReports: existingReports.has(normalizedLower),
      });
    });

    return companies;
  };

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const companies = parseCSV(content);
      setParsedCompanies(companies);
      updateValidation(companies);
      toast({
        title: "CSV Uploaded",
        description: `Parsed ${companies.length} companies from ${file.name}`,
      });
    };
    reader.readAsText(file);
  }, [existingReports]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      handleFileUpload(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
    }
  }, [handleFileUpload]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleTextInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setTextInput(value);
    
    if (value.trim()) {
      const companies = parseTextInput(value);
      setParsedCompanies(companies);
      updateValidation(companies);
    } else {
      setParsedCompanies([]);
      setValidation(null);
    }
  };

  const updateValidation = (companies: ParsedCompany[]) => {
    const duplicates = companies.filter(c => c.isDuplicate).length;
    const existing = companies.filter(c => c.existsInReports).length;
    setValidation({
      totalCompanies: companies.length - duplicates,
      duplicatesRemoved: duplicates,
      existingInReports: existing,
    });
  };

  const removeCompany = (id: string) => {
    const updated = parsedCompanies.filter(c => c.id !== id);
    setParsedCompanies(updated);
    updateValidation(updated);
  };

  const startEditing = (company: ParsedCompany) => {
    setEditingCompany(company.id);
    setEditValue(company.company_name);
  };

  const saveEdit = (id: string) => {
    const updated = parsedCompanies.map(c => 
      c.id === id ? { ...c, company_name: normalizeCompanyName(editValue) } : c
    );
    setParsedCompanies(updated);
    updateValidation(updated);
    setEditingCompany(null);
    setEditValue("");
  };

  const clearAll = () => {
    setParsedCompanies([]);
    setTextInput("");
    setValidation(null);
  };

  const getEstimatedTime = () => {
    if (!validation) return null;
    const effectiveCount = skipExisting 
      ? validation.totalCompanies - validation.existingInReports
      : validation.totalCompanies;
    const totalSeconds = effectiveCount * 45;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`;
  };

  const startBatch = async () => {
    const companiesToProcess = parsedCompanies
      .filter(c => !c.isDuplicate)
      .filter(c => !skipExisting || !c.existsInReports)
      .map(c => ({
        name: c.company_name,
        group: c.investor_group,
        priority: c.priority ? parseInt(c.priority) : undefined,
      }));

    if (companiesToProcess.length === 0) {
      toast({
        title: "No Companies to Process",
        description: "All companies are either duplicates or already exist in reports.",
        variant: "destructive",
      });
      return;
    }

    setIsStarting(true);
    try {
      const response = await fetch("/api/batch-research/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: companiesToProcess,
          config: {
            batchSize: parseInt(batchSize),
            skipExisting,
          },
        }),
      });

      if (response.ok) {
        const { jobId } = await response.json();
        const statusResponse = await fetch(`/api/batch-research/status/${jobId}`);
        if (statusResponse.ok) {
          const job = await statusResponse.json();
          setActiveJob(job);
          setActiveTab("active-jobs");
          toast({
            title: "Batch Research Started",
            description: `Processing ${companiesToProcess.length} companies...`,
          });
          clearAll();
        }
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to start batch");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start batch research.",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const pauseJob = async () => {
    if (!activeJob) return;
    try {
      const response = await fetch(`/api/batch-research/pause/${activeJob.id}`, {
        method: "POST",
      });
      if (response.ok) {
        setActiveJob(prev => prev ? { ...prev, status: 'paused' } : null);
        toast({ title: "Batch Paused" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to pause batch.", variant: "destructive" });
    }
  };

  const resumeJob = async () => {
    if (!activeJob) return;
    try {
      const response = await fetch(`/api/batch-research/resume/${activeJob.id}`, {
        method: "POST",
      });
      if (response.ok) {
        setActiveJob(prev => prev ? { ...prev, status: 'processing' } : null);
        toast({ title: "Batch Resumed" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to resume batch.", variant: "destructive" });
    }
  };

  const cancelJob = async () => {
    if (!activeJob) return;
    try {
      const response = await fetch(`/api/batch-research/cancel/${activeJob.id}`, {
        method: "POST",
      });
      if (response.ok) {
        setActiveJob(prev => prev ? { ...prev, status: 'cancelled' } : null);
        setCancelDialogOpen(false);
        toast({ title: "Batch Cancelled" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to cancel batch.", variant: "destructive" });
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isApproachingLimit = validation && validation.totalCompanies > 90;
  const isOverLimit = validation && validation.totalCompanies > 100;
  const isJobRunning = activeJob && (activeJob.status === 'pending' || activeJob.status === 'processing');
  const isJobPaused = activeJob?.status === 'paused';

  return (
    <Layout>
      <div className="container mx-auto max-w-6xl px-3 md:px-4 py-4 md:py-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight" data-testid="heading-batch-research">
            Batch Research
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Process multiple companies at once with high-volume batch research.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="tabs-batch-research">
            <TabsTrigger value="new-batch" data-testid="tab-new-batch">New Batch</TabsTrigger>
            <TabsTrigger value="active-jobs" data-testid="tab-active-jobs">
              Active Jobs
              {activeJobs.filter(j => j.status === 'processing' || j.status === 'pending').length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeJobs.filter(j => j.status === 'processing' || j.status === 'pending').length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="new-batch">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      CSV Upload
                    </CardTitle>
                    <CardDescription>
                      Upload a CSV file with columns: company_name (required), investor_group, priority
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                        isDragging
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-primary/50"
                      }`}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="dropzone-csv"
                    >
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="font-medium">Drag & drop your CSV file here</p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleFileInputChange}
                        data-testid="input-csv-file"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Text Input
                    </CardTitle>
                    <CardDescription>
                      Paste company names (one per line or comma-separated)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Apple Inc.&#10;Microsoft Corporation&#10;Google LLC"
                      className="min-h-[150px] font-mono text-sm"
                      value={textInput}
                      onChange={handleTextInputChange}
                      data-testid="textarea-companies"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Tip: Names will be automatically normalized and deduplicated
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {parsedCompanies.length > 0 && (
                  <>
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle>Preview & Validation</CardTitle>
                          <Button variant="ghost" size="sm" onClick={clearAll} data-testid="button-clear-all">
                            <Trash2 className="h-4 w-4 mr-1" />
                            Clear All
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {validation && (
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="text-center p-3 bg-muted rounded-lg">
                              <div className="text-2xl font-bold" data-testid="text-total-companies">
                                {validation.totalCompanies}
                              </div>
                              <div className="text-xs text-muted-foreground">To Research</div>
                            </div>
                            <div className="text-center p-3 bg-muted rounded-lg">
                              <div className="text-2xl font-bold text-yellow-600" data-testid="text-duplicates">
                                {validation.duplicatesRemoved}
                              </div>
                              <div className="text-xs text-muted-foreground">Duplicates</div>
                            </div>
                            <div className="text-center p-3 bg-muted rounded-lg">
                              <div className="text-2xl font-bold text-blue-600" data-testid="text-existing">
                                {validation.existingInReports}
                              </div>
                              <div className="text-xs text-muted-foreground">Existing</div>
                            </div>
                          </div>
                        )}

                        {isApproachingLimit && !isOverLimit && (
                          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            <span className="text-sm text-yellow-800">
                              Approaching 100 company limit ({validation?.totalCompanies}/100)
                            </span>
                          </div>
                        )}

                        {isOverLimit && (
                          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                            <span className="text-sm text-red-800">
                              Exceeds 100 company limit. Please remove {(validation?.totalCompanies || 0) - 100} companies.
                            </span>
                          </div>
                        )}

                        <div className="border rounded-lg max-h-[300px] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Company Name</TableHead>
                                <TableHead className="w-[100px]">Status</TableHead>
                                <TableHead className="w-[80px]">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {parsedCompanies.slice(0, 50).map((company) => (
                                <TableRow 
                                  key={company.id}
                                  className={company.isDuplicate ? "opacity-50" : ""}
                                  data-testid={`row-company-${company.id}`}
                                >
                                  <TableCell>
                                    {editingCompany === company.id ? (
                                      <div className="flex gap-2">
                                        <Input
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="h-8"
                                          data-testid={`input-edit-${company.id}`}
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => saveEdit(company.id)}
                                          data-testid={`button-save-${company.id}`}
                                        >
                                          Save
                                        </Button>
                                      </div>
                                    ) : (
                                      <span className="font-medium">{company.company_name}</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {company.isDuplicate ? (
                                      <Badge variant="outline" className="text-yellow-600">Duplicate</Badge>
                                    ) : company.existsInReports ? (
                                      <Badge variant="outline" className="text-blue-600">Exists</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-green-600">New</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => startEditing(company)}
                                        data-testid={`button-edit-${company.id}`}
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-500"
                                        onClick={() => removeCompany(company.id)}
                                        data-testid={`button-remove-${company.id}`}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {parsedCompanies.length > 50 && (
                          <p className="text-xs text-muted-foreground mt-2 text-center">
                            Showing first 50 of {parsedCompanies.length} companies
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Configuration</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="batch-size">Batch Size</Label>
                          <Select value={batchSize} onValueChange={setBatchSize} data-testid="select-batch-size">
                            <SelectTrigger className="w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="5">5</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="skip-existing"
                            checked={skipExisting}
                            onCheckedChange={(checked) => setSkipExisting(checked as boolean)}
                            data-testid="checkbox-skip-existing"
                          />
                          <Label htmlFor="skip-existing" className="cursor-pointer">
                            Skip companies with existing reports
                          </Label>
                        </div>

                        {getEstimatedTime() && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            Estimated completion time: {getEstimatedTime()}
                          </div>
                        )}

                        <Button
                          className="w-full"
                          size="lg"
                          disabled={isStarting || isOverLimit || parsedCompanies.length === 0}
                          onClick={startBatch}
                          data-testid="button-start-batch"
                        >
                          {isStarting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Starting...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Start Batch Research
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </>
                )}

                {parsedCompanies.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Companies Added</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        Upload a CSV file or paste company names to get started.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="active-jobs">
            {activeJob && (isJobRunning || isJobPaused) && (
              <Card className="mb-6">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {isJobPaused ? (
                        <Pause className="h-5 w-5 text-yellow-500" />
                      ) : (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      )}
                      Current Job
                    </CardTitle>
                    <Badge variant={isJobPaused ? "outline" : "default"}>
                      {isJobPaused ? "Paused" : "In Progress"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>
                        Processing company {(activeJob.completedQueue || []).length + (activeJob.activeQueue || []).length} of {activeJob.totalCompanies}
                        {(activeJob.activeQueue || []).length > 0 && `: ${activeJob.activeQueue[0].name}`}
                      </span>
                      <span>{Math.round(activeJob.progress)}%</span>
                    </div>
                    <Progress value={activeJob.progress} className="h-3" />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Completed ({(activeJob.completedQueue || []).length})
                      </h4>
                      <div className="max-h-[200px] overflow-auto border rounded-lg">
                        {(activeJob.completedQueue || []).map((company, i) => (
                          <div key={i} className="px-3 py-2 border-b last:border-0 flex items-center gap-2">
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span className="text-sm">{company.name}</span>
                          </div>
                        ))}
                        {(activeJob.completedQueue || []).length === 0 && (
                          <p className="text-sm text-muted-foreground p-3">No companies completed yet</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Failed ({(activeJob.failedQueue || []).length})
                      </h4>
                      <div className="max-h-[200px] overflow-auto border rounded-lg">
                        {(activeJob.failedQueue || []).map((company, i) => (
                          <div key={i} className="px-3 py-2 border-b last:border-0">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-3 w-3 text-red-500" />
                              <span className="text-sm font-medium">{company.name}</span>
                            </div>
                            <p className="text-xs text-red-600 mt-1">{company.error}</p>
                          </div>
                        ))}
                        {(activeJob.failedQueue || []).length === 0 && (
                          <p className="text-sm text-muted-foreground p-3">No failures</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {isJobPaused ? (
                      <Button onClick={resumeJob} data-testid="button-resume">
                        <Play className="h-4 w-4 mr-2" />
                        Resume
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={pauseJob} data-testid="button-pause">
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => setCancelDialogOpen(true)}
                      data-testid="button-cancel"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeJobs.filter(j => j.id !== activeJob?.id).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Other Active Jobs</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Companies</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeJobs.filter(j => j.id !== activeJob?.id).map((job) => (
                        <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                          <TableCell className="font-mono text-xs">{job.id.slice(0, 8)}</TableCell>
                          <TableCell>
                            <Badge variant={job.status === 'paused' ? "outline" : "default"}>
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="w-24">
                              <Progress value={job.progress} className="h-2" />
                            </div>
                          </TableCell>
                          <TableCell>{(job.completedQueue || []).length}/{job.totalCompanies}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActiveJob(job)}
                              data-testid={`button-view-job-${job.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {activeJobs.length === 0 && !activeJob && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Active Jobs</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Start a new batch to see jobs here.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setActiveTab("new-batch")}
                    data-testid="button-go-new-batch"
                  >
                    Create New Batch
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            {historyJobs.length > 0 ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Companies</TableHead>
                        <TableHead>Success Rate</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyJobs.map((job) => {
                        const completedCount = (job.completedQueue || []).length;
                        const failedCount = (job.failedQueue || []).length;
                        const successRate = job.totalCompanies > 0
                          ? Math.round((completedCount / job.totalCompanies) * 100)
                          : 0;
                        const duration = job.completedAt && job.startedAt
                          ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
                          : 0;
                        
                        return (
                          <TableRow key={job.id} data-testid={`row-history-${job.id}`}>
                            <TableCell>{formatDate(job.createdAt)}</TableCell>
                            <TableCell>
                              <span className="text-green-600">{completedCount}</span>
                              <span className="text-muted-foreground"> / {job.totalCompanies}</span>
                              {failedCount > 0 && (
                                <span className="text-red-600 ml-1">
                                  ({failedCount} failed)
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={successRate >= 90 ? "default" : successRate >= 50 ? "secondary" : "destructive"}
                              >
                                {successRate}%
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDuration(duration)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  job.status === 'completed' ? "default" :
                                  job.status === 'cancelled' ? "outline" : "destructive"
                                }
                              >
                                {job.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No History Yet</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Completed batch jobs will appear here.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Batch Research?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop processing remaining companies. Companies already completed will be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Running</AlertDialogCancel>
            <AlertDialogAction onClick={cancelJob} className="bg-destructive text-destructive-foreground">
              Cancel Batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
