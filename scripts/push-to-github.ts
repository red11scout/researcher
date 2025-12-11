// Script to create a GitHub repository and push all code
// Uses the GitHub integration from Replit

import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
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

async function main() {
  console.log('🚀 Starting GitHub repository creation...\n');
  
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user info
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✅ Authenticated as: ${user.login}`);
    
    const repoName = 'smart-report-ai';
    const repoDescription = 'Smart Report AI - Generate comprehensive strategic AI opportunity assessments for companies with detailed analysis across 8 steps including business drivers, KPIs, friction points, AI use cases, benefits quantification, token modeling, and priority scoring.';
    
    // Check if repo already exists
    let repoExists = false;
    try {
      await octokit.repos.get({
        owner: user.login,
        repo: repoName
      });
      repoExists = true;
      console.log(`📦 Repository "${repoName}" already exists`);
    } catch (e: any) {
      if (e.status !== 404) throw e;
    }
    
    // Create repository if it doesn't exist
    if (!repoExists) {
      console.log(`📦 Creating repository: ${repoName}...`);
      await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: repoDescription,
        private: false,
        auto_init: false
      });
      console.log(`✅ Repository created: https://github.com/${user.login}/${repoName}`);
    }
    
    // Get the access token for git operations
    const token = await getAccessToken();
    const remoteUrl = `https://${token}@github.com/${user.login}/${repoName}.git`;
    
    // Configure git
    console.log('\n🔧 Configuring git...');
    try {
      execSync('git config user.email "replit@users.noreply.github.com"', { stdio: 'pipe' });
      execSync('git config user.name "Replit User"', { stdio: 'pipe' });
    } catch (e) {
      // Ignore if already configured
    }
    
    // Check if we have a git repo
    const hasGitRepo = fs.existsSync('.git');
    if (!hasGitRepo) {
      console.log('📁 Initializing git repository...');
      execSync('git init', { stdio: 'pipe' });
    }
    
    // Create .gitignore if it doesn't exist
    if (!fs.existsSync('.gitignore')) {
      fs.writeFileSync('.gitignore', `node_modules/
.env
.env.local
*.log
.DS_Store
dist/
.replit
replit.nix
.cache/
`);
    }
    
    // Add all files
    console.log('📝 Adding files...');
    execSync('git add -A', { stdio: 'pipe' });
    
    // Commit
    console.log('💾 Committing changes...');
    try {
      execSync('git commit -m "Initial commit: Smart Report AI application"', { stdio: 'pipe' });
    } catch (e: any) {
      // Check if nothing to commit
      if (e.message.includes('nothing to commit')) {
        console.log('ℹ️  No new changes to commit');
      } else {
        // Try with allow-empty if needed
        execSync('git commit --allow-empty -m "Update: Smart Report AI application"', { stdio: 'pipe' });
      }
    }
    
    // Set up remote
    console.log('🔗 Setting up remote...');
    try {
      execSync('git remote remove origin', { stdio: 'pipe' });
    } catch (e) {
      // Ignore if doesn't exist
    }
    execSync(`git remote add origin ${remoteUrl}`, { stdio: 'pipe' });
    
    // Push to GitHub
    console.log('⬆️  Pushing to GitHub...');
    execSync('git branch -M main', { stdio: 'pipe' });
    execSync('git push -u origin main --force', { stdio: 'pipe' });
    
    console.log('\n✅ SUCCESS!');
    console.log(`\n📦 Repository URL: https://github.com/${user.login}/${repoName}`);
    console.log(`\nYour code has been pushed to GitHub!`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    process.exit(1);
  }
}

main();
