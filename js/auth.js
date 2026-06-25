// ========== 用户认证（注册 / 登录 / 会话） ==========
// 用户数据统一保存在 Gitee 仓库根目录的 user.json：
// 字段：id（时间戳）、name、pwd（加密后）、filder（space_时间戳）

const SESSION_KEY = 'dictationUser'; // localStorage 中保存的当前登录用户

// ===== 密码简单加密（Base64 可逆混淆） =====
function encryptPwd(plain) {
  try {
    // 先反转再 Base64，增加一点混淆
    const reversed = plain.split('').reverse().join('');
    return btoa(unescape(encodeURIComponent(reversed)));
  } catch (e) {
    return btoa(unescape(encodeURIComponent(plain)));
  }
}

function decryptPwd(encrypted) {
  try {
    const reversed = decodeURIComponent(escape(atob(encrypted)));
    return reversed.split('').reverse().join('');
  } catch (e) {
    return '';
  }
}

// 取当前登录用户（未登录返回 null）
function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// 是否已登录
function isLoggedIn() {
  return !!getCurrentUser();
}

// 保存 / 清除会话
function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// 登录拦截：未登录返回 false（单页模式，不再做 location 跳转，由 app.js init 处理）
function requireLogin() {
  return isLoggedIn();
}

// 退出登录
function logout() {
  clearSession();
  // 单页切换到登录页（不跳转独立 login.html）
  if (typeof window.showLoginPage === 'function') {
    window.showLoginPage();
  }
}

// 校验仓库可访问，并把仓库真实默认分支回填到 config（避免 branch 配置不匹配）
// 返回 { ok, config, error }
async function prepareConfig(config) {
  const check = await checkRepoAccess(config);
  if (!check.ok) return { ok: false, config, error: check.error };
  const cfg = { ...config };
  if (check.repo && check.repo.defaultBranch) cfg.branch = check.repo.defaultBranch;
  return { ok: true, config: cfg, error: null };
}

// 注册：name + password。先拉取 user.json 检查重名，密码加密后存储
// 注册成功后创建用户空间文件夹并写入空的 cate.json
// 成功返回 { ok:true, user }，失败返回 { ok:false, error }
async function registerUser(name, password) {
  name = (name || '').trim();
  password = password || '';
  if (!name) return { ok: false, error: '请输入用户名' };
  if (!password) return { ok: false, error: '请输入密码' };

  const config = getSyncConfig();
  if (!isSyncConfigured(config)) return { ok: false, error: '同步未配置，无法注册' };

  try {
    const prep = await prepareConfig(config);
    if (!prep.ok) return { ok: false, error: prep.error };

    // 拉取已有用户列表，检查重名
    const users = await fetchUserList(prep.config);
    if (users.some(u => String(u.name) === name)) {
      return { ok: false, error: '该用户名已被注册' };
    }

    // 密码加密存储，创建用户空间标识
    const ts = Date.now();
    const space = 'space_' + ts;
    const user = { id: ts, name: name, pwd: encryptPwd(password), filder: space, synced: false };
    users.push(user);
    await pushUserList(prep.config, users);

    // 用户空间采用懒加载：注册时不预创建任何文件。
    // 用户在知识库添加内容时，对应 分类/年级.json 会自动创建；
    // 读取消费时（pullCategoryFromGitee）文件不存在则按空数组处理。

    // 会话中保存加密后的 pwd
    setSession(user);
    return { ok: true, user: user };
  } catch (e) {
    return { ok: false, error: e.message || '注册失败' };
  }
}

// 登录：校验 name + password（密码与加密后的 pwd 比对）
async function loginUser(name, password) {
  name = (name || '').trim();
  password = password || '';
  if (!name) return { ok: false, error: '请输入用户名' };
  if (!password) return { ok: false, error: '请输入密码' };

  const config = getSyncConfig();
  if (!isSyncConfigured(config)) return { ok: false, error: '同步未配置，无法登录' };

  try {
    const prep = await prepareConfig(config);
    if (!prep.ok) return { ok: false, error: prep.error };
    const users = await fetchUserList(prep.config);

    // 先用加密后的密码匹配，兼容明文旧数据
    const encrypted = encryptPwd(password);
    const found = users.find(u =>
      String(u.name) === name &&
      (String(u.pwd) === encrypted || String(u.pwd) === password)
    );
    if (!found) return { ok: false, error: '用户名或密码错误' };

    // 如果旧数据是明文，自动升级为加密
    if (String(found.pwd) === password) {
      found.pwd = encrypted;
      await pushUserList(prep.config, users);
    }

    setSession(found);
    return { ok: true, user: found };
  } catch (e) {
    return { ok: false, error: e.message || '登录失败' };
  }
}
