const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
const SEMESTERS = ['上册', '下册'];
// 完整年级名（含上下册）：g 为 0-11 的内部索引
function gradeFullName(g) { return GRADES[Math.floor(Number(g) / 2)] + SEMESTERS[Number(g) % 2]; }
// 切换年级（保留当前学期），返回新的 0-11 索引
function gradeWithSemester(gradeIndex, g) { return Number(gradeIndex) * 2 + (Number(g) % 2); }
// 渲染年级 tab（6 个）+ 学期 tab（2 个），返回绑定好的对象
// gradeBarId: 年级容器；semesterBarId: 学期容器；currentGrade: 0-11；onChange: 切换后回调
function renderGradeAndSemester(gradeBarId, semesterBarId, currentGrade, onChange) {
  const gradeIdx = Math.floor(currentGrade / 2);
  const semIdx = currentGrade % 2;
  const gradeBar = document.getElementById(gradeBarId);
  gradeBar.innerHTML = GRADES.map((g, i) => `<div class="grade-tab ${gradeIdx === i ? 'active' : ''}" data-grade="${i}"><span class="grade-tab-text">${g}</span></div>`).join('');
  gradeBar.querySelectorAll('.grade-tab').forEach(t => {
    t.onclick = () => { onChange(gradeWithSemester(parseInt(t.dataset.grade), currentGrade)); };
  });
  const semBar = document.getElementById(semesterBarId);
  if (semBar) {
    semBar.innerHTML = SEMESTERS.map((s, i) => `<div class="semester-tab ${semIdx === i ? 'active' : ''}" data-sem="${i}"><span>${s}</span></div>`).join('');
    semBar.querySelectorAll('.semester-tab').forEach(t => {
      t.onclick = () => {
        const newG = Math.floor(currentGrade / 2) * 2 + parseInt(t.dataset.sem);
        onChange(newG);
      };
    });
  }
}
const CATEGORIES = [
  { label: '汉字', value: 'hanzi' },
  { label: '词语', value: 'ciyu' },
  { label: '成语', value: 'chengyu' },
  { label: '古诗', value: 'gushi' },
  { label: '日积月累', value: 'jilei' }
];
const CATEGORY_LABELS = { hanzi: '汉字', ciyu: '词语', chengyu: '成语', gushi: '古诗', jilei: '日积月累' };

// 内容数据按分类 × 年级二维存储：categoryData[category][gradeIndex] = 记录数组
const CATE_KEYS_12 = ['grade1_0','grade1','grade2_0','grade2','grade3_0','grade3','grade4_0','grade4','grade5_0','grade5','grade6_0','grade6'];
function emptyCateData12() { const o = {}; CATE_KEYS_12.forEach(k => { o[k] = []; }); return o; }
function emptyCategoryGradeData() {
  const o = {};
  CATEGORIES.forEach(c => { o[c.value] = [[],[],[],[],[],[],[],[],[],[],[],[]]; });
  return o;
}
let appState = {
  categoryData: emptyCategoryGradeData(),
  cateData: emptyCateData12(),
  cateLoaded: false,        // 单元课文树 cate.json 是否已加载（进听写页时拉一次）
  categoryLoaded: {},       // 各分类内容数据是否已加载：{ hanzi: true, ciyu: true, ... }，点分类 tab 时按需拉
  statsData: {},            // 用户统计层：statsData[cat][g] = { id: {times,yes,wrong} }
  statsLoaded: {}           // 各分类统计是否已加载：{ hanzi: true, ... }
};

// localStorage key：与 gitee 文件路径规则一致，偶数=上册，奇数=下册
function storageKey(cat, g) {
  const n = Number(g);
  const base = Math.floor(n / 2) + 1;
  const suffix = n % 2 === 0 ? '_0' : '';
  return `cat_${cat}_${base}${suffix}`;
}
// 统计层 localStorage key（独立于内容数据）
function statsStorageKey(cat, g) {
  const n = Number(g);
  const base = Math.floor(n / 2) + 1;
  const suffix = n % 2 === 0 ? '_0' : '';
  return `stats_${cat}_${base}${suffix}`;
}
const CATE_STORAGE_KEY = 'characterCate';
function gradeKey(g) {
  const n = Number(g);
  const base = Math.floor(n / 2) + 1;
  return n % 2 === 0 ? 'grade' + base + '_0' : 'grade' + base;
}

function getCategoryGradeData(cat, g) {
  if (!appState.categoryData[cat]) appState.categoryData[cat] = [[],[],[],[],[],[],[],[],[],[],[],[]];
  const arr = appState.categoryData[cat][g];
  return Array.isArray(arr) ? arr : [];
}
function setCategoryGradeData(cat, g, arr) {
  if (!appState.categoryData[cat]) appState.categoryData[cat] = [[],[],[],[],[],[],[],[],[],[],[],[]];
  appState.categoryData[cat][g] = Array.isArray(arr) ? arr : [];
}

// ===== 用户统计层（个人空间，与共享内容解耦）=====
// 内存结构：statsData[cat][g] = { "字id": {times,yes,wrong} }
function getStatsMap(cat, g) {
  if (!appState.statsData[cat]) appState.statsData[cat] = [{},{},{},{},{},{},{},{},{},{},{},{}];
  const m = appState.statsData[cat][g];
  return (m && typeof m === 'object') ? m : {};
}
function setStatsMap(cat, g, m) {
  if (!appState.statsData[cat]) appState.statsData[cat] = [{},{},{},{},{},{},{},{},{},{},{},{}];
  appState.statsData[cat][g] = (m && typeof m === 'object') ? m : {};
}
// 读取某条目的统计（合并到内容对象用）
function getStat(cat, g, id) {
  const m = getStatsMap(cat, g);
  return m[String(id)] || { times: 0, yes: 0, wrong: 0 };
}
// 写入/更新某条目统计，并持久化+同步
function updateStat(cat, g, id, patch) {
  const m = getStatsMap(cat, g);
  const cur = m[String(id)] || { times: 0, yes: 0, wrong: 0 };
  m[String(id)] = { times: cur.times || 0, yes: cur.yes || 0, wrong: cur.wrong || 0, ...patch };
  saveStats(cat, g);
}
function saveStats(cat, g) {
  try { localStorage.setItem(statsStorageKey(cat, g), JSON.stringify(getStatsMap(cat, g))); } catch (e) { }
  autoSyncStatsToGitee(cat, g);
}
async function autoSyncStatsToGitee(cat, g) {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushStatsToGitee(JSON.stringify(getStatsMap(cat, g)), c, cat, g); updateSyncTime(); } catch (e) { }
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
  if (!data) return emptyCateData12();
  const hasTreeKey = CATE_KEYS_12.some(k => Array.isArray(data[k]));
  const ensureUnit = (u, grade) => ({
    id: u.id, name: u.name, type: u.type || 'unit', grade: Number(grade),
    lessons: Array.isArray(u.lessons) ? u.lessons.map(l => ({
      id: l.id, name: l.name, type: l.type || 'lesson', grade: Number(grade)
    })) : []
  });
  const tree = emptyCateData12();
  if (hasTreeKey) {
    CATE_KEYS_12.forEach(k => {
      const grade = Number(k.replace('grade', '').replace('_0', '')) - 1;
      const arr = Array.isArray(data[k]) ? data[k] : [];
      tree[k] = arr.map(u => ensureUnit(u, grade));
    });
  }
  return tree;
}

