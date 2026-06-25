const GITEE_API_BASE = 'https://gitee.com/api/v5';
const DEFAULT_BRANCH = 'master';

// ===== 用户空间支持 =====
// _activeSpace = null → 使用 dictation/（默认基础库）
// _activeSpace = 'space_xxx' → 使用用户个人空间
let _activeSpace = null;

function setActiveSpace(space) { _activeSpace = space; }
function getActiveSpace() { return _activeSpace; }
function getSpacePrefix() { return _activeSpace || 'dictation'; }

// 内容数据按分类分文件夹、按年级分文件：{space}/{category}/{grade+1}.json
function getCategoryGradePath(category, gradeIndex) {
  return `${getSpacePrefix()}/${category}/${Number(gradeIndex) + 1}.json`;
}

function getCatePath() {
  return `${getSpacePrefix()}/cate.json`;
}

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

function buildCategoryContentUrl(config, category, gradeIndex) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(getCategoryGradePath(category, gradeIndex))}`;
}

function buildCateUrl(config) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(getCatePath())}`;
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
  return _writeFileToGitee(url, dataJson, config, commitMessage);
}

// 纯写入层：先 POST 创建，文件已存在则取 sha 后 PUT 更新。
// 与 pushFileToGitee 的区别是不做 checkRepoAccess（仓库可达性检查），
// 供批量复制模板等已确认仓库可用的场景调用，避免重复网络请求。
async function _writeFileToGitee(url, dataJson, config, commitMessage) {
  if (!url) throw new Error('仓库地址格式错误');
  const base64Content = encodeBase64(dataJson);
  const branch = config.branch || DEFAULT_BRANCH;
  const token = config.token.trim();

  // 先尝试直接创建（适用于文件不存在的情况）
  const createResp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, content: base64Content, branch, message: commitMessage })
  });
  if (createResp.ok) return;

  // POST 失败，判断是否需要走更新流程（文件已存在需要 sha）
  const createErrData = await createResp.json().catch(() => ({}));
  // 如果错误是因为文件已存在，获取 sha 后走 PUT 更新
  const isFileExists = createResp.status === 400 || createResp.status === 422 ||
    (createErrData.message && (
      createErrData.message.includes('already exists') ||
      createErrData.message.includes('sha') ||
      createErrData.message.includes('SHA') ||
      createErrData.message.includes('已经存在')
    ));

  if (isFileExists) {
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
    return;
  }

  // 其他 POST 错误直接抛出
  throw new Error((createErrData && createErrData.message) || `创建文件失败(${createResp.status})`);
}

async function pushCategoryToGitee(dataJson, config, category, gradeIndex) {
  const url = buildCategoryContentUrl(config, category, gradeIndex);
  await pushFileToGitee(url, dataJson, config, `同步${category}/${gradeIndex + 1}数据`);
}

async function pullCategoryFromGitee(config, category, gradeIndex) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const url = buildCategoryContentUrl(config, category, gradeIndex);
  if (!url) throw new Error('仓库地址格式错误');
  const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  const data = await resp.json();
  if (resp.ok && data && data.content) {
    return decodeBase64(data.content);
  } else if (resp.status === 401) {
    throw new Error('令牌无效或已过期(401)');
  } else {
    // 文件不存在时（404 或 200+message）返回空数组
    return '[]';
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
  } else {
    // 文件不存在时返回默认空分类结构
    return '{"grade1":[],"grade2":[],"grade3":[],"grade4":[],"grade5":[],"grade6":[]}';
  }
}

// ========== 用户数据 user.json（仓库根目录） ==========
const USER_FILE_PATH = 'user.json';

function buildUserFileUrl(config) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(USER_FILE_PATH)}`;
}

// 拉取全部用户列表；文件不存在（404/409/400 等）时返回空数组，便于首次注册创建
async function fetchUserList(config) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const url = buildUserFileUrl(config);
  if (!url) throw new Error('仓库地址格式错误');
  let resp, data;
  try {
    resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
    data = await resp.json();
  } catch (e) {
    // 网络异常时按空列表处理，让注册可继续走创建流程
    return [];
  }
  if (resp.status === 401) {
    throw new Error('令牌无效或已过期(401)');
  }
  // HTTP 200 且包含 content → 文件存在，解析并返回
  if (resp.ok && data && data.content) {
    try {
      const parsed = JSON.parse(decodeBase64(data.content));
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  // 其他情况（文件不存在返回200+message、404、409、400等）统一视为尚无用户数据
  // Gitee API 在文件不存在时可能返回 200 + { message: "Not Found" }，没有 content 字段
  return [];
}

// 写回用户列表（自动处理创建/更新）
async function pushUserList(config, users) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const url = buildUserFileUrl(config);
  if (!url) throw new Error('仓库地址格式错误');
  await pushFileToGitee(url, JSON.stringify(users, null, 2), config, '更新用户数据 user.json');
}

async function pushCountDataToGitee(records, config, date) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const folderName = `${yyyy}${mm}`;
  const fileName = `${yyyy}${mm}${dd}.json`;
  const filePath = `${getSpacePrefix()}/count_data/${folderName}/${fileName}`;
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
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(`${getSpacePrefix()}/count_data`)}`;
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
  const folderPath = `${getSpacePrefix()}/count_data/${latestDir}`;
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
  const filePath = `${getSpacePrefix()}/count_data/${folderName}/${fileName}`;
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

