const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
const CATEGORIES = [
  { label: '汉字', value: 'hanzi' },
  { label: '词语', value: 'ciyu' },
  { label: '成语', value: 'chengyu' }
];
const CATEGORY_LABELS = { hanzi: '汉字', ciyu: '词语', chengyu: '成语' };

let appState = {
  gradeData: [[], [], [], [], [], []],
  cateData: { grade1: [], grade2: [], grade3: [], grade4: [], grade5: [], grade6: [] }
};

function storageKey(g) { return `characterList_${g}`; }
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
      const arr = Array.isArray(data[k]) ? data[k] : [];
      tree[k] = arr.map(u => ensureUnit(u, grade));
    });
  }
  return tree;
}

function loadLocalData() {
  for (let i = 0; i < 6; i++) {
    try {
      const data = localStorage.getItem(storageKey(i));
      if (data) { const p = JSON.parse(data); appState.gradeData[i] = Array.isArray(p) ? p : []; }
    } catch (e) {}
  }
  try {
    const cs = localStorage.getItem(CATE_STORAGE_KEY);
    if (cs) appState.cateData = normalizeCateData(JSON.parse(cs));
  } catch (e) {}
}

function saveGradeData(g) {
  try { localStorage.setItem(storageKey(g), JSON.stringify(appState.gradeData[g])); } catch (e) {}
  autoSyncToGitee(g);
}
function saveCateData() {
  try { localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); } catch (e) {}
  autoSyncCateToGitee();
}
async function autoSyncToGitee(g) {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushToGitee(JSON.stringify(appState.gradeData[g]), c, g); updateSyncTime(); } catch (e) {}
}
async function autoSyncCateToGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { await pushCateToGitee(JSON.stringify(appState.cateData), c); updateSyncTime(); } catch (e) {}
}
function updateSyncTime() {
  const n = new Date(), p = m => String(m).padStart(2, '0');
  localStorage.setItem('lastSyncTime', `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}`);
}
async function loadAllDataFromGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try {
    const cj = await pullCateFromGitee(c); const rc = JSON.parse(cj);
    if (rc && Object.keys(rc).length > 0) { appState.cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); }
  } catch (e) {}
  for (let i = 0; i < 6; i++) {
    try { const rj = await pullFromGitee(c, i); const rd = JSON.parse(rj); if (Array.isArray(rd) && rd.length > 0) { appState.gradeData[i] = rd; localStorage.setItem(storageKey(i), JSON.stringify(rd)); } } catch (e) {}
  }
  refreshCurrentPage();
}
async function fetchCateFromGitee() {
  const c = getSyncConfig(); if (!isSyncConfigured(c)) return;
  try { const cj = await pullCateFromGitee(c); const rc = JSON.parse(cj); if (rc && Object.keys(rc).length > 0) { appState.cateData = normalizeCateData(rc); localStorage.setItem(CATE_STORAGE_KEY, JSON.stringify(appState.cateData)); } } catch (e) {}
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
  const titles = { statistics: '统计', characters: '汉字库', dictation: '听写', mine: '我的' };
  document.getElementById('navTitle').textContent = titles[tab] || '';
  document.getElementById('tabbar').style.display = '';
  document.getElementById('navBack').style.display = 'none';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  if (tab === 'characters') refreshCharacters();
  else if (tab === 'dictation') refreshDictationSelect();
  else if (tab === 'mine') refreshMine();
}

function navigateTo(page) {
  const titles = { history: '历史听写', latest: '最新听写' };
  document.getElementById('navTitle').textContent = titles[page] || '';
  document.getElementById('tabbar').style.display = 'none';
  document.getElementById('navBack').style.display = '';
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  currentPage = page;
  if (page === 'history') initHistory();
  else if (page === 'latest') loadLatest();
}

function refreshCurrentPage() {
  if (currentPage === 'characters') refreshCharacters();
  else if (currentPage === 'dictation' && dictationState.phase === 'select') refreshDictationSelect();
}

// ========== 统计页 ==========
function initStatistics() {
  document.getElementById('goLatestBtn').onclick = () => navigateTo('latest');
  document.getElementById('goHistoryBtn').onclick = () => navigateTo('history');
}

// ========== 汉字库页 ==========
let charState = { currentGrade: 0, filterUnitIndex: 0, filterLessonIndex: 0 };

function refreshCharacters() {
  const tabsEl = document.getElementById('charGradeTabs');
  tabsEl.innerHTML = GRADES.map((g, i) => `<div class="grade-tab ${charState.currentGrade===i?'active':''}" data-grade="${i}"><span class="grade-tab-text">${g}</span></div>`).join('');
  tabsEl.querySelectorAll('.grade-tab').forEach(t => {
    t.onclick = () => { charState.currentGrade = parseInt(t.dataset.grade); charState.filterUnitIndex=0; charState.filterLessonIndex=0; refreshCharacters(); };
  });

  const units = getGradeUnits(charState.currentGrade);
  const fuid = charState.filterUnitIndex > 0 ? units[charState.filterUnitIndex-1].id : null;
  const lessons = fuid === null ? units.flatMap(u => u.lessons||[]) : (units.find(u=>String(u.id)===String(fuid))||{lessons:[]}).lessons||[];

  document.getElementById('charUnitFilter').innerHTML = '<option value="0">全部单元</option>' + units.map((u,i)=>`<option value="${i+1}" ${charState.filterUnitIndex===i+1?'selected':''}>${u.name}</option>`).join('');
  document.getElementById('charLessonFilter').innerHTML = '<option value="0">全部课文</option>' + lessons.map((l,i)=>`<option value="${i+1}" ${charState.filterLessonIndex===i+1?'selected':''}>${l.name}</option>`).join('');

  let list = appState.gradeData[charState.currentGrade] || [];
  if (fuid !== null) list = list.filter(item => String(item.unitId) === String(fuid));
  if (charState.filterLessonIndex > 0) { const lid = lessons[charState.filterLessonIndex-1].id; list = list.filter(item => String(item.lessonId) === String(lid)); }

  const area = document.getElementById('charListArea');
  if (list.length === 0) { area.innerHTML = '<div class="empty-tip">暂无内容，点击右下角添加</div>'; }
  else {
    area.innerHTML = '<div class="char-grid">' + list.map(item => `<div class="char-card" data-id="${item.id}">${item.pinyin?`<span class="char-pinyin">${item.pinyin}</span>`:''}<span class="char-hanzi">${item.content||''}</span>${item.ciyu?`<span class="char-ciyu">${item.ciyu}</span>`:''}<span class="char-times">${item.times?item.times:''}</span><span class="char-play">🔈</span></div>`).join('') + '</div>';
    area.querySelectorAll('.char-card').forEach(card => {
      const item = list.find(c => String(c.id) === String(card.dataset.id));
      if (!item) return;
      card.onclick = (e) => { if (e.target.classList.contains('char-play')) { e.stopPropagation(); playChar(item); } else openEditModal(item); };
      card.oncontextmenu = (e) => { e.preventDefault(); deleteCharItem(item); };
      let pt; card.addEventListener('touchstart', () => { pt = setTimeout(() => deleteCharItem(item), 600); });
      card.addEventListener('touchend', () => clearTimeout(pt)); card.addEventListener('touchmove', () => clearTimeout(pt));
    });
  }
}

