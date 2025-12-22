import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, Building2, TrendingUp, ShieldCheck, FileText, Upload, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import heroBg from "@assets/generated_images/clean_white_and_blue_abstract_enterprise_background.png";
import blueAllyLogo from "@assets/image_1764371505115.png";

interface UploadedDocument {
  name: string;
  content: string;
  size: number;
  type: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file (for PDFs)
const ALLOWED_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".pdf"]; // Supported formats

export default function Home() {
  const [query, setQuery] = useState("");
  const [_, setLocation] = useLocation();
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    // Validate files before upload
    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} - Supported formats: PDF, TXT, MD, CSV, JSON`,
          variant: "destructive",
        });
        continue;
      }
      
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit`,
          variant: "destructive",
        });
        continue;
      }
      
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);
    try {
      // Upload files to server for processing (especially PDFs)
      const formData = new FormData();
      for (const file of validFiles) {
        formData.append("files", file);
      }

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      
      // Check if serialized documents would exceed sessionStorage limits
      // sessionStorage uses UTF-16 encoding, so each character takes 2 bytes
      const combinedDocs = [...documents, ...result.documents];
      const jsonString = JSON.stringify(combinedDocs);
      const storageBytes = jsonString.length * 2; // UTF-16 encoding
      
      // sessionStorage limit is typically 5MB, use 4MB as safe limit
      const SAFE_STORAGE_LIMIT = 4 * 1024 * 1024;
      
      if (storageBytes > SAFE_STORAGE_LIMIT) {
        toast({
          title: "Text content too large",
          description: "Extracted text exceeds storage limit. Try uploading fewer or smaller documents.",
          variant: "destructive",
        });
        return;
      }

      // Add processed documents
      setDocuments(prev => [...prev, ...result.documents]);
      setShowDocuments(true);

      // Show any processing errors
      if (result.errors && result.errors.length > 0) {
        for (const err of result.errors) {
          toast({
            title: "File processing error",
            description: `${err.name}: ${err.error}`,
            variant: "destructive",
          });
        }
      }

      if (result.documents.length > 0) {
        toast({
          title: "Files uploaded",
          description: `${result.documents.length} document(s) processed successfully`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [toast, documents]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // Store documents in sessionStorage to pass to report page
      if (documents.length > 0) {
        try {
          sessionStorage.setItem("uploadedDocuments", JSON.stringify(documents));
        } catch (storageError) {
          // If storage fails, proceed without documents but notify user
          console.error("Failed to store documents:", storageError);
          toast({
            title: "Document upload issue",
            description: "Documents couldn't be saved. Analysis will proceed without uploaded files.",
            variant: "destructive",
          });
          sessionStorage.removeItem("uploadedDocuments");
        }
      } else {
        sessionStorage.removeItem("uploadedDocuments");
      }
      setLocation(`/report?company=${encodeURIComponent(query)}`);
    }
  };

  return (
    <Layout>
      <div className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center overflow-hidden px-4">
        {/* Abstract Background */}
        <div className="absolute inset-0 z-0 opacity-10">
          <img 
            src={heroBg} 
            alt="Background" 
            className="w-full h-full object-cover"
          />
        </div>

        <div className="container relative z-10 px-0 md:px-6 flex flex-col items-center text-center max-w-4xl mx-auto pt-4 md:pt-0 md:-mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img 
              src={blueAllyLogo} 
              alt="BlueAlly" 
              className="h-10 md:h-14 w-auto mb-4 md:mb-6 mx-auto"
            />
            <div className="inline-flex items-center rounded-full border px-2 md:px-2.5 py-0.5 text-[10px] md:text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 mb-4 md:mb-6">
              <Sparkles className="mr-1 h-3 w-3" />
              Powered by BlueAllyAI
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight text-foreground mb-4 md:mb-6 leading-tight">
              Deep corporate intelligence, <br className="hidden sm:block" />
              <span className="text-primary">simplified.</span>
            </h1>
            <p className="text-base md:text-lg lg:text-xl text-muted-foreground mb-6 md:mb-10 max-w-2xl mx-auto px-2">
              Generate comprehensive research reports with industry benchmarks, 
              risk analysis, and strategic insights in seconds.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-2xl"
          >
            <form onSubmit={handleSearch} className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-blue-600/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-background border rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 p-2 gap-2 sm:gap-0">
                <div className="flex items-center flex-1">
                  <Search className="ml-2 sm:ml-4 h-5 w-5 md:h-6 md:w-6 text-muted-foreground flex-shrink-0" />
                  <Input 
                    type="text" 
                    placeholder="Enter company name..." 
                    className="flex-1 border-0 bg-transparent text-base md:text-lg h-12 md:h-14 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/50"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    data-testid="input-company-name"
                  />
                </div>
                <Button size="lg" type="submit" className="h-11 md:h-12 px-6 md:px-8 rounded-lg text-sm md:text-base font-medium shadow-none w-full sm:w-auto" data-testid="button-research">
                  Research
                </Button>
              </div>
            </form>

            {/* Document Upload Section */}
            <div className="mt-4 w-full">
              <button
                type="button"
                onClick={() => setShowDocuments(!showDocuments)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                data-testid="button-toggle-documents"
              >
                <FileText className="h-4 w-4" />
                <span>Add documents for context</span>
                {showDocuments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {documents.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                    {documents.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showDocuments && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4"
                  >
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                        isDragging 
                          ? "border-primary bg-primary/5" 
                          : "border-muted-foreground/25 hover:border-muted-foreground/50"
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".txt,.md,.csv,.json,.pdf"
                        onChange={(e) => handleFiles(e.target.files)}
                        className="hidden"
                        disabled={isUploading}
                        data-testid="input-file-upload"
                      />
                      
                      <div className="flex flex-col items-center gap-3">
                        {isUploading ? (
                          <>
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">Processing files...</p>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">
                                Drag & drop files here or{" "}
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="text-primary hover:underline"
                                  data-testid="button-browse-files"
                                >
                                  browse
                                </button>
                              </p>
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Supports PDF, TXT, MD, CSV, JSON (max 10MB each)
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {documents.length > 0 && (
                        <div className="mt-4 space-y-2">
                          {documents.map((doc, index) => (
                            <div
                              key={`${doc.name}-${index}`}
                              className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                              data-testid={`document-item-${index}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                                <span className="text-sm truncate">{doc.name}</span>
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  ({(doc.size / 1024).toFixed(1)} KB)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeDocument(index)}
                                className="p-1 hover:bg-destructive/10 rounded transition-colors flex-shrink-0"
                                data-testid={`button-remove-document-${index}`}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground/70 text-center mt-3">
                      Upload company reports, use case descriptions, or any relevant documents to enhance the AI analysis
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-8 mt-10 md:mt-20 w-full"
          >
            <FeatureCard 
              icon={<Building2 className="h-5 w-5 md:h-6 md:w-6 text-primary" />}
              title="Comprehensive Profiles"
              description="Detailed overview of business models, products, and market positioning."
            />
            <FeatureCard 
              icon={<TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-primary" />}
              title="Market Benchmarks"
              description="Conservative industry estimates and competitor analysis driven by data."
            />
            <FeatureCard 
              icon={<ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-primary" />}
              title="Critical Analysis"
              description="AI-driven self-critique to ensure accuracy and highlight potential risks."
            />
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="flex flex-col items-center p-4 md:p-6 rounded-xl border bg-card/50 backdrop-blur-sm hover:bg-card transition-colors text-center">
      <div className="mb-3 md:mb-4 p-2.5 md:p-3 rounded-full bg-primary/10">
        {icon}
      </div>
      <h3 className="text-base md:text-lg font-semibold mb-1.5 md:mb-2">{title}</h3>
      <p className="text-xs md:text-sm text-muted-foreground">{description}</p>
    </div>
  );
}