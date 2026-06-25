const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
const CATEGORIES = [
  { label: '汉字', value: 'hanzi' },
  { label: '词语', value: 'ciyu' },
  { label: '成语', value: 'chengyu' },
  { label: '古诗', value: 'gushi' },
  { label: '日积月累', value: 'jilei' }
];
const CATEGORY_LABELS = { hanzi: '汉字', ciyu: '词语', chengyu: '成语', gushi: '古诗', jilei: '日积月累' };

// 内容数据按分类 × 年级二维存储：categoryData[category][gradeIndex] = 记录数组
function emptyCategoryGradeData() {
  const o = {};
  CATEGORIES.forEach(c => { o[c.value] = [[], [], [], [], [], []]; });
  return o;
}
let appState = {
  categoryData: emptyCategoryGradeData(),
  cateData: { grade1: [], grade2: [], grade3: [], grade4: [], grade5: [], grade6: [] },
  cateLoaded: false,        // 单元课文树 cate.json 是否已加载（进听写页时拉一次）
  categoryLoaded: {}        // 各分类内容数据是否已加载：{ hanzi: true, ciyu: true, ... }，点分类 tab 时按需拉
};

function storageKey(cat, g) { return `cat_${cat}_${g}`; }
const CATE_STORAGE_KEY = 'characterCate';
function gradeKey(g) { return 'grade' + (Number(g) + 1); }

function getCategoryGradeData(cat, g) {
  if (!appState.categoryData[cat]) appState.categoryData[cat] = [[], [], [], [], [], []];
  const arr = appState.categoryData[cat][g];
  return Array.isArray(arr) ? arr : [];
}
function setCategoryGradeData(cat, g, arr) {
  if (!appState.categoryData[cat]) appState.categoryData[cat] = [[], [], [], [], [], []];
  appState.categoryData[cat][g] = Array.isArray(arr) ? arr : [];
}

// ===== 内置默认同步配置（无需在“我的”页面手动输入）=====
const DEFAULT_SYNC_CONFIG = {
  token: '51a0167ca18909d6055b158f8875c922',
  repo: 'https://gitee.com/hesir00/dictation_sql.git',
  branch: 'master',
  autoSync: false
};
// 启动时写入默认配置；已存在的用户配置保留不变
function ensureDefaultSyncConfig() {
  try {
    const raw = localStorage.getItem('giteeSyncConfig');
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg && cfg.token && cfg.repo) return; // 用户已配置，保留
    }
  } catch (e) { }
  saveSyncConfig(DEFAULT_SYNC_CONFIG);
}

function normalizeCateData(data) {
  const emptyTree = { grade1: [], grade2: [], grade3: [], grade4: [], grade5: [], grade6: [] };
  if (!data) return { ...emptyTree };
  const hasTreeKey = Object.keys(emptyTree).some(k => Array.isArray(data[k]));
  const ensureUnit = (u, grade) => ({
    id: u.id, name: u.name, type: u.type || 'unit', grade: Number(grade),
    lessons: Array.isArray(u.lessons) ? u.lessons.map(l => ({
      id: l.id, name: l.name, type: l.type || 'lesson', grade: Number(grade)
    })) : []
  });
  const tree = { ...emptyTree };
  if (hasTreeKey) {
    Object.keys(emptyTree).forEach(k => {
      const grade = Number(k.replace('grade', '')) - 1;
      const arr = Array.isArray(data[k]) ? data[k] : [];
      tree[k] = arr.map(u => ensureUnit(u, grade));
    });
  }
  return tree;
}

function loadLocalData() {
  CATEGORIES.forEach(cat => {
    for (let i = 0; i < 6; i++) {
      try {
        const data = localStorage.getItem(storageKey(cat.value, i));
        if (data) { const p = JSON.parse(data); setCategoryGradeData(cat.value, i, Array.isArray(p) ? p : []); }
      } catch (e) { }
    }
  });
  try {
    const cs = localStorage.getItem(CATE_STORAGE_KEY);
    if (cs) appState.cateData = normalizeCateData(JSON.parse(cs));
  } catch (e) { }
}

function saveCategoryGradeData(cat, g) {
  try { localStorage.setItem(storageKey(cat, g), JSON.stringify(getCategoryGradeData(cat, g))); } catch (e) { }
  autoSyncCategoryToGitee(cat, g);
}
function saveCateData() {
  try { localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); } catch (e) { }
  autoSyncCateToGitee();
}
async function autoSyncCategoryToGitee(cat, g) {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushCategoryToGitee(JSON.stringify(getCategoryGradeData(cat, g)), c, cat, g); updateSyncTime(); } catch (e) { }
}
async function autoSyncCateToGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushCateToGitee(JSON.stringify(appState.cateData), c); updateSyncTime(); } catch (e) { }
}
function updateSyncTime() {
  const n = new Date(), p = m => String(m).padStart(2, '0');
  localStorage.setItem('lastSyncTime', `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}`);
}
function getGradeUnits(g) { return appState.cateData[gradeKey(g)] || []; }

