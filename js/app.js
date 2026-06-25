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
  // 年级 tab
  const tabsEl = document.getElementById('cateGradeTabs');
  tabsEl.innerHTML = GRADES.map((gd, i) => `<div class="grade-tab ${g === i ? 'active' : ''}" data-grade="${i}"><span class="grade-tab-text">${gd}</span></div>`).join('');
  tabsEl.querySelectorAll('.grade-tab').forEach(t => {
    t.onclick = () => { charState.currentGrade = parseInt(t.dataset.grade); charState.filterUnitIndex = 0; charState.filterLessonIndex = 0; refreshCategoryPage(); };
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
      cardHtml += `<span class="char-times">${item.times ? item.times : ''}</span>`;
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
}

function openCategoryAddModal() {
  const cat = charState.currentCategory;
  let form = { gradeIndex: charState.currentGrade, unitIndex: 0, lessonIndex: 0, content: '' };
  const ph = { hanzi: '如：诗｜shī（诗人）shī rén，碧｜bì（碧绿）bì lǜ', ciyu: '如：高兴｜gāo xìng，快乐｜kuài lè', chengyu: '如：春暖花开｜chūn nuǎn huā kāi', gushi: '如：静夜思｜jìng yè sī', jilei: '如：一年之计在于春｜yī nián zhī jì zài yú chūn' };
  function getHtml() {
    const units = getGradeUnits(form.gradeIndex);
    const lessons = form.unitIndex > 0 ? ((units[form.unitIndex - 1] || { lessons: [] }).lessons || []) : [];
    return `<div class="modal-header"><span class="modal-title">添加${CATEGORY_LABELS[cat]}</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="addGrade"><option value="">请选择年级</option>${GRADES.map((g, i) => `<option value="${i}" ${form.gradeIndex === i ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><div class="form-row"><select class="form-select" id="addUnit"><option value="0">选择单元</option>${units.map((u, i) => `<option value="${i + 1}" ${form.unitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('')}</select><div class="form-row-btn" id="addUnitBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">课文</label><div class="form-row"><select class="form-select" id="addLesson"><option value="0">选择课文</option>${lessons.map((l, i) => `<option value="${i + 1}" ${form.lessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('')}</select><div class="form-row-btn" id="addLessonBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">内容</label><textarea class="form-textarea" id="addContent" placeholder="${ph[cat] || '请输入内容'}">${form.content}</textarea></div>
      <button class="btn btn-primary btn-block" id="addSubmitBtn">添加</button>`;
  }
  function bindForm() {
    document.getElementById('addGrade').onchange = (e) => { form.gradeIndex = e.target.value === '' ? null : parseInt(e.target.value); form.unitIndex = 0; form.lessonIndex = 0; showModal(getHtml()); bindForm(); };
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
  for (let i = 0; i < 6; i++) { const arr = getCategoryGradeData(cat, i); if (arr.find(c => c.id === item.id)) { ig = i; break; } }
  const gu = getGradeUnits(ig); let ui = 0, li = 0, su = null;
  if (item.unitId) { const idx = gu.findIndex(u => String(u.id) === String(item.unitId)); if (idx > -1) { ui = idx + 1; su = gu[idx]; } }
  if (item.lessonId && su) { const idx = (su.lessons || []).findIndex(l => String(l.id) === String(item.lessonId)); if (idx > -1) li = idx + 1; }
  let ef = { id: item.id, originalGrade: ig, gradeIndex: ig, unitIndex: ui, lessonIndex: li, content: item.content || '', ciyu: item.ciyu || '', ciyupy: item.ciyupy || '' };
  function getHtml() {
    const units = ef.gradeIndex !== null ? getGradeUnits(ef.gradeIndex) : [];
    const lessons = (ef.gradeIndex !== null && ef.unitIndex > 0) ? ((units[ef.unitIndex - 1] || { lessons: [] }).lessons || []) : [];
    return `<div class="modal-header"><span class="modal-title">修改${CATEGORY_LABELS[cat]}</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="editGrade">${GRADES.map((g, i) => `<option value="${i}" ${ef.gradeIndex === i ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><select class="form-select" id="editUnit"><option value="0">选择单元</option>${units.map((u, i) => `<option value="${i + 1}" ${ef.unitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">课文</label><select class="form-select" id="editLesson"><option value="0">选择课文</option>${lessons.map((l, i) => `<option value="${i + 1}" ${ef.lessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">内容</label><input class="form-input" id="editContent" value="${ef.content}" placeholder="请输入内容" /></div>
      <div class="form-group"><label class="form-label">词语</label><input class="form-input" id="editCiyu" value="${ef.ciyu}" placeholder="请输入词语" /></div>
      <div class="form-group"><label class="form-label">词语拼音</label><input class="form-input" id="editCiyupy" value="${ef.ciyupy}" placeholder="如 shi ren" /></div>
      <button class="btn btn-primary btn-block" id="editSaveBtn">保存</button>`;
  }
  function bindEdit() {
    document.getElementById('editGrade').onchange = (e) => { ef.gradeIndex = parseInt(e.target.value); ef.unitIndex = 0; ef.lessonIndex = 0; showModal(getHtml()); bindEdit(); };
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
    return `<div class="modal-header"><span class="modal-title">${GRADES[charState.currentGrade]} - 管理</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="manage-tabs"><div class="manage-tab ${mt === 'unit' ? 'active' : ''}" data-tab="unit">单元</div><div class="manage-tab ${mt === 'lesson' ? 'active' : ''}" data-tab="lesson">课文</div></div>
      <div class="manage-list">${list.length === 0 ? `<div style="text-align:center;padding:30px 0;color:#999;font-size:13px;">暂无${mt === 'unit' ? '单元' : '课文'}</div>` : list.map(item => `<div class="manage-item"><div class="manage-item-info"><span class="manage-item-id">${item.id}</span><span class="manage-item-name">${item.name}${item._unitName ? ' (' + item._unitName + ')' : ''}</span></div><span class="manage-item-delete" data-id="${item.id}" data-type="${item.type || (mt === 'unit' ? 'unit' : 'lesson')}">删除</span></div>`).join('')}</div>
      <div class="clear-cate-btn" id="clearCateBtn">清空所有分类数据</div>`;
  }
  function bindManage() {
    document.querySelectorAll('.manage-tab').forEach(t => { t.onclick = () => { mt = t.dataset.tab; showModal(getHtml()); bindManage(); }; });
    document.querySelectorAll('.manage-item-delete').forEach(d => { d.onclick = () => { const id = d.dataset.id, type = d.dataset.type; confirmDialog('确认删除', '确定删除吗？关联的内容不会被删除。', () => { const key = gradeKey(charState.currentGrade); if (type === 'unit') { const idx = (appState.cateData[key] || []).findIndex(u => String(u.id) === String(id)); if (idx > -1) appState.cateData[key].splice(idx, 1); } else { for (const u of (appState.cateData[key] || [])) { const idx = (u.lessons || []).findIndex(l => String(l.id) === String(id)); if (idx > -1) { u.lessons.splice(idx, 1); break; } } } saveCateData(); showModal(getHtml()); bindManage(); }); }; });
    document.getElementById('clearCateBtn').onclick = () => { confirmDialog('确认清空', '将清空所有单元和课文分类数据。确定清空吗？', () => { appState.cateData = { grade1: [], grade2: [], grade3: [], grade4: [], grade5: [], grade6: [] }; saveCateData(); showModal(getHtml()); bindManage(); showToast('已清空'); }); };
  }
  showModal(getHtml()); bindManage();
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
    const files = await listHanziDataFolder(config, getSpacePrefix() + '/count_hanzi/' + fn);
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
    const result = await pullHanziRecordsFromGitee(config, getSpacePrefix() + '/count_hanzi/' + fn + '/' + fileName);
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
  try { const result = await pullHanziRecordsFromGitee(config, getSpacePrefix() + '/count_hanzi/' + fn + '/' + historyState.selectedDate); historyState.selectedFileSha = result.sha || ''; historyState.charList = (result.records || []).map(r => ({ ...r, yes: typeof r.yes === 'number' ? r.yes : 0 })); renderHistoryChars(); } catch (e) { }
}

async function saveHistoryCountData() {
  if (!historyState.selectedDate || historyState.syncing) return; historyState.syncing = true;
  const config = getSyncConfig(); if (!isSyncConfigured(config)) { historyState.syncing = false; return; }
  try { const fn = '' + historyState.currentYear + String(historyState.currentMonth).padStart(2, '0'); await pushHanziRecordsUpdate(config, fn, historyState.selectedDate, historyState.charList, historyState.selectedFileSha); } catch (e) { showToast('保存失败'); }
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

  // 年级 tab
  const tabsEl = document.getElementById('umGradeTabs');
  tabsEl.innerHTML = GRADES.map((gd, i) =>
    `<div class="grade-tab ${g === i ? 'active' : ''}" data-grade="${i}"><span class="grade-tab-text">${gd}</span></div>`
  ).join('');
  tabsEl.querySelectorAll('.grade-tab').forEach(t => {
    t.onclick = () => {
      umState.currentGrade = parseInt(t.dataset.grade);
      umState.filterUnitIndex = 0;
      renderUnitManage();
    };
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
  document.getElementById('navBack').onclick = () => { switchTab('statistics'); };
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






