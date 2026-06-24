const GITEE_API_BASE = 'https://gitee.com/api/v5';
const DEFAULT_BRANCH = 'master';

function getGradePath(gradeIndex) {
  return `dictation/characterList_${Number(gradeIndex) + 1}.json`;
}

const CATE_PATH = 'dictation/cate.json';

function getSyncConfig() {
  try {
    const data = localStorage.getItem('giteeSyncConfig');
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('读取同步配置失败', e);
  }
  return { token: '', repo: '', branch: DEFAULT_BRANCH, autoSync: false };
}

function saveSyncConfig(config) {
  try {
    const clean = { ...config };
    if (clean.token) clean.token = clean.token.trim();
    if (clean.repo) clean.repo = clean.repo.trim();
    localStorage.setItem('giteeSyncConfig', JSON.stringify(clean));
  } catch (e) {
    console.error('保存同步配置失败', e);
  }
}

function isSyncConfigured(config) {
  return !!(config && config.token && config.repo);
}

function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(base64) {
  return decodeURIComponent(escape(atob((base64 || '').replace(/\s/g, ''))));
}

function encodeFilePath(path) {
  return path.split('/').map(s => encodeURIComponent(s)).join('/');
}

function parseRepo(repo) {
  let str = (repo || '').trim();
  str = str.replace(/\.git$/, '');
  str = str.replace(/\/$/, '');
  if (str.startsWith('http://') || str.startsWith('https://')) {
    str = str.replace(/^https?:\/\//, '');
    const slashIdx = str.indexOf('/');
    if (slashIdx === -1) return null;
    str = str.substring(slashIdx + 1);
  }
  const parts = str.split('/').filter(p => p);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

function buildRepoUrl(config) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}`;
}

function buildContentUrl(config, gradeIndex) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(getGradePath(gradeIndex))}`;
}

function buildCateUrl(config) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(CATE_PATH)}`;
}

function buildCountDataUrl(config, filePath) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(filePath)}`;
}

async function checkRepoAccess(config) {
  if (!isSyncConfigured(config)) {
    return { ok: false, error: '请先配置 Gitee 令牌和仓库地址', repo: null };
  }
  const parsed = parseRepo(config.repo);
  if (!parsed) {
    return { ok: false, error: '仓库地址格式错误，请填写 owner/repo', repo: null };
  }
  const url = buildRepoUrl(config);
  try {
    const resp = await fetch(`${url}?access_token=${config.token.trim()}`);
    const data = await resp.json();
    if (resp.ok && data) {
      const defaultBranch = data.default_branch || '';
      return { ok: true, error: null, repo: { owner: parsed.owner, repo: parsed.repo, defaultBranch } };
    } else if (resp.status === 404) {
      return { ok: false, error: `仓库 ${parsed.owner}/${parsed.repo} 不存在或无权访问(404)`, repo: null };
    } else if (resp.status === 401) {
      return { ok: false, error: '令牌无效或已过期(401)', repo: null };
    } else if (resp.status === 403) {
      return { ok: false, error: '无仓库访问权限(403)', repo: null };
    } else {
      return { ok: false, error: (data && data.message) || `未知错误(${resp.status})`, repo: null };
    }
  } catch (err) {
    return { ok: false, error: '网络请求失败：' + (err.message || ''), repo: null };
  }
}

async function getFileShaByUrl(url, config) {
  try {
    const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
    const data = await resp.json();
    if (resp.ok && data && data.sha) {
      return { sha: data.sha, error: null };
    } else {
      return { sha: null, error: `HTTP ${resp.status}` };
    }
  } catch (err) {
    return { sha: null, error: '网络请求失败：' + (err.message || '') };
  }
}

async function pushFileToGitee(url, dataJson, config, commitMessage) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const check = await checkRepoAccess(config);
  if (!check.ok) throw new Error(check.error);
  if (!url) throw new Error('仓库地址格式错误');

  const base64Content = encodeBase64(dataJson);
  const branch = config.branch || DEFAULT_BRANCH;
  const token = config.token.trim();

  const createResp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, content: base64Content, branch, message: commitMessage })
  });
  if (createResp.ok) return;

  const { sha, error: shaError } = await getFileShaByUrl(url, config);
  if (!sha) throw new Error(`推送失败 - 获取sha: ${shaError}`);

  const updateResp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, content: base64Content, sha, branch, message: commitMessage })
  });
  if (!updateResp.ok) {
    const errData = await updateResp.json().catch(() => ({}));
    throw new Error((errData && errData.message) || `更新失败(${updateResp.status})`);
  }
}

async function pushToGitee(dataJson, config, gradeIndex) {
  const url = buildContentUrl(config, gradeIndex);
  await pushFileToGitee(url, dataJson, config, `同步${gradeIndex + 1}年级听写数据`);
}

async function pullFromGitee(config, gradeIndex) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const url = buildContentUrl(config, gradeIndex);
  if (!url) throw new Error('仓库地址格式错误');
  const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  const data = await resp.json();
  if (resp.ok && data && data.content) {
    return decodeBase64(data.content);
  } else if (resp.status === 404) {
    return '[]';
  } else if (resp.status === 401) {
    throw new Error('令牌无效或已过期(401)');
  } else {
    throw new Error((data && data.message) || `拉取失败(${resp.status})`);
  }
}

