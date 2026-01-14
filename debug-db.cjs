const { neon } = require('@neondatabase/serverless');

async function debug() {
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 30) + '...');

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Test connection
    const test = await sql`SELECT 1 as test`;
    console.log('Connection test:', test);

    // Count reports
    const count = await sql`SELECT COUNT(*) as count FROM reports`;
    console.log('Reports count:', count[0].count);

    // Get first report
    const first = await sql`SELECT id, company_name FROM reports LIMIT 1`;
    console.log('First report:', first);

  } catch (err) {
    console.log('Error:', err.message);
  }
}

debug();