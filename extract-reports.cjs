const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const sql = neon(process.env.DATABASE_URL);

async function extractReports() {
  console.log('Fetching all reports from Neon...');

  const reports = await sql`SELECT * FROM reports ORDER BY created_at DESC`;

  console.log('Found ' + reports.length + ' reports');

  fs.writeFileSync('aea-all-reports.json', JSON.stringify(reports, null, 2));
  console.log('Saved to aea-all-reports.json');
}

extractReports().catch(console.error);