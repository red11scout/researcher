import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from '@/lib/formatters';
import { chartColors } from './chart-config';

interface UseCase {
  useCase?: string;
  name?: string;
  function?: string;
  department?: string;
  tier?: string;
  priority?: string;
  annualValue?: number;
  totalAnnualImpact?: number;
  priorityScore?: number;
  roi?: number;
}

interface UseCasesTableProps {
  useCases: UseCase[];
  limit?: number;
}

function getPriorityBadgeColor(tier: string): string {
  switch (tier.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'high':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'medium':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'low':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}

export function UseCasesTable({ useCases, limit = 10 }: UseCasesTableProps) {
  const displayUseCases = useCases.slice(0, limit);

  if (displayUseCases.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500">
        No use cases available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-slate-200">
            <TableHead className="text-slate-600 font-semibold">Use Case</TableHead>
            <TableHead className="text-slate-600 font-semibold">Department</TableHead>
            <TableHead className="text-slate-600 font-semibold text-right">Annual Value</TableHead>
            <TableHead className="text-slate-600 font-semibold text-right">Score</TableHead>
            <TableHead className="text-slate-600 font-semibold">Priority</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayUseCases.map((uc, index) => {
            const tier = uc.tier || uc.priority || 'Medium';
            const value = uc.annualValue || uc.totalAnnualImpact || 0;
            const score = uc.priorityScore || 0;
            
            return (
              <TableRow 
                key={index} 
                className="border-b border-slate-100 hover:bg-slate-50"
                data-testid={`row-usecase-${index}`}
              >
                <TableCell className="font-medium text-slate-900">
                  {uc.useCase || uc.name || `Use Case ${index + 1}`}
                </TableCell>
                <TableCell className="text-slate-600">
                  {uc.function || uc.department || 'General'}
                </TableCell>
                <TableCell className="text-right font-medium text-slate-900">
                  {format.currencyAuto(value)}
                </TableCell>
                <TableCell className="text-right text-slate-600">
                  {score > 0 ? score.toFixed(0) : '-'}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={getPriorityBadgeColor(tier)}
                  >
                    {tier}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {useCases.length > limit && (
        <p className="text-sm text-slate-500 mt-4 text-center">
          Showing {limit} of {useCases.length} use cases
        </p>
      )}
    </div>
  );
}
