import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, RotateCcw, Calculator, Search } from 'lucide-react';

interface Assumption {
  key: string;
  label: string;
  valueNumber: number;
  defaultValueNumber: number;
  unit: string;
  category: string;
  description?: string;
}

interface AssumptionsTableProps {
  assumptions: Assumption[];
  onUpdate: (key: string, value: number) => void;
  onReset: (key: string) => void;
  onRecalculate: () => void;
  isLoading?: boolean;
}

export function AssumptionsTable({ 
  assumptions, 
  onUpdate, 
  onReset, 
  onRecalculate,
  isLoading = false 
}: AssumptionsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const filteredAssumptions = assumptions.filter(a => 
    a.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.key.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedAssumptions = filteredAssumptions.reduce((acc, assumption) => {
    const category = assumption.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(assumption);
    return acc;
  }, {} as Record<string, Assumption[]>);

  const handleEdit = (assumption: Assumption) => {
    setEditingKey(assumption.key);
    setEditValue(assumption.valueNumber.toString());
  };

  const handleSave = (key: string) => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      onUpdate(key, numValue);
    }
    setEditingKey(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === 'Enter') {
      handleSave(key);
    } else if (e.key === 'Escape') {
      setEditingKey(null);
      setEditValue('');
    }
  };

  const isModified = (a: Assumption) => a.valueNumber !== a.defaultValueNumber;

  return (
    <Card data-testid="assumptions-table-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Assumptions
            </CardTitle>
            <CardDescription>
              Edit assumptions to recalculate all values deterministically
            </CardDescription>
          </div>
          <Button 
            onClick={onRecalculate} 
            disabled={isLoading}
            data-testid="button-recalculate"
          >
            {isLoading ? 'Calculating...' : 'Recalculate All'}
          </Button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assumptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-assumptions"
          />
        </div>
      </CardHeader>
      <CardContent>
        {Object.entries(groupedAssumptions).map(([category, categoryAssumptions]) => (
          <div key={category} className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              {category}
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Assumption</TableHead>
                  <TableHead className="w-[150px]">Value</TableHead>
                  <TableHead className="w-[100px]">Unit</TableHead>
                  <TableHead className="w-[100px]">Default</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryAssumptions.map((assumption) => (
                  <TableRow 
                    key={assumption.key}
                    className={isModified(assumption) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}
                    data-testid={`row-assumption-${assumption.key}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{assumption.label}</span>
                        {isModified(assumption) && (
                          <Badge variant="outline" className="text-xs">Modified</Badge>
                        )}
                        {assumption.description && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">{assumption.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {editingKey === assumption.key ? (
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSave(assumption.key)}
                          onKeyDown={(e) => handleKeyDown(e, assumption.key)}
                          className="w-24 h-8"
                          autoFocus
                          data-testid={`input-assumption-${assumption.key}`}
                        />
                      ) : (
                        <button
                          onClick={() => handleEdit(assumption)}
                          className="text-left hover:bg-muted px-2 py-1 rounded cursor-pointer"
                          data-testid={`value-assumption-${assumption.key}`}
                        >
                          {assumption.unit === 'multiplier' || assumption.unit === 'pct'
                            ? (assumption.valueNumber * 100).toFixed(0) + '%'
                            : assumption.valueNumber.toLocaleString()}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {assumption.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {assumption.unit === 'multiplier' || assumption.unit === 'pct'
                        ? (assumption.defaultValueNumber * 100).toFixed(0) + '%'
                        : assumption.defaultValueNumber.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {isModified(assumption) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onReset(assumption.key)}
                              data-testid={`button-reset-${assumption.key}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reset to default</TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default AssumptionsTable;
