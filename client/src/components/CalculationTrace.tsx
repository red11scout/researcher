import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, Calculator } from 'lucide-react';

interface CalculationTraceProps {
  label: string;
  value: number;
  formula: string;
  inputs: Record<string, number>;
  intermediates?: Record<string, number>;
  formatValue?: (val: number) => string;
}

export function CalculationTrace({
  label,
  value,
  formula,
  inputs,
  intermediates,
  formatValue = (v) => v.toLocaleString(),
}: CalculationTraceProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2 text-muted-foreground hover:text-foreground"
          data-testid={`button-trace-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <Info className="h-3 w-3 mr-1" />
          How computed
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {label} Calculation
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Result</div>
            <div className="text-2xl font-bold" data-testid="trace-result">
              {formatValue(value)}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Formula</div>
            <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-sm font-mono" data-testid="trace-formula">
              {formula}
            </code>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Inputs</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variable</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(inputs).map(([key, val]) => (
                  <TableRow key={key}>
                    <TableCell className="font-mono text-sm">{key}</TableCell>
                    <TableCell className="text-right font-mono text-sm" data-testid={`trace-input-${key}`}>
                      {typeof val === 'number' && val < 1 && val > 0
                        ? (val * 100).toFixed(1) + '%'
                        : val.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {intermediates && Object.keys(intermediates).length > 0 && (
            <div>
              <div className="text-sm font-medium mb-2">Intermediate Values</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(intermediates).map(([key, val]) => (
                    <TableRow key={key}>
                      <TableCell className="font-mono text-sm">{key}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {val.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-2 border-t">
            All calculations are deterministic. Values update when assumptions change.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CalculationTrace;
