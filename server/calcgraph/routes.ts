/**
 * CalcGraph API Routes
 * 
 * RESTful API endpoints for the CalcGraph calculation service.
 * These routes enable:
 * - Assumption management (view, update, reset)
 * - Report recalculation with custom assumptions
 * - Monte Carlo uncertainty analysis
 * - Formula transparency and audit trail
 */

import type { Express, Request, Response } from 'express';
import { getCalcGraphService, createNewCalcGraphService, type AIResearchOutput } from './service';
import { FORMULA_REGISTRY, DEFAULT_ASSUMPTIONS } from './engine';

export function registerCalcGraphRoutes(app: Express): void {
  const service = getCalcGraphService();

  // ============================================================================
  // ASSUMPTION ENDPOINTS
  // ============================================================================

  /**
   * GET /api/calcgraph/assumptions
   * Get all assumptions with current values
   */
  app.get('/api/calcgraph/assumptions', (req: Request, res: Response) => {
    try {
      const assumptions = service.getAssumptions();
      res.json({
        success: true,
        data: assumptions,
        count: assumptions.length,
      });
    } catch (error) {
      console.error('[CalcGraph] Error getting assumptions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get assumptions',
      });
    }
  });

  /**
   * GET /api/calcgraph/assumptions/categories
   * Get assumptions grouped by category
   */
  app.get('/api/calcgraph/assumptions/categories', (req: Request, res: Response) => {
    try {
      const grouped = service.getAssumptionsByCategory();
      res.json({
        success: true,
        data: grouped,
        categories: Object.keys(grouped),
      });
    } catch (error) {
      console.error('[CalcGraph] Error getting assumptions by category:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get assumptions',
      });
    }
  });

  /**
   * PUT /api/calcgraph/assumptions/:id
   * Update a single assumption value
   */
  app.put('/api/calcgraph/assumptions/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { value } = req.body;

      if (typeof value !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Value must be a number',
        });
      }

      const result = service.updateAssumption(id, value);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        message: `Assumption ${id} updated to ${value}`,
      });
    } catch (error) {
      console.error('[CalcGraph] Error updating assumption:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update assumption',
      });
    }
  });

  /**
   * PUT /api/calcgraph/assumptions
   * Update multiple assumptions at once
   */
  app.put('/api/calcgraph/assumptions', (req: Request, res: Response) => {
    try {
      const { updates } = req.body;

      if (!Array.isArray(updates)) {
        return res.status(400).json({
          success: false,
          error: 'Updates must be an array of { id, value } objects',
        });
      }

      const results: Array<{ id: string; success: boolean; error?: string }> = [];

      for (const update of updates) {
        if (typeof update.id !== 'string' || typeof update.value !== 'number') {
          results.push({ id: update.id || 'unknown', success: false, error: 'Invalid update format' });
          continue;
        }

        const result = service.updateAssumption(update.id, update.value);
        results.push({ id: update.id, success: result.success, error: result.error });
      }

      const allSuccess = results.every(r => r.success);
      res.status(allSuccess ? 200 : 207).json({
        success: allSuccess,
        results,
      });
    } catch (error) {
      console.error('[CalcGraph] Error updating assumptions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update assumptions',
      });
    }
  });

  /**
   * POST /api/calcgraph/assumptions/reset
   * Reset all assumptions to default values
   */
  app.post('/api/calcgraph/assumptions/reset', (req: Request, res: Response) => {
    try {
      service.resetAssumptions();
      res.json({
        success: true,
        message: 'All assumptions reset to defaults',
      });
    } catch (error) {
      console.error('[CalcGraph] Error resetting assumptions:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset assumptions',
      });
    }
  });

  // ============================================================================
  // FORMULA ENDPOINTS
  // ============================================================================

  /**
   * GET /api/calcgraph/formulas
   * Get all formula definitions for transparency
   */
  app.get('/api/calcgraph/formulas', (req: Request, res: Response) => {
    try {
      const formulas = Object.values(FORMULA_REGISTRY);
      res.json({
        success: true,
        data: formulas,
        count: formulas.length,
      });
    } catch (error) {
      console.error('[CalcGraph] Error getting formulas:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get formulas',
      });
    }
  });

  /**
   * GET /api/calcgraph/formulas/:id
   * Get a specific formula definition
   */
  app.get('/api/calcgraph/formulas/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const formula = FORMULA_REGISTRY[id];

      if (!formula) {
        return res.status(404).json({
          success: false,
          error: `Formula ${id} not found`,
        });
      }

      res.json({
        success: true,
        data: formula,
      });
    } catch (error) {
      console.error('[CalcGraph] Error getting formula:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get formula',
      });
    }
  });

  // ============================================================================
  // CALCULATION ENDPOINTS
  // ============================================================================

  /**
   * POST /api/calcgraph/calculate
   * Calculate a report from AI research output
   */
  app.post('/api/calcgraph/calculate', (req: Request, res: Response) => {
    try {
      const research: AIResearchOutput = req.body.research;

      if (!research || !research.companyName) {
        return res.status(400).json({
          success: false,
          error: 'Research data with companyName is required',
        });
      }

      // Create a fresh service instance for this calculation
      const calcService = createNewCalcGraphService();
      
      try {
        const report = calcService.processResearchOutput(research);
        res.json({
          success: true,
          data: report,
        });
      } finally {
        calcService.destroy();
      }
    } catch (error) {
      console.error('[CalcGraph] Error calculating report:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate report',
      });
    }
  });

  /**
   * POST /api/calcgraph/recalculate
   * Recalculate a report with custom assumptions
   */
  app.post('/api/calcgraph/recalculate', (req: Request, res: Response) => {
    try {
      const { research, assumptions } = req.body;

      if (!research || !research.companyName) {
        return res.status(400).json({
          success: false,
          error: 'Research data with companyName is required',
        });
      }

      if (!Array.isArray(assumptions)) {
        return res.status(400).json({
          success: false,
          error: 'Assumptions must be an array of { id, value } objects',
        });
      }

      // Create a fresh service instance for this calculation
      const calcService = createNewCalcGraphService();
      
      try {
        const report = calcService.recalculateWithAssumptions(research, assumptions);
        res.json({
          success: true,
          data: report,
        });
      } finally {
        calcService.destroy();
      }
    } catch (error) {
      console.error('[CalcGraph] Error recalculating report:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recalculate report',
      });
    }
  });

  // ============================================================================
  // MONTE CARLO ENDPOINTS
  // ============================================================================

  /**
   * POST /api/calcgraph/uncertainty
   * Run Monte Carlo simulation for uncertainty analysis
   */
  app.post('/api/calcgraph/uncertainty', (req: Request, res: Response) => {
    try {
      const { research, sampleSize = 10000 } = req.body;

      if (!research || !research.companyName) {
        return res.status(400).json({
          success: false,
          error: 'Research data with companyName is required',
        });
      }

      // Limit sample size to prevent abuse
      const limitedSampleSize = Math.min(Math.max(1000, sampleSize), 50000);

      // Create a fresh service instance
      const calcService = createNewCalcGraphService();
      
      try {
        const analysis = calcService.runUncertaintyAnalysis(research, limitedSampleSize);
        res.json({
          success: true,
          data: analysis,
          sampleSize: limitedSampleSize,
        });
      } finally {
        calcService.destroy();
      }
    } catch (error) {
      console.error('[CalcGraph] Error running uncertainty analysis:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run uncertainty analysis',
      });
    }
  });

  // ============================================================================
  // AUDIT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/calcgraph/audit
   * Get the audit log for the current session
   */
  app.get('/api/calcgraph/audit', (req: Request, res: Response) => {
    try {
      const state = service.exportState();
      res.json({
        success: true,
        data: state.auditLog,
        count: state.auditLog.length,
      });
    } catch (error) {
      console.error('[CalcGraph] Error getting audit log:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get audit log',
      });
    }
  });

  // ============================================================================
  // STATE MANAGEMENT ENDPOINTS
  // ============================================================================

  /**
   * GET /api/calcgraph/state
   * Export the current calculation state
   */
  app.get('/api/calcgraph/state', (req: Request, res: Response) => {
    try {
      const state = service.exportState();
      res.json({
        success: true,
        data: state,
      });
    } catch (error) {
      console.error('[CalcGraph] Error exporting state:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export state',
      });
    }
  });

  /**
   * POST /api/calcgraph/state
   * Import a calculation state
   */
  app.post('/api/calcgraph/state', (req: Request, res: Response) => {
    try {
      const { state } = req.body;

      if (!state) {
        return res.status(400).json({
          success: false,
          error: 'State object is required',
        });
      }

      service.importState(state);
      res.json({
        success: true,
        message: 'State imported successfully',
      });
    } catch (error) {
      console.error('[CalcGraph] Error importing state:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import state',
      });
    }
  });

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  /**
   * GET /api/calcgraph/health
   * Health check for the CalcGraph service
   */
  app.get('/api/calcgraph/health', (req: Request, res: Response) => {
    try {
      const assumptions = service.getAssumptions();
      res.json({
        success: true,
        status: 'healthy',
        version: '2.0.0',
        assumptionCount: assumptions.length,
        formulaCount: Object.keys(FORMULA_REGISTRY).length,
      });
    } catch (error) {
      console.error('[CalcGraph] Health check failed:', error);
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Health check failed',
      });
    }
  });

  console.log('[CalcGraph] Routes registered successfully');
}
