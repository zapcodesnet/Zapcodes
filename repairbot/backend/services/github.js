const axios = require('axios');

const GITHUB_API = 'https://api.github.com';

/**
 * Parse GitHub URL into owner/repo
 */
function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\?\#]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  return { owner: match[1], repo: match[2].replace('.git', '') };
}

/**
 * Fetch repo file tree (public repos, no token needed)
 */
async function getRepoTree(owner, repo, branch = 'main', token = null) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `token ${token}`;

  try {
    const { data } = await axios.get(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers }
    );
    return data.tree.filter(f => f.type === 'blob' && isCodeFile(f.path));
  } catch (err) {
    // Try 'master' branch if 'main' fails
    if (branch === 'main') {
      return getRepoTree(owner, repo, 'master', token);
    }
    throw new Error(`Failed to access repo: ${err.response?.status || err.message}`);
  }
}

/**
 * Fetch file content
 */
async function getFileContent(owner, repo, path, token = null) {
  const headers = { Accept: 'application/vnd.github.v3.raw' };
  if (token) headers.Authorization = `token ${token}`;

  try {
    const { data } = await axios.get(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
      { headers }
    );
    if (typeof data === 'object' && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (err) {
    return null;
  }
}

/**
 * Create a pull request with fix
 */
async function createPullRequest(owner, repo, token, { branch, title, body, files }) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  // Get default branch ref
  const { data: repoData } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}`, { headers });
  const defaultBranch = repoData.default_branch;

  // Get latest commit SHA
  const { data: refData } = await axios.get(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    { headers }
  );
  const baseSha = refData.object.sha;

  // Create new branch
  const branchName = `repairbot/${branch}-${Date.now()}`;
  await axios.post(`${GITHUB_API}/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: baseSha,
  }, { headers });

  // Create/update files on new branch
  for (const file of files) {
    // Get current file to get its SHA
    let fileSha;
    try {
      const { data: existingFile } = await axios.get(
        `${GITHUB_API}/repos/${owner}/${repo}/contents/${file.path}?ref=${branchName}`,
        { headers }
      );
      fileSha = existingFile.sha;
    } catch (e) {
      // File doesn't exist yet
    }

    await axios.put(`${GITHUB_API}/repos/${owner}/${repo}/contents/${file.path}`, {
      message: `fix: ${title}`,
      content: Buffer.from(file.content).toString('base64'),
      branch: branchName,
      ...(fileSha ? { sha: fileSha } : {}),
    }, { headers });
  }

  // Create PR
  const { data: pr } = await axios.post(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
    title: `[RepairBot] ${title}`,
    body: `## 🤖 RepairBot Auto-Fix\n\n${body}\n\n---\n*This PR was created automatically by RepairBot*`,
    head: branchName,
    base: defaultBranch,
  }, { headers });

  return pr;
}

function isCodeFile(path) {
  const exts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.kt', '.swift', '.dart', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.cs', '.php', '.vue', '.svelte', '.json', '.yaml', '.yml', '.xml', '.gradle', '.toml'];
  return exts.some(ext => path.endsWith(ext));
}

/**
 * Detect platform from repo files
 */
function detectPlatform(files) {
  const paths = files.map(f => f.path || f);
  if (paths.some(p => p.includes('package.json') && (p.includes('react-native') || p.includes('expo')))) return 'react-native';
  if (paths.some(p => p.endsWith('.dart') || p.includes('pubspec.yaml'))) return 'flutter';
  if (paths.some(p => p.endsWith('.swift') || p.includes('.xcodeproj'))) return 'swift';
  if (paths.some(p => p.endsWith('.kt'))) return 'kotlin';
  if (paths.some(p => p.endsWith('.java') && p.includes('android'))) return 'java-android';
  return 'web';
}

module.exports = { parseGitHubUrl, getRepoTree, getFileContent, createPullRequest, detectPlatform };