function loadLocalData() {
  CATEGORIES.forEach(cat => {
    for (let i = 0; i < 12; i++) {
      try {
        const data = localStorage.getItem(storageKey(cat.value, i));
        if (data) { const p = JSON.parse(data); setCategoryGradeData(cat.value, i, Array.isArray(p) ? p : []); }
      } catch (e) { }
      // 加载本地统计缓存
      try {
        const sd = localStorage.getItem(statsStorageKey(cat.value, i));
        if (sd) { const p = JSON.parse(sd); setStatsMap(cat.value, i, (p && typeof p === 'object') ? p : {}); }
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
  try { await pushCateToGitee(JSON.stringify(appState.cateData), c); updateSyncTime(); }
  catch (e) { console.error('同步 cate.json 到 Gitee 失败:', e.message || e); }
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
  const titles = { statistics: '首页', characters: '知识库', dictation: '听写', mine: '我的' };
  const navTitle = document.getElementById('navTitle');
  navTitle.textContent = titles[tab] || '';
  navTitle.style.visibility = '';
  // 首页隐藏整个顶部导航栏
  document.getElementById('navbar').style.display = (tab === 'statistics') ? 'none' : '';
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

// 拉取指定分类的 12 个年级文件（点分类 tab 时按需调用）
async function loadCategoryData(cat) {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) { appState.categoryLoaded[cat] = true; appState.statsLoaded[cat] = true; return; }
  for (let i = 0; i < 12; i++) {
    try {
      const rj = await pullCategoryFromGitee(c, cat, i); const rd = JSON.parse(rj);
      if (Array.isArray(rd)) { setCategoryGradeData(cat, i, rd); localStorage.setItem(storageKey(cat, i), JSON.stringify(rd)); }
    } catch (e) { }
    // 同步拉取该年级的用户统计层（个人空间）
    try {
      const sj = await pullStatsFromGitee(c, cat, i); const sd = JSON.parse(sj || '{}');
      setStatsMap(cat, i, (sd && typeof sd === 'object') ? sd : {});
      localStorage.setItem(statsStorageKey(cat, i), JSON.stringify(getStatsMap(cat, i)));
    } catch (e) { }
  }
  appState.categoryLoaded[cat] = true;
  appState.statsLoaded[cat] = true;
}

function navigateTo(page) {
  const titles = { history: '历史听写', latest: '最新听写', error: '错词本', category: '知识库', unitmanage: '单元课文管理' };
  // 子页面总是显示顶部导航栏
  document.getElementById('navbar').style.display = '';
  document.getElementById('navTitle').style.visibility = '';
  if (titles[page]) document.getElementById('navTitle').textContent = titles[page];
  document.getElementById('tabbar').style.display = 'none';
  document.getElementById('navBack').style.display = '';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  currentPage = page;
  if (page === 'history') initHistory();
  else if (page === 'latest') loadLatest();
  else if (page === 'error') initErrorBook();
}

// 进入知识库分类详情子页（单页切换，不跳转独立 html）
function navigateToCategory(cat, grade) {
  charState.currentCategory = cat;
  charState.currentGrade = grade;
  charState.filterUnitIndex = 0;
  charState.filterLessonIndex = 0;
  navigateTo('category');
  // 标题显示分类名
  document.getElementById('navTitle').textContent = CATEGORY_LABELS[cat] || '知识库';
  // 绑定筛选/FAB（每次进入重新绑定，元素始终存在于 DOM）
  initCategoryPage();
  // 按需加载该分类数据，加载完渲染
  if (appState.categoryLoaded[cat]) {
    refreshCategoryPage();
  } else {
    showLoading('加载数据中...');
    loadCategoryData(cat).then(() => { hideLoading(); refreshCategoryPage(); }).catch(() => { hideLoading(); refreshCategoryPage(); });
  }
}

// ========== 统计页 ==========
function initStatistics() {
  document.getElementById('goLatestBtn').onclick = () => navigateTo('latest');
  document.getElementById('goHistoryBtn').onclick = () => navigateTo('history');
  document.getElementById('goErrorBtn').onclick = () => navigateTo('error');
}

// ========== 知识库页 ==========
let charState = { currentGrade: 0, currentCategory: 'hanzi', filterUnitIndex: 0, filterLessonIndex: 0 };

const CATEGORY_INFO = [
  { value: 'hanzi', label: '汉字', icon: '🀄', color: '#FF6B35', desc: '会写生字' },
  { value: 'ciyu', label: '词语', icon: '📝', color: '#5B9BD5', desc: '积累词汇' },
  { value: 'chengyu', label: '成语', icon: '🎯', color: '#4CAF50', desc: '成语典故' },
  { value: 'gushi', label: '古诗', icon: '📜', color: '#9C27B0', desc: '古诗文' },
  { value: 'jilei', label: '日积月累', icon: '📦', color: '#FF9800', desc: '每日积累' }
];

function refreshCharacters() {
  renderGradeAndSemester('charGradeTabs', 'charSemesterBar', charState.currentGrade, (newG) => {
    charState.currentGrade = newG; refreshCharacters();
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
      navigateToCategory(cat, charState.currentGrade);
    };
  });

  // 绑定单元课文管理入口
  const entry = document.getElementById('unitManageEntry');
  if (entry) {
    entry.onclick = () => navigateToUnitManage();
  }
}

function initCharacters() {
  // 知识库首页由 refreshCharacters 渲染分类卡片；分类详情页绑定在 initCategoryPage
}

// ========== 知识库分类详情页（原 category.js 合并，单页内嵌） ==========
function getCategoryPageList() {
  const cat = charState.currentCategory, g = charState.currentGrade;
  const gu = getGradeUnits(g);
  const fuid = charState.filterUnitIndex > 0 ? gu[charState.filterUnitIndex - 1].id : null;
  const gl = fuid === null ? gu.flatMap(u => u.lessons || []) : (gu.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];
  let list = getCategoryGradeData(cat, g);
  if (fuid !== null) list = list.filter(item => String(item.unitId) === String(fuid));
  if (charState.filterLessonIndex > 0) { const lid = gl[charState.filterLessonIndex - 1].id; list = list.filter(item => String(item.lessonId) === String(lid)); }
  return list;
}

function refreshCategoryPage() {
  const cat = charState.currentCategory, g = charState.currentGrade;
  // 汉字类按钮仅汉字分类，词语类按钮仅非汉字分类
  const hanziVisible = (cat === 'hanzi') ? '' : 'none';
  const cyVisible = (cat !== 'hanzi') ? '' : 'none';
  setDisplay('cateMoxieHanziBtn', hanziVisible);
  setDisplay('cateFullHanziBtn', hanziVisible);
  setDisplay('cateZhuyinBtn', hanziVisible);
  setDisplay('cateMoxieCyBtn', cyVisible);
  setDisplay('cateFullCyBtn', cyVisible);
  // 年级 + 学期 tab
  renderGradeAndSemester('cateGradeTabs', 'cateSemesterBar', g, (newG) => {
    charState.currentGrade = newG; charState.filterUnitIndex = 0; charState.filterLessonIndex = 0; refreshCategoryPage();
  });

  // 筛选栏
  const units = getGradeUnits(g);
  const fuid = charState.filterUnitIndex > 0 ? units[charState.filterUnitIndex - 1].id : null;
  const lessons = fuid === null ? units.flatMap(u => u.lessons || []) : (units.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];
  document.getElementById('cateUnitFilter').innerHTML = '<option value="0">全部单元</option>' + units.map((u, i) => `<option value="${i + 1}" ${charState.filterUnitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('');
  document.getElementById('cateLessonFilter').innerHTML = '<option value="0">全部课文</option>' + lessons.map((l, i) => `<option value="${i + 1}" ${charState.filterLessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('');

  // 内容列表
  const list = getCategoryPageList();
  const area = document.getElementById('cateListArea');
  if (list.length === 0) {
    area.innerHTML = '<div class="empty-tip">暂无内容，点击右下角添加</div>';
  } else {
    area.innerHTML = '<div class="char-grid">' + list.map(item => {
      let cardHtml = '';
      if (item.pinyin) cardHtml += `<span class="char-pinyin">${item.pinyin}</span>`;
      cardHtml += `<span class="char-hanzi">${item.content || ''}</span>`;
      if (item.ciyu) cardHtml += `<span class="char-ciyu">${item.ciyu}</span>`;
      if (item.ciyupy) cardHtml += `<span class="char-ciyupy">${item.ciyupy}</span>`;
      const stat = getStat(cat, g, item.id);
      cardHtml += `<span class="char-times">${stat.times ? stat.times : ''}</span>`;
      cardHtml += `<span class="char-play"><svg t="1782292289492" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3691" width="25" height="25"><path d="M529.1 901.6c-2.7 0-12.1-4.1-17-9l-0.3-0.3-230.4-190.1H96.1c-8.9 0-18.3-4.6-22.7-9-4.4-4.4-9-13.8-9-22.7v-319c0-7 2.7-12.9 4.4-14.6H71l2.4-2.4c4.4-4.4 13.8-9 22.7-9h185.3l230.4-195.8 0.2-0.2c5.8-5.8 12.9-7 17.8-7 4.4 0 8.9 1 12.6 2.9l0.5 0.3 0.5 0.2c12.5 4.2 17.2 11.3 17.2 26.4v717.8c0 15.1-4.7 22.3-17.2 26.4l-1.8 0.6-1.4 1.4c-3 3-5.6 3.1-11.1 3.1z m279.1-79.7c-9.9 0-23.1-5.1-26.9-12.6-9-18-5.8-36.4 7.9-46.1 4.8-2 11.6-7.2 20.3-15.6 8.9-8.7 22.4-23.7 36.2-45.7 23-36.8 50.4-99.7 50.4-190.9s-29-154.2-53.3-191.1c-14.5-22-28.8-37-38.2-45.6-6.6-6.1-14.9-13-21-15.5-12.6-9.1-17-31.4-8.9-44.5 9.4-9.1 20.6-14.3 30.8-14.3 5.4 0 10.4 1.4 14.8 4.2 0.7 0.6 1.6 1.3 3 2.4 29.4 23.1 54.9 51.4 75.8 84.1 40.1 62.9 60.5 137 60.5 220.3 0 83.7-19.7 158.1-58.4 221.1-20.1 32.7-44.5 60.9-72.6 83.6-1.7 1.4-2.6 2.1-3.3 2.8-3.4 3.4-13.3 3.4-17.1 3.4zM688.6 696.6c-8.3 0-22.6-9.7-26.9-18.3l-0.2-0.5-0.3-0.4c-8.2-12.4 0.8-30.4 14.5-39.7 6.4-3.4 60.9-35.5 60.9-132.3 0-46.5-18-78.4-33.2-97-16.5-20.2-33.1-29.4-33.7-29.8l-0.6-0.3-0.7-0.2c-5.8-1.9-11.4-8.5-14.3-16.8-2.9-8.3-2.3-16.6 1.4-22.2l0.6-0.9 0.3-1c2.9-8.6 15.6-16.1 27.3-16.1 4.5 0 8.6 1.1 11.7 3.2l2.1 1.4h1.5c4.5 1.7 29.1 14 53.5 41.9 21.7 24.9 47.6 68.1 47.6 132.2 0 72.9-24.5 120.2-45 147.1-22.6 29.5-45.6 42.2-50.4 44.1h-2.4l-2.4 2.4c-3.2 3-5.7 3.2-11.3 3.2z" fill="#088019" p-id="3692"></path></svg></span>`;
      return `<div class="char-card" data-id="${item.id}">${cardHtml}</div>`;
    }).join('') + '</div>';

    area.querySelectorAll('.char-card').forEach(card => {
      const item = list.find(c => String(c.id) === String(card.dataset.id));
      if (!item) return;
      card.onclick = (e) => {
        if (e.target.closest('.char-play')) { e.stopPropagation(); playCategoryItem(item); }
        else if (e.target.closest('.char-hanzi')) { openCategoryEditModal(item); }
      };
      card.oncontextmenu = (e) => { e.preventDefault(); deleteCategoryItem(item); };
      let pt; card.addEventListener('touchstart', () => { pt = setTimeout(() => deleteCategoryItem(item), 600); });
      card.addEventListener('touchend', () => clearTimeout(pt));
      card.addEventListener('touchmove', () => clearTimeout(pt));
    });
  }
}

async function playCategoryItem(item) {
  window.speechSynthesis.cancel();
  await new Promise(r => setTimeout(r, 50));
  if (item.content) await speak(item.content, { cancel: false });
  await new Promise(r => setTimeout(r, 100));
  if (item.ciyu) await speak(item.ciyu, { cancel: false });
}

function deleteCategoryItem(item) {
  confirmDialog('确认删除', `确定删除「${item.content}」吗？`, () => {
    const cat = charState.currentCategory, g = charState.currentGrade;
    const arr = getCategoryGradeData(cat, g);
    const idx = arr.findIndex(c => c.id === item.id);
    if (idx > -1) { arr.splice(idx, 1); saveCategoryGradeData(cat, g); refreshCategoryPage(); showToast('已删除'); }
  });
}

function initCategoryPage() {
  document.getElementById('cateUnitFilter').onchange = (e) => { charState.filterUnitIndex = parseInt(e.target.value); charState.filterLessonIndex = 0; refreshCategoryPage(); };
  document.getElementById('cateLessonFilter').onchange = (e) => { charState.filterLessonIndex = parseInt(e.target.value); refreshCategoryPage(); };
  document.getElementById('cateAddBtn').onclick = () => openCategoryAddModal();
  document.getElementById('cateManageBtn').onclick = () => openCategoryManageModal();
  // 导出：汉字页标红布局，词语页分散对齐布局
  document.getElementById('cateExportBtn').onclick = () => exportCategoryMoxieA4(
    charState.currentCategory === 'hanzi' ? { highlightTarget: true } : { wrapByWord: true }
  );
  // 汉字类：汉字默写（目标字留空）/ 汉字全写（全空）/ 汉字注音（全显示，拼音四线三格）
  document.getElementById('cateMoxieHanziBtn').onclick = () => exportCategoryMoxieA4({ hideTarget: true });
  document.getElementById('cateFullHanziBtn').onclick = () => exportCategoryMoxieA4({ hideAll: true });
  document.getElementById('cateZhuyinBtn').onclick = () => exportCategoryMoxieA4({ pinyinGrid: true });
  // 词语类：词语默写（随机留空）/ 词语全写（全空，分散对齐）
  document.getElementById('cateMoxieCyBtn').onclick = () => exportCategoryMoxieA4({ wrapByWord: true, randomHide: true });
  document.getElementById('cateFullCyBtn').onclick = () => exportCategoryMoxieA4({ wrapByWord: true, hideAll: true });
}

// 设置元素显隐的小工具
function setDisplay(id, val) { const el = document.getElementById(id); if (el) el.style.display = val; }

// ========== A4 导出公共部分 ==========
function getExportScopeInfo() {
  const cat = charState.currentCategory, g = charState.currentGrade;
  const gradeName = gradeFullName(g) || '';
  const catName = CATEGORY_LABELS[cat] || '知识库';
  const gu = getGradeUnits(g);
  const fuid = charState.filterUnitIndex > 0 ? gu[charState.filterUnitIndex - 1].id : null;
  const unitName = fuid ? (gu.find(u => String(u.id) === String(fuid)) || {}).name : '全部单元';
  let lessonName = '全部课文';
  if (charState.filterLessonIndex > 0) {
    const gl = fuid === null ? gu.flatMap(u => u.lessons || []) : (gu.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];
    if (gl[charState.filterLessonIndex - 1]) lessonName = gl[charState.filterLessonIndex - 1].name;
  }
  return { cat, g, gradeName, catName, unitName, lessonName };
}

// ========== 汉字（词语）默写导出 + 汉字导出（下载为本地图片 PNG）==========
// A4 @ 150dpi：1240×1754。布局：每行 4 个词组，每个字“拼音在上、田字格在下”逐字对齐。
// 模式（通过 opts 对象决定）：
//   hideTarget=true  —— 目标字留空，其余字显示 = 汉字默写
//   hideAll=true     —— 田字格全部留空                = 全写
//   highlightTarget=true —— 全部显示，目标字标红     = 汉字导出
//   wrapByWord=true  —— 词语页按词组自动换行（分散对齐，避免多字词挤压）
//   randomHide=true  —— 词语默写：按字数随机留空（2/3字空1，4字空2），需配合 wrapByWord
function exportCategoryMoxieA4(opts) {
  const hideTarget = opts?.hideTarget ?? false;
  const hideAll = opts?.hideAll ?? false;
  const highlightTarget = opts?.highlightTarget ?? false; // 仅汉字导出模式生效
  const wrapByWord = opts?.wrapByWord ?? false;          // 词语页按词组自动换行
  const randomHide = opts?.randomHide ?? false;          // 词语默写：按字数随机留空
  const pinyinGrid = opts?.pinyinGrid ?? false;          // 汉字注音：拼音用四线三格、汉字全显示
  const list = getCategoryPageList();
  if (!list || list.length === 0) { showToast('当前没有可导出的内容'); return; }
  const { gradeName, unitName, lessonName } = getExportScopeInfo();

  const W = 1240, H = 1754;            // A4 @150dpi
  const MARGIN = 70;                    // 页边距
  const COLS = 4;                       // 每行 4 个词组（汉字导出布局）
  const TZG = 78;                       // 田字格边长（px）
  const GAP_COL = 12;                   // 字与字间距
  const GAP_WORD = 28;                  // 词组间距（词语页换行布局）
  const PY_H = 38;                      // 拼音行高
  const ITEM_GAP_Y = 36;                // 词组行间距
  const HAN_FONT = `44px 'STKaiti','KaiTi','楷体',serif`;
  const PY_FONT = `28px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif`;
  const TITLE_FONT = `bold 34px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif`;
  const META_FONT = `20px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif`;
  const FOOTER_FONT = `18px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif`;

  let ctx;   // 当前页 canvas 上下文（drawCell/drawZhuyinCell 闭包引用，每页重新赋值）

  // 绘制单个字格：拼音 + 田字格 + 字（模式决定留空/标红）
  function drawCell(c, x, baseY) {
    ctx.fillStyle = '#142351';
    ctx.font = PY_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(c.py || '', x + TZG / 2, baseY + PY_H - 8);
    drawTianZiGe(ctx, x, baseY + PY_H, TZG);
    if (!c.blank) {
      ctx.fillStyle = (highlightTarget && c.isTarget) ? '#EF5350' : '#2D2D2D';
      ctx.font = HAN_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.ch, x + TZG / 2, baseY + PY_H + TZG / 2 + 2);
    }
  }

  // 汉字注音专用：拼音写在四线三格里 + 田字格 + 字（字全部显示）
  const ZH_TOTAL_H = 56;   // 四线格总高度（line1 到 line4）
  const ZH_TOP = 8;        // 顶部留白，之后画 line1
  function drawZhuyinCell(c, x, baseY) {
    const gridW = TZG;
    const l1 = baseY + ZH_TOP;                       // 顶线
    const l2 = baseY + ZH_TOP + 18;                  // 中线（虚线）
    const l3 = baseY + ZH_TOP + 35;                  // 基线（拼音文字落在此线）
    const l4 = baseY + ZH_TOP + ZH_TOTAL_H;          // 底线
    // 四条线
    ctx.save();
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(x, l1); ctx.lineTo(x + gridW, l1); ctx.stroke();
    ctx.strokeStyle = '#ccc';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, l2); ctx.lineTo(x + gridW, l2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, l3); ctx.lineTo(x + gridW, l3); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, l4); ctx.lineTo(x + gridW, l4); ctx.stroke();
    ctx.restore();
    // 拼音不显示，只保留空的四线三格线条
    // 田字格（在四线格下方）
    const tzgY = baseY + ZH_TOTAL_H + ZH_TOP;
    drawTianZiGe(ctx, x, tzgY, TZG);
    // 字（全部显示）
    ctx.fillStyle = '#2D2D2D';
    ctx.font = HAN_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.ch, x + TZG / 2, tzgY + TZG / 2 + 2);
  }

  // 预处理：词组 + 拼音 + 目标字
  const items = list.map(item => {
    const word = (item.ciyu && item.ciyu.trim()) ? item.ciyu.trim() : (item.content || '');
    const wordPy = (item.ciyupy && item.ciyupy.trim()) ? item.ciyupy.trim() : (item.pinyin || '');
    const target = (item.ciyu && item.ciyu.trim()) ? (item.content || '') : '';
    const chars = [...word];
    const pys = wordPy ? wordPy.split(/\s+/).filter(s => s) : [];
    const perChar = pys.length === chars.length;
    // 词语默写：随机留空位置集合（2/3字空1个，4字空2个）
    const blankIdx = new Set();
    if (randomHide && chars.length > 0) {
      const n = chars.length >= 4 ? 2 : 1;
      const pool = chars.map((_, i) => i);
      for (let k = 0; k < n && pool.length > 0; k++) {
        const pick = Math.floor(Math.random() * pool.length);
        blankIdx.add(pool.splice(pick, 1)[0]);
      }
    }
    return chars.map((ch, i) => ({
      ch,
      py: perChar ? (pys[i] || '') : '',
      isTarget: target.includes(ch),
      blank: hideAll || (hideTarget && target.includes(ch)) || blankIdx.has(i)
    }));
  }).filter(a => a.length > 0);

  if (items.length === 0) { showToast('当前没有可导出的内容'); return; }

  // 汉字注音模式：四线三格更高，需更大行高；并切换绘制函数
  const drawFn = pinyinGrid ? drawZhuyinCell : drawCell;
  const itemH = pinyinGrid ? (ZH_TOTAL_H + ZH_TOP * 2 + TZG + 4) : (PY_H + TZG + 4);

  // ========== 分页计算 ==========
  // 页眉高度（标题 + 副标题 + 间距）
  const HEADER_H = 24 + 34 + 12 + 20 + 30; // 从 y=MARGIN 开始：橙线+24、标题+34+12、副标题+20+30
  const FOOTER_H = 40;                     // 页脚距离底部
  const CONTENT_TOP = MARGIN + HEADER_H;   // 内容起始 y
  const CONTENT_BOTTOM = H - FOOTER_H;     // 内容结束 y（不能超出页脚）
  const MAX_Y = CONTENT_BOTTOM - itemH;    // 最后一行的最大起始 y

  // 生成所有行（两种布局都统一为「行」数组）
  const allRows = [];

  if (wrapByWord) {
    const wordW = (cells) => cells.length * TZG + (cells.length - 1) * GAP_COL;
    const rightEdge = W - MARGIN;
    const contentW = rightEdge - MARGIN;
    let cur = [], curW = 0;
    items.forEach((cells) => {
      const w = wordW(cells);
      const addW = w + (cur.length > 0 ? GAP_WORD : 0);
      if (cur.length > 0 && (curW + addW > contentW + 1 || cur.length >= 4)) {
        allRows.push({ type: 'wrap', cells: cur });
        cur = []; curW = 0;
      }
      cur.push(cells);
      curW += (cur.length > 1 ? GAP_WORD : 0) + w;
    });
    if (cur.length > 0) allRows.push({ type: 'wrap', cells: cur });
  } else {
    const contentW = W - MARGIN * 2;
    const cellW = contentW / COLS;
    // 将 items 按固定列数打包为行
    let cur = [], curCells = [];
    items.forEach((cells, i) => {
      cur.push({ cells, col: i % COLS });
      curCells.push(cells);
      if (cur.length === COLS || i === items.length - 1) {
        allRows.push({ type: 'grid', entries: cur, cellsArr: curCells });
        cur = []; curCells = [];
      }
    });
  }

  // 将行分配到各页（逐页累计高度）
  // 每页从 CONTENT_TOP 开始，首行无前置 gap，后续行需 ITEM_GAP_Y + itemH
  const pages = [];            // pages[i] = { rows: [...], top: CONTENT_TOP }
  let curPageRows = [];
  let curPageUsed = 0;         // 当前页已占用高度（从 CONTENT_TOP 起）

  for (const row of allRows) {
    // 该行需要的高度：首行仅 itemH，非首行 itemH + ITEM_GAP_Y
    const rowNeed = (curPageRows.length === 0 ? 0 : ITEM_GAP_Y) + itemH;
    // 若加入此行后底部超出内容区，且当前页已有内容，则封存当前页、开新页
    if (curPageRows.length > 0 && curPageUsed + rowNeed > MAX_Y - CONTENT_TOP) {
      pages.push({ rows: curPageRows, top: CONTENT_TOP });
      curPageRows = [];
      curPageUsed = 0;
    }
    curPageRows.push(row);
    curPageUsed += rowNeed;
  }
  if (curPageRows.length > 0) {
    pages.push({ rows: curPageRows, top: CONTENT_TOP });
  }

  // 逐页生成 canvas dataUrls
  const dataUrls = [];
  const totalPages = pages.length;
  // 统一确定模式名称（循环内外均需引用）
  let modeName;
  if (wrapByWord) {
    modeName = hideAll ? '词语全写' : (randomHide ? '词语默写' : '词语导出');
  } else {
    modeName = hideAll ? '汉字全写' : (pinyinGrid ? '汉字注音' : (highlightTarget ? '汉字导出' : '汉字默写'));
  }

  for (let pi = 0; pi < totalPages; pi++) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');

    // 白底
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    // 页眉
    let y = MARGIN;
    ctx.fillStyle = '#FF6B35';
    ctx.fillRect(MARGIN, y, W - MARGIN * 2, 3);
    y += 24;
    ctx.fillStyle = '#2D2D2D';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = TITLE_FONT;
    // 标题
    ctx.fillText(`${modeName} · ${gradeName}`, W / 2, y + 34);
    y += 34 + 12;
    ctx.fillStyle = '#8E8E93';
    ctx.font = META_FONT;
    ctx.fillText(`${unitName} ｜ ${lessonName} ｜ 共 ${list.length} 项`, W / 2, y + 20);
    y += 20 + 30;

    // 绘制当前页的行
    const page = pages[pi];
    let rowTop = page.top;

    for (const row of page.rows) {
      if (row.type === 'wrap') {
        const cellsArr = row.cells;
        const wordW = (cells) => cells.length * TZG + (cells.length - 1) * GAP_COL;
        const contentW = (W - MARGIN * 2);
        const totalWordW = cellsArr.reduce((s, c) => s + wordW(c), 0);
        const gap = cellsArr.length > 1 ? (contentW - totalWordW) / (cellsArr.length - 1) : 0;
        const baseY = rowTop;
        let cx = MARGIN;
        cellsArr.forEach((cells, idx) => {
          if (idx > 0) cx += gap;
          cells.forEach(c => { drawFn(c, cx, baseY); cx += TZG + GAP_COL; });
        });
        rowTop += itemH + ITEM_GAP_Y;
      } else {
        // type: 'grid' — 汉字固定列布局
        const entries = row.entries;
        const contentW = W - MARGIN * 2;
        const cellW = contentW / COLS;
        const baseY = rowTop;
        entries.forEach(({ cells, col }) => {
          const totalW = cells.length * TZG + (cells.length - 1) * GAP_COL;
          let x = MARGIN + col * cellW + (cellW - totalW) / 2;
          cells.forEach(c => { drawFn(c, x, baseY); x += TZG + GAP_COL; });
        });
        rowTop += itemH + ITEM_GAP_Y;
      }
    }

    // 页脚（含页码）
    ctx.fillStyle = '#8E8E93';
    ctx.font = FOOTER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`小学语文助手 · ${modeName} · 第 ${pi + 1} / ${totalPages} 页`, W / 2, H - 40);

    dataUrls.push(canvas.toDataURL('image/png'));
  }

  // 显示图片弹窗（多页）
  showPagedImageModal(dataUrls, `${modeName}-${gradeName}-${unitName}`);
}

