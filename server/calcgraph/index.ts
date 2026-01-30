/**
 * CalcGraph Module - World-Class Deterministic Calculation System
 * 
 * This module provides a complete solution for accurate, auditable financial calculations
 * in AI-powered research applications.
 * 
 * Key Components:
 * - CalcGraphEngine: Core calculation engine with dimensional validation
 * - CalcGraphService: Integration layer between AI research and calculations
 * - Formula Registry: Version-controlled formula definitions
 * - Assumption Registry: User-adjustable parameters with audit trail
 * - Monte Carlo: Uncertainty quantification and sensitivity analysis
 */

export {
  // Engine
  CalcGraphEngine,
  createCalcGraphEngine,
  
  // Types
  type UnitDimension,
  type Unit,
  type ConfidenceLevel,
  type DistributionType,
  type SourceReference,
  type CalculatedValue,
  type UncertainVariable,
  type MonteCarloResult,
  type FormulaDefinition,
  type Assumption,
  type CalculationNode,
  type CalculationGraph,
  
  // Constants
  UNITS,
  FORMULA_REGISTRY,
  DEFAULT_ASSUMPTIONS,
} from './engine';

export {
  // Service
  CalcGraphService,
  getCalcGraphService,
  createNewCalcGraphService,
  
  // Types
  type AIResearchOutput,
  type CalculatedReport,
} from './service';
