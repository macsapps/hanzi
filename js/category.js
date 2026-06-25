// ========== 分类页面公共逻辑（hanzi/ciyu/chengyu/gushi/jilei） ==========

// === 从 URL 获取参数 ===
const urlParams = new URLSearchParams(location.search);
const currentGrade = parseInt(urlParams.get('grade')) || 0;

// === 从页面文件名确定分类 ===
const pageName = location.pathname.split('/').pop().replace('.html', '');
const CATEGORY_LABELS = { hanzi: '汉字', ciyu: '词语', chengyu: '成语', gushi: '古诗', jilei: '日积月累' };
const CATEGORY = pageName; // 'hanzi', 'ciyu', etc.
const CATEGORY_LABEL = CATEGORY_LABELS[CATEGORY] || '知识库';

document.title = CATEGORY_LABEL;
document.getElementById('pageTitle').textContent = CATEGORY_LABEL;

// === 数据状态 ===
const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
let gradeData = [[], [], [], [], [], []];
let cateData = { grade1: [], grade2: [], grade3: [], grade4: [], grade5: [], grade6: [] };

let filterUnitIndex = 0;
let filterLessonIndex = 0;

function storageKey(g) { return `cat_${CATEGORY}_${g}`; }
const CATE_STORAGE_KEY = 'characterCate';
function gradeKey(g) { return 'grade' + (Number(g) + 1); }

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
      tree[k] = (Array.isArray(data[k]) ? data[k] : []).map(u => ensureUnit(u, grade));
    });
  }
  return tree;
}

function loadLocalData() {
  for (let i = 0; i < 6; i++) {
    try {
      const d = localStorage.getItem(storageKey(i));
      if (d) { const p = JSON.parse(d); gradeData[i] = Array.isArray(p) ? p : []; }
    } catch (e) {}
  }
  try {
    const cs = localStorage.getItem(CATE_STORAGE_KEY);
    if (cs) cateData = normalizeCateData(JSON.parse(cs));
  } catch (e) {}
}

function saveGradeData(g) {
  try { localStorage.setItem(storageKey(g), JSON.stringify(gradeData[g])); } catch (e) {}
  autoSyncToGitee(g);
}

function saveCateData() {
  try { localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(cateData)); } catch (e) {}
  autoSyncCateToGitee();
}

async function autoSyncToGitee(g) {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushCategoryToGitee(JSON.stringify(gradeData[g]), c, CATEGORY, g); } catch (e) {}
}

async function autoSyncCateToGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushCateToGitee(JSON.stringify(cateData), c); } catch (e) {}
}

function getGradeUnits(g) { return cateData[gradeKey(g)] || []; }

function getFilteredList() {
  const gu = getGradeUnits(currentGrade);
  const fuid = filterUnitIndex > 0 ? gu[filterUnitIndex - 1].id : null;
  const gl = fuid === null ? gu.flatMap(u => u.lessons || []) : (gu.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];

  let list = gradeData[currentGrade] || [];
  // 按分类过滤
  list = list.filter(item => String(item.category) === CATEGORY);
  // 按单元/课文过滤
  if (fuid !== null) list = list.filter(item => String(item.unitId) === String(fuid));
  if (filterLessonIndex > 0) { const lid = gl[filterLessonIndex - 1].id; list = list.filter(item => String(item.lessonId) === String(lid)); }
  return list;
}