function showToast(title) {
  const t = document.getElementById('toast'); t.textContent = title; t.className = 'toast show';
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.className = 'toast'; }, 2000);
}
function showLoading(title) { document.getElementById('loadingText').textContent = title || '加载中...'; document.getElementById('loadingMask').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingMask').style.display = 'none'; }
function showModal(html) { document.getElementById('modalBox').innerHTML = html; document.getElementById('modalMask').style.display = 'flex'; }
function closeModal() { document.getElementById('modalMask').style.display = 'none'; }
function confirmDialog(title, content, onConfirm) {
  window._confirmCallback = onConfirm;
  showModal(`<div class="modal-header"><span class="modal-title">${title}</span><span class="modal-close" onclick="closeModal()">×</span></div><p style="font-size:14px;color:#666;line-height:1.6;margin-bottom:20px;">${content}</p><div class="btn-row"><button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="closeModal();window._confirmCallback()">确定</button></div>`);
}

let currentPage = 'statistics';

function switchTab(tab) {
  currentPage = tab;
  document.querySelectorAll('.tab-item').forEach(item => item.classList.toggle('active', item.dataset.tab === tab));
  const titles = { statistics: '统计', characters: '知识库', dictation: '听写', mine: '我的' };
  document.getElementById('navTitle').textContent = titles[tab] || '';
  document.getElementById('tabbar').style.display = '';
  document.getElementById('navBack').style.display = 'none';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  if (tab === 'characters') refreshCharacters();
  else if (tab === 'dictation') ensureDataLoadedThenRefresh();
  else if (tab === 'mine') refreshMine();
}

// 按需加载：进听写页只拉 cate.json（单元课文树）+ 当前分类的 6 个年级文件；
// 点其他分类 tab 时再按需拉该分类。统计页不拉任何内容数据。
function ensureDataLoadedThenRefresh() {
  const tasks = [];
  if (!appState.cateLoaded) tasks.push(loadCateFromGiteeOnly());
  if (!appState.categoryLoaded[dictationState.currentCategory]) tasks.push(loadCategoryData(dictationState.currentCategory));
  if (tasks.length === 0) { refreshDictationSelect(); return; }
  showLoading('加载数据中...');
  Promise.all(tasks).then(() => { hideLoading(); refreshDictationSelect(); }).catch(() => { hideLoading(); refreshDictationSelect(); });
}

// 只拉取单元课文树 cate.json（所有分类共享）
async function loadCateFromGiteeOnly() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try {
    const cj = await pullCateFromGitee(c); const rc = JSON.parse(cj);
    if (rc && Object.keys(rc).length > 0) { appState.cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); }
  } catch (e) { }
  appState.cateLoaded = true;
}

// 拉取指定分类的 6 个年级文件（点分类 tab 时按需调用）
async function loadCategoryData(cat) {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) { appState.categoryLoaded[cat] = true; return; }
  for (let i = 0; i < 6; i++) {
    try {
      const rj = await pullCategoryFromGitee(c, cat, i); const rd = JSON.parse(rj);
      if (Array.isArray(rd)) { setCategoryGradeData(cat, i, rd); localStorage.setItem(storageKey(cat, i), JSON.stringify(rd)); }
    } catch (e) { }
  }
  appState.categoryLoaded[cat] = true;
}

function navigateTo(page) {
  const titles = { history: '历史听写', latest: '最新听写', error: '错词本' };
  document.getElementById('navTitle').textContent = titles[page] || '';
  document.getElementById('tabbar').style.display = 'none';
  document.getElementById('navBack').style.display = '';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  currentPage = page;
  if (page === 'history') initHistory();
  else if (page === 'latest') loadLatest();
  else if (page === 'error') initErrorBook();
}

// ========== 统计页 ==========
function initStatistics() {
  document.getElementById('goLatestBtn').onclick = () => navigateTo('latest');
  document.getElementById('goHistoryBtn').onclick = () => navigateTo('history');
  document.getElementById('goErrorBtn').onclick = () => navigateTo('error');
}

// ========== 知识库页 ==========
let charState = { currentGrade: 0 };

const CATEGORY_INFO = [
  { value: 'hanzi', label: '汉字', icon: '🀄', color: '#FF6B35', desc: '会写生字' },
  { value: 'ciyu', label: '词语', icon: '📝', color: '#5B9BD5', desc: '积累词汇' },
  { value: 'chengyu', label: '成语', icon: '🎯', color: '#4CAF50', desc: '成语典故' },
  { value: 'gushi', label: '古诗', icon: '📜', color: '#9C27B0', desc: '古诗文' },
  { value: 'jilei', label: '日积月累', icon: '📦', color: '#FF9800', desc: '每日积累' }
];

function refreshCharacters() {
  const tabsEl = document.getElementById('charGradeTabs');
  tabsEl.innerHTML = GRADES.map((g, i) => `<div class="grade-tab ${charState.currentGrade === i ? 'active' : ''}" data-grade="${i}"><span class="grade-tab-text">${g}</span></div>`).join('');
  tabsEl.querySelectorAll('.grade-tab').forEach(t => {
    t.onclick = () => { charState.currentGrade = parseInt(t.dataset.grade); refreshCharacters(); };
  });

  const gridEl = document.getElementById('categoryGrid');
  gridEl.innerHTML = CATEGORY_INFO.map(cat => `
    <div class="category-card" data-cat="${cat.value}" style="--cat-color:${cat.color}">
      <div class="category-card-icon">${cat.icon}</div>
      <div class="category-card-label">${cat.label}</div>
      <div class="category-card-desc">${cat.desc}</div>
    </div>
  `).join('');

  gridEl.querySelectorAll('.category-card').forEach(card => {
    card.onclick = () => {
      const cat = card.dataset.cat;
      location.href = `${cat}.html?grade=${charState.currentGrade}`;
    };
  });
}

function initCharacters() {
  // 知识库页面不需要 filter/FAB 绑定，由独立页面承载
}

