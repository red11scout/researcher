// Script to initialize empty GitHub repo and upload files using Contents API
// Uses the GitHub integration from Replit

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Essential files to upload (prioritized list)
const ESSENTIAL_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.ts',
  'drizzle.config.ts',
  'replit.md',
  'shared/schema.ts',
  'server/index.ts',
  'server/routes.ts',
  'server/storage.ts',
  'server/ai-service.ts',
  'server/db.ts',
  'server/vite.ts',
  'client/index.html',
  'client/src/App.tsx',
  'client/src/main.tsx',
  'client/src/index.css',
  'client/src/pages/Home.tsx',
  'client/src/pages/Report.tsx',
  'client/src/pages/SavedReports.tsx',
  'client/src/pages/WhatIfAnalysis.tsx',
  'client/src/pages/AssumptionPanel.tsx',
  'client/src/pages/Benchmarks.tsx',
  'client/src/components/Layout.tsx',
  'client/src/lib/queryClient.ts',
  'client/src/lib/utils.ts',
  'client/src/hooks/use-toast.ts',
  'client/src/hooks/use-mobile.tsx',
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Initializing GitHub repository with essential files...\n');
  
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user info
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    const owner = user.login;
    const repo = 'smart-report-ai';
    const baseDir = process.cwd();
    
    // First, create an initial commit with README to initialize the repo
    console.log('\n📝 Creating initial README to initialize repository...');
    
    const readmeContent = `# Smart Report AI

A comprehensive AI opportunity assessment tool that generates strategic reports for companies.

## Features

- **8-Step Analysis Framework**: Company overview, strategic anchoring, KPI baselines, friction points, AI use cases, benefits quantification, token modeling, and priority scoring
- **Benefits Quantification**: Calculate revenue, cost, cash flow, and risk benefits with detailed formulas
- **Token Modeling**: Estimate token usage and costs for each AI use case
- **Priority Scoring**: Score and tier use cases (Critical/High/Medium/Low) with implementation roadmap
- **What-If Analysis**: Adjust assumptions and see real-time impact on projections
- **Export Options**: PDF, Word, Excel, and Markdown exports

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **AI**: Anthropic Claude API

## Getting Started

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Set up environment variables (see .env.example)
4. Run the development server: \`npm run dev\`

## License

MIT
`;

    try {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'README.md',
        message: 'Initial commit: Add README',
        content: Buffer.from(readmeContent).toString('base64'),
        branch: 'main'
      });
      console.log('   ✓ README.md created');
    } catch (e: any) {
      if (e.status === 422 && e.message.includes('sha')) {
        console.log('   ℹ️  README.md already exists');
      } else if (e.status === 404) {
        // Branch doesn't exist, create with default branch
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: 'README.md',
          message: 'Initial commit: Add README',
          content: Buffer.from(readmeContent).toString('base64')
        });
        console.log('   ✓ README.md created (new branch)');
      } else {
        throw e;
      }
    }
    
    await sleep(1000); // Wait for repo to initialize
    
    // Now upload essential files
    console.log('\n📤 Uploading essential source files...');
    let uploadedCount = 0;
    
    for (const filePath of ESSENTIAL_FILES) {
      const fullPath = path.join(baseDir, filePath);
      
      if (!fs.existsSync(fullPath)) {
        console.log(`   ⚠️  Skipping (not found): ${filePath}`);
        continue;
      }
      
      try {
        const content = fs.readFileSync(fullPath);
        const base64Content = content.toString('base64');
        
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: `Add ${filePath}`,
          content: base64Content,
          branch: 'main'
        });
        
        uploadedCount++;
        console.log(`   ✓ [${uploadedCount}/${ESSENTIAL_FILES.length}] ${filePath}`);
        
        // Rate limiting delay
        await sleep(500);
        
      } catch (e: any) {
        if (e.status === 422 && e.message.includes('sha')) {
          console.log(`   ℹ️  Already exists: ${filePath}`);
        } else if (e.status === 403 && e.message.includes('rate limit')) {
          console.log('   ⏳ Rate limited, waiting 60 seconds...');
          await sleep(60000);
          // Retry
          try {
            const content = fs.readFileSync(fullPath);
            await octokit.repos.createOrUpdateFileContents({
              owner,
              repo,
              path: filePath,
              message: `Add ${filePath}`,
              content: content.toString('base64'),
              branch: 'main'
            });
            uploadedCount++;
            console.log(`   ✓ [${uploadedCount}/${ESSENTIAL_FILES.length}] ${filePath} (retry succeeded)`);
          } catch (retryError: any) {
            console.log(`   ❌ Failed after retry: ${filePath}`);
          }
        } else {
          console.log(`   ❌ Failed: ${filePath} - ${e.message}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS!');
    console.log('='.repeat(60));
    console.log(`\n📦 Repository: smart-report-ai`);
    console.log(`🔗 URL: https://github.com/${owner}/${repo}`);
    console.log(`📊 Uploaded ${uploadedCount} essential files`);
    console.log(`\nNote: Additional UI components can be added manually if needed.`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