// === 渲染 ===
function refreshCategory() {
  // 年级 tab
  const tabsEl = document.getElementById('cateGradeTabs');
  tabsEl.innerHTML = GRADES.map((g, i) => `<div class="grade-tab ${currentGrade === i ? 'active' : ''}" data-grade="${i}"><span class="grade-tab-text">${g}</span></div>`).join('');
  tabsEl.querySelectorAll('.grade-tab').forEach(t => {
    t.onclick = () => {
      // 切换年级，重新加载数据
      location.href = `${CATEGORY}.html?grade=${t.dataset.grade}`;
    };
  });

  // 筛选栏
  const units = getGradeUnits(currentGrade);
  const fuid = filterUnitIndex > 0 ? units[filterUnitIndex - 1].id : null;
  const lessons = fuid === null ? units.flatMap(u => u.lessons || []) : (units.find(u => String(u.id) === String(fuid)) || { lessons: [] }).lessons || [];

  document.getElementById('cateUnitFilter').innerHTML = '<option value="0">全部单元</option>' + units.map((u, i) => `<option value="${i + 1}" ${filterUnitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('');
  document.getElementById('cateLessonFilter').innerHTML = '<option value="0">全部课文</option>' + lessons.map((l, i) => `<option value="${i + 1}" ${filterLessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('');

  // 内容列表
  const list = getFilteredList();
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
      cardHtml += `<span class="char-play">
        <svg t="1782292289492" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3691" width="25" height="25"><path d="M529.1 901.6c-2.7 0-12.1-4.1-17-9l-0.3-0.3-230.4-190.1H96.1c-8.9 0-18.3-4.6-22.7-9-4.4-4.4-9-13.8-9-22.7v-319c0-7 2.7-12.9 4.4-14.6H71l2.4-2.4c4.4-4.4 13.8-9 22.7-9h185.3l230.4-195.8 0.2-0.2c5.8-5.8 12.9-7 17.8-7 4.4 0 8.9 1 12.6 2.9l0.5 0.3 0.5 0.2c12.5 4.2 17.2 11.3 17.2 26.4v717.8c0 15.1-4.7 22.3-17.2 26.4l-1.8 0.6-1.4 1.4c-3 3-5.6 3.1-11.1 3.1z m279.1-79.7c-9.9 0-23.1-5.1-26.9-12.6-9-18-5.8-36.4 7.9-46.1 4.8-2 11.6-7.2 20.3-15.6 8.9-8.7 22.4-23.7 36.2-45.7 23-36.8 50.4-99.7 50.4-190.9s-29-154.2-53.3-191.1c-14.5-22-28.8-37-38.2-45.6-6.6-6.1-14.9-13-21-15.5-12.6-9.1-17-31.4-8.9-44.5 9.4-9.1 20.6-14.3 30.8-14.3 5.4 0 10.4 1.4 14.8 4.2 0.7 0.6 1.6 1.3 3 2.4 29.4 23.1 54.9 51.4 75.8 84.1 40.1 62.9 60.5 137 60.5 220.3 0 83.7-19.7 158.1-58.4 221.1-20.1 32.7-44.5 60.9-72.6 83.6-1.7 1.4-2.6 2.1-3.3 2.8-3.4 3.4-13.3 3.4-17.1 3.4zM688.6 696.6c-8.3 0-22.6-9.7-26.9-18.3l-0.2-0.5-0.3-0.4c-8.2-12.4 0.8-30.4 14.5-39.7 6.4-3.4 60.9-35.5 60.9-132.3 0-46.5-18-78.4-33.2-97-16.5-20.2-33.1-29.4-33.7-29.8l-0.6-0.3-0.7-0.2c-5.8-1.9-11.4-8.5-14.3-16.8-2.9-8.3-2.3-16.6 1.4-22.2l0.6-0.9 0.3-1c2.9-8.6 15.6-16.1 27.3-16.1 4.5 0 8.6 1.1 11.7 3.2l2.1 1.4h1.5c4.5 1.7 29.1 14 53.5 41.9 21.7 24.9 47.6 68.1 47.6 132.2 0 72.9-24.5 120.2-45 147.1-22.6 29.5-45.6 42.2-50.4 44.1h-2.4l-2.4 2.4c-3.2 3-5.7 3.2-11.3 3.2z" fill="#088019" p-id="3692"></path></svg>
      </span>`;
      return `<div class="char-card" data-id="${item.id}">${cardHtml}</div>`;
    }).join('') + '</div>';

    // 卡片交互
    area.querySelectorAll('.char-card').forEach(card => {
      const item = list.find(c => String(c.id) === String(card.dataset.id));
      if (!item) return;
      card.onclick = (e) => {
        if (e.target.closest('.char-play')) { e.stopPropagation(); playItem(item); }
        else if (e.target.closest('.char-hanzi')) { openEditModal(item); }
      };
      card.oncontextmenu = (e) => { e.preventDefault(); deleteItem(item); };
      let pt; card.addEventListener('touchstart', () => { pt = setTimeout(() => deleteItem(item), 600); });
      card.addEventListener('touchend', () => clearTimeout(pt));
      card.addEventListener('touchmove', () => clearTimeout(pt));
    });
  }
}