function initCharacters() {
  document.getElementById('charUnitFilter').onchange = (e) => { charState.filterUnitIndex = parseInt(e.target.value); charState.filterLessonIndex = 0; refreshCharacters(); };
  document.getElementById('charLessonFilter').onchange = (e) => { charState.filterLessonIndex = parseInt(e.target.value); refreshCharacters(); };
  document.getElementById('charManageBtn').onclick = () => openManageModal();
  document.getElementById('charAddBtn').onclick = () => openAddModal();
}

async function playChar(item) {
  // 先取消之前可能残留的语音
  window.speechSynthesis.cancel();
  await delay(50);
  // 只播放汉字和词语，不播放拼音（ciyupy 是纯拼音字母，不应朗读）
  if (item.content) await speak(item.content, { cancel: false });
  await delay(100);
  if (item.ciyu) await speak(item.ciyu, { cancel: false });
}

function deleteCharItem(item) {
  confirmDialog('确认删除', `确定删除「${item.content}」吗？`, () => {
    const arr = appState.gradeData[charState.currentGrade]; const idx = arr.findIndex(c => c.id === item.id);
    if (idx > -1) { arr.splice(idx, 1); saveGradeData(charState.currentGrade); refreshCharacters(); showToast('已删除'); }
  });
}

function openAddModal() {
  let form = { gradeIndex: null, unitIndex: 0, lessonIndex: 0, category: 'hanzi', content: '' };
  function getHtml() {
    const units = form.gradeIndex !== null ? getGradeUnits(form.gradeIndex) : [];
    const lessons = (form.gradeIndex !== null && form.unitIndex > 0) ? ((units[form.unitIndex-1]||{lessons:[]}).lessons||[]) : [];
    const ph = { hanzi: '如：诗｜shī（诗人）shī rén，碧｜bì（碧绿）bì lǜ', ciyu: '如：高兴｜gāo xìng，快乐｜kuài lè', chengyu: '如：春暖花开｜chūn nuǎn huā kāi' };
    return `<div class="modal-header"><span class="modal-title">添加内容</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="addGrade"><option value="">请选择年级</option>${GRADES.map((g,i)=>`<option value="${i}" ${form.gradeIndex===i?'selected':''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><div class="form-row"><select class="form-select" id="addUnit"><option value="0">选择单元</option>${units.map((u,i)=>`<option value="${i+1}" ${form.unitIndex===i+1?'selected':''}>${u.name}</option>`).join('')}</select><div class="form-row-btn" id="addUnitBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">课文</label><div class="form-row"><select class="form-select" id="addLesson"><option value="0">选择课文</option>${lessons.map((l,i)=>`<option value="${i+1}" ${form.lessonIndex===i+1?'selected':''}>${l.name}</option>`).join('')}</select><div class="form-row-btn" id="addLessonBtn">+</div></div></div>
      <div class="form-group"><label class="form-label">分类</label><div class="category-tabs">${CATEGORIES.map(cat=>`<div class="category-tab ${form.category===cat.value?'active':''}" data-cat="${cat.value}">${cat.label}</div>`).join('')}</div></div>
      <div class="form-group"><label class="form-label">内容</label><textarea class="form-textarea" id="addContent" placeholder="${ph[form.category]||'请输入内容'}">${form.content}</textarea></div>
      <button class="btn btn-primary btn-block" id="addSubmitBtn">添加</button>`;
  }
  function bindForm() {
    document.getElementById('addGrade').onchange = (e) => { form.gradeIndex = e.target.value===''?null:parseInt(e.target.value); form.unitIndex=0; form.lessonIndex=0; showModal(getHtml()); bindForm(); };
    document.getElementById('addUnit').onchange = (e) => { form.unitIndex = parseInt(e.target.value); form.lessonIndex=0; showModal(getHtml()); bindForm(); };
    document.getElementById('addLesson').onchange = (e) => { form.lessonIndex = parseInt(e.target.value); };
    document.getElementById('addContent').oninput = (e) => { form.content = e.target.value; };
    document.querySelectorAll('.category-tab').forEach(t => { t.onclick = () => { form.category = t.dataset.cat; showModal(getHtml()); bindForm(); }; });
    document.getElementById('addUnitBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请先选择年级'); return; }
      showModal(`<div class="modal-header"><span class="modal-title">添加单元</span><span class="modal-close" onclick="closeModal()">×</span></div><div class="form-group"><label class="form-label">名称</label><input class="form-input" id="quickAddName" placeholder="如：第一单元" /></div><button class="btn btn-primary btn-block" id="quickAddConfirm">确定</button>`);
      document.getElementById('quickAddConfirm').onclick = () => {
        const name = document.getElementById('quickAddName').value.trim(); if (!name) { showToast('请输入名称'); return; }
        const id = String(Date.now()), key = gradeKey(form.gradeIndex);
        appState.cateData[key].push({id,name,type:'unit',grade:form.gradeIndex,lessons:[]});
        form.unitIndex = appState.cateData[key].length; form.lessonIndex=0; saveCateData(); showModal(getHtml()); bindForm(); showToast('添加成功');
      };
    };
    document.getElementById('addLessonBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请先选择年级'); return; }
      if (form.unitIndex === 0) { showToast('请先选择单元'); return; }
      showModal(`<div class="modal-header"><span class="modal-title">添加课文</span><span class="modal-close" onclick="closeModal()">×</span></div><div class="form-group"><label class="form-label">名称</label><input class="form-input" id="quickAddName" placeholder="如：第1课 春天来了" /></div><button class="btn btn-primary btn-block" id="quickAddConfirm">确定</button>`);
      document.getElementById('quickAddConfirm').onclick = () => {
        const name = document.getElementById('quickAddName').value.trim(); if (!name) { showToast('请输入名称'); return; }
        const id = String(Date.now()), key = gradeKey(form.gradeIndex);
        appState.cateData[key][form.unitIndex-1].lessons.push({id,name,type:'lesson',grade:form.gradeIndex});
        form.lessonIndex = appState.cateData[key][form.unitIndex-1].lessons.length; saveCateData(); showModal(getHtml()); bindForm(); showToast('添加成功');
      };
    };
    document.getElementById('addSubmitBtn').onclick = () => {
      if (form.gradeIndex === null) { showToast('请选择年级'); return; }
      if (form.unitIndex === 0) { showToast('请选择单元'); return; }
      if (form.lessonIndex === 0) { showToast('请选择课文'); return; }
      const content = document.getElementById('addContent').value.trim(); if (!content) { showToast('请输入内容'); return; }
      const gi = form.gradeIndex, units = getGradeUnits(gi), unitId = units[form.unitIndex-1].id;
      const lessons = (units[form.unitIndex-1]||{lessons:[]}).lessons||[], lessonId = lessons[form.lessonIndex-1].id;
      if (!Array.isArray(appState.gradeData[gi])) appState.gradeData[gi] = [];
      const list = appState.gradeData[gi]; const segs = content.split(/[，,]/).filter(s => s.trim());
      segs.forEach(seg => {
        const tr = seg.trim(); if (!tr) return;
        let ciyu='', ciyupy='', before=tr, after='';
        const m = tr.match(/[（(]([^）)]+)[）)]/);
        if (m) {
          ciyu = m[1].trim();
          const parenStart = tr.search(/[（(]/);
          const parenEnd = tr.search(/[）)]/);
          before = tr.slice(0, parenStart).trim();
          after = tr.slice(parenEnd + 1).trim();
          ciyupy = after;
        }
        const parts = before.split(/[｜|]/); const text=(parts[0]||'').trim(), py=(parts[1]||'').trim(); if (!text) return;
        if (form.category==='hanzi'&&!parts[1]&&text.length>1&&segs.length===1) { [...text.replace(/\s+/g,'')].forEach(ch=>list.push({id:Date.now()+Math.random(),content:ch,category:form.category,pinyin:'',ciyu:'',ciyupy:'',unitId,lessonId,times:0,yes:0,wrong:0})); }
        else list.push({id:Date.now()+Math.random(),content:text,category:form.category,pinyin:py,ciyu,ciyupy,unitId,lessonId,times:0,yes:0,wrong:0});
      });
      charState.currentGrade=gi; saveGradeData(gi); closeModal(); refreshCharacters(); showToast('添加成功');
    };
  }
  fetchCateFromGitee().then(() => { showModal(getHtml()); bindForm(); });
}

function openEditModal(item) {
  let ig = charState.currentGrade;
  for (let i=0;i<6;i++) { if (Array.isArray(appState.gradeData[i])&&appState.gradeData[i].find(c=>c.id===item.id)) { ig=i; break; } }
  const gu = getGradeUnits(ig); let ui=0,li=0,su=null;
  if (item.unitId) { const idx=gu.findIndex(u=>String(u.id)===String(item.unitId)); if(idx>-1){ui=idx+1;su=gu[idx];} }
  if (item.lessonId&&su) { const idx=(su.lessons||[]).findIndex(l=>String(l.id)===String(item.lessonId)); if(idx>-1)li=idx+1; }
  let ef = {id:item.id,originalGrade:ig,gradeIndex:ig,unitIndex:ui,lessonIndex:li,content:item.content||'',ciyu:item.ciyu||'',ciyupy:item.ciyupy||''};
  function getHtml() {
    const units = ef.gradeIndex!==null?getGradeUnits(ef.gradeIndex):[];
    const lessons = (ef.gradeIndex!==null&&ef.unitIndex>0)?((units[ef.unitIndex-1]||{lessons:[]}).lessons||[]):[];
    return `<div class="modal-header"><span class="modal-title">修改内容</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="form-group"><label class="form-label">年级</label><select class="form-select" id="editGrade">${GRADES.map((g,i)=>`<option value="${i}" ${ef.gradeIndex===i?'selected':''}>${g}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">单元</label><select class="form-select" id="editUnit"><option value="0">选择单元</option>${units.map((u,i)=>`<option value="${i+1}" ${ef.unitIndex===i+1?'selected':''}>${u.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">课文</label><select class="form-select" id="editLesson"><option value="0">选择课文</option>${lessons.map((l,i)=>`<option value="${i+1}" ${ef.lessonIndex===i+1?'selected':''}>${l.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">汉字</label><input class="form-input" id="editContent" value="${ef.content}" placeholder="请输入汉字" /></div>
      <div class="form-group"><label class="form-label">词语</label><input class="form-input" id="editCiyu" value="${ef.ciyu}" placeholder="请输入词语" /></div>
      <div class="form-group"><label class="form-label">词语拼音</label><input class="form-input" id="editCiyupy" value="${ef.ciyupy}" placeholder="如 shi ren" /></div>
      <button class="btn btn-primary btn-block" id="editSaveBtn">保存</button>`;
  }
  function bindEdit() {
    document.getElementById('editGrade').onchange=(e)=>{ef.gradeIndex=parseInt(e.target.value);ef.unitIndex=0;ef.lessonIndex=0;showModal(getHtml());bindEdit();};
    document.getElementById('editUnit').onchange=(e)=>{ef.unitIndex=parseInt(e.target.value);ef.lessonIndex=0;showModal(getHtml());bindEdit();};
    document.getElementById('editLesson').onchange=(e)=>{ef.lessonIndex=parseInt(e.target.value);};
    document.getElementById('editSaveBtn').onclick=()=>{
      if(ef.unitIndex===0){showToast('请选择单元');return;} if(ef.lessonIndex===0){showToast('请选择课文');return;}
      const content=document.getElementById('editContent').value.trim(),ciyu=document.getElementById('editCiyu').value.trim(),ciyupy=document.getElementById('editCiyupy').value.trim();
      if(!content){showToast('请输入内容');return;}
      const og=ef.originalGrade,ng=ef.gradeIndex,units=getGradeUnits(ng),unitId=units[ef.unitIndex-1].id;
      const lessons=(units[ef.unitIndex-1]||{lessons:[]}).lessons||[],lessonId=lessons[ef.lessonIndex-1].id;
      const ol=appState.gradeData[og],ii=ol.findIndex(c=>c.id===ef.id); if(ii===-1){showToast('未找到内容');return;}
      if(og===ng){ol[ii].content=content;ol[ii].ciyu=ciyu;ol[ii].ciyupy=ciyupy;ol[ii].unitId=unitId;ol[ii].lessonId=lessonId;saveGradeData(og);}
      else{const mi=ol.splice(ii,1)[0];mi.content=content;mi.ciyu=ciyu;mi.ciyupy=ciyupy;mi.unitId=unitId;mi.lessonId=lessonId;if(!Array.isArray(appState.gradeData[ng]))appState.gradeData[ng]=[];appState.gradeData[ng].push(mi);saveGradeData(og);saveGradeData(ng);charState.currentGrade=ng;}
      closeModal();refreshCharacters();showToast('修改成功');
    };
  }
  showModal(getHtml());bindEdit();
}

function openManageModal() {
  let mt='unit';
  function getHtml() {
    let list = mt==='unit'?getGradeUnits(charState.currentGrade):getGradeUnits(charState.currentGrade).flatMap(u=>(u.lessons||[]).map(l=>({...l,_unitName:u.name})));
    return `<div class="modal-header"><span class="modal-title">${GRADES[charState.currentGrade]} - 管理</span><span class="modal-close" onclick="closeModal()">×</span></div>
      <div class="manage-tabs"><div class="manage-tab ${mt==='unit'?'active':''}" data-tab="unit">单元</div><div class="manage-tab ${mt==='lesson'?'active':''}" data-tab="lesson">课文</div></div>
      <div class="manage-list">${list.length===0?`<div style="text-align:center;padding:30px 0;color:#999;font-size:13px;">暂无${mt==='unit'?'单元':'课文'}</div>`:list.map(item=>`<div class="manage-item"><div class="manage-item-info"><span class="manage-item-id">${item.id}</span><span class="manage-item-name">${item.name}${item._unitName?' ('+item._unitName+')':''}</span></div><span class="manage-item-delete" data-id="${item.id}" data-type="${item.type||(mt==='unit'?'unit':'lesson')}">删除</span></div>`).join('')}</div>
      <div class="clear-cate-btn" id="clearCateBtn">清空所有分类数据</div>`;
  }
  function bindManage() {
    document.querySelectorAll('.manage-tab').forEach(t=>{t.onclick=()=>{mt=t.dataset.tab;showModal(getHtml());bindManage();};});
    document.querySelectorAll('.manage-item-delete').forEach(d=>{d.onclick=()=>{const id=d.dataset.id,type=d.dataset.type;confirmDialog('确认删除','确定删除吗？关联的内容不会被删除。',()=>{const key=gradeKey(charState.currentGrade);if(type==='unit'){const idx=(appState.cateData[key]||[]).findIndex(u=>String(u.id)===String(id));if(idx>-1)appState.cateData[key].splice(idx,1);}else{for(const u of(appState.cateData[key]||[])){const idx=(u.lessons||[]).findIndex(l=>String(l.id)===String(id));if(idx>-1){u.lessons.splice(idx,1);break;}}}saveCateData();showModal(getHtml());bindManage();});};});
    document.getElementById('clearCateBtn').onclick=()=>{confirmDialog('确认清空','将清空所有单元和课文分类数据。确定清空吗？',()=>{appState.cateData={grade1:[],grade2:[],grade3:[],grade4:[],grade5:[],grade6:[]};saveCateData();showModal(getHtml());bindManage();showToast('已清空');});};
  }
  showModal(getHtml());bindManage();
}

// ========== 听写页 ==========
let dictationState = {
  phase: 'select', dictationMode: 'lesson', currentGrade: 0,
  filterUnitIndex: 0, filterLessonIndex: 0,
  dictationList: [], currentIndex: 0, currentGroup: 0,
  abortFlag: false, isPaused: false, _delayTimer: null, dictationRecords: []
};

function showDictPhase(phase) {
  ['select','running','complete'].forEach(p => {
    document.getElementById('dict-'+p).classList.toggle('active', p === phase);
  });
}

function getDictationSelectedList() {
  let list = appState.gradeData[dictationState.currentGrade] || [];
  const gu = getGradeUnits(dictationState.currentGrade);
  const fuid = dictationState.filterUnitIndex > 0 ? gu[dictationState.filterUnitIndex-1].id : null;
  if (fuid !== null) list = list.filter(item => String(item.unitId) === String(fuid));
  if (dictationState.dictationMode === 'lesson' && dictationState.filterLessonIndex > 0) {
    const gl = fuid === null ? gu.flatMap(u=>u.lessons||[]) : (gu.find(u=>String(u.id)===String(fuid))||{lessons:[]}).lessons||[];
    const lid = gl[dictationState.filterLessonIndex-1].id;
    list = list.filter(item => String(item.lessonId) === String(lid));
  }
  return list;
}

function refreshDictationSelect() {
  if (dictationState.phase !== 'select') return;
  showDictPhase('select');
  const modeEl = document.getElementById('dictModeTabs');
  modeEl.innerHTML = [{mode:'lesson',label:'按课文听写'},{mode:'unit',label:'按单元听写'}].map(m=>`<div class="mode-tab ${dictationState.dictationMode===m.mode?'active':''}" data-mode="${m.mode}">${m.label}</div>`).join('');
  modeEl.querySelectorAll('.mode-tab').forEach(t=>{t.onclick=()=>{dictationState.dictationMode=t.dataset.mode;dictationState.filterUnitIndex=0;dictationState.filterLessonIndex=0;refreshDictationSelect();};});
  const gtEl = document.getElementById('dictGradeTabs');
  gtEl.innerHTML = GRADES.map((g,i)=>`<div class="grade-tab ${dictationState.currentGrade===i?'active':''}" data-grade="${i}"><span class="grade-tab-text">${g}</span></div>`).join('');
  gtEl.querySelectorAll('.grade-tab').forEach(t=>{t.onclick=()=>{dictationState.currentGrade=parseInt(t.dataset.grade);dictationState.filterUnitIndex=0;dictationState.filterLessonIndex=0;refreshDictationSelect();};});
  const gu = getGradeUnits(dictationState.currentGrade);
  const fuid = dictationState.filterUnitIndex > 0 ? gu[dictationState.filterUnitIndex-1].id : null;
  const gl = fuid === null ? gu.flatMap(u=>u.lessons||[]) : (gu.find(u=>String(u.id)===String(fuid))||{lessons:[]}).lessons||[];
  document.getElementById('dictUnitFilter').innerHTML = '<option value="0">选择单元</option>' + gu.map((u,i)=>`<option value="${i+1}" ${dictationState.filterUnitIndex===i+1?'selected':''}>${u.name}</option>`).join('');
  const lp = document.getElementById('dictLessonPicker');
  lp.style.display = dictationState.dictationMode === 'lesson' ? '' : 'none';
  if (dictationState.dictationMode === 'lesson') {
    document.getElementById('dictLessonFilter').innerHTML = '<option value="0">选择课文</option>' + gl.map((l,i)=>`<option value="${i+1}" ${dictationState.filterLessonIndex===i+1?'selected':''}>${l.name}</option>`).join('');
  }
  const selectedList = getDictationSelectedList();
  document.getElementById('dictCount').textContent = selectedList.length;
  const previewEl = document.getElementById('dictCharPreview');
  if (selectedList.length === 0) {
    previewEl.innerHTML = '<div class="empty-tip">请选择年级、单元、课文</div>';
  } else {
    previewEl.innerHTML = '<div class="char-grid">' + selectedList.map(item =>
      `<div class="char-card">${item.pinyin?`<span class="char-pinyin">${item.pinyin}</span>`:''}<span class="char-hanzi">${item.content||''}</span>${item.ciyu?`<span class="char-ciyu">${item.ciyu}</span>`:''}${item.ciyupy?`<span class="char-ciyupy">${item.ciyupy}</span>`:''}</div>`
    ).join('') + '</div>';
  }
  const startBtn = document.getElementById('dictStartBtn');
  startBtn.classList.toggle('disabled', selectedList.length === 0);
}

function initDictation() {
  document.getElementById('dictUnitFilter').onchange = (e) => { dictationState.filterUnitIndex=parseInt(e.target.value); dictationState.filterLessonIndex=0; refreshDictationSelect(); };
  document.getElementById('dictLessonFilter').onchange = (e) => { dictationState.filterLessonIndex=parseInt(e.target.value); refreshDictationSelect(); };
  document.getElementById('dictStartBtn').onclick = () => startDictation();
  document.getElementById('dictPauseBtn').onclick = () => togglePause();
  document.getElementById('dictStopBtn').onclick = () => stopDictation();
  document.getElementById('dictRestartBtn').onclick = () => {
    dictationState.currentIndex=0;dictationState.currentGroup=0;dictationState.abortFlag=false;dictationState.isPaused=false;dictationState.dictationRecords=[];dictationState.phase='dictating';
    showDictPhase('running');updateDictRunning();runDictationLoop();
  };
  document.getElementById('dictBackBtn').onclick = () => {
    dictationState.phase='select';dictationState.dictationList=[];dictationState.currentGroup=0;dictationState.currentIndex=0;refreshDictationSelect();
  };
}

async function startDictation() {
  const list = getDictationSelectedList();
  if (list.length === 0) { showToast('没有可选的字词'); return; }
  dictationState.dictationList=[...list];dictationState.currentIndex=0;dictationState.currentGroup=0;
  dictationState.abortFlag=false;dictationState.isPaused=false;dictationState.dictationRecords=[];dictationState.phase='dictating';
  showDictPhase('running');updateDictRunning();await runDictationLoop();
}

function updateDictRunning() {
  const char = dictationState.dictationList[dictationState.currentIndex];
  const pct = dictationState.dictationList.length===0?0:Math.round((dictationState.currentIndex/dictationState.dictationList.length)*100);
  document.getElementById('dictProgressText').textContent=(dictationState.currentIndex+1)+' / '+dictationState.dictationList.length;
  document.getElementById('dictProgressFill').style.width=pct+'%';
  document.getElementById('dictPinyin').textContent=(char&&char.pinyin)?char.pinyin:'';
  document.getElementById('dictMainChar').textContent=char?char.content:'';
  const badge=document.getElementById('dictBadge'); const cl=char?(CATEGORY_LABELS[char.category]||''):'';
  if(cl){badge.textContent=cl;badge.style.display='';}else{badge.style.display='none';}
  document.getElementById('dictReadIndicator').innerHTML=[1,2].map(i=>'<div class="read-dot '+(i<=dictationState.currentGroup?'active':'')+'"></div>').join('')+'<span class="read-text">第 '+dictationState.currentGroup+' / 2 组</span>';
  document.getElementById('dictPauseHint').style.display = dictationState.phase==='paused'?'':'none';
  document.getElementById('dictPauseBtn').textContent = dictationState.phase==='paused'?'▶ 继续':'⏸ 暂停';
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
    dictationState.dictationRecords.push({id:char.id,pg:1,yes:0,hz:char.content||'',cy:char.ciyu||'',cyp:char.ciyupy||'',py:char.pinyin||'',nj:GRADES[dictationState.currentGrade]||'',dy:unit||'',kw:lesson||''});
    if (dictationState.currentIndex < dictationState.dictationList.length - 1) await delay(2000);
    dictationState.currentIndex++; dictationState.currentGroup = 0; updateDictRunning();
  }
  if (!dictationState.abortFlag) {
    dictationState.phase = 'complete';
    showDictPhase('complete');
    document.getElementById('dictCompleteStat').textContent = '共听写 ' + dictationState.dictationList.length + ' 个字词';
    document.getElementById('dictCompleteGrid').innerHTML = dictationState.dictationList.map(item=>'<div class="complete-card">'+item.content+'</div>').join('');
    syncDictationRecords();
  }
}

function findUnitName(id) { if(!id)return''; for(let i=1;i<=6;i++){const u=(appState.cateData['grade'+i]||[]).find(u=>String(u.id)===String(id));if(u)return u.name;} return''; }
function findLessonName(id) { if(!id)return''; for(let i=1;i<=6;i++){for(const u of(appState.cateData['grade'+i]||[])){const l=(u.lessons||[]).find(l=>String(l.id)===String(id));if(l)return l.name;}} return''; }
function incrementTimes(char) { const list=appState.gradeData[dictationState.currentGrade];if(!Array.isArray(list))return;const item=list.find(c=>c.id===char.id);if(item){item.times=(item.times||0)+1;saveGradeData(dictationState.currentGrade);} }
async function syncDictationRecords() {
  if(dictationState.dictationRecords.length===0)return;
  const c=getSyncConfig();
  if(!isSyncConfigured(c)){
    console.log('未配置Gitee同步，听写记录仅保存在本地');
    return;
  }
  try{
    await pushCountDataToGitee(dictationState.dictationRecords,c);
    console.log('听写记录已同步到 count_data/' + new Date().toISOString().slice(0,10));
  }catch(e){
    console.error('同步听写记录失败:', e.message);
  }
}
function togglePause() { if(dictationState.phase==='paused'){dictationState.isPaused=false;dictationState.phase='dictating';}else{dictationState.isPaused=true;dictationState.phase='paused';stopSpeak();} updateDictRunning(); }
function stopDictation() { dictationState.abortFlag=true;dictationState.isPaused=false;stopSpeak();if(dictationState._delayTimer){clearTimeout(dictationState._delayTimer);dictationState._delayTimer=null;}dictationState.phase='select';dictationState.currentGroup=0;dictationState.currentIndex=0;refreshDictationSelect(); }
function delay(ms) { return new Promise(r=>{dictationState._delayTimer=setTimeout(r,ms);}); }
function waitWhilePaused() { return new Promise(r=>{const c=()=>{if(dictationState.abortFlag||!dictationState.isPaused){r();return;}setTimeout(c,200);};c();}); }

// ========== 我的页 ==========
function refreshMine() {
  const config = getSyncConfig();
  document.getElementById('cfgToken').value = config.token || 'a207949f9c164a99357ce1e6a1913b1e';
  document.getElementById('cfgRepo').value = config.repo || 'https://gitee.com/hesir00/quick-tools-warehouse.git';
  document.getElementById('cfgBranch').value = config.branch || 'master';
  const last = localStorage.getItem('lastSyncTime') || '';
  const ss = document.getElementById('syncStatus');
  if (last) { document.getElementById('syncStatusText').textContent = '上次同步：' + last; ss.style.display = ''; }
  else { ss.style.display = 'none'; }
}

function initMine() {
  let showToken = false;
  document.getElementById('eyeBtn').onclick = () => {
    showToken = !showToken;
    document.getElementById('cfgToken').type = showToken ? 'text' : 'password';
    document.getElementById('eyeBtn').textContent = showToken ? '👁' : '🔒';
  };
  document.getElementById('saveCfgBtn').onclick = async () => {
    const cfg = { token: document.getElementById('cfgToken').value, repo: document.getElementById('cfgRepo').value, branch: document.getElementById('cfgBranch').value || 'master', autoSync: false };
    if (!cfg.token || !cfg.repo) { showToast('请完善同步配置'); return; }
    saveSyncConfig(cfg);
    showLoading('验证仓库...');
    const check = await checkRepoAccess(cfg);
    hideLoading();
    if (check.ok) showToast('配置已保存，仓库连接正常'); else showToast(check.error);
  };
  document.getElementById('pushBtn').onclick = async () => {
    const cfg = getSyncConfig(); if (!isSyncConfigured(cfg)) { showToast('请先配置令牌和仓库地址'); return; }
    showLoading('推送中...');
    try { for (let i=0;i<6;i++){const data=localStorage.getItem(storageKey(i))||'[]';await pushToGitee(data,cfg,i);} hideLoading();updateSyncTime();refreshMine();showToast('推送成功'); }
    catch (e) { hideLoading(); showToast(e.message||'推送失败'); }
  };
  document.getElementById('pullBtn').onclick = async () => {
    const cfg = getSyncConfig(); if (!isSyncConfigured(cfg)) { showToast('请先配置令牌和仓库地址'); return; }
    showLoading('拉取中...');
    try { for(let i=0;i<6;i++){const rj=await pullFromGitee(cfg,i);JSON.parse(rj);localStorage.setItem(storageKey(i),rj);appState.gradeData[i]=JSON.parse(rj);} hideLoading();updateSyncTime();refreshMine();showToast('拉取成功'); }
    catch (e) { hideLoading(); showToast(e.message||'拉取失败'); }
  };
}

// ========== 历史听写页 ==========
let historyState = { currentYear: 2026, currentMonth: 6, dateList: [], selectedDate: '', selectedFileSha: '', charList: [], syncing: false };

function initHistory() {
  const now = new Date();
  historyState.currentYear = now.getFullYear();
  historyState.currentMonth = now.getMonth() + 1;
  document.getElementById('prevMonthBtn').onclick = () => {
    historyState.currentMonth--; if(historyState.currentMonth<1){historyState.currentMonth=12;historyState.currentYear--;}
    historyState.selectedDate=''; historyState.charList=[]; loadDateList();
  };
  document.getElementById('nextMonthBtn').onclick = () => {
    historyState.currentMonth++; if(historyState.currentMonth>12){historyState.currentMonth=1;historyState.currentYear++;}
    historyState.selectedDate=''; historyState.charList=[]; loadDateList();
  };
  loadDateList();
}

async function loadDateList() {
  historyState.dateList = [];
  const container = document.getElementById('dateListContainer');
  container.innerHTML = '<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  document.getElementById('historyMonthLabel').textContent = historyState.currentYear+'年'+String(historyState.currentMonth).padStart(2,'0')+'月';
  const config = getSyncConfig();
  if (!isSyncConfigured(config)) { container.innerHTML = '<div class="empty-tip"><span class="empty-text">请先配置同步</span></div>'; return; }
  try {
    const fn = ''+historyState.currentYear+String(historyState.currentMonth).padStart(2,'0');
    const files = await listCountDataFolder(config, 'dictation/count_data/'+fn);
    historyState.dateList = files.map(name => { const d=name.replace('.json','').slice(-2);const m=name.replace('.json','').slice(4,6);return{fileName:name,label:m+'月'+d+'日'};}).reverse();
    if (historyState.dateList.length === 0) { container.innerHTML = '<div class="empty-tip"><span class="empty-text">暂无听写记录</span></div>'; return; }
    container.innerHTML = historyState.dateList.map(item=>'<div class="date-item '+(historyState.selectedDate===item.fileName?'active':'')+'" data-file="'+item.fileName+'"><span class="date-item-text">'+item.label+'</span></div>').join('');
    container.querySelectorAll('.date-item').forEach(e=>{e.onclick=()=>selectDate(e.dataset.file);});
  } catch (e) { container.innerHTML = '<div class="empty-tip"><span class="empty-text">加载失败</span></div>'; }
}

async function selectDate(fileName) {
  historyState.selectedDate=fileName; historyState.selectedFileSha=''; historyState.charList=[];
  document.getElementById('dateListContainer').querySelectorAll('.date-item').forEach(e=>e.classList.toggle('active',e.dataset.file===fileName));
  const charArea = document.getElementById('charAreaContainer');
  charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  const config = getSyncConfig(); if (!isSyncConfigured(config)) return;
  try {
    const fn = ''+historyState.currentYear+String(historyState.currentMonth).padStart(2,'0');
    const result = await pullCountDataFromGitee(config, 'dictation/count_data/'+fn+'/'+fileName);
    historyState.selectedFileSha = result.sha||'';
    historyState.charList = (result.records||[]).map(r=>({...r,yes:typeof r.yes==='number'?r.yes:0}));
    renderHistoryChars();
  } catch (e) { charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">加载失败</span></div>'; }
}

function renderHistoryChars() {
  const charArea = document.getElementById('charAreaContainer');
  if (historyState.charList.length === 0) { charArea.innerHTML = '<div class="empty-tip"><span class="empty-text">无数据</span></div>'; return; }
  charArea.innerHTML = '<div class="char-grid">'+historyState.charList.map((item,idx)=>'<div class="char-card" style="'+(item.yes===1?'background:#c9f9d5;':item.yes===2?'background:#f4b0ac;':'')+'">'+(item.py?'<span class="char-pinyin">'+item.py+'</span>':'')+'<span class="char-hanzi">'+item.hz+'</span>'+(item.cy?'<span class="char-ciyu">'+item.cy+'</span>':'')+(item.cyp?'<span class="char-ciyupy">'+item.cyp+'</span>':'')+(item.yes!==0?'<div class="mark-status">'+(item.yes===1?'✅':'❌')+'</div>':'<div class="mark-btns"><button class="mark-btn" data-idx="'+idx+'" data-val="1">✅</button><button class="mark-btn" data-idx="'+idx+'" data-val="2">❌</button></div>')+'</div>').join('')+'</div>';
  charArea.querySelectorAll('.mark-btn').forEach(b=>{b.onclick=()=>historyMarkYes(parseInt(b.dataset.idx),parseInt(b.dataset.val));});
}

async function historyMarkYes(idx, value) {
  const item = historyState.charList[idx]; const ov=item.yes; const nv=ov===value?0:value;
  historyState.charList[idx].yes=nv; updateYesInCharList(item.id,ov,nv); renderHistoryChars();
  await saveHistoryCountData();
  const fn=''+historyState.currentYear+String(historyState.currentMonth).padStart(2,'0'); const config=getSyncConfig();
  if(!isSyncConfigured(config))return;
  try { const result=await pullCountDataFromGitee(config,'dictation/count_data/'+fn+'/'+historyState.selectedDate); historyState.selectedFileSha=result.sha||''; historyState.charList=(result.records||[]).map(r=>({...r,yes:typeof r.yes==='number'?r.yes:0})); renderHistoryChars(); } catch(e){}
}

async function saveHistoryCountData() {
  if(!historyState.selectedDate||historyState.syncing)return; historyState.syncing=true;
  const config=getSyncConfig(); if(!isSyncConfigured(config)){historyState.syncing=false;return;}
  try { const fn=''+historyState.currentYear+String(historyState.currentMonth).padStart(2,'0'); await pushCountDataRecords(config,fn,historyState.selectedDate,historyState.charList,historyState.selectedFileSha); } catch(e){showToast('保存失败');}
  historyState.syncing=false;
}

function updateYesInCharList(charId, oldYes, newYes) {
  const idStr = String(charId);
  for (let i=0;i<6;i++) {
    let list=[]; try{const d=localStorage.getItem(storageKey(i));if(d)list=JSON.parse(d);}catch(e){continue;}
    if(!Array.isArray(list))continue; const idx=list.findIndex(c=>String(c.id)===idStr);
    if(idx>-1){if(oldYes===1)list[idx].yes=(list[idx].yes||0)-1;else if(oldYes===2)list[idx].wrong=(list[idx].wrong||0)-1;if(newYes===1)list[idx].yes=(list[idx].yes||0)+1;else if(newYes===2)list[idx].wrong=(list[idx].wrong||0)+1;localStorage.setItem(storageKey(i),JSON.stringify(list));appState.gradeData[i]=list;const config=getSyncConfig();if(isSyncConfigured(config))pushToGitee(JSON.stringify(list),config,i).catch(()=>{});break;}
  }
}

// ========== 最新听写页 ==========
let latestState = { dateLabel:'', charList:[], loading:true, folderName:'', fileName:'', fileSha:'', syncing:false };

async function loadLatest() {
  latestState.loading=true;
  const header=document.getElementById('latestDateHeader'); const charArea=document.getElementById('latestCharArea');
  charArea.innerHTML='<div class="empty-tip"><span class="empty-text">加载中...</span></div>';
  const config=getSyncConfig();
  if(!isSyncConfigured(config)){charArea.innerHTML='<div class="empty-tip"><span class="empty-text">请先配置 Gitee 同步</span></div>';latestState.loading=false;return;}
  try {
    const result=await fetchLatestCountData(config);
    latestState.dateLabel=result.dateLabel;latestState.folderName=result.folderName;latestState.fileName=result.fileName;latestState.fileSha=result.sha||'';
    latestState.charList=(result.records||[]).map(r=>({...r,yes:typeof r.yes==='number'?r.yes:0}));
    header.innerHTML=latestState.dateLabel?'<span class="date-header-text">'+latestState.dateLabel+'</span>':'';
    if(latestState.charList.length===0)charArea.innerHTML='<div class="empty-tip"><span class="empty-text">暂无听写记录</span></div>';else renderLatestChars();
  } catch(e){charArea.innerHTML='<div class="empty-tip"><span class="empty-text">加载失败</span></div>';}
  latestState.loading=false;
}

function renderLatestChars() {
  const charArea=document.getElementById('latestCharArea');
  charArea.innerHTML='<div class="char-grid">'+latestState.charList.map((item,idx)=>'<div class="char-card" style="width:90px;'+(item.yes===1?'background:#c9f9d5;':item.yes===2?'background:#f4b0ac;':'')+'">'+(item.py?'<span class="char-pinyin">'+item.py+'</span>':'')+'<span class="char-hanzi">'+item.hz+'</span>'+(item.cy?'<span class="char-ciyu">'+item.cy+'</span>':'')+(item.cyp?'<span class="char-ciyupy">'+item.cyp+'</span>':'')+(item.yes!==0?'<div class="mark-status">'+(item.yes===1?'✅':'❌')+'</div>':'<div class="mark-btns"><button class="mark-btn" data-idx="'+idx+'" data-val="1">✅</button><button class="mark-btn" data-idx="'+idx+'" data-val="2">❌</button></div>')+'</div>').join('')+'</div>';
  charArea.querySelectorAll('.mark-btn').forEach(b=>{b.onclick=()=>latestMarkYes(parseInt(b.dataset.idx),parseInt(b.dataset.val));});
}

async function latestMarkYes(idx, value) {
  const item=latestState.charList[idx]; const ov=item.yes; const nv=ov===value?0:value;
  latestState.charList[idx].yes=nv; updateYesInCharList(item.id,ov,nv); renderLatestChars();
  await saveLatestCountData(); await loadLatest();
}

async function saveLatestCountData() {
  if(!latestState.folderName||!latestState.fileName||latestState.syncing)return; latestState.syncing=true;
  const config=getSyncConfig(); if(!isSyncConfigured(config)){latestState.syncing=false;return;}
  try{await pushCountDataRecords(config,latestState.folderName,latestState.fileName,latestState.charList,latestState.fileSha);}catch(e){showToast('保存失败');}
  latestState.syncing=false;
}

// ========== 初始化 ==========
function init() {
  loadLocalData();
  initStatistics();
  initCharacters();
  initDictation();
  initMine();
  document.getElementById('navBack').onclick = () => { switchTab('statistics'); };
  document.querySelectorAll('.tab-item').forEach(item => {
    item.onclick = () => switchTab(item.dataset.tab);
  });
  loadAllDataFromGitee();
  switchTab('statistics');
}

window.addEventListener('DOMContentLoaded', init);