// ========== count_hanzi 听写记录（按月/按天） ==========
// 与 count_data 结构完全一致，仅路径前缀不同：{space}/count_hanzi/YYYYMM/YYYYMMDD.json
// 听写完成后写入；最新听写 / 历史听写从此读取。

function buildHanziUrl(config, filePath) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(filePath)}`;
}

// 听写完成：把记录追加到当天文件（不存在则创建），返回写入的 folderName/fileName 供调用方记录
async function pushHanziRecordsToGitee(records, config, date) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const folderName = `${yyyy}${mm}`;
  const fileName = `${yyyy}${mm}${dd}.json`;
  const filePath = `${getSpacePrefix()}/count_hanzi/${folderName}/${fileName}`;
  const url = buildHanziUrl(config, filePath);
  if (!url) throw new Error('仓库地址格式错误');

  let existingRecords = [];
  let sha = '';
  try {
    const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
    const data = await resp.json();
    if (resp.ok && data && data.content) {
      const parsed = JSON.parse(decodeBase64(data.content));
      if (Array.isArray(parsed)) existingRecords = parsed;
      sha = data.sha || '';
    }
  } catch (e) {}

  const merged = [...existingRecords, ...records];
  const base64Content = encodeBase64(JSON.stringify(merged, null, 2));
  const branch = config.branch || DEFAULT_BRANCH;
  const token = config.token.trim();
  const commitMessage = `同步听写记录 ${fileName}`;

  if (sha) {
    // 文件已存在，PUT 更新
    const updateResp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, content: base64Content, sha, branch, message: commitMessage })
    });
    if (!updateResp.ok) {
      const errData = await updateResp.json().catch(() => ({}));
      throw new Error((errData && errData.message) || `更新失败(${updateResp.status})`);
    }
  } else {
    // 文件不存在，POST 创建（复用 pushFileToGitee 自动处理创建/更新）
    await pushFileToGitee(url, JSON.stringify(merged, null, 2), config, commitMessage);
  }
  return { folderName, fileName };
}

// 拉取单日听写记录（按完整文件路径）
async function pullHanziRecordsFromGitee(config, filePath) {
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

// 列出某月文件夹下的所有日期文件（复用 listCountDataFolder，路径无关）
async function listHanziDataFolder(config, folderPath) {
  return listCountDataFolder(config, folderPath);
}

// 列出 count_hanzi 下所有月份目录
async function listHanziDataDirs(config) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  const parsed = parseRepo(config.repo);
  if (!parsed) throw new Error('仓库地址格式错误');
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(`${getSpacePrefix()}/count_hanzi`)}`;
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

// 获取最新一天的听写记录
async function fetchLatestHanziData(config) {
  const dirs = await listHanziDataDirs(config);
  if (dirs.length === 0) {
    return { records: [], dateLabel: '', folderName: '', fileName: '', sha: '' };
  }
  const latestDir = dirs[dirs.length - 1];
  const folderPath = `${getSpacePrefix()}/count_hanzi/${latestDir}`;
  const files = await listHanziDataFolder(config, folderPath);
  if (files.length === 0) {
    return { records: [], dateLabel: '', folderName: '', fileName: '', sha: '' };
  }
  const sortedFiles = [...files].sort();
  const latestFile = sortedFiles[sortedFiles.length - 1];
  const filePath = `${folderPath}/${latestFile}`;
  const { records, sha } = await pullHanziRecordsFromGitee(config, filePath);
  const name = latestFile.replace('.json', '');
  const y = name.slice(0, 4);
  const m = name.slice(4, 6);
  const d = name.slice(6, 8);
  const dateLabel = `${y}年${m}月${d}日`;
  return { records, sha, dateLabel, folderName: latestDir, fileName: latestFile };
}

// 标记后更新当天听写记录（按 folderName/fileName 定位）
async function pushHanziRecordsUpdate(config, folderName, fileName, records, sha) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  if (!sha) throw new Error('缺少文件 sha，无法更新');
  const filePath = `${getSpacePrefix()}/count_hanzi/${folderName}/${fileName}`;
  const url = buildHanziUrl(config, filePath);
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