// === TTS ===
async function playItem(item) {
  window.speechSynthesis.cancel();
  await delay(50);
  if (item.content) await speak(item.content, { cancel: false });
  await delay(100);
  if (item.ciyu) await speak(item.ciyu, { cancel: false });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// === CRUD ===
function deleteItem(item) {
  confirmDialog('确认删除', `确定删除「${item.content}」吗？`, () => {
    const arr = gradeData[currentGrade];
    const idx = arr.findIndex(c => c.id === item.id);
    if (idx > -1) { arr.splice(idx, 1); saveGradeData(currentGrade); refreshCategory(); showToast('已删除'); }
  });
}

function openEditModal(item) {
  let ig = currentGrade;
  for (let i = 0; i < 6; i++) { if (Array.isArray(gradeData[i]) && gradeData[i].find(c => c.id === item.id)) { ig = i; break; } }
  const gu = getGradeUnits(ig); let ui = 0, li = 0, su = null;
  if (item.unitId) { const idx = gu.findIndex(u => String(u.id) === String(item.unitId)); if (idx > -1) { ui = idx + 1; su = gu[idx]; } }
  if (item.lessonId && su) { const idx = (su.lessons || []).findIndex(l => String(l.id) === String(item.lessonId)); if (idx > -1) li = idx + 1; }
  let ef = { id: item.id, originalGrade: ig, gradeIndex: ig, unitIndex: ui, lessonIndex: li, content: item.content || '', ciyu: item.ciyu || '', ciyupy: item.ciyupy || '' };
  function getHtml() {
    const units = ef.gradeIndex !== null ? getGradeUnits(ef.gradeIndex) : [];
    const lessons = (ef.gradeIndex !== null && ef.unitIndex > 0) ? ((units[ef.unitIndex - 1] || { lessons: [] }).lessons || []) : [];
    return `<div class="modal-header"><span class="modal-title">修改${CATEGORY_LABEL}</span><span class="modal-close" onclick="closeModal()">×</span></div>
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
      const ol = gradeData[og], ii = ol.findIndex(c => c.id === ef.id); if (ii === -1) { showToast('未找到内容'); return; }
      if (og === ng) { ol[ii].content = content; ol[ii].ciyu = ciyu; ol[ii].ciyupy = ciyupy; ol[ii].unitId = unitId; ol[ii].lessonId = lessonId; saveGradeData(og); }
      else { const mi = ol.splice(ii, 1)[0]; mi.content = content; mi.ciyu = ciyu; mi.ciyupy = ciyupy; mi.unitId = unitId; mi.lessonId = lessonId; gradeData[ng].push(mi); saveGradeData(og); saveGradeData(ng); }
      closeModal(); refreshCategory(); showToast('修改成功');
    };
  }
  showModal(getHtml()); bindEdit();
}

function openAddModal() {
  let form = { gradeIndex: currentGrade, unitIndex: 0, lessonIndex: 0, category: CATEGORY, content: '' };
  const ph = { hanzi: '如：诗｜shī（诗人）shī rén，碧｜bì（碧绿）bì lǜ', ciyu: '如：高兴｜gāo xìng，快乐｜kuài lè', chengyu: '如：春暖花开｜chūn nuǎn huā kāi', gushi: '如：静夜思｜jìng yè sī', jilei: '如：一年之计在于春｜yī nián zhī jì zài yú chūn' };
  function getHtml() {
    const units = getGradeUnits(form.gradeIndex);
    const lessons = form.unitIndex > 0 ? ((units[form.unitIndex - 1] || { lessons: [] }).lessons || []) : [];
    return `<div class="modal-header"><span class="modal-title">添加${CATEGORY_LABEL}</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="addGrade"><option value="">请选择年级</option>${GRADES.map((g, i) => `<option value="${i}" ${form.gradeIndex === i ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><div class="form-row"><select class="form-select" id="addUnit"><option value="0">选择单元</option>${units.map((u, i) => `<option value="${i + 1}" ${form.unitIndex === i + 1 ? 'selected' : ''}>${u.name}</option>`).join('')}</select><div class="form-row-btn" id="addUnitBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">课文</label><div class="form-row"><select class="form-select" id="addLesson"><option value="0">选择课文</option>${lessons.map((l, i) => `<option value="${i + 1}" ${form.lessonIndex === i + 1 ? 'selected' : ''}>${l.name}</option>`).join('')}</select><div class="form-row-btn" id="addLessonBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">内容</label><textarea class="form-textarea" id="addContent" placeholder="${ph[form.category] || '请输入内容'}">${form.content}</textarea></div>
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
        cateData[key].push({ id, name, type: 'unit', grade: form.gradeIndex, lessons: [] });
        form.unitIndex = cateData[key].length; form.lessonIndex = 0; saveCateData(); showModal(getHtml()); bindForm(); showToast('添加成功');
      };
    };
    document.getElementById('addLessonBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请先选择年级'); return; }
      if (form.unitIndex === 0) { showToast('请先选择单元'); return; }
      showModal(`<div class="modal-header"><span class="modal-title">添加课文</span><span class="modal-close" onclick="closeModal()">×</span></div><div class="form-group"><label class="form-label">名称</label><input class="form-input" id="quickAddName" placeholder="如：第1课 春天来了" /></div><button class="btn btn-primary btn-block" id="quickAddConfirm">确定</button>`);
      document.getElementById('quickAddConfirm').onclick = () => {
        const name = document.getElementById('quickAddName').value.trim(); if (!name) { showToast('请输入名称'); return; }
        const id = String(Date.now()), key = gradeKey(form.gradeIndex);
        cateData[key][form.unitIndex - 1].lessons.push({ id, name, type: 'lesson', grade: form.gradeIndex });
        form.lessonIndex = cateData[key][form.unitIndex - 1].lessons.length; saveCateData(); showModal(getHtml()); bindForm(); showToast('添加成功');
      };
    };
    document.getElementById('addSubmitBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请选择年级'); return; }
      if (form.unitIndex === 0) { showToast('请选择单元'); return; }
      if (form.lessonIndex === 0) { showToast('请选择课文'); return; }
      const content = document.getElementById('addContent').value.trim(); if (!content) { showToast('请输入内容'); return; }
      const gi = form.gradeIndex, units = getGradeUnits(gi), unitId = units[form.unitIndex - 1].id;
      const lessons = (units[form.unitIndex - 1] || { lessons: [] }).lessons || [], lessonId = lessons[form.lessonIndex - 1].id;
      if (!Array.isArray(gradeData[gi])) gradeData[gi] = [];
      const list = gradeData[gi]; const segs = content.split(/[，,]/).filter(s => s.trim());
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
        if (form.category === 'hanzi' && !parts[1] && text.length > 1 && segs.length === 1) {
          [...text.replace(/\s+/g, '')].forEach(ch => list.push({ id: Date.now() + Math.random(), content: ch, category: form.category, pinyin: '', ciyu: '', ciyupy: '', unitId, lessonId, times: 0, yes: 0, wrong: 0 }));
        } else {
          list.push({ id: Date.now() + Math.random(), content: text, category: form.category, pinyin: py, ciyu, ciyupy, unitId, lessonId, times: 0, yes: 0, wrong: 0 });
        }
      });
      saveGradeData(gi); closeModal(); refreshCategory(); showToast('添加成功');
    };
  }
  fetchCateFromGitee().then(() => { showModal(getHtml()); bindForm(); });
}

function openManageModal() {
  let mt = 'unit';
  function getHtml() {
    let list = mt === 'unit' ? getGradeUnits(currentGrade) : getGradeUnits(currentGrade).flatMap(u => (u.lessons || []).map(l => ({ ...l, _unitName: u.name })));
    return `<div class="modal-header"><span class="modal-title">${GRADES[currentGrade]} - 管理</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="manage-tabs"><div class="manage-tab ${mt === 'unit' ? 'active' : ''}" data-tab="unit">单元</div><div class="manage-tab ${mt === 'lesson' ? 'active' : ''}" data-tab="lesson">课文</div></div>
      <div class="manage-list">${list.length === 0 ? `<div style="text-align:center;padding:30px 0;color:#999;font-size:13px;">暂无${mt === 'unit' ? '单元' : '课文'}</div>` : list.map(item => `<div class="manage-item"><div class="manage-item-info"><span class="manage-item-id">${item.id}</span><span class="manage-item-name">${item.name}${item._unitName ? ' (' + item._unitName + ')' : ''}</span></div><span class="manage-item-delete" data-id="${item.id}" data-type="${item.type || (mt === 'unit' ? 'unit' : 'lesson')}">删除</span></div>`).join('')}</div>
      <div class="clear-cate-btn" id="clearCateBtn">清空所有分类数据</div>`;
  }
  function bindManage() {
    document.querySelectorAll('.manage-tab').forEach(t => { t.onclick = () => { mt = t.dataset.tab; showModal(getHtml()); bindManage(); }; });
    document.querySelectorAll('.manage-item-delete').forEach(d => { d.onclick = () => { const id = d.dataset.id, type = d.dataset.type; confirmDialog('确认删除', '确定删除吗？', () => { const key = gradeKey(currentGrade); if (type === 'unit') { const idx = (cateData[key] || []).findIndex(u => String(u.id) === String(id)); if (idx > -1) cateData[key].splice(idx, 1); } else { for (const u of (cateData[key] || [])) { const idx = (u.lessons || []).findIndex(l => String(l.id) === String(id)); if (idx > -1) { u.lessons.splice(idx, 1); break; } } } saveCateData(); showModal(getHtml()); bindManage(); }); }; });
    document.getElementById('clearCateBtn').onclick = () => { confirmDialog('确认清空', '将清空所有单元和课文分类数据。确定清空吗？', () => { cateData = { grade1: [], grade2: [], grade3: [], grade4: [], grade5: [], grade6: [] }; saveCateData(); showModal(getHtml()); bindManage(); showToast('已清空'); }); };
  }
  showModal(getHtml()); bindManage();
}

// === 数据加载（从 gitee.js） ===
async function fetchCateFromGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { const cj = await pullCateFromGitee(c); const rc = JSON.parse(cj); if (rc && Object.keys(rc).length > 0) { cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(cateData)); } } catch (e) {}
}

async function loadAllDataFromGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try {
    const cj = await pullCateFromGitee(c); const rc = JSON.parse(cj);
    if (rc && Object.keys(rc).length > 0) { cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(cateData)); }
  } catch (e) {}
  for (let i = 0; i < 6; i++) {
    try { const rj = await pullCategoryFromGitee(c, CATEGORY, i); const rd = JSON.parse(rj); if (Array.isArray(rd)) { gradeData[i] = rd; localStorage.setItem(storageKey(i), JSON.stringify(rd)); } } catch (e) {}
  }
  refreshCategory();
}

// === Toast / Modal / Loading（复用主应用中同名的函数） ===
function showToast(title) {
  const t = document.getElementById('toast'); t.textContent = title; t.className = 'toast show';
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.className = 'toast'; }, 2000);
}
function showModal(html) { document.getElementById('modalBox').innerHTML = html; document.getElementById('modalMask').style.display = 'flex'; }
function closeModal() { document.getElementById('modalMask').style.display = 'none'; }
function confirmDialog(title, content, onConfirm) {
  window._confirmCallback = onConfirm;
  showModal(`<div class="modal-header"><span class="modal-title">${title}</span><span class="modal-close" onclick="closeModal()">×</span></div><p style="font-size:14px;color:#666;line-height:1.6;margin-bottom:20px;">${content}</p><div class="btn-row"><button class="btn btn-outline" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="closeModal();window._confirmCallback()">确定</button></div>`);
}

// === 确保默认同步配置 ===
function ensureDefaultSyncConfig() {
  try {
    const raw = localStorage.getItem('giteeSyncConfig');
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg && cfg.token && cfg.repo) return;
    }
  } catch (e) {}
  saveSyncConfig({
    token: '51a0167ca18909d6055b158f8875c922',
    repo: 'https://gitee.com/hesir00/dictation_sql.git',
    branch: 'master',
    autoSync: false
  });
}

// === 初始化 ===
function init() {
  if (!requireLogin()) return;
  ensureDefaultSyncConfig();

  const curUser = getCurrentUser();
  if (curUser && curUser.filder) {
    setActiveSpace(curUser.filder);
  }

  loadLocalData();

  // 绑定筛选栏
  document.getElementById('cateUnitFilter').onchange = (e) => { filterUnitIndex = parseInt(e.target.value); filterLessonIndex = 0; refreshCategory(); };
  document.getElementById('cateLessonFilter').onchange = (e) => { filterLessonIndex = parseInt(e.target.value); refreshCategory(); };
  document.getElementById('cateAddBtn').onclick = () => openAddModal();
  document.getElementById('cateManageBtn').onclick = () => openManageModal();

  refreshCategory();
  loadAllDataFromGitee();
}

// 确保函数在全局可用（用于 onclick 属性）
window.openAddModal = openAddModal;
window.openManageModal = openManageModal;
window.closeModal = closeModal;

window.addEventListener('DOMContentLoaded', init);
