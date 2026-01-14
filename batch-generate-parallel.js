/**
 * AEA Portfolio Batch Report Generator - PARALLEL VERSION
 * 
 * Generates AI assessment reports for all 54 portfolio companies.
 * Processes 5 companies in parallel to reduce total runtime.
 * 
 * Run from Replit shell: node batch-generate-parallel.js
 * 
 * Estimated runtime: ~2-3 hours (vs 9+ hours sequential)
 */

const companies = [
  "Redwood Logistics",
  "American Oncology Network",
  "Scan Global Logistics",
  "Bespoke Partners",
  "EZ Texting",
  "Huge",
  "Cenegenics",
  "The Lifetime Value Co",
  "Montway",
  "ROI CX Solutions",
  "NES Fircroft",
  "Excelitas Technologies",
  "Polygon Group",
  "AmeriVet Partners",
  "Ascential Technologies",
  "TricorBraun",
  "Traeger Pellet Grills",
  "BMS Enterprises",
  "SitelogIQ",
  "SCIO Automation",
  "Numotion",
  "Verdesian Life Sciences",
  "Commonwealth Pain",
  "Mark Spain Real Estate",
  "Veseris",
  "Spectrum Control",
  "American Expediting",
  "Rees Scientific",
  "Cimsense",
  "AS Software",
  "Jack's Family Restaurants",
  "Nations Roof",
  "ThreeSixty Group",
  "Chemical Guys",
  "Hero Digital",
  "Pave America",
  "Singer Industrial",
  "American Dental",
  "Window Nation",
  "Visual Comfort",
  "50 Floor",
  "TileBar",
  "Splash Car Wash",
  "Barnet Products",
  "Monroe Engineering",
  "WorldWide Electric",
  "Crane Engineering",
  "Meritus Gas Partners",
  "Dana Safety Supply",
  "P&B Intermodal",
  "RED Global",
  "Impetus Wellness",
  "Chemtron RiverBend",
  "Unisyn Precision"
];

// Configuration
const API_URL = process.env.API_URL || 'https://reports.aiplatformsforscale.com/api/analyze';
const BATCH_SIZE = 5;              // Number of parallel requests
const DELAY_BETWEEN_BATCHES = 30000; // 30 seconds between batches
const MAX_RETRIES = 3;
const RETRY_DELAY = 15000;         // 15 seconds between retries
const REQUEST_TIMEOUT = 300000;    // 5 minute timeout per request

// Track progress
const results = {
  successful: [],
  failed: [],
  startTime: null,
  endTime: null
};

// Utility functions
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatDuration = (ms) => {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
};

// Fetch with timeout
const fetchWithTimeout = async (url, options, timeout) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

// Generate report for a single company
async function generateReport(companyName) {
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`  [${companyName}] Attempt ${attempt}/${MAX_RETRIES}...`);
      
      const response = await fetchWithTimeout(
        API_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyName })
        },
        REQUEST_TIMEOUT
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Extract key metrics
      const totalValue = data.analysis?.executiveDashboard?.totalAnnualValue || 0;
      const useCaseCount = data.analysis?.steps?.find(s => s.step === 4)?.data?.length || 0;
      
      const duration = Date.now() - startTime;
      
      console.log(`  ✓ [${companyName}] SUCCESS - $${(totalValue / 1e6).toFixed(1)}M (${formatDuration(duration)})`);
      
      results.successful.push({
        companyName,
        totalValue,
        useCaseCount,
        duration,
        attempts: attempt
      });
      
      return { success: true, companyName, totalValue };
      
    } catch (error) {
      const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
      console.log(`  ✗ [${companyName}] Attempt ${attempt} failed: ${errorMsg}`);
      
      if (attempt < MAX_RETRIES) {
        await wait(RETRY_DELAY);
      }
    }
  }
  
  // All retries failed
  console.log(`  ✗ [${companyName}] FAILED after ${MAX_RETRIES} attempts`);
  results.failed.push({ companyName, error: 'Max retries exceeded' });
  return { success: false, companyName };
}