// 显示多页图片弹窗：支持翻页切换、页码指示、下载当前页
function showPagedImageModal(dataUrls, fileBaseName) {
  const total = dataUrls.length;
  let currentIdx = 0;
  const escapedName = fileBaseName.replace(/'/g, "\\'");

  function renderPage(idx) {
    const html = `<div class="modal-header">
        <span class="modal-title">长按图片保存到相册</span>
        <span class="modal-download-btn" onclick="downloadPagedImage('${escapedName}', ${idx})">⬇ 下载</span>
        <span class="modal-close" onclick="closeModal()">×</span>
      </div>
      <div style="text-align:center;">
        <img id="saveImg" src="${dataUrls[idx]}" alt="汉字默写" style="width:100%;max-width:420px;border:1px solid var(--color-border);border-radius:10px;user-select:none;-webkit-user-select:none;" />
        <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-top:10px;">
          ${idx > 0 ? '<span class="page-nav-btn" onclick="window._pageGoto(' + (idx - 1) + ')">‹ 上一页</span>' : '<span class="page-nav-btn page-nav-disabled">‹ 上一页</span>'}
          <span class="page-indicator">第 ${idx + 1} / ${total} 页</span>
          ${idx < total - 1 ? '<span class="page-nav-btn" onclick="window._pageGoto(' + (idx + 1) + ')">下一页 ›</span>' : '<span class="page-nav-btn page-nav-disabled">下一页 ›</span>'}
        </div>
        <p style="font-size:13px;color:var(--color-text-secondary);margin-top:10px;line-height:1.6;">长按上方图片，选择「存储图像 / 保存图片」即可存入手机相册。</p>
      </div>`;
    showModal(html);
  }

  window._pageGoto = function(idx) {
    currentIdx = idx;
    renderPage(idx);
  };

  renderPage(0);
}

// 下载多页弹窗中当前页图片（点击「下载」按钮触发）
function downloadPagedImage(fileBaseName, pageIdx) {
  const img = document.getElementById('saveImg');
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = `${fileBaseName}-${pageIdx + 1}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('图片已下载');
}

// 绘制单个田字格：实线边框 + 十字虚线
function drawTianZiGe(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  // 十字虚线
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y);
  ctx.lineTo(x + size / 2, y + size);
  ctx.moveTo(x, y + size / 2);
  ctx.lineTo(x + size, y + size / 2);
  ctx.stroke();
  ctx.restore();
}

function openCategoryAddModal() {
  const cat = charState.currentCategory;
  let form = { gradeIndex: charState.currentGrade, unitIndex: 0, lessonIndex: 0, content: '' };
  const ph = { hanzi: '如：诗｜shī（诗人）shī rén，碧｜bì（碧绿）bì lǜ', ciyu: '如：高兴｜gāo xìng，快乐｜kuài lè', chengyu: '如：春暖花开｜chūn nuǎn huā kāi', gushi: '如：静夜思｜jìng yè sī', jilei: '如：一年之计在于春｜yī nián zhī jì zài yú chūn' };
  function getHtml() {
    const gi = form.gradeIndex;
    const hasGrade = gi !== null && gi !== '';
    const gradeIdx = hasGrade ? Math.floor(Number(gi) / 2) : -1;
    const semIdx = hasGrade ? (Number(gi) % 2) : 0;
    const units = hasGrade ? getGradeUnits(gi) : [];
    const lessons = (hasGrade && form.unitIndex > 0) ? ((units[form.unitIndex - 1] || { lessons: [] }).lessons || []) : [];
    return `<div class="modal-header"><span class="modal-title">添加${CATEGORY_LABELS[cat]}</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="addGrade"><option value="">请选择年级</option>${GRADES.map((g, i) => `<option value="${i}" ${gradeIdx === i ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">学期</label><select class="form-select" id="addSemester">${SEMESTERS.map((s, i) => `<option value="${i}" ${semIdx === i ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><div class="form-row"><select class="form-select" id="addUnit"><option value="0">选择单元</option>${units.map((u, i) => `<option value="${i + 1}" ${form.unitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('')}</select><div class="form-row-btn" id="addUnitBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">课文</label><div class="form-row"><select class="form-select" id="addLesson"><option value="0">选择课文</option>${lessons.map((l, i) => `<option value="${i + 1}" ${form.lessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('')}</select><div class="form-row-btn" id="addLessonBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">内容</label><textarea class="form-textarea" id="addContent" placeholder="${ph[cat] || '请输入内容'}">${form.content}</textarea></div>
      <button class="btn btn-primary btn-block" id="addSubmitBtn">添加</button>`;
  }
  function bindForm() {
    // 年级+学期组合成 0-11 内部索引：grade*2 + semester（0=上册，1=下册）
    const recomputeGrade = () => {
      const gv = document.getElementById('addGrade').value;
      if (gv === '') { form.gradeIndex = null; form.semester = 0; }
      else {
        const sv = parseInt(document.getElementById('addSemester').value) || 0;
        form.gradeIndex = parseInt(gv) * 2 + sv;
        form.semester = sv;
      }
      form.unitIndex = 0; form.lessonIndex = 0;
      showModal(getHtml()); bindForm();
    };
    document.getElementById('addGrade').onchange = recomputeGrade;
    document.getElementById('addSemester').onchange = recomputeGrade;
    document.getElementById('addUnit').onchange = (e) => { form.unitIndex = parseInt(e.target.value); form.lessonIndex = 0; showModal(getHtml()); bindForm(); };
    document.getElementById('addLesson').onchange = (e) => { form.lessonIndex = parseInt(e.target.value); };
    document.getElementById('addContent').oninput = (e) => { form.content = e.target.value; };
    document.getElementById('addUnitBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请先选择年级'); return; }
      showModal(`<div class="modal-header"><span class="modal-title">添加单元</span><span class="modal-close" onclick="closeModal()">×</span></div><div class="form-group"><label class="form-label">名称</label><input class="form-input" id="quickAddName" placeholder="如：第一单元" /></div><button class="btn btn-primary btn-block" id="quickAddConfirm">确定</button>`);
      document.getElementById('quickAddConfirm').onclick = () => {
        const name = document.getElementById('quickAddName').value.trim(); if (!name) { showToast('请输入名称'); return; }
        const id = String(Date.now()), key = gradeKey(form.gradeIndex);
        appState.cateData[key].push({ id, name, type: 'unit', grade: form.gradeIndex, lessons: [] });
        form.unitIndex = appState.cateData[key].length; form.lessonIndex = 0; saveCateData(); showModal(getHtml()); bindForm(); showToast('添加成功');
      };
    };
    document.getElementById('addLessonBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请先选择年级'); return; }
      if (form.unitIndex === 0) { showToast('请先选择单元'); return; }
      showModal(`<div class="modal-header"><span class="modal-title">添加课文</span><span class="modal-close" onclick="closeModal()">×</span></div><div class="form-group"><label class="form-label">名称</label><input class="form-input" id="quickAddName" placeholder="如：第1课 春天来了" /></div><button class="btn btn-primary btn-block" id="quickAddConfirm">确定</button>`);
      document.getElementById('quickAddConfirm').onclick = () => {
        const name = document.getElementById('quickAddName').value.trim(); if (!name) { showToast('请输入名称'); return; }
        const id = String(Date.now()), key = gradeKey(form.gradeIndex);
        appState.cateData[key][form.unitIndex - 1].lessons.push({ id, name, type: 'lesson', grade: form.gradeIndex });
        form.lessonIndex = appState.cateData[key][form.unitIndex - 1].lessons.length; saveCateData(); showModal(getHtml()); bindForm(); showToast('添加成功');
      };
    };
    document.getElementById('addSubmitBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请选择年级'); return; }
      if (form.unitIndex === 0) { showToast('请选择单元'); return; }
      if (form.lessonIndex === 0) { showToast('请选择课文'); return; }
      const content = document.getElementById('addContent').value.trim(); if (!content) { showToast('请输入内容'); return; }
      const gi = form.gradeIndex, units = getGradeUnits(gi), unitId = units[form.unitIndex - 1].id;
      const lessons = (units[form.unitIndex - 1] || { lessons: [] }).lessons || [], lessonId = lessons[form.lessonIndex - 1].id;
      const list = getCategoryGradeData(cat, gi); const segs = content.split(/[，,]/).filter(s => s.trim());
      segs.forEach(seg => {
        const tr = seg.trim(); if (!tr) return;
        let ciyu = '', ciyupy = '', before = tr, after = '';
        const m = tr.match(/[（(]([^）)]+)[）)]/);
        if (m) {
          ciyu = m[1].trim();
          const parenStart = tr.search(/[（(]/), parenEnd = tr.search(/[）)]/);
          before = tr.slice(0, parenStart).trim();
          after = tr.slice(parenEnd + 1).trim();
          ciyupy = after;
        }
        const parts = before.split(/[｜|]/); const text = (parts[0] || '').trim(), py = (parts[1] || '').trim(); if (!text) return;
        if (cat === 'hanzi' && !parts[1] && text.length > 1 && segs.length === 1) {
          [...text.replace(/\s+/g, '')].forEach(ch => list.push({ id: Date.now() + Math.random(), content: ch, category: cat, pinyin: '', ciyu: '', ciyupy: '', unitId, lessonId, times: 0, yes: 0, wrong: 0 }));
        } else {
          list.push({ id: Date.now() + Math.random(), content: text, category: cat, pinyin: py, ciyu, ciyupy, unitId, lessonId, times: 0, yes: 0, wrong: 0 });
        }
      });
      charState.currentGrade = gi; saveCategoryGradeData(cat, gi); closeModal(); refreshCategoryPage(); showToast('添加成功');
    };
  }
  showModal(getHtml()); bindForm();
}

function openCategoryEditModal(item) {
  const cat = charState.currentCategory;
  let ig = charState.currentGrade;
  for (let i = 0; i < 12; i++) { const arr = getCategoryGradeData(cat, i); if (arr.find(c => c.id === item.id)) { ig = i; break; } }
  const gu = getGradeUnits(ig); let ui = 0, li = 0, su = null;
  if (item.unitId) { const idx = gu.findIndex(u => String(u.id) === String(item.unitId)); if (idx > -1) { ui = idx + 1; su = gu[idx]; } }
  if (item.lessonId && su) { const idx = (su.lessons || []).findIndex(l => String(l.id) === String(item.lessonId)); if (idx > -1) li = idx + 1; }
  let ef = { id: item.id, originalGrade: ig, gradeIndex: ig, unitIndex: ui, lessonIndex: li, content: item.content || '', ciyu: item.ciyu || '', ciyupy: item.ciyupy || '' };
  function getHtml() {
    const gi = ef.gradeIndex;
    const hasGrade = gi !== null && gi !== '';
    const gradeIdx = hasGrade ? Math.floor(Number(gi) / 2) : 0;
    const semIdx = hasGrade ? (Number(gi) % 2) : 0;
    const units = hasGrade ? getGradeUnits(gi) : [];
    const lessons = (hasGrade && ef.unitIndex > 0) ? ((units[ef.unitIndex - 1] || { lessons: [] }).lessons || []) : [];
    return `<div class="modal-header"><span class="modal-title">修改${CATEGORY_LABELS[cat]}</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="editGrade">${GRADES.map((g, i) => `<option value="${i}" ${gradeIdx === i ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">学期</label><select class="form-select" id="editSemester">${SEMESTERS.map((s, i) => `<option value="${i}" ${semIdx === i ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><select class="form-select" id="editUnit"><option value="0">选择单元</option>${units.map((u, i) => `<option value="${i + 1}" ${ef.unitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">课文</label><select class="form-select" id="editLesson"><option value="0">选择课文</option>${lessons.map((l, i) => `<option value="${i + 1}" ${ef.lessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">内容</label><input class="form-input" id="editContent" value="${ef.content}" placeholder="请输入内容" /></div>
      <div class="form-group"><label class="form-label">词语</label><input class="form-input" id="editCiyu" value="${ef.ciyu}" placeholder="请输入词语" /></div>
      <div class="form-group"><label class="form-label">词语拼音</label><input class="form-input" id="editCiyupy" value="${ef.ciyupy}" placeholder="如 shi ren" /></div>
      <button class="btn btn-primary btn-block" id="editSaveBtn">保存</button>`;
  }
  function bindEdit() {
    // 年级+学期组合成 0-11 内部索引
    const recomputeGrade = () => {
      const gv = parseInt(document.getElementById('editGrade').value);
      const sv = parseInt(document.getElementById('editSemester').value) || 0;
      ef.gradeIndex = gv * 2 + sv;
      ef.unitIndex = 0; ef.lessonIndex = 0;
      showModal(getHtml()); bindEdit();
    };
    document.getElementById('editGrade').onchange = recomputeGrade;
    document.getElementById('editSemester').onchange = recomputeGrade;
    document.getElementById('editUnit').onchange = (e) => { ef.unitIndex = parseInt(e.target.value); ef.lessonIndex = 0; showModal(getHtml()); bindEdit(); };
    document.getElementById('editLesson').onchange = (e) => { ef.lessonIndex = parseInt(e.target.value); };
    document.getElementById('editSaveBtn').onclick = () => {
      if (ef.unitIndex === 0) { showToast('请选择单元'); return; } if (ef.lessonIndex === 0) { showToast('请选择课文'); return; }
      const content = document.getElementById('editContent').value.trim(), ciyu = document.getElementById('editCiyu').value.trim(), ciyupy = document.getElementById('editCiyupy').value.trim();
      if (!content) { showToast('请输入内容'); return; }
      const og = ef.originalGrade, ng = ef.gradeIndex, units = getGradeUnits(ng), unitId = units[ef.unitIndex - 1].id;
      const lessons = (units[ef.unitIndex - 1] || { lessons: [] }).lessons || [], lessonId = lessons[ef.lessonIndex - 1].id;
      const ol = getCategoryGradeData(cat, og), ii = ol.findIndex(c => c.id === ef.id); if (ii === -1) { showToast('未找到内容'); return; }
      if (og === ng) { ol[ii].content = content; ol[ii].ciyu = ciyu; ol[ii].ciyupy = ciyupy; ol[ii].unitId = unitId; ol[ii].lessonId = lessonId; saveCategoryGradeData(cat, og); }
      else { const mi = ol.splice(ii, 1)[0]; mi.content = content; mi.ciyu = ciyu; mi.ciyupy = ciyupy; mi.unitId = unitId; mi.lessonId = lessonId; getCategoryGradeData(cat, ng).push(mi); saveCategoryGradeData(cat, og); saveCategoryGradeData(cat, ng); charState.currentGrade = ng; }
      closeModal(); refreshCategoryPage(); showToast('修改成功');
    };
  }
  showModal(getHtml()); bindEdit();
}

function openCategoryManageModal() {
  let mt = 'unit';
  function getHtml() {
    let list = mt === 'unit' ? getGradeUnits(charState.currentGrade) : getGradeUnits(charState.currentGrade).flatMap(u => (u.lessons || []).map(l => ({ ...l, _unitName: u.name })));
    return `<div class="modal-header"><span class="modal-title">${gradeFullName(charState.currentGrade)} - 管理</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="manage-tabs"><div class="manage-tab ${mt === 'unit' ? 'active' : ''}" data-tab="unit">单元</div><div class="manage-tab ${mt === 'lesson' ? 'active' : ''}" data-tab="lesson">课文</div></div>
      <div class="manage-list">${list.length === 0 ? `<div style="text-align:center;padding:30px 0;color:#999;font-size:13px;">暂无${mt === 'unit' ? '单元' : '课文'}</div>` : list.map(item => `<div class="manage-item"><div class="manage-item-info"><span class="manage-item-id">${item.id}</span><span class="manage-item-name">${item.name}${item._unitName ? ' (' + item._unitName + ')' : ''}</span></div><span class="manage-item-delete" data-id="${item.id}" data-type="${item.type || (mt === 'unit' ? 'unit' : 'lesson')}">删除</span></div>`).join('')}</div>
      <div class="clear-cate-btn" id="clearCateBtn">清空所有分类数据</div>`;
  }
  function bindManage() {
    document.querySelectorAll('.manage-tab').forEach(t => { t.onclick = () => { mt = t.dataset.tab; showModal(getHtml()); bindManage(); }; });
    document.querySelectorAll('.manage-item-delete').forEach(d => { d.onclick = () => { const id = d.dataset.id, type = d.dataset.type; confirmDialog('确认删除', '确定删除吗？关联的内容不会被删除。', () => { const key = gradeKey(charState.currentGrade); if (type === 'unit') { const idx = (appState.cateData[key] || []).findIndex(u => String(u.id) === String(id)); if (idx > -1) appState.cateData[key].splice(idx, 1); } else { for (const u of (appState.cateData[key] || [])) { const idx = (u.lessons || []).findIndex(l => String(l.id) === String(id)); if (idx > -1) { u.lessons.splice(idx, 1); break; } } } saveCateData(); showModal(getHtml()); bindManage(); }); }; });
    document.getElementById('clearCateBtn').onclick = () => { confirmDialog('确认清空', '将清空所有单元和课文分类数据。确定清空吗？', () => { appState.cateData = emptyCateData12(); saveCateData(); showModal(getHtml()); bindManage(); showToast('已清空'); }); };
  }
  showModal(getHtml()); bindManage();
}

// ========== 听写页 ==========
let dictationState = {
  phase: 'select', dictationMode: 'lesson', currentCategory: 'hanzi', currentGrade: 0,
  filterUnitIndex: 0, filterLessonIndex: 0,
  dictationList: [], currentIndex: 0, currentGroup: 0,
  abortFlag: false, isPaused: false, _delayTimer: null, dictationRecords: [],
  groupDelay: 5000   // 一组（一个字词）朗读完后，等待多久再朗读下一组（毫秒）
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
  // 年级 + 学期 tab
  renderGradeAndSemester('dictGradeTabs', 'dictSemesterBar', dictationState.currentGrade, (newG) => {
    dictationState.currentGrade = newG; dictationState.filterUnitIndex = 0; dictationState.filterLessonIndex = 0; refreshDictationSelect();
  });
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
  dictationState.abortFlag = false; dictationState.isPaused = false; dictationState.dictationRecords = [];

  // 弹窗选择组间延迟时间
  const delayMs = await new Promise(resolve => {
    const options = [
      { label: '3 秒', ms: 3000 },
      { label: '5 秒', ms: 5000 },
      { label: '8 秒', ms: 8000 },
      { label: '10 秒', ms: 10000 },
    ];
    const optionBtns = options.map((o, i) =>
      `<button class="delay-option-btn" data-idx="${i}" style="flex:1;min-width:60px;">${o.label}</button>`
    ).join('');
    showModal(`<div class="modal-header"><span class="modal-title">选择组间延迟时间</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <p style="font-size:14px;color:var(--color-text-secondary);margin-bottom:16px;text-align:center;">每组字词朗读完后，等待多久才开始下一组？</p>
      <div style="display:flex;gap:10px;justify-content:center;">${optionBtns}</div>`);
    // 绑定按钮事件
    setTimeout(() => {
      document.querySelectorAll('.delay-option-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          closeModal();
          resolve(options[idx].ms);
        };
      });
    }, 0);
  });

  dictationState.groupDelay = delayMs;
  dictationState.phase = 'dictating';
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
    dictationState.dictationRecords.push({ id: char.id, pg: 1, yes: 0, hz: char.content || '', cy: char.ciyu || '', cyp: char.ciyupy || '', py: char.pinyin || '', nj: gradeFullName(dictationState.currentGrade) || '', dy: unit || '', kw: lesson || '' });
    if (dictationState.currentIndex < dictationState.dictationList.length - 1) await delay(dictationState.groupDelay);
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

function findUnitName(id) { if (!id) return ''; for (const k of CATE_KEYS_12) { const u = (appState.cateData[k] || []).find(u => String(u.id) === String(id)); if (u) return u.name; } return ''; }
function findLessonName(id) { if (!id) return ''; for (const k of CATE_KEYS_12) { for (const u of (appState.cateData[k] || [])) { const l = (u.lessons || []).find(l => String(l.id) === String(id)); if (l) return l.name; } } return ''; }
function incrementTimes(char) {
  // 听写次数写入用户统计层（个人空间），不再污染共享内容数据
  const cat = dictationState.currentCategory, g = dictationState.currentGrade;
  const cur = getStat(cat, g, char.id);
  updateStat(cat, g, char.id, { times: (cur.times || 0) + 1 });
}
async function syncDictationRecords() {
  if (dictationState.dictationRecords.length === 0) return;
  const c = getSyncConfig();
  if (!isSyncConfigured(c)) {
    console.log('未配置Gitee同步，听写记录仅保存在本地');
    return;
  }
  try {
    await pushHanziRecordsToGitee(dictationState.dictationRecords, c);
    console.log('听写记录已同步到 count_hanzi/' + new Date().toISOString().slice(0, 10));
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
      // 推送单元课文树 cate.json
      await pushCateToGitee(JSON.stringify(appState.cateData), cfg);
      // 推送分类内容数据 + 用户统计
      for (const cat of CATEGORIES) {
        for (let i = 0; i < 12; i++) {
          const data = localStorage.getItem(storageKey(cat.value, i)) || '[]'; await pushCategoryToGitee(data, cfg, cat.value, i);
          // 同时推送用户统计层到个人空间
          const stats = localStorage.getItem(statsStorageKey(cat.value, i)) || '{}'; await pushStatsToGitee(stats, cfg, cat.value, i);
        }
      }
      hideLoading(); updateSyncTime(); refreshMine(); showToast('推送成功');
    } catch (e) { hideLoading(); showToast(e.message || '推送失败'); }
  };
  document.getElementById('initDataBtn').onclick = async () => {
    const cfg = getSyncConfig(); if (!isSyncConfigured(cfg)) { showToast('请先配置令牌和仓库地址'); return; }
    confirmDialog('初始化数据文件', '扫描并创建缺失的数据文件（已有文件不动）。确定执行吗？', async () => {
      showLoading('初始化中...');
      try {
        const result = await initAllDataFiles(cfg, (done, total, name) => {
          document.getElementById('loadingText').textContent = `初始化中... ${done}/${total} ${name}`;
        });
        hideLoading();
        showToast(`完成：新建 ${result.created} 个，跳过 ${result.skipped} 个，失败 ${result.failed} 个`);
      } catch (e) {
        hideLoading(); showToast('初始化失败：' + (e.message || ''));
      }
    });
  };
  document.getElementById('pullBtn').onclick = async () => {
    const cfg = getSyncConfig(); if (!isSyncConfigured(cfg)) { showToast('请先配置令牌和仓库地址'); return; }
    showLoading('拉取中...');
    try {
      // 拉取单元课文树
      try { const cj = await pullCateFromGitee(cfg); const rc = JSON.parse(cj); if (rc && Object.keys(rc).length > 0) { appState.cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); } } catch (e) { }
      appState.cateLoaded = true;
      // 拉取全部分类 × 年级内容 + 用户统计层
      for (const cat of CATEGORIES) {
        for (let i = 0; i < 12; i++) {
          const rj = await pullCategoryFromGitee(cfg, cat.value, i);
          const rd = JSON.parse(rj);
          localStorage.setItem(storageKey(cat.value, i), rj);
          setCategoryGradeData(cat.value, i, rd);
          // 拉取用户统计层（个人空间）
          try {
            const sj = await pullStatsFromGitee(cfg, cat.value, i);
            const sd = JSON.parse(sj || '{}');
            setStatsMap(cat.value, i, (sd && typeof sd === 'object') ? sd : {});
            localStorage.setItem(statsStorageKey(cat.value, i), JSON.stringify(getStatsMap(cat.value, i)));
          } catch (e) { }
        }
        appState.categoryLoaded[cat.value] = true;
        appState.statsLoaded[cat.value] = true;
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
    const files = await listHanziDataFolder(config, getUserDataPrefix() + '/count_hanzi/' + fn);
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
    const result = await pullHanziRecordsFromGitee(config, getUserDataPrefix() + '/count_hanzi/' + fn + '/' + fileName);
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
  try { const result = await pullHanziRecordsFromGitee(config, getUserDataPrefix() + '/count_hanzi/' + fn + '/' + historyState.selectedDate); historyState.selectedFileSha = result.sha || ''; historyState.charList = (result.records || []).map(r => ({ ...r, yes: typeof r.yes === 'number' ? r.yes : 0 })); renderHistoryChars(); } catch (e) { }
}

async function saveHistoryCountData() {
  if (!historyState.selectedDate || historyState.syncing) return; historyState.syncing = true;
  const config = getSyncConfig(); if (!isSyncConfigured(config)) { historyState.syncing = false; return; }
  try { const fn = '' + historyState.currentYear + String(historyState.currentMonth).padStart(2, '0'); await pushHanziRecordsUpdate(config, fn, historyState.selectedDate, historyState.charList, historyState.selectedFileSha); } catch (e) { showToast('保存失败'); }
  historyState.syncing = false;
}

function updateYesInCharList(charId, oldYes, newYes) {
  // 批改对错只写入用户统计层（个人空间），不再污染共享内容数据
  const idStr = String(charId);
  outer: for (const cat of CATEGORIES) {
    for (let i = 0; i < 12; i++) {
      const list = getCategoryGradeData(cat.value, i);
      if (!Array.isArray(list)) continue;
      if (list.find(c => String(c.id) === idStr)) {
        const cur = getStat(cat.value, i, idStr);
        let yes = cur.yes || 0, wrong = cur.wrong || 0;
        if (oldYes === 1) yes--; else if (oldYes === 2) wrong--;
        if (newYes === 1) yes++; else if (newYes === 2) wrong++;
        updateStat(cat.value, i, idStr, { yes, wrong });
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
    const result = await fetchLatestHanziData(config);
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
  try { await pushHanziRecordsUpdate(config, latestState.folderName, latestState.fileName, latestState.charList, latestState.fileSha); } catch (e) { showToast('保存失败'); }
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

// ========== 单元课文管理页 ==========
let umState = { currentGrade: 0, filterUnitIndex: 0 };

function navigateToUnitManage() {
  umState = { currentGrade: 0, filterUnitIndex: 0 };
  document.getElementById('navTitle').textContent = '单元课文管理';
  document.getElementById('tabbar').style.display = 'none';
  document.getElementById('navBack').style.display = '';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-unitmanage').classList.add('active');
  currentPage = 'unitmanage';
  renderUnitManage();
}

function renderUnitManage() {
  const g = umState.currentGrade;

  // 年级 + 学期 tab
  renderGradeAndSemester('umGradeTabs', 'umSemesterBar', g, (newG) => {
    umState.currentGrade = newG; umState.filterUnitIndex = 0; renderUnitManage();
  });

  const units = getGradeUnits(g);

  // ---- 单元列表 ----
  const unitListEl = document.getElementById('umUnitList');
  if (units.length === 0) {
    unitListEl.innerHTML = '<div class="um-empty">暂无单元，点击上方按钮添加</div>';
  } else {
    unitListEl.innerHTML = units.map((u, i) => {
      const lessonCount = (u.lessons || []).length;
      return `<div class="um-item" data-id="${u.id}" data-idx="${i}">
        <div class="um-item-info">
          <span class="um-item-index">${i + 1}</span>
          <span class="um-item-name">${u.name}</span>
          <span class="um-item-lesson-count">${lessonCount} 课</span>
        </div>
        <div class="um-item-actions">
          <button class="um-item-btn um-item-btn-edit" data-action="renameUnit">重命名</button>
          <button class="um-item-btn um-item-btn-del" data-action="delUnit">删除</button>
        </div>
      </div>`;
    }).join('');

    unitListEl.querySelectorAll('.um-item').forEach(item => {
      const id = item.dataset.id;
      item.querySelectorAll('[data-action]').forEach(btn => {
        btn.onclick = () => {
          const action = btn.dataset.action;
          if (action === 'renameUnit') renameUnit(id);
          else if (action === 'delUnit') deleteUnit(id);
        };
      });
    });
  }

  // ---- 课文列表 ----
  const filterEl = document.getElementById('umLessonUnitFilter');
  const fuid = umState.filterUnitIndex > 0 ? units[umState.filterUnitIndex - 1].id : null;
  filterEl.innerHTML = '<option value="0">选择单元</option>' +
    units.map((u, i) => `<option value="${i + 1}" ${umState.filterUnitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('');
  filterEl.onchange = (e) => {
    umState.filterUnitIndex = parseInt(e.target.value);
    renderUnitManage();
  };

  const selUnit = fuid ? units.find(u => String(u.id) === String(fuid)) : null;
  const lessons = selUnit ? (selUnit.lessons || []) : [];
  const lessonListEl = document.getElementById('umLessonList');
  if (!fuid) {
    lessonListEl.innerHTML = '<div class="um-empty">请先在上方选择一个单元</div>';
  } else if (lessons.length === 0) {
    lessonListEl.innerHTML = '<div class="um-empty">该单元暂无课文，点击上方按钮添加</div>';
  } else {
    lessonListEl.innerHTML = lessons.map((l, i) =>
      `<div class="um-item" data-id="${l.id}" data-unit-id="${selUnit.id}">
        <div class="um-item-info">
          <span class="um-item-index">${i + 1}</span>
          <span class="um-item-name">${l.name}</span>
        </div>
        <div class="um-item-actions">
          <button class="um-item-btn um-item-btn-edit" data-action="renameLesson">重命名</button>
          <button class="um-item-btn um-item-btn-del" data-action="delLesson">删除</button>
        </div>
      </div>`
    ).join('');

    lessonListEl.querySelectorAll('.um-item').forEach(item => {
      const id = item.dataset.id;
      const unitId = item.dataset.unitId;
      item.querySelectorAll('[data-action]').forEach(btn => {
        btn.onclick = () => {
          const action = btn.dataset.action;
          if (action === 'renameLesson') renameLesson(unitId, id);
          else if (action === 'delLesson') deleteLesson(unitId, id);
        };
      });
    });
  }

  // 绑定添加按钮
  document.getElementById('umAddUnitBtn').onclick = () => addUnit();
  document.getElementById('umAddLessonBtn').onclick = () => addLesson();
}

// ---- 单元 CRUD ----

function addUnit() {
  showModal(`<div class="modal-header"><span class="modal-title">添加单元</span><span class="modal-close" onclick="closeModal()">×</span></div>
    <div class="form-group"><label class="form-label">单元名称</label><input class="form-input" id="umInputName" placeholder="如：第一单元" autofocus /></div>
    <button class="btn btn-primary btn-block" id="umConfirmBtn">确定添加</button>`);
  document.getElementById('umConfirmBtn').onclick = () => {
    const name = document.getElementById('umInputName').value.trim();
    if (!name) { showToast('请输入单元名称'); return; }
    const key = gradeKey(umState.currentGrade);
    const id = String(Date.now());
    appState.cateData[key].push({ id, name, type: 'unit', grade: umState.currentGrade, lessons: [] });
    saveCateData();
    closeModal();
    renderUnitManage();
    showToast('添加成功');
  };
}

function renameUnit(id) {
  const key = gradeKey(umState.currentGrade);
  const unit = (appState.cateData[key] || []).find(u => String(u.id) === String(id));
  if (!unit) return;
  showModal(`<div class="modal-header"><span class="modal-title">重命名单元</span><span class="modal-close" onclick="closeModal()">×</span></div>
    <div class="form-group"><label class="form-label">单元名称</label><input class="form-input" id="umInputName" value="${unit.name}" autofocus /></div>
    <button class="btn btn-primary btn-block" id="umConfirmBtn">保存</button>`);
  document.getElementById('umConfirmBtn').onclick = () => {
    const name = document.getElementById('umInputName').value.trim();
    if (!name) { showToast('请输入单元名称'); return; }
    unit.name = name;
    saveCateData();
    closeModal();
    renderUnitManage();
    showToast('已重命名');
  };
}

function deleteUnit(id) {
  confirmDialog('确认删除', '确定删除该单元吗？该单元下的所有课文也会一并删除，关联的内容不会受影响。', () => {
    const key = gradeKey(umState.currentGrade);
    const idx = (appState.cateData[key] || []).findIndex(u => String(u.id) === String(id));
    if (idx > -1) appState.cateData[key].splice(idx, 1);
    saveCateData();
    if (umState.filterUnitIndex > 0) {
      umState.filterUnitIndex = 0;
    }
    renderUnitManage();
    showToast('已删除');
  });
}

// ---- 课文 CRUD ----

function addLesson() {
  const units = getGradeUnits(umState.currentGrade);
  const fuid = umState.filterUnitIndex > 0 ? units[umState.filterUnitIndex - 1] : null;
  if (!fuid) { showToast('请先在上方选择一个单元'); return; }
  showModal(`<div class="modal-header"><span class="modal-title">添加课文</span><span class="modal-close" onclick="closeModal()">×</span></div>
    <div class="form-group"><label class="form-label">课文名称</label><input class="form-input" id="umInputName" placeholder="如：第1课 春天来了" autofocus /></div>
    <button class="btn btn-primary btn-block" id="umConfirmBtn">确定添加</button>`);
  document.getElementById('umConfirmBtn').onclick = () => {
    const name = document.getElementById('umInputName').value.trim();
    if (!name) { showToast('请输入课文名称'); return; }
    const id = String(Date.now());
    fuid.lessons.push({ id, name, type: 'lesson', grade: umState.currentGrade });
    saveCateData();
    closeModal();
    renderUnitManage();
    showToast('添加成功');
  };
}

function renameLesson(unitId, lessonId) {
  const key = gradeKey(umState.currentGrade);
  const unit = (appState.cateData[key] || []).find(u => String(u.id) === String(unitId));
  if (!unit) return;
  const lesson = (unit.lessons || []).find(l => String(l.id) === String(lessonId));
  if (!lesson) return;
  showModal(`<div class="modal-header"><span class="modal-title">重命名课文</span><span class="modal-close" onclick="closeModal()">×</span></div>
    <div class="form-group"><label class="form-label">课文名称</label><input class="form-input" id="umInputName" value="${lesson.name}" autofocus /></div>
    <button class="btn btn-primary btn-block" id="umConfirmBtn">保存</button>`);
  document.getElementById('umConfirmBtn').onclick = () => {
    const name = document.getElementById('umInputName').value.trim();
    if (!name) { showToast('请输入课文名称'); return; }
    lesson.name = name;
    saveCateData();
    closeModal();
    renderUnitManage();
    showToast('已重命名');
  };
}

function deleteLesson(unitId, lessonId) {
  confirmDialog('确认删除', '确定删除该课文吗？关联的内容不会受影响。', () => {
    const key = gradeKey(umState.currentGrade);
    const unit = (appState.cateData[key] || []).find(u => String(u.id) === String(unitId));
    if (!unit) return;
    const idx = (unit.lessons || []).findIndex(l => String(l.id) === String(lessonId));
    if (idx > -1) unit.lessons.splice(idx, 1);
    saveCateData();
    renderUnitManage();
    showToast('已删除');
  });
}

// ========== 初始化 ==========
function init() {
  if (!isLoggedIn()) {
    // 未登录：显示登录页，不初始化主应用
    showLoginPage();
    return;
  }
  startApp();
}

// 已登录：初始化主应用并进入统计页
function startApp() {
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
  document.getElementById('navBack').onclick = () => {
    // 知识库分类详情页和单元课文管理页返回知识库首页，其他子页返回首页
    if (currentPage === 'category' || currentPage === 'unitmanage') {
      switchTab('characters');
    } else {
      switchTab('statistics');
    }
  };
  document.querySelectorAll('.tab-item').forEach(item => {
    item.onclick = () => switchTab(item.dataset.tab);
  });

  // 显示主应用外壳（navbar/tabbar），切到统计页
  showAppShell();
  // 统计页不需要远端内容数据，仅检查是否首次登录（不依赖远端数据）
  checkFirstLogin();
  switchTab('statistics');
}

// 显示登录页（隐藏 navbar/tabbar，只显示 page-login）
function showLoginPage() {
  const navbar = document.getElementById('navbar');
  if (navbar) navbar.style.display = 'none';
  document.getElementById('tabbar').style.display = 'none';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-login').classList.add('active');
}

// 显示主应用外壳（navbar/tabbar 显示）
function showAppShell() {
  const navbar = document.getElementById('navbar');
  if (navbar) navbar.style.display = '';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
}

// 登录/注册成功后由 login.js 调用：进入主应用
function onLoginSuccess() {
  startApp();
}

// 暴露给 login.js / auth.js（logout）使用
window.showLoginPage = showLoginPage;
window.onLoginSuccess = onLoginSuccess;

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
  showLoading('正在加载基础数据...');
  try {
    // 基础内容统一从 dictation/ 读取共享库，不再复制到用户空间；
    // 用户个人听写记录(count_hanzi)、错词本(count_error)按需写入用户空间。
    // 这里拉取单元课文树 + 全部分类内容到本地缓存，完成首次加载。
    await loadCateFromGiteeOnly();
    for (const cat of CATEGORIES) { await loadCategoryData(cat.value); }
    await markUserSynced(user);
    hideLoading();
    showToast('基础数据加载完成');
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