// ========== 听写页 ==========
let dictationState = {
  phase: 'select', dictationMode: 'lesson', currentCategory: 'hanzi', currentGrade: 0,
  filterUnitIndex: 0, filterLessonIndex: 0,
  dictationList: [], currentIndex: 0, currentGroup: 0,
  abortFlag: false, isPaused: false, _delayTimer: null, dictationRecords: []
};

function showDictPhase(phase) {
  ['select', 'running', 'complete'].forEach(p => {
    document.getElementById('dict-' + p).classList.toggle('active', p === phase);
  });
}

function getDictationSelectedList() {
  let list = getCategoryGradeData(dictationState.currentCategory, dictationState.currentGrade);
  const gu = getGradeUnits(dictationState.currentGrade);
  const fuid = dictationState.filterUnitIndex > 0 ? gu[dictationState.filterUnitIndex - 1].id : null;
  if (fuid !== null) list = list.filter(item => String(item.unitId) === String(fuid));
  if (dictationState.dictationMode === 'lesson' && dictationState.filterLessonIndex > 0) {
    const gl = fuid === null ? gu.flatMap(u => u.lessons || []) : (gu.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];
    const lid = gl[dictationState.filterLessonIndex - 1].id;
    list = list.filter(item => String(item.lessonId) === String(lid));
  }
  return list;
}

