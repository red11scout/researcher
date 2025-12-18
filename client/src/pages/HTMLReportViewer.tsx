import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Copy, Printer, ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { type Report } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { format, parseFormattedValue } from '@/lib/formatters';

const BLUEALLY_LOGO_WHITE = 'data:image/png;base64,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';

const formatCurrency = (value: number | string): string => {
  if (typeof value === 'string') {
    if (value.startsWith('$')) return value;
    const num = parseFormattedValue(value);
    if (num === 0 && value !== '0' && value !== '$0') return value;
    return format.currencyAuto(num);
  }
  return format.currencyAuto(value);
};

const formatNumber = (value: number | string): string => {
  if (typeof value === 'string') {
    const num = parseFormattedValue(value);
    if (num === 0 && value !== '0') return value;
    return format.number(num, { compact: true });
  }
  return format.number(value, { compact: true });
};

// Format table cell values with commas for large numbers
const formatTableValue = (value: any, columnName?: string): string => {
  if (value === null || value === undefined) return '';
  
  const strValue = String(value);
  
  // If it already has formatting ($ or %), return as is but ensure commas
  if (strValue.startsWith('$')) {
    // Format currency values with commas
    const numStr = strValue.replace(/[$,]/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num)) {
      return '$' + num.toLocaleString('en-US');
    }
    return strValue;
  }
  
  // Check if it's a pure number (no letters except for common suffixes)
  const numericValue = strValue.replace(/,/g, '');
  const num = parseFloat(numericValue);
  
  // If it's a valid number and looks like a large numeric value
  if (!isNaN(num) && /^-?\d+\.?\d*$/.test(numericValue)) {
    // For very large numbers (tokens, runs), use commas
    if (Math.abs(num) >= 1000) {
      return num.toLocaleString('en-US');
    }
    return strValue;
  }
  
  // Return original value if not a number
  return strValue;
};

