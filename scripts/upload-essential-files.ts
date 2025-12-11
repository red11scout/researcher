// Script to upload essential files to GitHub repository
// Uses the GitHub integration from Replit with rate limiting

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

// Only include these essential directories and files
const INCLUDE_PATHS = [
  'client',
  'server',
  'shared',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.ts',
  'postcss.config.js',
  'components.json',
  'drizzle.config.ts',
  'theme.json',
  'replit.md'
];

// Additional excludes within included directories
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.cache',
  '*.log'
];

function shouldInclude(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check exclusions first
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      if (regex.test(normalizedPath)) return false;
    } else {
      if (normalizedPath.includes('/' + pattern + '/') || normalizedPath.startsWith(pattern + '/')) return false;
    }
  }
  
  // Check if path starts with any included path
  for (const includePath of INCLUDE_PATHS) {
    if (normalizedPath === includePath || normalizedPath.startsWith(includePath + '/')) {
      return true;
    }
  }
  
  return false;
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (!shouldInclude(relativePath)) continue;
      
      if (entry.isDirectory()) {
        files.push(...getAllFiles(fullPath, baseDir));
      } else {
        files.push(relativePath);
      }
    }
  } catch (e) {
    // Ignore permission errors
  }
  
  return files;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting GitHub file upload (essential files only)...\n');
  
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user info
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    const owner = user.login;
    const repo = 'smart-report-ai';
    
    // Get all essential files
    const baseDir = process.cwd();
    
    // Add root-level files first
    const rootFiles = INCLUDE_PATHS.filter(p => !p.includes('/') && fs.existsSync(path.join(baseDir, p)) && fs.statSync(path.join(baseDir, p)).isFile());
    
    // Then add directory contents
    const dirFiles: string[] = [];
    for (const includePath of INCLUDE_PATHS) {
      const fullPath = path.join(baseDir, includePath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        dirFiles.push(...getAllFiles(fullPath, baseDir));
      }
    }
    
    const files = [...rootFiles, ...dirFiles];
    console.log(`\n📁 Found ${files.length} essential files to upload`);
    
    // Create blobs with rate limiting
    console.log('\n📤 Uploading files (with rate limiting)...');
    const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
    
    let uploadedCount = 0;
    let retryCount = 0;
    const maxRetries = 3;
    
    for (const file of files) {
      let success = false;
      retryCount = 0;
      
      while (!success && retryCount < maxRetries) {
        try {
          const content = fs.readFileSync(path.join(baseDir, file));
          const base64Content = content.toString('base64');
          
          const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: base64Content,
            encoding: 'base64'
          });
          
          tree.push({
            path: file.replace(/\\/g, '/'),
            mode: '100644',
            type: 'blob',
            sha: blob.sha
          });
          
          uploadedCount++;
          console.log(`   ✓ [${uploadedCount}/${files.length}] ${file}`);
          success = true;
          
          // Small delay to avoid rate limiting
          await sleep(100);
          
        } catch (e: any) {
          if (e.status === 403 && e.message.includes('rate limit')) {
            retryCount++;
            console.log(`   ⏳ Rate limited, waiting 30 seconds... (retry ${retryCount}/${maxRetries})`);
            await sleep(30000);
          } else {
            console.error(`   ❌ Failed: ${file} - ${e.message}`);
            break;
          }
        }
      }
    }
    
    if (tree.length === 0) {
      throw new Error('No files were uploaded. Please try again later.');
    }
    
    console.log(`\n✅ Uploaded ${uploadedCount} files as blobs`);
    
    // Create tree
    console.log('\n🌳 Creating tree...');
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      tree
    });
    
    // Create commit
    console.log('💾 Creating commit...');
    const { data: commit } = await octokit.git.createCommit({
      owner,
      repo,
      message: 'Initial commit: Smart Report AI application\n\nComprehensive AI opportunity assessment tool featuring:\n- 8-step strategic analysis framework\n- Benefits quantification by business driver\n- Token modeling and cost estimation\n- Priority scoring and roadmap generation',
      tree: newTree.sha,
      parents: []
    });
    
    // Update main branch reference
    console.log('🔗 Updating main branch...');
    try {
      await octokit.git.updateRef({
        owner,
        repo,
        ref: 'heads/main',
        sha: commit.sha,
        force: true
      });
    } catch (e: any) {
      if (e.status === 422 || e.status === 404) {
        await octokit.git.createRef({
          owner,
          repo,
          ref: 'refs/heads/main',
          sha: commit.sha
        });
      } else {
        throw e;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS!');
    console.log('='.repeat(60));
    console.log(`\n📦 Repository: smart-report-ai`);
    console.log(`🔗 URL: https://github.com/${owner}/${repo}`);
    console.log(`\nAll essential code has been pushed to GitHub!`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