function refreshDictationSelect() {
  if (dictationState.phase !== 'select') return;
  showDictPhase('select');
  const modeEl = document.getElementById('dictModeTabs');
  modeEl.innerHTML = [{ mode: 'lesson', label: '按课文听写' }, { mode: 'unit', label: '按单元听写' }].map(m => `<div class="mode-tab ${dictationState.dictationMode === m.mode ? 'active' : ''}" data-mode="${m.mode}">${m.label}</div>`).join('');
  modeEl.querySelectorAll('.mode-tab').forEach(t => { t.onclick = () => { dictationState.dictationMode = t.dataset.mode; dictationState.filterUnitIndex = 0; dictationState.filterLessonIndex = 0; refreshDictationSelect(); }; });
  // 分类 tab
  const catEl = document.getElementById('dictCategoryTabs');
  catEl.innerHTML = CATEGORIES.map(c => `<div class="grade-tab ${dictationState.currentCategory === c.value ? 'active' : ''}" data-cat="${c.value}"><span class="grade-tab-text">${c.label}</span></div>`).join('');
  catEl.querySelectorAll('.grade-tab').forEach(t => { t.onclick = () => {
    const newCat = t.dataset.cat;
    dictationState.currentCategory = newCat; dictationState.filterUnitIndex = 0; dictationState.filterLessonIndex = 0;
    // 该分类未加载则按需拉取（点谁加载谁），拉完再刷新
    if (!appState.categoryLoaded[newCat]) {
      showLoading('加载数据中...');
      loadCategoryData(newCat).then(() => { hideLoading(); refreshDictationSelect(); }).catch(() => { hideLoading(); refreshDictationSelect(); });
    } else {
      refreshDictationSelect();
    }
  }; });
  // 年级 tab
  const gtEl = document.getElementById('dictGradeTabs');
  gtEl.innerHTML = GRADES.map((g, i) => `<div class="grade-tab ${dictationState.currentGrade === i ? 'active' : ''}" data-grade="${i}"><span class="grade-tab-text">${g}</span></div>`).join('');
  gtEl.querySelectorAll('.grade-tab').forEach(t => { t.onclick = () => { dictationState.currentGrade = parseInt(t.dataset.grade); dictationState.filterUnitIndex = 0; dictationState.filterLessonIndex = 0; refreshDictationSelect(); }; });
  const gu = getGradeUnits(dictationState.currentGrade);
  const fuid = dictationState.filterUnitIndex > 0 ? gu[dictationState.filterUnitIndex - 1].id : null;
  const gl = fuid === null ? gu.flatMap(u => u.lessons || []) : (gu.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];
  document.getElementById('dictUnitFilter').innerHTML = '<option value="0">选择单元</option>' + gu.map((u, i) => `<option value="${i + 1}" ${dictationState.filterUnitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('');
  const lp = document.getElementById('dictLessonPicker');
  lp.style.display = dictationState.dictationMode === 'lesson' ? '' : 'none';
  if (dictationState.dictationMode === 'lesson') {
    document.getElementById('dictLessonFilter').innerHTML = '<option value="0">选择课文</option>' + gl.map((l, i) => `<option value="${i + 1}" ${dictationState.filterLessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('');
  }
  const selectedList = getDictationSelectedList();
  document.getElementById('dictCount').textContent = selectedList.length;
  const previewEl = document.getElementById('dictCharPreview');
  if (selectedList.length === 0) {
    previewEl.innerHTML = '<div class="empty-tip">请选择年级、单元、课文</div>';
  } else {
    previewEl.innerHTML = '<div class="char-grid">' + selectedList.map(item =>
      `<div class="char-card">${item.pinyin ? `<span class="char-pinyin">${item.pinyin}</span>` : ''}<span class="char-hanzi">${item.content || ''}</span>${item.ciyu ? `<span class="char-ciyu">${item.ciyu}</span>` : ''}${item.ciyupy ? `<span class="char-ciyupy">${item.ciyupy}</span>` : ''}</div>`
    ).join('') + '</div>';
  }
  const startBtn = document.getElementById('dictStartBtn');
  startBtn.classList.toggle('disabled', selectedList.length === 0);
}

function initDictation() {
  document.getElementById('dictUnitFilter').onchange = (e) => { dictationState.filterUnitIndex = parseInt(e.target.value); dictationState.filterLessonIndex = 0; refreshDictationSelect(); };
  document.getElementById('dictLessonFilter').onchange = (e) => { dictationState.filterLessonIndex = parseInt(e.target.value); refreshDictationSelect(); };
  document.getElementById('dictStartBtn').onclick = () => startDictation();
  document.getElementById('dictPauseBtn').onclick = () => togglePause();
  document.getElementById('dictStopBtn').onclick = () => stopDictation();
  document.getElementById('dictRestartBtn').onclick = () => {
    dictationState.currentIndex = 0; dictationState.currentGroup = 0; dictationState.abortFlag = false; dictationState.isPaused = false; dictationState.dictationRecords = []; dictationState.phase = 'dictating';
    showDictPhase('running'); updateDictRunning(); runDictationLoop();
  };
  document.getElementById('dictBackBtn').onclick = () => {
    dictationState.phase = 'select'; dictationState.dictationList = []; dictationState.currentGroup = 0; dictationState.currentIndex = 0; refreshDictationSelect();
  };
}

async function startDictation() {
  const list = getDictationSelectedList();
  if (list.length === 0) { showToast('没有可选的字词'); return; }
  dictationState.dictationList = [...list]; dictationState.currentIndex = 0; dictationState.currentGroup = 0;
  dictationState.abortFlag = false; dictationState.isPaused = false; dictationState.dictationRecords = []; dictationState.phase = 'dictating';
  showDictPhase('running'); updateDictRunning(); await runDictationLoop();
}

function updateDictRunning() {
  const char = dictationState.dictationList[dictationState.currentIndex];
  const pct = dictationState.dictationList.length === 0 ? 0 : Math.round((dictationState.currentIndex / dictationState.dictationList.length) * 100);
  document.getElementById('dictProgressText').textContent = (dictationState.currentIndex + 1) + ' / ' + dictationState.dictationList.length;
  document.getElementById('dictProgressFill').style.width = pct + '%';
  document.getElementById('dictPinyin').textContent = (char && char.pinyin) ? char.pinyin : '';
  document.getElementById('dictMainChar').textContent = char ? char.content : '';
  const badge = document.getElementById('dictBadge'); const cl = char ? (CATEGORY_LABELS[char.category] || '') : '';
  if (cl) { badge.textContent = cl; badge.style.display = ''; } else { badge.style.display = 'none'; }
  document.getElementById('dictReadIndicator').innerHTML = [1, 2].map(i => '<div class="read-dot ' + (i <= dictationState.currentGroup ? 'active' : '') + '"></div>').join('') + '<span class="read-text">第 ' + dictationState.currentGroup + ' / 2 组</span>';
  document.getElementById('dictPauseHint').style.display = dictationState.phase === 'paused' ? '' : 'none';
  document.getElementById('dictPauseBtn').textContent = dictationState.phase === 'paused' ? '▶ 继续' : '⏸ 暂停';
}

async function runDictationLoop() {
  while (dictationState.currentIndex < dictationState.dictationList.length) {
    if (dictationState.abortFlag) return;
    await waitWhilePaused();
    if (dictationState.abortFlag) return;
    const char = dictationState.dictationList[dictationState.currentIndex];
    for (let i = 0; i < 2; i++) {
      if (dictationState.abortFlag) return;
      await waitWhilePaused();
      if (dictationState.abortFlag) return;
      dictationState.currentGroup = i + 1; updateDictRunning();
      // 每次朗读前先 cancel 之前的残留，然后连续播放不 cancel
      window.speechSynthesis.cancel();
      await delay(50);
      await speak(char.content, { cancel: false }); await delay(800);
      if (char.ciyu) await speak(char.ciyu, { cancel: false });
      await delay(800);
      if (i === 0) await delay(1500);
    }
    incrementTimes(char);
    const unit = findUnitName(char.unitId), lesson = findLessonName(char.lessonId);
    dictationState.dictationRecords.push({ id: char.id, pg: 1, yes: 0, hz: char.content || '', cy: char.ciyu || '', cyp: char.ciyupy || '', py: char.pinyin || '', nj: GRADES[dictationState.currentGrade] || '', dy: unit || '', kw: lesson || '' });
    if (dictationState.currentIndex < dictationState.dictationList.length - 1) await delay(2000);
    dictationState.currentIndex++; dictationState.currentGroup = 0; updateDictRunning();
  }
  if (!dictationState.abortFlag) {
    dictationState.phase = 'complete';
    showDictPhase('complete');
    document.getElementById('dictCompleteStat').textContent = '共听写 ' + dictationState.dictationList.length + ' 个字词';
    document.getElementById('dictCompleteGrid').innerHTML = dictationState.dictationList.map(item => '<div class="complete-card">' + item.content + '</div>').join('');
    syncDictationRecords();
  }
}

function findUnitName(id) { if (!id) return ''; for (let i = 1; i <= 6; i++) { const u = (appState.cateData['grade' + i] || []).find(u => String(u.id) === String(id)); if (u) return u.name; } return ''; }
function findLessonName(id) { if (!id) return ''; for (let i = 1; i <= 6; i++) { for (const u of (appState.cateData['grade' + i] || [])) { const l = (u.lessons || []).find(l => String(l.id) === String(id)); if (l) return l.name; } } return ''; }
function incrementTimes(char) { const list = getCategoryGradeData(dictationState.currentCategory, dictationState.currentGrade); if (!Array.isArray(list)) return; const item = list.find(c => c.id === char.id); if (item) { item.times = (item.times || 0) + 1; saveCategoryGradeData(dictationState.currentCategory, dictationState.currentGrade); } }
async function syncDictationRecords() {
  if (dictationState.dictationRecords.length === 0) return;
  const c = getSyncConfig();
  if (!isSyncConfigured(c)) {
    console.log('未配置Gitee同步，听写记录仅保存在本地');
    return;
  }
  try {
    await pushCountDataToGitee(dictationState.dictationRecords, c);
    console.log('听写记录已同步到 count_data/' + new Date().toISOString().slice(0, 10));
  } catch (e) {
    console.error('同步听写记录失败:', e.message);
  }
}
function togglePause() { if (dictationState.phase === 'paused') { dictationState.isPaused = false; dictationState.phase = 'dictating'; } else { dictationState.isPaused = true; dictationState.phase = 'paused'; stopSpeak(); } updateDictRunning(); }
function stopDictation() { dictationState.abortFlag = true; dictationState.isPaused = false; stopSpeak(); if (dictationState._delayTimer) { clearTimeout(dictationState._delayTimer); dictationState._delayTimer = null; } dictationState.phase = 'select'; dictationState.currentGroup = 0; dictationState.currentIndex = 0; refreshDictationSelect(); }
function delay(ms) { return new Promise(r => { dictationState._delayTimer = setTimeout(r, ms); }); }
function waitWhilePaused() { return new Promise(r => { const c = () => { if (dictationState.abortFlag || !dictationState.isPaused) { r(); return; } setTimeout(c, 200); }; c(); }); }

// ========== 我的页 ==========
function refreshMine() {
  const user = getCurrentUser();
  document.getElementById('accountInfo').textContent = user ? ('当前用户：' + user.name) : '未登录';
  const last = localStorage.getItem('lastSyncTime') || '';
  const ss = document.getElementById('syncStatus');
  if (last) { document.getElementById('syncStatusText').textContent = '上次同步：' + last; ss.style.display = ''; }
  else { ss.style.display = 'none'; }
}

function initMine() {
  document.getElementById('logoutBtn').onclick = () => {
    confirmDialog('退出登录', '确定要退出当前账号吗？', () => { logout(); });
  };
  document.getElementById('pushBtn').onclick = async () => {
    const cfg = getSyncConfig(); if (!isSyncConfigured(cfg)) { showToast('请先配置令牌和仓库地址'); return; }
    showLoading('推送中...');
    try {
      for (const cat of CATEGORIES) { for (let i = 0; i < 6; i++) { const data = localStorage.getItem(storageKey(cat.value, i)) || '[]'; await pushCategoryToGitee(data, cfg, cat.value, i); } }
      hideLoading(); updateSyncTime(); refreshMine(); showToast('推送成功');
    } catch (e) { hideLoading(); showToast(e.message || '推送失败'); }
  };
  document.getElementById('pullBtn').onclick = async () => {
    const cfg = getSyncConfig(); if (!isSyncConfigured(cfg)) { showToast('请先配置令牌和仓库地址'); return; }
    showLoading('拉取中...');
    try {
      // 拉取单元课文树
      try { const cj = await pullCateFromGitee(cfg); const rc = JSON.parse(cj); if (rc && Object.keys(rc).length > 0) { appState.cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); } } catch (e) { }
      appState.cateLoaded = true;
      // 拉取全部分类 × 年级内容
      for (const cat of CATEGORIES) {
        for (let i = 0; i < 6; i++) {
          const rj = await pullCategoryFromGitee(cfg, cat.value, i);
          const rd = JSON.parse(rj);
          localStorage.setItem(storageKey(cat.value, i), rj);
          setCategoryGradeData(cat.value, i, rd);
        }
        appState.categoryLoaded[cat.value] = true;
      }
      hideLoading(); updateSyncTime(); refreshMine(); showToast('拉取成功');
    } catch (e) { hideLoading(); showToast(e.message || '拉取失败'); }
  };
}