// ========== count_error 错误记录 ==========
function getErrorDataUrl(config, filePath) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(filePath)}`;
}

function getCurrentErrorMonth() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function pushErrorRecord(config, errorItem) {
  if (!isSyncConfigured(config)) return;
  const month = getCurrentErrorMonth();
  const fileName = `${month}.json`;
  const filePath = `${getSpacePrefix()}/count_error/${fileName}`;
  const url = getErrorDataUrl(config, filePath);
  if (!url) return;
  const branch = config.branch || DEFAULT_BRANCH;
  const token = config.token.trim();

  // 拉取已有数据（用于去重和获取sha）
  let existing = [];
  let sha = '';
  try {
    const resp = await fetch(`${url}?access_token=${token}&ref=${branch}`);
    const data = await resp.json();
    if (resp.ok && data && data.content) {
      const parsed = JSON.parse(decodeBase64(data.content));
      existing = Array.isArray(parsed) ? parsed : [];
      sha = data.sha || '';
    }
  } catch (e) {}

  // 去重检查
  if (existing.some(r => String(r.id) === String(errorItem.id) && r.hz === errorItem.hz)) return;

  existing.push(errorItem);
  const base64Content = encodeBase64(JSON.stringify(existing, null, 2));
  const commitMsg = `记录错误汉字 ${errorItem.hz}`;

  // 先用 POST 创建
  const createResp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, content: base64Content, branch, message: commitMsg })
  });
  if (createResp.ok) return;

  // POST 失败（文件已存在），重新获取 sha
  if (!sha) {
    try {
      const resp2 = await fetch(`${url}?access_token=${token}&ref=${branch}`);
      const d2 = await resp2.json();
      if (resp2.ok && d2 && d2.sha) sha = d2.sha;
    } catch (e) {}
  }
  if (!sha) return;

  // PUT 更新
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: token, content: base64Content, sha, branch, message: commitMsg })
  });
}

async function listErrorDirs(config) {
  if (!isSyncConfigured(config)) return [];
  const parsed = parseRepo(config.repo);
  if (!parsed) return [];
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(`${getSpacePrefix()}/count_error`)}`;
  try {
    const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
    const data = await resp.json();
    if (resp.ok && Array.isArray(data)) {
      return data.filter(item => item.type === 'file' && item.name.endsWith('.json')).map(item => item.name).sort().reverse();
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function pullErrorDataFromGitee(config, monthFileName) {
  if (!isSyncConfigured(config)) return [];
  const filePath = `${getSpacePrefix()}/count_error/${monthFileName}`;
  const url = getErrorDataUrl(config, filePath);
  if (!url) return [];
  try {
    const resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
    const data = await resp.json();
    if (resp.ok && data && data.content) {
      const records = JSON.parse(decodeBase64(data.content));
      return Array.isArray(records) ? records : [];
    }
    return [];
  } catch (e) {
    return [];
  }
}

// ===== 通用文件 URL 构建（用于同步等场景） =====
function buildFileUrl(config, filePath) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return null;
  return `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(filePath)}`;
}

// 递归列出某个目录下的所有文件（含子目录）
async function listAllFilesRecursive(config, dirPath) {
  const parsed = parseRepo(config.repo);
  if (!parsed) return [];
  const url = `${GITEE_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/${encodeFilePath(dirPath)}`;
  let resp;
  try {
    resp = await fetch(`${url}?access_token=${config.token.trim()}&ref=${config.branch || DEFAULT_BRANCH}`);
  } catch (e) {
    return [];
  }
  const data = await resp.json();
  if (!resp.ok || !Array.isArray(data)) return [];

  const results = [];
  for (const item of data) {
    if (item.type === 'file') {
      results.push(`${dirPath}/${item.name}`);
    } else if (item.type === 'dir') {
      const subFiles = await listAllFilesRecursive(config, `${dirPath}/${item.name}`);
      results.push(...subFiles);
    }
  }
  return results;
}

// ===== 同步基础数据到用户空间 =====
// 将 dictation/ 目录下的所有文件复制到用户的个人空间
async function syncBaseDataToUserSpace(config, space) {
  if (!isSyncConfigured(config)) throw new Error('请先配置 Gitee 令牌和仓库地址');
  if (!space) throw new Error('缺少用户空间标识');

  const branch = config.branch || DEFAULT_BRANCH;
  const token = config.token.trim();

  // 读取 dictation/ 下所有文件
  const files = await listAllFilesRecursive(config, 'dictation');
  if (files.length === 0) return;

  let copied = 0;
  for (const srcPath of files) {
    // 读取源文件内容
    const srcUrl = buildFileUrl(config, srcPath);
    if (!srcUrl) continue;
    let resp;
    try {
      resp = await fetch(`${srcUrl}?access_token=${token}&ref=${branch}`);
    } catch (e) {
      continue;
    }
    const data = await resp.json();
    if (!resp.ok || !data || !data.content) continue;

    // 写入到用户空间（保持相对路径）
    const relPath = srcPath.startsWith('dictation/') ? srcPath.slice('dictation/'.length) : srcPath;
    const destPath = `${space}/${relPath}`;
    const destUrl = buildFileUrl(config, destPath);
    if (!destUrl) continue;

    await _writeFileToGitee(destUrl, decodeBase64(data.content), config, `同步基础数据 ${relPath}`);
    copied++;
  }
  return copied;
}