// Process a batch of companies in parallel
async function processBatch(batch, batchNumber, totalBatches) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`BATCH ${batchNumber}/${totalBatches}: Processing ${batch.length} companies in parallel`);
  console.log(`Companies: ${batch.join(', ')}`);
  console.log(`${'═'.repeat(60)}`);
  
  const batchStart = Date.now();
  
  // Run all companies in this batch in parallel
  const batchResults = await Promise.all(
    batch.map(companyName => generateReport(companyName))
  );
  
  const batchDuration = Date.now() - batchStart;
  const successCount = batchResults.filter(r => r.success).length;
  
  console.log(`\nBatch ${batchNumber} complete: ${successCount}/${batch.length} successful (${formatDuration(batchDuration)})`);
  
  return batchResults;
}

// Main batch process
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     AEA PORTFOLIO BATCH GENERATOR - PARALLEL VERSION           ║');
  console.log('║     BlueAlly AI Assessment Platform                            ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Companies to process: ${companies.length.toString().padEnd(38)}║`);
  console.log(`║  Parallel batch size: ${BATCH_SIZE.toString().padEnd(39)}║`);
  console.log(`║  Total batches: ${Math.ceil(companies.length / BATCH_SIZE).toString().padEnd(45)}║`);
  console.log(`║  Estimated runtime: 2-3 hours${' '.repeat(32)}║`);
  console.log(`║  Started at: ${new Date().toLocaleString().padEnd(48)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  results.startTime = Date.now();
  
  // Split companies into batches
  const batches = [];
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    batches.push(companies.slice(i, i + BATCH_SIZE));
  }
  
  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    await processBatch(batches[i], i + 1, batches.length);
    
    // Progress update
    const completed = Math.min((i + 1) * BATCH_SIZE, companies.length);
    const elapsed = Date.now() - results.startTime;
    const avgTimePerCompany = elapsed / completed;
    const remaining = avgTimePerCompany * (companies.length - completed);
    
    console.log(`\n📊 Overall Progress: ${completed}/${companies.length} (${Math.round(completed / companies.length * 100)}%)`);
    console.log(`   Elapsed: ${formatDuration(elapsed)} | Est. remaining: ${formatDuration(remaining)}`);
    console.log(`   Success rate: ${results.successful.length}/${completed} (${Math.round(results.successful.length / completed * 100)}%)`);
    
    // Wait between batches (except for last one)
    if (i < batches.length - 1) {
      console.log(`\n⏳ Waiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
      await wait(DELAY_BETWEEN_BATCHES);
    }
  }
  
  results.endTime = Date.now();
  
  // Final summary
  const totalDuration = results.endTime - results.startTime;
  const totalValue = results.successful.reduce((sum, r) => sum + r.totalValue, 0);
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      BATCH COMPLETE                            ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Total duration: ${formatDuration(totalDuration).padEnd(44)}║`);
  console.log(`║  Successful: ${results.successful.length.toString().padEnd(49)}║`);
  console.log(`║  Failed: ${results.failed.length.toString().padEnd(52)}║`);
  console.log(`║  Success rate: ${Math.round(results.successful.length / companies.length * 100)}%${' '.repeat(46)}║`);
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  TOTAL PORTFOLIO AI VALUE: $${(totalValue / 1e6).toFixed(1)}M${' '.repeat(30)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  // Top 10 by value
  if (results.successful.length > 0) {
    console.log('\n📈 Top 10 Companies by AI Value:');
    results.successful
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10)
      .forEach((r, i) => {
        console.log(`   ${(i + 1).toString().padStart(2)}. ${r.companyName.padEnd(30)} $${(r.totalValue / 1e6).toFixed(1)}M`);
      });
  }
  
  // List failures for retry
  if (results.failed.length > 0) {
    console.log('\n❌ Failed companies (run separately):');
    results.failed.forEach(r => {
      console.log(`   - ${r.companyName}`);
    });
    
    // Output retry command
    console.log('\n📋 To retry failed companies, run with:');
    const failedNames = results.failed.map(r => `"${r.companyName}"`).join(', ');
    console.log(`   const retryCompanies = [${failedNames}];`);
  }
  
  // Save results
  const fs = await import('fs');
  const resultsFile = `batch-results-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsFile}`);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
});

// Run
main().catch(console.error);