// ========== 历史听写页 ==========
let historyState = { currentYear: 2026, currentMonth: 6, dateList: [], selectedDate: '', selectedFileSha: '', charList: [], syncing: false };

function initHistory() {
  const now = new Date();
  historyState.currentYear = now.getFullYear();
  historyState.currentMonth = now.getMonth() + 1;
  document.getElementById('prevMonthBtn').onclick = () => {
    historyState.currentMonth--; if (historyState.currentMonth < 1) { historyState.currentMonth = 12; historyState.currentYear--; }
    historyState.selectedDate = ''; historyState.charList = []; loadDateList();
  };
  document.getElementById('nextMonthBtn').onclick = () => {
    historyState.currentMonth++; if (historyState.currentMonth > 12) { historyState.currentMonth = 1; historyState.currentYear++; }
    historyState.selectedDate = ''; historyState.charList = []; loadDateList();
  };
  loadDateList();
}

async function loadDateList() {
  historyState.dateList = [];
  const container = document.getElementById('dateListContainer');
  container.innerHTML = '<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  document.getElementById('historyMonthLabel').textContent = historyState.currentYear + '年' + String(historyState.currentMonth).padStart(2, '0') + '月';
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) { container.innerHTML = '<div class="empty-tip"><span class="empty-text">请先配置同步</span></div>'; return; }
  try {
    const fn = '' + historyState.currentYear + String(historyState.currentMonth).padStart(2, '0');
    const files = await listCountDataFolder(config, getSpacePrefix() + '/count_data/' + fn);
    historyState.dateList = files.map(name => { const d = name.replace('.json', '').slice(-2); const m = name.replace('.json', '').slice(4, 6); return { fileName: name, label: m + '月' + d + '日' }; }).reverse();
    if (historyState.dateList.length === 0) { container.innerHTML = '<div class="empty-tip"><span class="empty-text">暂无听写记录</span></div>'; return; }
    container.innerHTML = historyState.dateList.map(item => '<div class="date-item ' + (historyState.selectedDate === item.fileName ? 'active' : '') + '" data-file="' + item.fileName + '"><span class="date-item-text">' + item.label + '</span></div>').join('');
    container.querySelectorAll('.date-item').forEach(e => { e.onclick = () => selectDate(e.dataset.file); });
  } catch (e) { container.innerHTML = '<div class="empty-tip"><span class="empty-text">加载失败</span></div>'; }
}

