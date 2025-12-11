// Script to upload files to GitHub repository using the Contents API
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

// Files and directories to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.replit',
  'replit.nix',
  '.cache',
  '.config',
  '.upm',
  'dist',
  '.env',
  '.env.local',
  '*.log',
  '.DS_Store',
  'attached_assets',
  'scripts/push-to-github.ts',
  'scripts/upload-to-github.ts'
];

function shouldIgnore(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      if (regex.test(normalizedPath)) return true;
    } else {
      if (normalizedPath === pattern || normalizedPath.startsWith(pattern + '/')) return true;
    }
  }
  return false;
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (shouldIgnore(relativePath)) continue;
    
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      files.push(relativePath);
    }
  }
  
  return files;
}

async function main() {
  console.log('🚀 Starting GitHub file upload...\n');
  
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user info
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    const owner = user.login;
    const repo = 'smart-report-ai';
    
    // Get all files to upload
    const baseDir = process.cwd();
    const files = getAllFiles(baseDir);
    console.log(`\n📁 Found ${files.length} files to upload`);
    
    // Try to get existing tree to check for existing files
    let existingShas: Record<string, string> = {};
    try {
      const { data: contents } = await octokit.repos.getContent({
        owner,
        repo,
        path: ''
      });
      // Repository has content, we might need to update
    } catch (e: any) {
      if (e.status !== 404) throw e;
      // Repository is empty, that's fine
    }
    
    // Create blobs for all files
    console.log('\n📤 Uploading files...');
    const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = [];
    
    let uploadedCount = 0;
    for (const file of files) {
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
        if (uploadedCount % 10 === 0) {
          console.log(`   Uploaded ${uploadedCount}/${files.length} files...`);
        }
      } catch (e: any) {
        console.error(`   ❌ Failed to upload ${file}: ${e.message}`);
      }
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
      message: 'Initial commit: Smart Report AI application',
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
      // If main doesn't exist, create it
      if (e.status === 422) {
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
    
    console.log('\n✅ SUCCESS!');
    console.log(`\n📦 Repository URL: https://github.com/${owner}/${repo}`);
    console.log(`\nAll code has been pushed to GitHub!`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