async function pushCateToGitee(dataJson, config) {
  const url = buildCateUrl(config);
  await pushFileToGitee(url, dataJson, config, '同步单元课文分类数据');
}

async function pullCateFromGitee(config) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const url = buildCateUrl(config);
  if (!url) throw new Error('仓库地址格式错误');
  const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  const data = await resp.json();
  if (resp.ok && data && data.content) {
    return decodeBase64(data.content);
  } else if (resp.status === 404) {
    return '{"grade1":[],"grade2":[],"grade3":[],"grade4":[],"grade5":[],"grade6":[]}';
  } else {
    throw new Error('拉取分类数据失败(' + resp.status + ')');
  }
}

async function pushCountDataToGitee(records, config, date) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const folderName = `${yyyy}${mm}`;
  const fileName = `${yyyy}${mm}${dd}.json`;
  const filePath = `dictation/count_data/${folderName}/${fileName}`;
  const url = buildCountDataUrl(config, filePath);
  if (!url) throw new Error('仓库地址格式错误');

  let existingRecords = [];
  try {
    const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
    const data = await resp.json();
    if (resp.ok && data && data.content) {
      const parsed = JSON.parse(decodeBase64(data.content));
      if (Array.isArray(parsed)) existingRecords = parsed;
    }
  } catch (e) {}

  const merged = [...existingRecords, ...records];
  await pushFileToGitee(url, JSON.stringify(merged, null, 2), config, `同步听写记录 ${fileName}`);
}

async function listCountDataFolder(config, folderPath) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const parsed = parseRepo(config.repo);
  if (!parsed) throw new Error('仓库地址格式错误');
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(folderPath)}`;
  const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  const data = await resp.json();
  if (resp.ok && Array.isArray(data)) {
    return data.filter(item => item.type === 'file' && item.name.endsWith('.json')).map(item => item.name);
  } else if (resp.status === 404) {
    return [];
  } else {
    throw new Error('获取目录列表失败(' + resp.status + ')');
  }
}

async function pullCountDataFromGitee(config, filePath) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const parsed = parseRepo(config.repo);
  if (!parsed) throw new Error('仓库地址格式错误');
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(filePath)}`;
  const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  const data = await resp.json();
  if (resp.ok && data && data.content) {
    const sha = data.sha || '';
    try {
      const records = JSON.parse(decodeBase64(data.content));
      return { records: Array.isArray(records) ? records : [], sha };
    } catch (e) {
      return { records: [], sha };
    }
  } else if (resp.status === 404) {
    return { records: [], sha: '' };
  } else {
    throw new Error('拉取听写记录失败(' + resp.status + ')');
  }
}

async function listCountDataDirs(config) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const parsed = parseRepo(config.repo);
  if (!parsed) throw new Error('仓库地址格式错误');
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath('dictation/count_data')}`;
  const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  const data = await resp.json();
  if (resp.ok && Array.isArray(data)) {
    return data.filter(item => item.type === 'dir').map(item => item.name).sort();
  } else if (resp.status === 404) {
    return [];
  } else {
    throw new Error('获取目录列表失败(' + resp.status + ')');
  }
}

async function fetchLatestCountData(config) {
  const dirs = await listCountDataDirs(config);
  if (dirs.length === 0) {
    return { records: [], dateLabel: '', folderName: '', fileName: '', sha: '' };
  }
  const latestDir = dirs[dirs.length - 1];
  const folderPath = `dictation/count_data/${latestDir}`;
  const files = await listCountDataFolder(config, folderPath);
  if (files.length === 0) {
    return { records: [], dateLabel: '', folderName: '', fileName: '', sha: '' };
  }
  const sortedFiles = [...files].sort();
  const latestFile = sortedFiles[sortedFiles.length - 1];
  const filePath = `${folderPath}/${latestFile}`;
  const { records, sha } = await pullCountDataFromGitee(config, filePath);
  const name = latestFile.replace('.json', '');
  const y = name.slice(0, 4);
  const m = name.slice(4, 6);
  const d = name.slice(6, 8);
  const dateLabel = `${y}年${m}月${d}日`;
  return { records, sha, dateLabel, folderName: latestDir, fileName: latestFile };
}

async function pushCountDataRecords(config, folderName, fileName, records, sha) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  if (!sha) throw new Error('缺少文件 sha，无法更新');
  const filePath = `dictation/count_data/${folderName}/${fileName}`;
  const url = buildCountDataUrl(config, filePath);
  if (!url) throw new Error('仓库地址格式错误');
  const base64Content = encodeBase64(JSON.stringify(records, null, 2));
  const branch = config.branch || DEFAULT_BRANCH;
  const token = config.token.trim();
  const resp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, content: base64Content, sha, branch, message: `更新听写记录 ${fileName}` })
  });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error((errData && errData.message) || `更新失败(${resp.status})`);
  }
}
