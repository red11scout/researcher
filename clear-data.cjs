const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function clearData() {
  console.log('Clearing all reports from database...');
  const result = await sql`DELETE FROM reports`;
  console.log('✓ All test data cleared');
  
  // Verify
  const count = await sql`SELECT COUNT(*) FROM reports`;
  console.log('Reports remaining:', count[0].count);
}

clearData().catch(console.error);
