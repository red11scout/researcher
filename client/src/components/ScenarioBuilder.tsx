/**
 * ScenarioBuilder Component
 * 
 * A world-class scenario builder that allows users to:
 * - View and adjust all calculation assumptions
 * - See real-time recalculated results
 * - Compare base vs custom scenarios
 * - Run Monte Carlo uncertainty analysis
 * - View formula transparency
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  useAssumptions,
  useFormulas,
  useScenarioBuilder,
  formatCalculatedValue,
  formatConfidenceInterval,
  getConfidenceLevelColor,
  type Assumption,
} from '../hooks/useCalcGraph';

// ============================================================================
// CATEGORY DISPLAY NAMES
// ============================================================================

const CATEGORY_NAMES: Record<string, string> = {
  ai_pricing: 'AI Token Pricing',
  labor_rates: 'Labor Rates',
  conservative_factors: 'Conservative Estimation Factors',
  adoption: 'Adoption & Change Management',
  scoring_weights: 'Priority Scoring Weights',
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  ai_pricing: 'Pricing for AI model API calls (per million tokens)',
  labor_rates: 'Fully burdened hourly rates for different roles',
  conservative_factors: 'Discount factors applied to benefit estimates for conservative projections',
  adoption: 'Factors affecting user adoption and change management success',
  scoring_weights: 'Weights used in priority scoring calculations',
};

// ============================================================================
// ASSUMPTION SLIDER COMPONENT
// ============================================================================

interface AssumptionSliderProps {
  assumption: Assumption;
  customValue?: number;
  onChange: (id: string, value: number) => void;
  isModified: boolean;
}

function AssumptionSlider({ assumption, customValue, onChange, isModified }: AssumptionSliderProps) {
  const value = customValue ?? assumption.currentValue;
  const isPercentage = assumption.unit.dimension === 'rate';
  const displayValue = isPercentage ? (value * 100).toFixed(0) : value.toFixed(2);
  const displayDefault = isPercentage ? (assumption.defaultValue * 100).toFixed(0) : assumption.defaultValue.toFixed(2);
  
  const min = assumption.minValue ?? 0;
  const max = assumption.maxValue ?? 100;
  const step = assumption.step ?? (isPercentage ? 0.01 : 1);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-medium text-gray-900 flex items-center gap-2">
            {assumption.name}
            {isModified && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                Modified
              </span>
            )}
          </h4>
          <p className="text-sm text-gray-500 mt-0.5">{assumption.description}</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold text-gray-900">
            {isPercentage ? `${displayValue}%` : `$${displayValue}`}
          </span>
          {isModified && (
            <p className="text-xs text-gray-400">
              Default: {isPercentage ? `${displayDefault}%` : `$${displayDefault}`}
            </p>
          )}
        </div>
      </div>
      
      <div className="mt-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(assumption.id, parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{isPercentage ? `${(min * 100).toFixed(0)}%` : `$${min}`}</span>
          <span>{isPercentage ? `${(max * 100).toFixed(0)}%` : `$${max}`}</span>
        </div>
      </div>
      
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span className={getConfidenceLevelColor(assumption.confidenceLevel)}>
          {assumption.confidenceLevel.charAt(0).toUpperCase() + assumption.confidenceLevel.slice(1)} confidence
        </span>
        <span>•</span>
        <span>{assumption.source.description}</span>
      </div>
    </div>
  );
}

// ============================================================================
// COMPARISON TABLE COMPONENT
// ============================================================================

interface ComparisonTableProps {
  comparison: {
    base: Record<string, number>;
    custom: Record<string, number>;
    delta: Record<string, number>;
  } | null;
}

function ComparisonTable({ comparison }: ComparisonTableProps) {
  if (!comparison) return null;

  const formatValue = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const formatDelta = (value: number) => {
    const formatted = formatValue(Math.abs(value));
    if (value > 0) return <span className="text-green-600">+{formatted}</span>;
    if (value < 0) return <span className="text-red-600">-{formatted}</span>;
    return <span className="text-gray-500">$0</span>;
  };

  const rows = [
    { label: 'Total Annual Value', key: 'totalValue' },
    { label: 'Revenue Benefit', key: 'revenue' },
    { label: 'Cost Benefit', key: 'cost' },
    { label: 'Cash Flow Benefit', key: 'cashFlow' },
    { label: 'Risk Benefit', key: 'risk' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Scenario Comparison</h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 text-sm text-gray-600">
            <th className="text-left px-4 py-2 font-medium">Metric</th>
            <th className="text-right px-4 py-2 font-medium">Base Scenario</th>
            <th className="text-right px-4 py-2 font-medium">Custom Scenario</th>
            <th className="text-right px-4 py-2 font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
              <td className="px-4 py-3 text-right text-gray-600">
                {formatValue(comparison.base[row.key])}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                {formatValue(comparison.custom[row.key])}
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {formatDelta(comparison.delta[row.key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// MONTE CARLO RESULTS COMPONENT
// ============================================================================

interface MonteCarloResultsProps {
  analysis: {
    totalValueDistribution: {
      p10: number;
      p25: number;
      mean: number;
      median: number;
      p75: number;
      p90: number;
      standardDeviation: number;
      sampleSize: number;
      convergenceAchieved: boolean;
    };
    sensitivityAnalysis: Array<{
      assumptionId: string;
      assumptionName: string;
      impactOnTotalValue: number;
    }>;
  } | null;
}

function MonteCarloResults({ analysis }: MonteCarloResultsProps) {
  if (!analysis) return null;

  const { totalValueDistribution, sensitivityAnalysis } = analysis;

  const formatValue = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Value Distribution (Monte Carlo)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-red-600 font-medium">P10 (Conservative)</p>
            <p className="text-xl font-bold text-red-700">{formatValue(totalValueDistribution.p10)}</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-600 font-medium">Median (Expected)</p>
            <p className="text-xl font-bold text-blue-700">{formatValue(totalValueDistribution.median)}</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-sm text-green-600 font-medium">P90 (Optimistic)</p>
            <p className="text-xl font-bold text-green-700">{formatValue(totalValueDistribution.p90)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>Sample size: {totalValueDistribution.sampleSize.toLocaleString()}</span>
          <span className={totalValueDistribution.convergenceAchieved ? 'text-green-600' : 'text-yellow-600'}>
            {totalValueDistribution.convergenceAchieved ? '✓ Converged' : '⚠ Not converged'}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Sensitivity Analysis</h3>
        <p className="text-sm text-gray-500 mb-3">
          Which assumptions have the most impact on total value
        </p>
        <div className="space-y-2">
          {sensitivityAnalysis.slice(0, 5).map((item, index) => (
            <div key={item.assumptionId} className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-900">{item.assumptionName}</span>
                  <span className="text-sm text-gray-600">{item.impactOnTotalValue.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(item.impactOnTotalValue, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FORMULA VIEWER COMPONENT
// ============================================================================

interface FormulaViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

function FormulaViewer({ isOpen, onClose }: FormulaViewerProps) {
  const { formulas, isLoading } = useFormulas();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Formula Transparency</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          {isLoading ? (
            <p className="text-gray-500">Loading formulas...</p>
          ) : (
            <div className="space-y-4">
              {formulas?.map(formula => (
                <div key={formula.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">{formula.name}</h3>
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                      v{formula.version}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{formula.description}</p>
                  <div className="bg-white rounded border border-gray-200 p-3 font-mono text-sm">
                    {formula.expression}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {formula.inputVariables.map(v => (
                      <span key={v} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN SCENARIO BUILDER COMPONENT
// ============================================================================

interface ScenarioBuilderProps {
  research?: any;
  baseReport?: any;
  onClose?: () => void;
}

export function ScenarioBuilder({ research, baseReport, onClose }: ScenarioBuilderProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showFormulas, setShowFormulas] = useState(false);
  
  const {
    assumptions,
    assumptionsByCategory,
    isLoadingAssumptions,
    customAssumptions,
    customReport,
    analysis,
    isRecalculating,
    isRunningAnalysis,
    updateCustomAssumption,
    resetCustomAssumptions,
    recalculateWithCustomAssumptions,
    runUncertaintyAnalysis,
    getComparison,
    setResearch,
    setBaseReport,
  } = useScenarioBuilder(research);

  // Set initial data
  React.useEffect(() => {
    if (research) setResearch(research);
    if (baseReport) setBaseReport(baseReport);
  }, [research, baseReport, setResearch, setBaseReport]);

  const comparison = useMemo(() => getComparison(), [getComparison]);

  const customAssumptionMap = useMemo(() => {
    const map: Record<string, number> = {};
    customAssumptions.forEach(a => { map[a.id] = a.value; });
    return map;
  }, [customAssumptions]);

  const categories = useMemo(() => {
    if (!assumptionsByCategory) return [];
    return Object.keys(assumptionsByCategory).sort();
  }, [assumptionsByCategory]);

  if (isLoadingAssumptions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Scenario Builder</h1>
              <p className="text-sm text-gray-500 mt-1">
                Adjust assumptions and see how they impact the calculated benefits
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFormulas(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                View Formulas
              </button>
              <button
                onClick={resetCustomAssumptions}
                disabled={customAssumptions.length === 0}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset All
              </button>
              <button
                onClick={recalculateWithCustomAssumptions}
                disabled={isRecalculating || customAssumptions.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isRecalculating && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Recalculate
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Assumptions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Category Tabs */}
            <div className="bg-white rounded-lg border border-gray-200 p-2 flex flex-wrap gap-2">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {CATEGORY_NAMES[category] || category}
                </button>
              ))}
            </div>

            {/* Assumption Cards */}
            {activeCategory && assumptionsByCategory?.[activeCategory] && (
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {CATEGORY_NAMES[activeCategory] || activeCategory}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {CATEGORY_DESCRIPTIONS[activeCategory]}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assumptionsByCategory[activeCategory].map(assumption => (
                    <AssumptionSlider
                      key={assumption.id}
                      assumption={assumption}
                      customValue={customAssumptionMap[assumption.id]}
                      onChange={updateCustomAssumption}
                      isModified={assumption.id in customAssumptionMap}
                    />
                  ))}
                </div>
              </div>
            )}

            {!activeCategory && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Category</h3>
                <p className="text-gray-500">
                  Choose a category above to view and adjust the assumptions used in calculations
                </p>
              </div>
            )}
          </div>

          {/* Right Column - Results */}
          <div className="space-y-6">
            {/* Modified Assumptions Summary */}
            {customAssumptions.length > 0 && (
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                <h3 className="font-semibold text-blue-900 mb-2">
                  {customAssumptions.length} Assumption{customAssumptions.length !== 1 ? 's' : ''} Modified
                </h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  {customAssumptions.slice(0, 5).map(a => {
                    const assumption = assumptions?.find(ass => ass.id === a.id);
                    return (
                      <li key={a.id}>
                        {assumption?.name}: {a.value.toFixed(2)}
                      </li>
                    );
                  })}
                  {customAssumptions.length > 5 && (
                    <li className="text-blue-500">
                      +{customAssumptions.length - 5} more...
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Comparison Table */}
            <ComparisonTable comparison={comparison} />

            {/* Monte Carlo Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900">Uncertainty Analysis</h3>
                <button
                  onClick={runUncertaintyAnalysis}
                  disabled={isRunningAnalysis || !research}
                  className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isRunningAnalysis && (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                  )}
                  Run Monte Carlo
                </button>
              </div>
              {analysis ? (
                <MonteCarloResults analysis={analysis} />
              ) : (
                <p className="text-sm text-gray-500">
                  Run Monte Carlo simulation to see value distribution and sensitivity analysis
                </p>
              )}
            </div>

            {/* Audit Trail */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Calculation Transparency</h3>
              <p className="text-sm text-gray-500 mb-3">
                All calculations are performed by the CalcGraph engine using HyperFormula.
                Every result is deterministic and auditable.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Deterministic
                </span>
                <span className="flex items-center gap-1 text-green-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Auditable
                </span>
                <span className="flex items-center gap-1 text-green-600">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Versioned
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Formula Viewer Modal */}
      <FormulaViewer isOpen={showFormulas} onClose={() => setShowFormulas(false)} />
    </div>
  );
}

export default ScenarioBuilder;