// Sanitize text to remove any remaining markdown artifacts
const sanitizeForProse = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^[-_*]{3,}\s*$/gm, '')
    .replace(/^\s*[-*]\s+/gm, '') // Remove bullet list markers
    .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
    .replace(/\|\s*[-:]+\s*\|/g, '')
    .replace(/^\|(.+)\|$/gm, (_, content) => {
      const cells = content.split('|').map((c: string) => c.trim()).filter((c: string) => c);
      return cells.join(', ');
    })
    .replace(/\|/g, ' ')
    .replace(/⚠️?/g, '')
    .replace(/[\u2600-\u26FF\u2700-\u27BF]/g, '')
    .replace(/[→←↑↓↗↘]/g, '')
    .replace(/\[(HIGH|MEDIUM|LOW|ASSUMPTION|ESTIMATED|DATED)[^\]]*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

// Render professional prose as formatted paragraphs
const renderProseContent = (content: string): React.ReactNode => {
  if (!content) return null;
  
  // Sanitize any remaining markdown artifacts
  const cleanContent = sanitizeForProse(content);
  
  // Split into paragraphs
  const paragraphs = cleanContent.split(/\n\n+/).filter(p => p.trim());
  
  return (
    <div>
      {paragraphs.map((para, idx) => (
        <p key={idx} style={{ 
          fontSize: 15, 
          color: '#374151',
          lineHeight: 1.8,
          marginBottom: 16,
          textAlign: 'justify'
        }}>
          {para.trim()}
        </p>
      ))}
    </div>
  );
};

// Parse executive transformation markdown format to structured HTML (legacy support)
const renderExecutiveContent = (content: string): React.ReactNode => {
  if (!content) return null;
  
  // Check if content is plain prose (no markdown indicators)
  const hasMarkdown = content.includes('###') || content.includes('**') || content.includes('|');
  if (!hasMarkdown) {
    return renderProseContent(content);
  }
  
  const elements: React.ReactNode[] = [];
  
  // Split by horizontal rule to separate Company Profile from Key Business Challenges
  const sections = content.split(/\n---\n|\n-{3,}\n/);
  
  sections.forEach((section, sectionIdx) => {
    const trimmedSection = section.trim();
    if (!trimmedSection) return;
    
    // Check for markdown table (| ... |)
    if (trimmedSection.includes('|') && trimmedSection.split('\n').some(line => line.trim().startsWith('|'))) {
      const lines = trimmedSection.split('\n');
      const tableRows: string[][] = [];
      let headerRow: string[] = [];
      let inTable = false;
      
      lines.forEach((line, lineIdx) => {
        const trimmedLine = line.trim();
        
        // Handle markdown ### headers (new format)
        const h3Match = trimmedLine.match(/^###\s*(.+)$/);
        if (h3Match) {
          const headerText = h3Match[1].replace(/[⚠️]/g, '').trim();
          const isCritical = trimmedLine.includes('Critical Assumptions');
          elements.push(
            <h3 key={`h3-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 20, 
              fontWeight: 700, 
              color: isCritical ? '#c45500' : '#001278',
              marginTop: 28,
              marginBottom: 12,
              borderBottom: isCritical ? '2px solid #f59e0b' : '2px solid #02a2fa',
              paddingBottom: 8
            }}>
              {isCritical ? '⚠️ ' : ''}{headerText}
            </h3>
          );
          return;
        }
        
        // Handle bold headers before tables (legacy format)
        if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**') && !trimmedLine.includes('|')) {
          const headerText = trimmedLine.replace(/\*\*/g, '');
          elements.push(
            <h3 key={`header-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 18, 
              fontWeight: 700, 
              color: '#001278',
              marginTop: 24,
              marginBottom: 8
            }}>
              {headerText}
            </h3>
          );
          return;
        }
        
        // Handle revenue/earnings line with bold numbers
        if (trimmedLine.includes('**') && !trimmedLine.startsWith('|') && !trimmedLine.startsWith('**Company') && !trimmedLine.startsWith('**Key')) {
          const formattedLine = trimmedLine.split('**').map((part, i) => 
            i % 2 === 1 ? <strong key={i} style={{ fontSize: 24, color: '#001278' }}>{part}</strong> : part
          );
          elements.push(
            <p key={`bignum-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 16, 
              color: '#374151',
              marginBottom: 16,
              lineHeight: 1.6
            }}>
              {formattedLine}
            </p>
          );
          return;
        }
        
        // Handle ticker/HQ line
        if (!trimmedLine.startsWith('|') && !trimmedLine.includes('**') && trimmedLine.includes(' | ')) {
          elements.push(
            <p key={`ticker-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 14, 
              color: '#64748b',
              marginBottom: 4,
              fontWeight: 500
            }}>
              {trimmedLine}
            </p>
          );
          return;
        }
        
        // Parse table rows
        if (trimmedLine.startsWith('|')) {
          // Skip separator row (|---|---|)
          if (trimmedLine.includes('---')) return;
          
          const cells = trimmedLine.split('|').filter(c => c.trim()).map(c => c.trim());
          if (!inTable) {
            headerRow = cells;
            inTable = true;
          } else {
            tableRows.push(cells);
          }
        }
      });
      
      // Render the table if we have rows
      if (tableRows.length > 0 || headerRow.length > 0) {
        elements.push(
          <table key={`table-${sectionIdx}`} style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            marginBottom: 20,
            fontSize: 14
          }}>
            {headerRow.length > 0 && headerRow[0] && (
              <thead>
                <tr style={{ borderBottom: '2px solid #001278' }}>
                  {headerRow.map((cell, cellIdx) => (
                    <th key={cellIdx} style={{ 
                      padding: '10px 12px',
                      color: '#001278',
                      fontWeight: 700,
                      textAlign: 'left',
                      fontSize: 13
                    }}>
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.map((row, rowIdx) => (
                <tr key={rowIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} style={{ 
                      padding: '10px 12px',
                      color: cellIdx === 0 ? '#64748b' : '#1e293b',
                      fontWeight: cellIdx === 0 ? 400 : 600
                    }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      
      return;
    }
    
    // Handle sections starting with ### headers (new format)
    const h3SectionMatch = trimmedSection.match(/^###\s*(.+)$/m);
    if (h3SectionMatch) {
      const lines = trimmedSection.split('\n');
      
      lines.forEach((line, lineIdx) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        // Handle ### header
        const h3Match = trimmedLine.match(/^###\s*(.+)$/);
        if (h3Match) {
          const headerText = h3Match[1].replace(/[⚠️]/g, '').trim();
          const isCritical = trimmedLine.includes('Critical Assumptions');
          elements.push(
            <h3 key={`h3-section-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 20, 
              fontWeight: 700, 
              color: isCritical ? '#c45500' : '#001278',
              marginTop: 28,
              marginBottom: 12,
              borderBottom: isCritical ? '2px solid #f59e0b' : '2px solid #02a2fa',
              paddingBottom: 8
            }}>
              {isCritical ? '⚠️ ' : ''}{headerText}
            </h3>
          );
          return;
        }
        
        // Handle challenge headers **The $XM Problem: Name**
        const challengeMatch = trimmedLine.match(/^\*\*([^*]+)\*\*$/);
        if (challengeMatch) {
          elements.push(
            <h4 key={`challenge-new-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 15, 
              fontWeight: 600, 
              color: '#1e293b',
              marginTop: 16,
              marginBottom: 6
            }}>
              {challengeMatch[1]}
            </h4>
          );
          return;
        }
        
        // Handle inline bold text (revenue/earnings)
        if (trimmedLine.includes('**') && !trimmedLine.startsWith('|')) {
          const formattedLine = trimmedLine.split('**').map((part, i) => 
            i % 2 === 1 ? <strong key={i} style={{ fontSize: 24, color: '#001278' }}>{part}</strong> : part
          );
          elements.push(
            <p key={`bignum-new-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 16, 
              color: '#374151',
              marginBottom: 16,
              lineHeight: 1.6
            }}>
              {formattedLine}
            </p>
          );
          return;
        }
        
        // Handle ticker/HQ line
        if (trimmedLine.includes(' | ') && !trimmedLine.startsWith('|')) {
          elements.push(
            <p key={`ticker-new-${sectionIdx}-${lineIdx}`} style={{ 
              fontSize: 14, 
              color: '#64748b',
              marginBottom: 4,
              fontWeight: 500
            }}>
              {trimmedLine}
            </p>
          );
          return;
        }
        
        // Regular paragraph text
        elements.push(
          <p key={`para-new-${sectionIdx}-${lineIdx}`} style={{ 
            fontSize: 14, 
            color: '#4b5563',
            lineHeight: 1.7,
            marginBottom: 12
          }}>
            {trimmedLine}
          </p>
        );
      });
      
      return;
    }
    
    // Parse bold section headers like **Key Business Challenges** or **The $3B Problem: Shrink** (legacy format)
    const boldHeaderMatch = trimmedSection.match(/^\*\*([^*]+)\*\*\s*([\s\S]*)/);
    if (boldHeaderMatch) {
      const header = boldHeaderMatch[1];
      const body = boldHeaderMatch[2].trim();
      
      // Check if this is a main section header or a challenge header
      const isMainSection = header === 'Company Profile' || header === 'Key Business Challenges';
      
      elements.push(
        <h3 key={`bold-header-${sectionIdx}`} style={{ 
          fontSize: isMainSection ? 20 : 16, 
          fontWeight: 700, 
          color: isMainSection ? '#001278' : '#1e293b',
          marginTop: isMainSection ? 24 : 16,
          marginBottom: 8,
          borderBottom: isMainSection ? '2px solid #02a2fa' : 'none',
          paddingBottom: isMainSection ? 8 : 0
        }}>
          {header}
        </h3>
      );
      
      if (body) {
        // Handle the body text - may contain nested bold sections for challenges
        const challengeParts = body.split(/(?=\*\*[^*]+\*\*)/);
        
        challengeParts.forEach((part, partIdx) => {
          const challengeMatch = part.match(/^\*\*([^*]+)\*\*\s*([\s\S]*)/);
          if (challengeMatch) {
            elements.push(
              <h4 key={`challenge-${sectionIdx}-${partIdx}`} style={{ 
                fontSize: 15, 
                fontWeight: 600, 
                color: '#1e293b',
                marginTop: 16,
                marginBottom: 6
              }}>
                {challengeMatch[1]}
              </h4>
            );
            if (challengeMatch[2].trim()) {
              elements.push(
                <p key={`challenge-body-${sectionIdx}-${partIdx}`} style={{ 
                  fontSize: 14, 
                  color: '#4b5563',
                  lineHeight: 1.7,
                  marginBottom: 12
                }}>
                  {challengeMatch[2].trim()}
                </p>
              );
            }
          } else if (part.trim()) {
            elements.push(
              <p key={`part-${sectionIdx}-${partIdx}`} style={{ 
                fontSize: 14, 
                color: '#4b5563',
                lineHeight: 1.7,
                marginBottom: 12
              }}>
                {part.trim()}
              </p>
            );
          }
        });
      }
      
      return;
    }
    
    // Default paragraph rendering
    elements.push(
      <p key={`para-${sectionIdx}`} style={{ 
        fontSize: 14, 
        color: '#4b5563',
        lineHeight: 1.7,
        marginBottom: 12
      }}>
        {trimmedSection}
      </p>
    );
  });
  
  return <div>{elements}</div>;
};

// Parse Value Drivers - use prose rendering for clean content
const renderValueDriversContent = (content: string): React.ReactNode => {
  if (!content) return null;
  
  // Check if content is plain prose (no markdown indicators)
  const hasMarkdown = content.includes('###') || content.includes('**') || content.includes('|');
  if (!hasMarkdown) {
    return renderProseContent(content);
  }
  
  const elements: React.ReactNode[] = [];
  
  // Split by horizontal rules to separate sections (legacy markdown support)
  const sections = content.split(/\n---\n|\n-{3,}\n/);
  
  sections.forEach((section, sectionIdx) => {
    const trimmedSection = section.trim();
    if (!trimmedSection) return;
    
    const lines = trimmedSection.split('\n');
    let inTable = false;
    const tableRows: string[][] = [];
    let headerRow: string[] = [];
    
    lines.forEach((line, lineIdx) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;
      
      // Handle ### headers
      const h3Match = trimmedLine.match(/^###\s*(.+)$/);
      if (h3Match) {
        // Flush any pending table
        if (tableRows.length > 0 || headerRow.length > 0) {
          elements.push(
            <table key={`table-vd-${sectionIdx}-${lineIdx}`} style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              marginBottom: 20,
              fontSize: 14
            }}>
              {headerRow.length > 0 && (
                <thead>
                  <tr style={{ background: '#001278' }}>
                    {headerRow.map((cell, cellIdx) => (
                      <th key={cellIdx} style={{ 
                        padding: '10px 12px',
                        color: 'white',
                        fontWeight: 600,
                        textAlign: 'left',
                        fontSize: 13
                      }}>
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {tableRows.map((row, rowIdx) => (
                  <tr key={rowIdx} style={{ borderBottom: '1px solid #e2e8f0', background: rowIdx % 2 === 0 ? '#f8fafc' : 'white' }}>
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} style={{ 
                        padding: '10px 12px',
                        color: '#1e293b'
                      }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
          tableRows.length = 0;
          headerRow = [];
          inTable = false;
        }
        
        const headerText = h3Match[1].replace(/[⚠️]/g, '').trim();
        const isRisk = trimmedLine.includes('Portfolio Risk') || trimmedLine.includes('Critical');
        elements.push(
          <h3 key={`h3-vd-${sectionIdx}-${lineIdx}`} style={{ 
            fontSize: 18, 
            fontWeight: 700, 
            color: isRisk ? '#c45500' : '#001278',
            marginTop: 24,
            marginBottom: 12,
            borderBottom: isRisk ? '2px solid #f59e0b' : '2px solid #02a2fa',
            paddingBottom: 8
          }}>
            {isRisk ? '⚠️ ' : ''}{headerText}
          </h3>
        );
        return;
      }
      
      // Handle markdown tables
      if (trimmedLine.startsWith('|')) {
        if (trimmedLine.includes('---')) return; // Skip separator row
        
        const cells = trimmedLine.split('|').filter(c => c.trim()).map(c => c.trim());
        if (cells.length >= 2) {
          if (!inTable) {
            headerRow = cells;
            inTable = true;
          } else {
            tableRows.push(cells);
          }
        }
        return;
      } else if (inTable && (tableRows.length > 0 || headerRow.length > 0)) {
        // End of table - render it
        elements.push(
          <table key={`table-vd-end-${sectionIdx}-${lineIdx}`} style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            marginBottom: 20,
            fontSize: 14
          }}>
            {headerRow.length > 0 && (
              <thead>
                <tr style={{ background: '#001278' }}>
                  {headerRow.map((cell, cellIdx) => (
                    <th key={cellIdx} style={{ 
                      padding: '10px 12px',
                      color: 'white',
                      fontWeight: 600,
                      textAlign: 'left',
                      fontSize: 13
                    }}>
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.map((row, rowIdx) => (
                <tr key={rowIdx} style={{ borderBottom: '1px solid #e2e8f0', background: rowIdx % 2 === 0 ? '#f8fafc' : 'white' }}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} style={{ 
                      padding: '10px 12px',
                      color: '#1e293b'
                    }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
        tableRows.length = 0;
        headerRow = [];
        inTable = false;
      }
      
      // Handle big headline numbers like **$52.4M** in annual value
      if (trimmedLine.startsWith('**') && trimmedLine.includes('annual value')) {
        const formattedLine = trimmedLine.split('**').map((part, i) => 
          i % 2 === 1 ? <strong key={i} style={{ fontSize: 28, color: '#001278' }}>{part}</strong> : part
        );
        elements.push(
          <p key={`headline-${sectionIdx}-${lineIdx}`} style={{ 
            fontSize: 18, 
            color: '#374151',
            marginBottom: 20,
            lineHeight: 1.6
          }}>
            {formattedLine}
          </p>
        );
        return;
      }
      
      // Handle use case headers **[Name]** — $X.XM
      const useCaseMatch = trimmedLine.match(/^\*\*([^*]+)\*\*\s*[—–-]\s*\$?([\d.,]+[MKB]?)/);
      if (useCaseMatch) {
        elements.push(
          <div key={`usecase-${sectionIdx}-${lineIdx}`} style={{ 
            marginTop: 16,
            marginBottom: 8
          }}>
            <strong style={{ fontSize: 15, color: '#1e293b' }}>{useCaseMatch[1]}</strong>
            <span style={{ color: '#001278', fontWeight: 600, marginLeft: 8 }}>— ${useCaseMatch[2]}</span>
          </div>
        );
        return;
      }
      
      // Handle bold headers like **If it fails:** or **Mitigation:** or **Strategic tilt:**
      const boldMatch = trimmedLine.match(/^\*\*([^*]+)\*\*:?\s*(.*)/);
      if (boldMatch) {
        elements.push(
          <div key={`bold-${sectionIdx}-${lineIdx}`} style={{ marginTop: 12, marginBottom: 8 }}>
            <strong style={{ fontSize: 14, color: '#1e293b' }}>{boldMatch[1]}:</strong>
            {boldMatch[2] && (
              <span style={{ fontSize: 14, color: '#4b5563', marginLeft: 6 }}>{boldMatch[2]}</span>
            )}
          </div>
        );
        return;
      }
      
      // Regular paragraph text
      elements.push(
        <p key={`para-vd-${sectionIdx}-${lineIdx}`} style={{ 
          fontSize: 14, 
          color: '#4b5563',
          lineHeight: 1.7,
          marginBottom: 8
        }}>
          {trimmedLine}
        </p>
      );
    });
    
    // Render any remaining table at end of section
    if (tableRows.length > 0 || headerRow.length > 0) {
      elements.push(
        <table key={`table-vd-final-${sectionIdx}`} style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          marginBottom: 20,
          fontSize: 14
        }}>
          {headerRow.length > 0 && (
            <thead>
              <tr style={{ background: '#001278' }}>
                {headerRow.map((cell, cellIdx) => (
                  <th key={cellIdx} style={{ 
                    padding: '10px 12px',
                    color: 'white',
                    fontWeight: 600,
                    textAlign: 'left',
                    fontSize: 13
                  }}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {tableRows.map((row, rowIdx) => (
              <tr key={rowIdx} style={{ borderBottom: '1px solid #e2e8f0', background: rowIdx % 2 === 0 ? '#f8fafc' : 'white' }}>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} style={{ 
                    padding: '10px 12px',
                    color: '#1e293b'
                  }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  });
  
  return <div>{elements}</div>;
};

export default function HTMLReportViewer() {
  const [, params] = useRoute("/reports/:id/html");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const id = params?.id;
  const [copied, setCopied] = useState(false);

  const { data: report, isLoading, error } = useQuery<Report>({
    queryKey: [`/api/reports/${id}`],
    enabled: !!id,
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({
        title: "Link Copied",
        description: "Shareable report link copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy Failed",
        description: "Unable to copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingCard}>
          <Loader2 style={{ width: 48, height: 48, color: '#001278', animation: 'spin 1s linear infinite' }} />
          <h2 style={{ marginTop: 16, color: '#001278', fontSize: 20, fontWeight: 600 }}>Loading Report...</h2>
          <p style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>Fetching your strategic assessment</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorCard}>
          <h2 style={{ color: '#dc2626', fontSize: 24, fontWeight: 600, marginBottom: 12 }}>Report Not Found</h2>
          <p style={{ color: '#64748b', marginBottom: 24 }}>The report you are looking for does not exist or has been removed.</p>
          <button
            onClick={() => setLocation("/")}
            style={styles.backButton}
            data-testid="button-return-home"
          >
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const analysis = report.analysisData as any;
  const companyName = report.companyName;

  return (
    <div style={styles.body}>
      <style>{printStyles}</style>
      
      {/* Floating Toolbar */}
      <div style={styles.toolbar} className="no-print">
        <button
          onClick={() => setLocation("/")}
          style={styles.toolbarButton}
          data-testid="button-back"
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
        </button>
        <button
          onClick={handleCopyLink}
          style={styles.toolbarButtonPrimary}
          data-testid="button-copy-link"
        >
          {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
          <span style={{ marginLeft: 8 }}>{copied ? 'Copied!' : 'Copy Link'}</span>
        </button>
        <button
          onClick={handlePrint}
          style={styles.toolbarButton}
          data-testid="button-print"
        >
          <Printer style={{ width: 16, height: 16 }} />
          <span style={{ marginLeft: 8 }}>Print</span>
        </button>
      </div>

      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <img src={BLUEALLY_LOGO_WHITE} alt="BlueAlly" style={styles.headerLogo} />
          <h1 style={styles.headerTitle}>AI Strategic Assessment</h1>
          <div style={styles.headerCompany} data-testid="text-company-name">{companyName}</div>
          <div style={styles.headerDate}>
            {new Date(report.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Executive Dashboard */}
        {analysis.executiveDashboard && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardHeaderTitle}>Executive Dashboard</h2>
            </div>
            <div style={styles.cardContent}>
              <div style={styles.executiveDashboard}>
                <div style={{ ...styles.metricBox, ...styles.metricBoxPrimary }}>
                  <div style={styles.metricLabel}>Total Annual AI Value Opportunity</div>
                  <div style={{ ...styles.metricValue, fontSize: 32 }}>
                    {formatCurrency(analysis.executiveDashboard.totalAnnualValue)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Revenue Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#16a34a' }}>
                    {formatCurrency(analysis.executiveDashboard.totalRevenueBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Cost Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#2563eb' }}>
                    {formatCurrency(analysis.executiveDashboard.totalCostBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Cash Flow Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#7c3aed' }}>
                    {formatCurrency(analysis.executiveDashboard.totalCashFlowBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Risk Benefit</div>
                  <div style={{ ...styles.metricValue, color: '#ea580c' }}>
                    {formatCurrency(analysis.executiveDashboard.totalRiskBenefit)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Monthly Tokens</div>
                  <div style={styles.metricValue}>
                    {formatNumber(analysis.executiveDashboard.totalMonthlyTokens)}
                  </div>
                </div>
                <div style={styles.metricBox}>
                  <div style={styles.metricLabel}>Value per 1M Tokens</div>
                  <div style={styles.metricValue}>
                    {formatCurrency(analysis.executiveDashboard.valuePerMillionTokens)}
                  </div>
                </div>
              </div>

              {/* Top Use Cases Table */}
              {analysis.executiveDashboard.topUseCases && analysis.executiveDashboard.topUseCases.length > 0 && (
                <>
                  <h3 style={styles.sectionSubtitle}>Top Priority Use Cases</h3>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Use Case</th>
                        <th style={styles.th}>Priority</th>
                        <th style={styles.th}>Tokens/Month</th>
                        <th style={styles.th}>Annual Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.executiveDashboard.topUseCases.map((uc: any, idx: number) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{uc.rank}</td>
                          <td style={styles.td}>{uc.useCase}</td>
                          <td style={styles.td}>{uc.priorityScore?.toFixed(0) || 'N/A'}</td>
                          <td style={styles.td}>{formatNumber(uc.monthlyTokens)}</td>
                          <td style={styles.td}>{formatCurrency(uc.annualValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        )}

        {/* Executive Summary / Value Drivers */}
        {analysis.summary && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardHeaderTitle}>Value Drivers</h2>
            </div>
            <div style={styles.cardContent}>
              {renderValueDriversContent(analysis.summary)}
            </div>
          </div>
        )}

        {/* Analysis Steps */}
        {analysis.steps?.map((step: any, stepIdx: number) => {
          const isBenefitsStep = step.step === 5;
          const columns = step.data && step.data.length > 0
            ? Object.keys(step.data[0]).filter(k => !k.includes('Formula')).slice(0, 6)
            : [];

          return (
            <div key={stepIdx} style={styles.card}>
              <div style={styles.cardHeader}>
                <h2 style={styles.cardHeaderTitle}>
                  <span style={styles.stepBadge}>{step.step}</span>
                  {step.title}
                </h2>
              </div>
              <div style={styles.cardContent}>
                {step.step === 0 && step.content ? (
                  renderExecutiveContent(step.content)
                ) : step.content && (
                  <p style={styles.stepContent}>{step.content}</p>
                )}

                {step.data && step.data.length > 0 && (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {columns.map((col, colIdx) => (
                          <th key={colIdx} style={styles.th}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {step.data.map((row: any, rowIdx: number) => (
                        <>
                          <tr key={rowIdx} style={styles.tr}>
                            {columns.map((col, colIdx) => (
                              <td key={colIdx} style={styles.td}>
                                {formatTableValue(row[col], col).substring(0, 60)}
                              </td>
                            ))}
                          </tr>
                          {isBenefitsStep && (
                            <tr key={`benefit-${rowIdx}`}>
                              <td colSpan={columns.length} style={{ padding: 0, background: '#f8fafc' }}>
                                <div style={styles.benefitGrid}>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitRevenue }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Grow Revenue</span>
                                      <span style={{ ...styles.benefitValue, background: '#a7f3d0', color: '#166534' }}>
                                        {formatTableValue(row['Revenue Benefit ($)']) || '$0'}
                                      </span>
                                    </div>
                                    {row['Revenue Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Revenue Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No revenue impact</em>
                                    )}
                                  </div>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitCost }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Reduce Cost</span>
                                      <span style={{ ...styles.benefitValue, background: '#bfdbfe', color: '#1e40af' }}>
                                        {formatTableValue(row['Cost Benefit ($)']) || '$0'}
                                      </span>
                                    </div>
                                    {row['Cost Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Cost Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No cost impact</em>
                                    )}
                                  </div>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitCashflow }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Cash Flow</span>
                                      <span style={{ ...styles.benefitValue, background: '#e9d5ff', color: '#7c3aed' }}>
                                        {formatTableValue(row['Cash Flow Benefit ($)']) || '$0'}
                                      </span>
                                    </div>
                                    {row['Cash Flow Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Cash Flow Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No cash flow impact</em>
                                    )}
                                  </div>
                                  <div style={{ ...styles.benefitCard, ...styles.benefitRisk }}>
                                    <div style={styles.benefitHeader}>
                                      <span style={styles.benefitLabel}>Reduce Risk</span>
                                      <span style={{ ...styles.benefitValue, background: '#fed7aa', color: '#c2410c' }}>
                                        {formatTableValue(row['Risk Benefit ($)']) || '$0'}
                                      </span>
                                    </div>
                                    {row['Risk Formula'] ? (
                                      <div style={styles.formulaBox}>{row['Risk Formula']}</div>
                                    ) : (
                                      <em style={{ color: '#64748b', fontSize: 12 }}>No risk impact</em>
                                    )}
                                  </div>
                                </div>
                                <div style={styles.totalSummary}>
                                  <div style={styles.totalHeaderRow}>
                                    <strong>Total Annual Value</strong>
                                    <span style={styles.totalValue}>{row['Total Annual Value ($)'] || '$0'}</span>
                                  </div>
                                  <div style={styles.totalBreakdown}>
                                    <span style={{ ...styles.breakdownChip, background: '#a7f3d0', color: '#166534' }}>
                                      {row['Revenue Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>+</span>
                                    <span style={{ ...styles.breakdownChip, background: '#bfdbfe', color: '#1e40af' }}>
                                      {row['Cost Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>+</span>
                                    <span style={{ ...styles.breakdownChip, background: '#e9d5ff', color: '#7c3aed' }}>
                                      {row['Cash Flow Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>+</span>
                                    <span style={{ ...styles.breakdownChip, background: '#fed7aa', color: '#c2410c' }}>
                                      {row['Risk Benefit ($)'] || '$0'}
                                    </span>
                                    <span style={styles.operator}>=</span>
                                    <span style={{ ...styles.breakdownChip, background: 'white', color: '#001278', fontWeight: 'bold' }}>
                                      {row['Total Annual Value ($)'] || '$0'}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div style={styles.footer}>
          <p>Prepared by <strong>BlueAlly Insight</strong> | Enterprise AI Advisory</p>
          <p>www.blueally.com</p>
        </div>
      </div>
    </div>
  );
}

const printStyles = `
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  body: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    background: '#f8fafc',
    color: '#1e293b',
    lineHeight: 1.6,
    minHeight: '100vh',
  },
  container: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '40px 20px',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
  },
  loadingCard: {
    background: 'white',
    padding: 40,
    borderRadius: 12,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    textAlign: 'center' as const,
  },
  errorContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
  },
  errorCard: {
    background: 'white',
    padding: 40,
    borderRadius: 12,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    textAlign: 'center' as const,
    maxWidth: 400,
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: '#001278',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  toolbar: {
    position: 'fixed' as const,
    top: 20,
    right: 20,
    display: 'flex',
    gap: 8,
    zIndex: 1000,
    background: 'white',
    padding: 8,
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  toolbarButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#f1f5f9',
    color: '#1e293b',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'background 0.2s',
  },
  toolbarButtonPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  header: {
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    padding: 40,
    textAlign: 'center' as const,
    borderRadius: 12,
    marginBottom: 30,
  },
  headerLogo: {
    height: 40,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    marginBottom: 10,
    fontWeight: 600,
    letterSpacing: 2,
    color: 'white',
    textTransform: 'uppercase' as const,
  },
  headerCompany: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 8,
    color: 'white',
  },
  headerDate: {
    opacity: 0.9,
    fontSize: 14,
    color: 'white',
  },
  card: {
    background: 'white',
    borderRadius: 12,
    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
    marginBottom: 24,
    overflow: 'hidden',
  },
  cardHeader: {
    background: '#f1f5f9',
    padding: '16px 24px',
    borderBottom: '1px solid #e2e8f0',
  },
  cardHeaderTitle: {
    fontSize: 18,
    color: '#001278',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: 0,
    fontWeight: 600,
  },
  stepBadge: {
    background: '#001278',
    color: 'white',
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cardContent: {
    padding: 24,
  },
  executiveDashboard: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  metricBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 16,
    textAlign: 'center' as const,
  },
  metricBoxPrimary: {
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    gridColumn: 'span 2',
    border: 'none',
  },
  metricLabel: {
    fontSize: 12,
    textTransform: 'uppercase' as const,
    opacity: 0.8,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  sectionSubtitle: {
    margin: '24px 0 16px',
    color: '#001278',
    fontSize: 16,
    fontWeight: 600,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
  },
  th: {
    background: '#001278',
    color: 'white',
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontWeight: 600,
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
  },
  tr: {
    transition: 'background 0.2s',
  },
  summaryText: {
    background: '#f8fafc',
    padding: 20,
    borderRadius: 8,
    borderLeft: '4px solid #001278',
    whiteSpace: 'pre-wrap' as const,
  },
  stepContent: {
    marginBottom: 16,
    color: '#64748b',
  },
  benefitGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    padding: 16,
  },
  benefitCard: {
    padding: 16,
    borderRadius: 8,
  },
  benefitRevenue: {
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
  },
  benefitCost: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
  },
  benefitCashflow: {
    background: '#faf5ff',
    border: '1px solid #e9d5ff',
  },
  benefitRisk: {
    background: '#fff7ed',
    border: '1px solid #fed7aa',
  },
  benefitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitLabel: {
    fontWeight: 600,
    fontSize: 14,
  },
  benefitValue: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: '4px 12px',
    borderRadius: 6,
  },
  formulaBox: {
    background: 'white',
    padding: 12,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 13,
    wordBreak: 'break-all' as const,
  },
  totalSummary: {
    background: 'linear-gradient(135deg, #001278 0%, #02a2fd 100%)',
    color: 'white',
    padding: 20,
    borderRadius: 8,
    margin: '0 16px 16px',
  },
  totalHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: 'bold',
    background: 'white',
    color: '#001278',
    padding: '8px 16px',
    borderRadius: 8,
  },
  totalBreakdown: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    alignItems: 'center',
    background: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 6,
  },
  breakdownChip: {
    padding: '4px 10px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  operator: {
    color: 'rgba(255,255,255,0.7)',
  },
  footer: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#64748b',
    fontSize: 14,
  },
};