async function selectDate(fileName) {
  historyState.selectedDate = fileName; historyState.selectedFileSha = ''; historyState.charList = [];
  document.getElementById('dateListContainer').querySelectorAll('.date-item').forEach(e => e.classList.toggle('active', e.dataset.file === fileName));
  const charArea = document.getElementById('charAreaContainer');
  charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  const config = getSyncConfig(); if (!isSyncConfigured(config)) return;
  try {
    const fn = '' + historyState.currentYear + String(historyState.currentMonth).padStart(2, '0');
    const result = await pullCountDataFromGitee(config, getSpacePrefix() + '/count_data/' + fn + '/' + fileName);
    historyState.selectedFileSha = result.sha || '';
    historyState.charList = (result.records || []).map(r => ({ ...r, yes: typeof r.yes === 'number' ? r.yes : 0 }));
    renderHistoryChars();
  } catch (e) { charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">加载失败</span></div>'; }
}

function renderHistoryChars() {
  const charArea = document.getElementById('charAreaContainer');
  if (historyState.charList.length === 0) { charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">无数据</span></div>'; return; }
  charArea.innerHTML = '<div class="char-grid">' + historyState.charList.map((item, idx) => '<div class="char-card" style="' + (item.yes === 1 ? 'background:#c9f9d5;' : item.yes === 2 ? 'background:#f4b0ac;' : '') + '">' + (item.py ? '<span class="char-pinyin">' + item.py + '</span>' : '') + '<span class="char-hanzi">' + item.hz + '</span>' + (item.cy ? '<span class="char-ciyu">' + item.cy + '</span>' : '') + (item.cyp ? '<span class="char-ciyupy">' + item.cyp + '</span>' : '') + (item.yes !== 0 ? '<div class="mark-status"><img class="mark-icon" src="css/' + (item.yes === 1 ? 'success' : 'error') + '.png" /></div>' : '<div class="mark-btns"><button class="mark-btn" data-idx="' + idx + '" data-val="1"><img class="mark-icon" src="css/success.png" /></button><button class="mark-btn" data-idx="' + idx + '" data-val="2"><img class="mark-icon" src="css/error.png" /></button></div>') + '</div>').join('') + '</div>';
  charArea.querySelectorAll('.mark-btn').forEach(b => { b.onclick = () => historyMarkYes(parseInt(b.dataset.idx), parseInt(b.dataset.val)); });
}

async function historyMarkYes(idx, value) {
  const item = historyState.charList[idx]; const ov = item.yes; const nv = ov === value ? 0 : value;
  historyState.charList[idx].yes = nv; updateYesInCharList(item.id, ov, nv); renderHistoryChars();
  await saveHistoryCountData();
  // 记录错误汉字到 count_error
  if (nv === 2) {
    const config = getSyncConfig();
    if (isSyncConfigured(config)) {
      await pushErrorRecord(config, {
        id: item.id,
        hz: item.hz || '',
        cy: item.cy || '',
        cypy: item.cyp || '',
        py: item.py || '',
        nj: item.nj || '',
        dy: item.dy || '',
        kw: item.kw || ''
      });
    }
  }
  const fn = '' + historyState.currentYear + String(historyState.currentMonth).padStart(2, '0'); const config = getSyncConfig();
  if (!isSyncConfigured(config)) return;
  try { const result = await pullCountDataFromGitee(config, getSpacePrefix() + '/count_data/' + fn + '/' + historyState.selectedDate); historyState.selectedFileSha = result.sha || ''; historyState.charList = (result.records || []).map(r => ({ ...r, yes: typeof r.yes === 'number' ? r.yes : 0 })); renderHistoryChars(); } catch (e) { }
}

async function saveHistoryCountData() {
  if (!historyState.selectedDate || historyState.syncing) return; historyState.syncing = true;
  const config = getSyncConfig(); if (!isSyncConfigured(config)) { historyState.syncing = false; return; }
  try { const fn = '' + historyState.currentYear + String(historyState.currentMonth).padStart(2, '0'); await pushCountDataRecords(config, fn, historyState.selectedDate, historyState.charList, historyState.selectedFileSha); } catch (e) { showToast('保存失败'); }
  historyState.syncing = false;
}

function updateYesInCharList(charId, oldYes, newYes) {
  const idStr = String(charId);
  outer: for (const cat of CATEGORIES) {
    for (let i = 0; i < 6; i++) {
      let list = []; try { const d = localStorage.getItem(storageKey(cat.value, i)); if (d) list = JSON.parse(d); } catch (e) { continue; }
      if (!Array.isArray(list)) continue; const idx = list.findIndex(c => String(c.id) === idStr);
      if (idx > -1) {
        if (oldYes === 1) list[idx].yes = (list[idx].yes || 0) - 1; else if (oldYes === 2) list[idx].wrong = (list[idx].wrong || 0) - 1;
        if (newYes === 1) list[idx].yes = (list[idx].yes || 0) + 1; else if (newYes === 2) list[idx].wrong = (list[idx].wrong || 0) + 1;
        localStorage.setItem(storageKey(cat.value, i), JSON.stringify(list));
        setCategoryGradeData(cat.value, i, list);
        const config = getSyncConfig(); if (isSyncConfigured(config)) pushCategoryToGitee(JSON.stringify(list), config, cat.value, i).catch(() => { });
        break outer;
      }
    }
  }
}

// ========== 最新听写页 ==========
let latestState = { dateLabel: '', charList: [], loading: true, folderName: '', fileName: '', fileSha: '', syncing: false };

async function loadLatest() {
  latestState.loading = true;
  const header = document.getElementById('latestDateHeader'); const charArea = document.getElementById('latestCharArea');
  charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) { charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">请先配置 Gitee 同步</span></div>'; latestState.loading = false; return; }
  try {
    const result = await fetchLatestCountData(config);
    latestState.dateLabel = result.dateLabel; latestState.folderName = result.folderName; latestState.fileName = result.fileName; latestState.fileSha = result.sha || '';
    latestState.charList = (result.records || []).map(r => ({ ...r, yes: typeof r.yes === 'number' ? r.yes : 0 }));
    header.innerHTML = latestState.dateLabel ? '<span class="date-header-text">' + latestState.dateLabel + '</span>' : '';
    if (latestState.charList.length === 0) charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">暂无听写记录</span></div>'; else renderLatestChars();
  } catch (e) { charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">加载失败</span></div>'; }
  latestState.loading = false;
}

function renderLatestChars() {
  const charArea = document.getElementById('latestCharArea');
  charArea.innerHTML = '<div class="char-grid">' + latestState.charList.map((item, idx) => '<div class="char-card" style="width:90px;' + (item.yes === 1 ? 'background:#c9f9d5;' : item.yes === 2 ? 'background:#f4b0ac;' : '') + '">' + (item.py ? '<span class="char-pinyin">' + item.py + '</span>' : '') + '<span class="char-hanzi">' + item.hz + '</span>' + (item.cy ? '<span class="char-ciyu">' + item.cy + '</span>' : '') + (item.cyp ? '<span class="char-ciyupy">' + item.cyp + '</span>' : '') + (item.yes !== 0 ? '<div class="mark-status"><img class="mark-icon" src="css/' + (item.yes === 1 ? 'success' : 'error') + '.png" /></div>' : '<div class="mark-btns"><button class="mark-btn" data-idx="' + idx + '" data-val="1"><img class="mark-icon" src="css/success.png" /></button><button class="mark-btn" data-idx="' + idx + '" data-val="2"><img class="mark-icon" src="css/error.png" /></button></div>') + '</div>').join('') + '</div>';
  charArea.querySelectorAll('.mark-btn').forEach(b => { b.onclick = () => latestMarkYes(parseInt(b.dataset.idx), parseInt(b.dataset.val)); });
}

async function latestMarkYes(idx, value) {
  const item = latestState.charList[idx]; const ov = item.yes; const nv = ov === value ? 0 : value;
  latestState.charList[idx].yes = nv; updateYesInCharList(item.id, ov, nv); renderLatestChars();
  await saveLatestCountData();
  // 记录错误汉字到 count_error
  if (nv === 2) {
    const config = getSyncConfig();
    if (isSyncConfigured(config)) {
      await pushErrorRecord(config, {
        id: item.id,
        hz: item.hz || '',
        cy: item.cy || '',
        cypy: item.cyp || '',
        py: item.py || '',
        nj: item.nj || '',
        dy: item.dy || '',
        kw: item.kw || ''
      });
    }
  }
  await loadLatest();
}

async function saveLatestCountData() {
  if (!latestState.folderName || !latestState.fileName || latestState.syncing) return; latestState.syncing = true;
  const config = getSyncConfig(); if (!isSyncConfigured(config)) { latestState.syncing = false; return; }
  try { await pushCountDataRecords(config, latestState.folderName, latestState.fileName, latestState.charList, latestState.fileSha); } catch (e) { showToast('保存失败'); }
  latestState.syncing = false;
}

// ========== 错词本页 ==========
let errorState = { currentYear: 2026, currentMonth: 6, monthFiles: [], selectedFile: '', charList: [], loading: true };

function getCurrentErrorMonthState() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, fileName: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}.json` };
}

function initErrorBook() {
  const s = getCurrentErrorMonthState();
  errorState.currentYear = s.year;
  errorState.currentMonth = s.month;
  errorState.selectedFile = s.fileName;
  document.getElementById('errorPrevMonthBtn').onclick = () => {
    errorState.currentMonth--;
    if (errorState.currentMonth < 1) { errorState.currentMonth = 12; errorState.currentYear--; }
    errorState.selectedFile = `${errorState.currentYear}${String(errorState.currentMonth).padStart(2, '0')}.json`;
    loadErrorData();
  };
  document.getElementById('errorNextMonthBtn').onclick = () => {
    errorState.currentMonth++;
    if (errorState.currentMonth > 12) { errorState.currentMonth = 1; errorState.currentYear++; }
    errorState.selectedFile = `${errorState.currentYear}${String(errorState.currentMonth).padStart(2, '0')}.json`;
    loadErrorData();
  };
  loadErrorMonthList();
  loadErrorData();
}

async function loadErrorMonthList() {
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) return;
  try {
    errorState.monthFiles = await listErrorDirs(config);
  } catch (e) {
    errorState.monthFiles = [];
  }
}

async function loadErrorData() {
  errorState.loading = true;
  const area = document.getElementById('errorCharArea');
  const countText = document.getElementById('errorCountText');
  area.innerHTML = '<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  document.getElementById('errorMonthLabel').textContent = `${errorState.currentYear}年${String(errorState.currentMonth).padStart(2, '0')}月`;
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) {
    area.innerHTML = '<div class="empty-tip"><span class="empty-text">请先配置同步</span></div>';
    countText.textContent = '';
    errorState.loading = false;
    return;
  }
  try {
    errorState.charList = await pullErrorDataFromGitee(config, errorState.selectedFile);
    countText.textContent = errorState.charList.length > 0 ? `共 ${errorState.charList.length} 个错词` : '暂无错词记录';
    renderErrorChars();
  } catch (e) {
    area.innerHTML = '<div class="empty-tip"><span class="empty-text">加载失败</span></div>';
    countText.textContent = '';
  }
  errorState.loading = false;
}

function renderErrorChars() {
  const area = document.getElementById('errorCharArea');
  if (errorState.charList.length === 0) {
    area.innerHTML = '<div class="empty-tip"><span class="empty-text">暂无错词记录</span></div>';
    return;
  }
  area.innerHTML = '<div class="char-grid">' + errorState.charList.map((item) => {
    const bgStyle = 'background:#fff3f3;';
    return '<div class="char-card error-card" style="' + bgStyle + '">'
      + (item.py ? '<span class="char-pinyin">' + item.py + '</span>' : '')
      + '<span class="char-hanzi">' + item.hz + '</span>'
      + (item.cy ? '<span class="char-ciyu">' + item.cy + '</span>' : '')
      + (item.cypy ? '<span class="char-ciyupy">' + item.cypy + '</span>' : '')
      + '<div class="error-card-info">'
      + '<span class="error-info-item">' + (item.nj || '') + '</span>'
      + '<span class="error-info-item">' + (item.dy || '') + '</span>'
      + '<span class="error-info-item">' + (item.kw || '') + '</span>'
      + '</div>'
      + '</div>';
  }).join('') + '</div>';
}

// ========== 初始化 ==========
function init() {
  // 登录拦截：未登录跳转到登录页
  if (!requireLogin()) return;
  ensureDefaultSyncConfig();

  // 设置当前用户的数据空间
  const curUser = getCurrentUser();
  if (curUser && curUser.filder) {
    setActiveSpace(curUser.filder);
  }

  loadLocalData();
  initStatistics();
  initCharacters();
  initDictation();
  initMine();
  document.getElementById('navBack').onclick = () => { switchTab('statistics'); };
  document.querySelectorAll('.tab-item').forEach(item => {
    item.onclick = () => switchTab(item.dataset.tab);
  });

  // 统计页不需要远端内容数据，仅检查是否首次登录（不依赖远端数据）
  checkFirstLogin();
  switchTab('statistics');
}

// ===== 首次登录检测：用户 synced=false，弹窗询问是否同步基础数据 =====
async function checkFirstLogin() {
  const user = getCurrentUser();
  if (!user || user.synced) return;

  // 确保 modal 关闭后不再重复弹出
  if (window._syncDialogShown) return;
  window._syncDialogShown = true;

  // 延迟显示，等待页面渲染完毕
  setTimeout(() => {
    showModal(`<div class="modal-header"><span class="modal-title">欢迎，${user.name}！</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <p style="font-size:14px;color:#666;line-height:1.8;margin-bottom:22px;">
        检测到您是首次登录，是否将基础字词库同步到您的个人空间？
        <br><br>
        同步后您可以开始使用个人字词库进行听写练习，数据将保存在您的专属空间。
      </p>
      <div class="btn-row">
        <button class="btn btn-outline" id="skipSyncBtn">不用，我先自己添加</button>
        <button class="btn btn-primary" id="doSyncBtn">同步基础数据</button>
      </div>`);

    document.getElementById('skipSyncBtn').onclick = async () => {
      closeModal();
      await markUserSynced(user);
    };
    document.getElementById('doSyncBtn').onclick = async () => {
      closeModal();
      await doSyncBaseData(user);
    };
  }, 500);
}

async function doSyncBaseData(user) {
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) {
    showToast('同步配置缺失');
    return;
  }
  showLoading('正在同步基础数据...');
  try {
    const count = await syncBaseDataToUserSpace(config, user.filder);
    await markUserSynced(user);
    hideLoading();
    showToast(`同步完成，共复制 ${count || 0} 个文件`);
    // 重置加载标志：同步后数据已变，后续进听写页/切分类时按需重新拉取最新数据
    appState.cateLoaded = false;
    appState.categoryLoaded = {};
  } catch (e) {
    hideLoading();
    showToast('同步失败：' + (e.message || '未知错误'));
  }
}

async function markUserSynced(user) {
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) return;
  try {
    const prep = await prepareConfig(config);
    if (!prep.ok) return;
    const users = await fetchUserList(prep.config);
    const found = users.find(u => String(u.id) === String(user.id));
    if (found) {
      found.synced = true;
      await pushUserList(prep.config, users);
    }
    // 更新本地 session
    user.synced = true;
    setSession(user);
  } catch (e) {
    console.error('更新同步状态失败', e);
  }
}

window.addEventListener('DOMContentLoaded', init);


