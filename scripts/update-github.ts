// Script to update GitHub repository with new/changed files
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateFile(octokit: Octokit, owner: string, repo: string, filePath: string, message: string) {
  const baseDir = process.cwd();
  const fullPath = path.join(baseDir, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`   ⚠️  Skipping (not found): ${filePath}`);
    return false;
  }
  
  const content = fs.readFileSync(fullPath);
  const base64Content = content.toString('base64');
  
  // Try to get existing file SHA
  let sha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath
    });
    if ('sha' in data) {
      sha = data.sha;
    }
  } catch (e: any) {
    if (e.status !== 404) throw e;
    // File doesn't exist, will create new
  }
  
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: base64Content,
    sha,
    branch: 'main'
  });
  
  return true;
}

async function main() {
  console.log('🚀 Updating GitHub repository...\n');
  
  try {
    const octokit = await getUncachableGitHubClient();
    
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    const owner = user.login;
    const repo = 'smart-report-ai';
    
    // Files to update
    const filesToUpdate = [
      { path: 'client/src/pages/ReportViewer.tsx', message: 'Add read-only ReportViewer page for shareable links' },
      { path: 'client/src/App.tsx', message: 'Register /reports/:id route for ReportViewer' },
    ];
    
    console.log('\n📤 Updating files...');
    
    for (const file of filesToUpdate) {
      try {
        const success = await updateFile(octokit, owner, repo, file.path, file.message);
        if (success) {
          console.log(`   ✓ ${file.path}`);
        }
        await sleep(500);
      } catch (e: any) {
        if (e.status === 403 && e.message.includes('rate limit')) {
          console.log('   ⏳ Rate limited, waiting 60 seconds...');
          await sleep(60000);
          // Retry
          try {
            await updateFile(octokit, owner, repo, file.path, file.message);
            console.log(`   ✓ ${file.path} (retry)`);
          } catch (retryError) {
            console.log(`   ❌ Failed: ${file.path}`);
          }
        } else {
          console.log(`   ❌ Failed: ${file.path} - ${e.message}`);
        }
      }
    }
    
    console.log('\n✅ GitHub repository updated!');
    console.log(`🔗 URL: https://github.com/${owner}/${repo}`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
