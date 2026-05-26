'use strict';

document.addEventListener('DOMContentLoaded', function() {

// ── Storage Keys ────────────────────────────────────────────────────────────
const KEY_PROBANDEN = 'sl_probanden';
const KEY_SESSIONS  = 'sl_sessions';
const KEY_SETTINGS  = 'sl_settings';
const KEY_SCENARIOS = 'sl_scenarios';
const KEY_TAGS      = 'sl_tags';

const DEFAULT_SCENARIOS = [
  { id: 'sc_vr', name: 'Szenario VR Welt',       abbr: 'VR', icon: '🥽' },
  { id: 'sc_vu', name: 'Szenario Verkehrsunfall', abbr: 'VU', icon: '🚗' },
  { id: 'sc_kh', name: 'Szenario Krankenhaus',    abbr: 'KH', icon: '🏥' },
];

const DEFAULT_TAGS = [
  'Szenario verkürzt',
  'Techn. Fehler',
  'Proband abgebrochen',
  'Setup-Abweichung',
  'Proband unsicher',
  'Szenario wiederholt',
];

// ── State ────────────────────────────────────────────────────────────────────
let probanden        = [];
let sessions         = [];
let settings         = { deviceLabel: '', lastExport: null };
let scenarios        = [];
let tags             = [];
let selectedScenId   = '';
let timerInterval    = null;
let timerStart       = null;
let timerElapsed     = 0;
let sessionStartISO  = null;
let sessionEndISO    = null;
let sessionRunning   = false;
let detailSessionId  = null;
let editingProbandId = null;
let confirmCallback  = null;

// ── Persistence ──────────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem(KEY_PROBANDEN, JSON.stringify(probanden));
    localStorage.setItem(KEY_SESSIONS,  JSON.stringify(sessions));
    localStorage.setItem(KEY_SETTINGS,  JSON.stringify(settings));
    localStorage.setItem(KEY_SCENARIOS, JSON.stringify(scenarios));
    localStorage.setItem(KEY_TAGS,      JSON.stringify(tags));
  } catch(e) { showToast('⚠ Speicherfehler'); }
}

function load() {
  try {
    const p  = localStorage.getItem(KEY_PROBANDEN);
    const s  = localStorage.getItem(KEY_SESSIONS);
    const st = localStorage.getItem(KEY_SETTINGS);
    const sc = localStorage.getItem(KEY_SCENARIOS);
    const tg = localStorage.getItem(KEY_TAGS);
    if (p)  probanden = JSON.parse(p);
    if (s)  sessions  = JSON.parse(s);
    if (st) settings  = { ...settings, ...JSON.parse(st) };
    scenarios = sc ? JSON.parse(sc) : deepCopy(DEFAULT_SCENARIOS);
    if (!scenarios.length) scenarios = deepCopy(DEFAULT_SCENARIOS);
    tags = tg ? JSON.parse(tg) : [...DEFAULT_TAGS];
    if (!tags.length) tags = [...DEFAULT_TAGS];
  } catch(e) {
    scenarios = deepCopy(DEFAULT_SCENARIOS);
    tags = [...DEFAULT_TAGS];
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function deepCopy(x) { return JSON.parse(JSON.stringify(x)); }

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
}

function localTimeStr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}
function localDateStr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function localDatetimeStr(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE') + '  ' +
         d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function isoToTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return String(d.getHours()).padStart(2,'0') + ':' +
         String(d.getMinutes()).padStart(2,'0') + ':' +
         String(d.getSeconds()).padStart(2,'0');
}

function rebuildISO(originalISO, timeStr) {
  if (!originalISO || !timeStr) return originalISO || null;
  const orig  = new Date(originalISO);
  const parts = timeStr.split(':');
  return new Date(
    orig.getFullYear(), orig.getMonth(), orig.getDate(),
    parseInt(parts[0],10)||0, parseInt(parts[1],10)||0, parseInt(parts[2],10)||0, 0
  ).toISOString();
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, dur = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), dur);
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  document.getElementById('confirm-overlay').classList.remove('hidden');
  confirmCallback = onOk;
}
document.getElementById('confirm-ok').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (typeof confirmCallback === 'function') confirmCallback();
  confirmCallback = null;
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.add('hidden');
  confirmCallback = null;
});

// ── Navigation ────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name)?.classList.add('active');
  document.querySelector(`.nav-btn[data-screen="${name}"]`)?.classList.add('active');
  if (name === 'session')   renderSessionScreen();
  if (name === 'log')       renderLog();
  if (name === 'export')    renderExport();
  if (name === 'probanden') renderProbanden();
}
document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => showScreen(btn.dataset.screen))
);

// ══════════════════════════════════════════════════════════════════════════════
// TEILNEHMENDE
// ══════════════════════════════════════════════════════════════════════════════
function renderProbanden(filter = '') {
  const list  = document.getElementById('proband-list');
  const empty = document.getElementById('proband-empty');
  const label = document.getElementById('proband-count-label');
  const lower = filter.toLowerCase();
  const filtered = probanden.filter(p =>
    p.pseudo.toLowerCase().includes(lower) || String(p.sensor).includes(lower)
  );
  label.textContent = `TEILNEHMENDE (${filtered.length})`;
  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = filtered.map(p => {
    const done     = sessions.filter(s => s.probandId === p.id).length;
    const initials = p.pseudo.slice(-2).toUpperCase();
    return `<button class="proband-item" data-id="${esc(p.id)}">
      <div class="avatar">${esc(initials)}</div>
      <div class="proband-info">
        <div class="proband-name">${esc(p.pseudo)}</div>
        <div class="proband-sub">SNR: ${esc(p.sensor)}${p.note ? '  ·  ' + esc(p.note) : ''}</div>
      </div>
      <span class="badge badge-count">${done} Sitzung${done !== 1 ? 'en' : ''}</span>
    </button>`;
  }).join('');
  list.querySelectorAll('.proband-item').forEach(el =>
    el.addEventListener('click', () => openProbandEdit(el.dataset.id))
  );
}

document.getElementById('search-input').addEventListener('input', e => renderProbanden(e.target.value));

document.getElementById('btn-add-proband').addEventListener('click', () =>
  document.getElementById('add-form').classList.toggle('hidden')
);
document.getElementById('btn-cancel-proband').addEventListener('click', () => {
  document.getElementById('add-form').classList.add('hidden');
  clearAddForm();
});
document.getElementById('btn-save-proband').addEventListener('click', saveNewProband);

function saveNewProband() {
  const pseudo = document.getElementById('inp-pseudo').value.trim();
  const sRaw   = document.getElementById('inp-sensor').value.trim();
  const note   = document.getElementById('inp-note').value.trim();
  if (!pseudo) { showToast('⚠ Pseudonym eingeben'); return; }
  if (!sRaw)   { showToast('⚠ Sensoriknummer eingeben'); return; }
  const sensor = parseInt(sRaw, 10);
  if (isNaN(sensor) || sensor < 1 || sensor > 12) { showToast('⚠ Sensoriknummer 1–12'); return; }
  if (probanden.some(p => String(p.sensor) === String(sensor))) { showToast('⚠ SNR ' + sensor + ' vergeben'); return; }
  if (probanden.some(p => p.pseudo.toLowerCase() === pseudo.toLowerCase())) { showToast('⚠ Pseudonym vergeben'); return; }
  probanden.push({ id: uid(), pseudo, sensor, note, createdAt: new Date().toISOString() });
  save();
  clearAddForm();
  document.getElementById('add-form').classList.add('hidden');
  renderProbanden(document.getElementById('search-input').value);
  showToast('✓ ' + pseudo + ' angelegt');
}
function clearAddForm() {
  ['inp-pseudo','inp-sensor','inp-note'].forEach(id => { document.getElementById(id).value = ''; });
}

// ── Teilnehmende Edit/Delete ──────────────────────────────────────────────────
function openProbandEdit(id) {
  const p = probanden.find(x => x.id === id);
  if (!p) return;
  editingProbandId = id;
  document.getElementById('edit-pseudo').value = p.pseudo;
  document.getElementById('edit-sensor').value = p.sensor;
  document.getElementById('edit-note').value   = p.note || '';
  document.getElementById('proband-edit-overlay').classList.remove('hidden');
}
function closeProbandEdit() {
  document.getElementById('proband-edit-overlay').classList.add('hidden');
  editingProbandId = null;
}
document.getElementById('proband-edit-close').addEventListener('click', closeProbandEdit);
document.getElementById('proband-edit-cancel').addEventListener('click', closeProbandEdit);
document.getElementById('proband-edit-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('proband-edit-overlay')) closeProbandEdit();
});

document.getElementById('btn-save-proband-edit').addEventListener('click', () => {
  if (!editingProbandId) return;
  const idx    = probanden.findIndex(x => x.id === editingProbandId);
  if (idx === -1) return;
  const pseudo = document.getElementById('edit-pseudo').value.trim();
  const sRaw   = document.getElementById('edit-sensor').value.trim();
  const note   = document.getElementById('edit-note').value.trim();
  if (!pseudo) { showToast('⚠ Pseudonym eingeben'); return; }
  if (!sRaw)   { showToast('⚠ Sensoriknummer eingeben'); return; }
  const sensor = parseInt(sRaw, 10);
  if (isNaN(sensor) || sensor < 1 || sensor > 12) { showToast('⚠ Sensoriknummer 1–12'); return; }
  if (probanden.some((p,i) => i !== idx && String(p.sensor) === String(sensor))) { showToast('⚠ SNR vergeben'); return; }
  if (probanden.some((p,i) => i !== idx && p.pseudo.toLowerCase() === pseudo.toLowerCase())) { showToast('⚠ Pseudonym vergeben'); return; }
  probanden[idx] = { ...probanden[idx], pseudo, sensor, note };
  sessions = sessions.map(s => s.probandId === editingProbandId ? { ...s, pseudo, sensor } : s);
  save();
  closeProbandEdit();
  renderProbanden(document.getElementById('search-input').value);
  buildProbandSelect();
  showToast('✓ Gespeichert');
});

document.getElementById('btn-delete-proband').addEventListener('click', () => {
  if (!editingProbandId) return;
  const idToDelete = editingProbandId;
  const p     = probanden.find(x => x.id === idToDelete);
  const count = sessions.filter(s => s.probandId === idToDelete).length;
  const warn  = count > 0 ? ` ${count} Sitzung(en) bleiben erhalten.` : '';
  showConfirm('Person löschen',
    `"${p ? p.pseudo : ''}" löschen?${warn}`,
    () => {
      probanden = probanden.filter(x => x.id !== idToDelete);
      save();
      closeProbandEdit();
      renderProbanden(document.getElementById('search-input').value);
      buildProbandSelect();
      showToast('Person gelöscht');
    }
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════════════════════════════════════
function buildScenarioGrid() {
  const grid = document.getElementById('scenario-grid');
  if (!scenarios.length) {
    grid.innerHTML = '<div style="color:var(--text3);font-size:12px">Keine Szenarien — unter ⚙ Verwalten hinzufügen</div>';
    return;
  }
  if (!selectedScenId || !scenarios.find(s => s.id === selectedScenId)) {
    selectedScenId = scenarios[0].id;
  }
  grid.innerHTML = scenarios.map(sc => `
    <button class="scenario-btn${sc.id === selectedScenId ? ' selected' : ''}" data-scid="${esc(sc.id)}">
      <span class="sc-icon">${esc(sc.icon)}</span>
      <span>${esc(sc.name)}</span>
      <span class="sc-abbr">${esc(sc.abbr)}</span>
    </button>`).join('');
  grid.querySelectorAll('.scenario-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      selectedScenId = btn.dataset.scid;
      grid.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    })
  );
}

function buildProbandSelect() {
  const sel = document.getElementById('sel-proband');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Teilnehmende wählen —</option>' +
    probanden.map(p => `<option value="${esc(p.id)}">SNR ${esc(p.sensor)}  (${esc(p.pseudo)})</option>`).join('');
  if (probanden.some(p => p.id === cur)) sel.value = cur;
  updateProbandBadge();
}

function updateProbandBadge() {
  const sel   = document.getElementById('sel-proband');
  const badge = document.getElementById('proband-badge');
  const p     = probanden.find(x => x.id === sel.value);
  if (p) {
    badge.textContent = `✓  ${p.pseudo}${p.note ? '  ·  ' + p.note : ''}`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
document.getElementById('sel-proband').addEventListener('change', updateProbandBadge);

function renderSessionScreen() {
  buildProbandSelect();
  buildScenarioGrid();
  if (!sessionRunning && !sessionEndISO) renderTagRow('deviation-tags');
  updateTimerUI();
}

// ── Tags ──────────────────────────────────────────────────────────────────────
function renderTagRow(containerId, selectedTags = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = tags.map(tag => `
    <button class="tag${selectedTags.includes(tag) ? ' active' : ''}" data-tag="${esc(tag)}">${esc(tag)}</button>
  `).join('');
  container.querySelectorAll('.tag').forEach(btn =>
    btn.addEventListener('click', () => btn.classList.toggle('active'))
  );
}
function getActiveTags(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .tag.active`)).map(t => t.dataset.tag);
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer() {
  if (sessionRunning) return;
  if (!document.getElementById('sel-proband').value) { showToast('⚠ Teilnehmende wählen'); return; }
  if (!selectedScenId) { showToast('⚠ Szenario wählen'); return; }
  timerStart      = Date.now();
  timerElapsed    = 0;
  sessionRunning  = true;
  sessionStartISO = new Date().toISOString();
  sessionEndISO   = null;
  document.getElementById('save-card').classList.add('hidden');
  timerInterval = setInterval(() => {
    timerElapsed = Math.floor((Date.now() - timerStart) / 1000);
    document.getElementById('timer-display').textContent = formatTime(timerElapsed);
  }, 500);
  updateTimerUI();
}

function stopTimer() {
  if (!sessionRunning) return;
  clearInterval(timerInterval);
  timerInterval  = null;
  sessionRunning = false;
  sessionEndISO  = new Date().toISOString();
  timerElapsed   = Math.max(0, Math.floor((Date.now() - timerStart) / 1000));
  document.getElementById('save-card').classList.remove('hidden');
  updateTimerUI();
  setTimeout(() =>
    document.getElementById('save-card').scrollIntoView({ behavior:'smooth', block:'nearest' }), 100
  );
}

function updateTimerUI() {
  const status   = document.getElementById('timer-status');
  const meta     = document.getElementById('timer-meta');
  const btnStart = document.getElementById('btn-start');
  const btnStop  = document.getElementById('btn-stop');
  const display  = document.getElementById('timer-display');
  if (sessionRunning) {
    status.innerHTML = '<span class="status-running">● LÄUFT</span>';
    const sc = scenarios.find(s => s.id === selectedScenId);
    meta.textContent = 'Start: ' + localTimeStr(sessionStartISO) + (sc ? '  ·  ' + sc.abbr : '');
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
  } else if (sessionEndISO) {
    status.innerHTML = '<span class="status-done">✓ Abgeschlossen</span>';
    meta.textContent = localTimeStr(sessionStartISO) + ' → ' + localTimeStr(sessionEndISO) + '  ·  ' + formatTime(timerElapsed);
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
    display.textContent = formatTime(timerElapsed);
  } else {
    status.innerHTML = '<span class="status-idle">Bereit</span>';
    meta.textContent = '';
    display.textContent = '00:00';
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
  }
}

document.getElementById('btn-start').addEventListener('click', startTimer);
document.getElementById('btn-stop').addEventListener('click', stopTimer);

document.getElementById('btn-save-session').addEventListener('click', () => {
  const probandId = document.getElementById('sel-proband').value;
  if (!probandId)       { showToast('⚠ Keine Teilnehmenden'); return; }
  if (!sessionStartISO) { showToast('⚠ Nicht gestartet'); return; }
  if (!sessionEndISO)   { showToast('⚠ Nicht gestoppt'); return; }
  const p  = probanden.find(x => x.id === probandId);
  const sc = scenarios.find(x => x.id === selectedScenId);
  const deviations = getActiveTags('deviation-tags');
  const notes      = document.getElementById('session-notes').value.trim();
  sessions.push({
    id: uid(), probandId,
    pseudo:       p  ? p.pseudo  : '?',
    sensor:       p  ? p.sensor  : '?',
    scenarioId:   selectedScenId,
    scenarioName: sc ? sc.name   : '?',
    scenarioAbbr: sc ? sc.abbr   : '?',
    date:         localDateStr(sessionStartISO),
    startISO:     sessionStartISO,
    endISO:       sessionEndISO,
    duration_s:   timerElapsed,
    deviations, notes,
    deviceLabel:  settings.deviceLabel || '',
    createdAt:    new Date().toISOString()
  });
  save();
  sessionStartISO = null; sessionEndISO = null; timerElapsed = 0;
  document.getElementById('save-card').classList.add('hidden');
  renderTagRow('deviation-tags');
  document.getElementById('session-notes').value = '';
  updateTimerUI();
  showToast('✓ Sitzung gespeichert');
  setTimeout(() => showScreen('log'), 600);
});

// ── Scenario Manager ──────────────────────────────────────────────────────────
document.getElementById('btn-manage-scenarios').addEventListener('click', () => {
  renderScenarioManager();
  document.getElementById('scenario-overlay').classList.remove('hidden');
});
document.getElementById('scenario-close').addEventListener('click', () => {
  document.getElementById('scenario-overlay').classList.add('hidden');
  buildScenarioGrid();
});

function renderScenarioManager() {
  const list = document.getElementById('scenario-list-modal');
  if (!scenarios.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Keine Szenarien</div>';
    return;
  }
  list.innerHTML = scenarios.map((sc, i) => `
    <div class="scenario-manager-item">
      <span class="sm-icon">${esc(sc.icon)}</span>
      <div class="sm-info">
        <div class="sm-name">${esc(sc.name)}</div>
        <div class="sm-abbr">${esc(sc.abbr)}</div>
      </div>
      <div class="sm-btns">
        ${i > 0 ? `<button class="sm-btn" data-action="up" data-idx="${i}">↑</button>` : ''}
        <button class="sm-btn del" data-action="del" data-idx="${i}">✕</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-action]').forEach(btn =>
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'del') {
        if (scenarios.length <= 1) { showToast('⚠ Mindestens 1 Szenario'); return; }
        showConfirm('Szenario löschen', `"${scenarios[idx].name}" löschen?`, () => {
          if (selectedScenId === scenarios[idx].id) selectedScenId = '';
          scenarios.splice(idx, 1); save(); renderScenarioManager();
        });
      } else if (btn.dataset.action === 'up') {
        [scenarios[idx], scenarios[idx-1]] = [scenarios[idx-1], scenarios[idx]];
        save(); renderScenarioManager();
      }
    })
  );
}

document.getElementById('btn-add-scenario').addEventListener('click', () => {
  const name = document.getElementById('new-scenario-name').value.trim();
  const abbr = document.getElementById('new-scenario-abbr').value.trim().toUpperCase();
  const icon = document.getElementById('new-scenario-icon').value.trim() || '📋';
  if (!name) { showToast('⚠ Name eingeben'); return; }
  if (!abbr) { showToast('⚠ Abkürzung eingeben'); return; }
  if (scenarios.some(s => s.abbr === abbr)) { showToast('⚠ Abkürzung vergeben'); return; }
  scenarios.push({ id: uid(), name, abbr, icon });
  save();
  document.getElementById('new-scenario-name').value = '';
  document.getElementById('new-scenario-abbr').value = '';
  document.getElementById('new-scenario-icon').value = '';
  renderScenarioManager();
  showToast('✓ Szenario hinzugefügt');
});

// ── Tag Manager ───────────────────────────────────────────────────────────────
document.getElementById('btn-manage-tags').addEventListener('click', () => {
  renderTagManager();
  document.getElementById('tag-overlay').classList.remove('hidden');
});
document.getElementById('tag-close').addEventListener('click', () => {
  document.getElementById('tag-overlay').classList.add('hidden');
  renderTagRow('deviation-tags');
});
document.getElementById('tag-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('tag-overlay')) {
    document.getElementById('tag-overlay').classList.add('hidden');
    renderTagRow('deviation-tags');
  }
});

function renderTagManager() {
  const list = document.getElementById('tag-list-modal');
  if (!tags.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Keine Tags</div>';
    return;
  }
  list.innerHTML = tags.map((tag, i) => `
    <div class="scenario-manager-item" data-idx="${i}">
      <div class="sm-info"><div class="sm-name">${esc(tag)}</div></div>
      <div class="sm-btns">
        <button class="sm-btn" data-action="edit" data-idx="${i}">✏</button>
        <button class="sm-btn del" data-action="del" data-idx="${i}">✕</button>
      </div>
    </div>
    <div class="tag-edit-row hidden" id="tag-edit-row-${i}">
      <input type="text" class="tag-edit-input" id="tag-edit-input-${i}" value="${esc(tag)}" autocorrect="off">
      <div class="btn-row" style="margin-top:6px">
        <button class="btn btn-primary flex-1" data-action="save" data-idx="${i}">✓ Speichern</button>
        <button class="btn btn-ghost" data-action="cancel-edit" data-idx="${i}">Abbrechen</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-action]').forEach(btn =>
    btn.addEventListener('click', () => {
      const idx    = parseInt(btn.dataset.idx, 10);
      const action = btn.dataset.action;
      if (action === 'del') {
        if (tags.length <= 1) { showToast('⚠ Mindestens 1 Tag'); return; }
        showConfirm('Tag löschen', `"${tags[idx]}" löschen?`, () => {
          tags.splice(idx, 1); save(); renderTagManager();
        });
      } else if (action === 'edit') {
        document.getElementById(`tag-edit-row-${idx}`).classList.remove('hidden');
        document.getElementById(`tag-edit-input-${idx}`).focus();
      } else if (action === 'cancel-edit') {
        document.getElementById(`tag-edit-row-${idx}`).classList.add('hidden');
      } else if (action === 'save') {
        const val = document.getElementById(`tag-edit-input-${idx}`).value.trim();
        if (!val) { showToast('⚠ Bezeichnung eingeben'); return; }
        if (tags.some((t,i) => i !== idx && t.toLowerCase() === val.toLowerCase())) { showToast('⚠ Tag vergeben'); return; }
        tags[idx] = val; save(); renderTagManager();
        showToast('✓ Tag aktualisiert');
      }
    })
  );
}

document.getElementById('btn-add-tag').addEventListener('click', () => {
  const val = document.getElementById('new-tag-label').value.trim();
  if (!val) { showToast('⚠ Bezeichnung eingeben'); return; }
  if (tags.some(t => t.toLowerCase() === val.toLowerCase())) { showToast('⚠ Tag vergeben'); return; }
  tags.push(val); save();
  document.getElementById('new-tag-label').value = '';
  renderTagManager();
  showToast('✓ Tag hinzugefügt');
});

// ══════════════════════════════════════════════════════════════════════════════
// LOG
// ══════════════════════════════════════════════════════════════════════════════
function buildLogFilters() {
  const stSel = document.getElementById('log-filter-station');
  const prSel = document.getElementById('log-filter-proband');
  const stVal = stSel.value;
  const prVal = prSel.value;
  stSel.innerHTML = '<option value="all">Alle Szenarien</option>' +
    scenarios.map(sc => `<option value="${esc(sc.id)}">${esc(sc.icon)} ${esc(sc.name)}</option>`).join('');
  prSel.innerHTML = '<option value="all">Alle Teilnehmenden</option>' +
    probanden.map(p => `<option value="${esc(p.id)}">${esc(p.pseudo)} (${esc(p.sensor)})</option>`).join('');
  if (scenarios.find(s => s.id === stVal)) stSel.value = stVal;
  if (probanden.find(p => p.id === prVal)) prSel.value = prVal;
}

function getFilteredSessions() {
  const stVal = document.getElementById('log-filter-station').value;
  const prVal = document.getElementById('log-filter-proband').value;
  return sessions
    .filter(s => (stVal === 'all' || s.scenarioId === stVal) && (prVal === 'all' || s.probandId === prVal))
    .slice().reverse();
}

function renderLog() {
  buildLogFilters();
  const list     = document.getElementById('log-list');
  const empty    = document.getElementById('log-empty');
  const label    = document.getElementById('log-count-label');
  const filtered = getFilteredSessions();
  label.textContent = `SITZUNGEN (${filtered.length})`;
  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = filtered.map(s => {
    const hasDev  = s.deviations && s.deviations.length > 0;
    const devLine = hasDev ? `<div class="log-dev">⚑  ${esc(s.deviations.join('  ·  '))}</div>` : '';
    const sc   = scenarios.find(x => x.id === s.scenarioId);
    const icon = sc ? sc.icon + ' ' : '';
    const abbr = s.scenarioAbbr || s.scenarioName || '?';
    return `<button class="log-entry${hasDev ? ' has-deviation' : ''}" data-id="${esc(s.id)}">
      <div class="log-row-top">
        <span class="log-id">${esc(s.pseudo)}  ·  ${icon}${esc(abbr)}</span>
        <span class="log-time">${esc(localTimeStr(s.startISO))} – ${esc(localTimeStr(s.endISO))}</span>
      </div>
      <div class="log-meta">${esc(s.date)}  ·  Dauer: ${esc(formatTime(s.duration_s || 0))}</div>
      ${devLine}
    </button>`;
  }).join('');
  list.querySelectorAll('.log-entry').forEach(el =>
    el.addEventListener('click', () => openSessionDetail(el.dataset.id))
  );
}

document.getElementById('log-filter-station').addEventListener('change', renderLog);
document.getElementById('log-filter-proband').addEventListener('change', renderLog);

// ── Session Detail ────────────────────────────────────────────────────────────
function openSessionDetail(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  detailSessionId = id;
  const sc = scenarios.find(x => x.id === s.scenarioId);
  document.getElementById('detail-title').textContent = s.pseudo + '  ·  ' + (sc ? sc.abbr : s.scenarioAbbr || '?');
  document.getElementById('detail-content').innerHTML = [
    ['Datum',          s.date],
    ['Pseudonym',      s.pseudo],
    ['Sensoriknummer', s.sensor],
    ['Szenario',       (sc ? sc.icon + ' ' : '') + (sc ? sc.name : s.scenarioName || '?')],
    ['Start',          localTimeStr(s.startISO)],
    ['Ende',           localTimeStr(s.endISO)],
    ['Dauer',          formatTime(s.duration_s || 0)],
    ['Abweichungen',   s.deviations?.length ? s.deviations.join(', ') : '—'],
    ['Anmerkungen',    s.notes || '—'],
    ['Gerät/Betreuung',s.deviceLabel || '—'],
  ].map(([k,v]) => `<div class="detail-row"><div class="detail-key">${esc(k)}</div><div class="detail-val">${esc(v)}</div></div>`).join('');
  document.getElementById('detail-overlay').classList.remove('hidden');
}

document.getElementById('detail-close').addEventListener('click', closeDetailOverlay);
document.getElementById('detail-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('detail-overlay')) closeDetailOverlay();
});
function closeDetailOverlay() {
  document.getElementById('detail-overlay').classList.add('hidden');
  detailSessionId = null;
}

document.getElementById('btn-delete-session').addEventListener('click', () => {
  if (!detailSessionId) return;
  const idToDelete = detailSessionId;
  const s = sessions.find(x => x.id === idToDelete);
  showConfirm('Sitzung löschen',
    `Sitzung von ${s ? s.pseudo : ''} löschen?`,
    () => {
      sessions = sessions.filter(x => x.id !== idToDelete);
      save();
      document.getElementById('detail-overlay').classList.add('hidden');
      document.getElementById('edit-overlay').classList.add('hidden');
      detailSessionId = null;
      renderLog();
      showToast('Sitzung gelöscht');
    }
  );
});

document.getElementById('btn-edit-session').addEventListener('click', () => {
  if (!detailSessionId) return;
  openEditSession(detailSessionId);
});

function openEditSession(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  const prSel = document.getElementById('edit-proband');
  prSel.innerHTML = probanden.map(p =>
    `<option value="${esc(p.id)}"${p.id === s.probandId ? ' selected' : ''}>${esc(p.pseudo)} (${esc(p.sensor)})</option>`
  ).join('');
  if (!probanden.find(p => p.id === s.probandId)) {
    prSel.innerHTML = `<option value="${esc(s.probandId)}" selected>${esc(s.pseudo)} (gelöscht)</option>` + prSel.innerHTML;
  }
  const scSel = document.getElementById('edit-scenario');
  scSel.innerHTML = scenarios.map(sc =>
    `<option value="${esc(sc.id)}"${sc.id === s.scenarioId ? ' selected' : ''}>${esc(sc.icon)} ${esc(sc.name)}</option>`
  ).join('');
  document.getElementById('edit-date-info').textContent = '📅 ' + s.date + ' (Datum nicht änderbar)';
  document.getElementById('edit-start-time').value = isoToTimeInput(s.startISO);
  document.getElementById('edit-end-time').value   = isoToTimeInput(s.endISO);
  document.getElementById('edit-notes').value = s.notes || '';
  renderTagRow('edit-deviation-tags', s.deviations || []);
  document.getElementById('detail-overlay').classList.add('hidden');
  document.getElementById('edit-overlay').classList.remove('hidden');
}

document.getElementById('edit-close').addEventListener('click', () =>
  document.getElementById('edit-overlay').classList.add('hidden')
);
document.getElementById('edit-cancel').addEventListener('click', () =>
  document.getElementById('edit-overlay').classList.add('hidden')
);
document.getElementById('edit-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('edit-overlay'))
    document.getElementById('edit-overlay').classList.add('hidden');
});

document.getElementById('btn-save-edit').addEventListener('click', () => {
  if (!detailSessionId) { showToast('⚠ Keine Sitzung ausgewählt'); return; }
  const idx = sessions.findIndex(x => x.id === detailSessionId);
  if (idx === -1) return;
  const s          = sessions[idx];
  const probandId  = document.getElementById('edit-proband').value;
  const scenarioId = document.getElementById('edit-scenario').value;
  const startTime  = document.getElementById('edit-start-time').value;
  const endTime    = document.getElementById('edit-end-time').value;
  const notes      = document.getElementById('edit-notes').value.trim();
  const deviations = getActiveTags('edit-deviation-tags');
  if (!startTime) { showToast('⚠ Startzeit eingeben'); return; }
  if (!endTime)   { showToast('⚠ Endzeit eingeben'); return; }
  const newStartISO = rebuildISO(s.startISO, startTime);
  const newEndISO   = rebuildISO(s.endISO || s.startISO, endTime);
  if (!newStartISO || !newEndISO) { showToast('⚠ Ungültige Zeit'); return; }
  if (new Date(newEndISO) <= new Date(newStartISO)) { showToast('⚠ Ende muss nach Start liegen'); return; }
  const dur = Math.round((new Date(newEndISO) - new Date(newStartISO)) / 1000);
  const p   = probanden.find(x => x.id === probandId);
  const sc  = scenarios.find(x => x.id === scenarioId);
  sessions[idx] = {
    ...s, probandId,
    pseudo:       p  ? p.pseudo : s.pseudo,
    sensor:       p  ? p.sensor : s.sensor,
    scenarioId,
    scenarioName: sc ? sc.name  : s.scenarioName,
    scenarioAbbr: sc ? sc.abbr  : s.scenarioAbbr,
    startISO: newStartISO, endISO: newEndISO,
    date: localDateStr(newStartISO),
    duration_s: dur, notes, deviations,
    editedAt: new Date().toISOString()
  };
  save();
  document.getElementById('edit-overlay').classList.add('hidden');
  detailSessionId = null;
  renderLog();
  showToast('✓ Sitzung aktualisiert');
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════════════════════
function buildExportFilters() {
  const sel = document.getElementById('export-filter-station');
  const cur = sel.value;
  sel.innerHTML = '<option value="all">Alle Szenarien</option>' +
    scenarios.map(sc => `<option value="${esc(sc.id)}">${esc(sc.icon)} ${esc(sc.name)}</option>`).join('');
  if (scenarios.find(s => s.id === cur)) sel.value = cur;
}
function getExportSessions() {
  const v = document.getElementById('export-filter-station').value;
  return v === 'all' ? sessions : sessions.filter(s => s.scenarioId === v);
}
function renderStats() {
  const data  = getExportSessions();
  const total = data.length;
  const avg   = total > 0 ? Math.round(data.reduce((a,s) => a + (s.duration_s||0), 0) / total) : 0;
  const devs  = data.filter(s => s.deviations?.length > 0).length;
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Sitzungen</div></div>
    <div class="stat-card"><div class="stat-value">${formatTime(avg)}</div><div class="stat-label">⌀ Dauer</div></div>
    <div class="stat-card"><div class="stat-value">${devs}</div><div class="stat-label">Abweich.</div></div>`;
}
function renderExport() {
  buildExportFilters();
  renderStats();
  document.getElementById('inp-device-label').value = settings.deviceLabel || '';
  document.getElementById('last-export-info').textContent =
    settings.lastExport ? localDatetimeStr(settings.lastExport) : 'Noch kein Export';
}
document.getElementById('export-filter-station').addEventListener('change', renderStats);
document.getElementById('inp-device-label').addEventListener('change', e => {
  settings.deviceLabel = e.target.value.trim(); save();
});

function escCsv(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
document.getElementById('btn-export-csv').addEventListener('click', () => {
  const data = getExportSessions();
  if (!data.length) { showToast('⚠ Keine Daten'); return; }
  const hdr = ['ID','Datum','Pseudonym','Sensoriknummer','Szenario','Szenario_Abkuerzung',
                'Start_ISO','Ende_ISO','Start_Uhrzeit','Ende_Uhrzeit',
                'Dauer_s','Dauer_mm_ss','Abweichungen','Anmerkungen','Geraet_Betreuung'];
  const rows = data.map(s => [
    s.id, s.date, s.pseudo, s.sensor,
    s.scenarioName||'?', s.scenarioAbbr||'?',
    s.startISO, s.endISO,
    localTimeStr(s.startISO), localTimeStr(s.endISO),
    s.duration_s||0, formatTime(s.duration_s||0),
    (s.deviations||[]).join('; '), s.notes||'', s.deviceLabel||''
  ].map(escCsv).join(','));
  downloadFile('\uFEFF' + [hdr.join(','),...rows].join('\r\n'), `studylog_${dateSlug()}.csv`, 'text/csv;charset=utf-8;');
  recordExport(); showToast('✓ CSV: ' + data.length + ' Sitzungen');
});
document.getElementById('btn-export-json').addEventListener('click', () => {
  const data = getExportSessions();
  if (!data.length) { showToast('⚠ Keine Daten'); return; }
  const enriched = data.map(s => ({ ...s, start_local: localTimeStr(s.startISO), end_local: localTimeStr(s.endISO) }));
  downloadFile(JSON.stringify(enriched, null, 2), `studylog_${dateSlug()}.json`, 'application/json');
  recordExport(); showToast('✓ JSON: ' + data.length + ' Sitzungen');
});
function dateSlug() { return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function downloadFile(content, filename, type) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type })), download: filename
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function recordExport() {
  settings.lastExport = new Date().toISOString(); save();
  document.getElementById('last-export-info').textContent = localDatetimeStr(settings.lastExport);
}
document.getElementById('btn-clear-data').addEventListener('click', () => {
  showConfirm('⚠ Alle Daten löschen',
    'Alle Teilnehmenden und Sitzungsdaten werden unwiderruflich gelöscht. Vorher exportieren!',
    () => {
      probanden = []; sessions = []; settings.lastExport = null;
      save(); renderProbanden(); renderLog(); renderExport();
      showToast('Alle Daten gelöscht');
    });
});

// ── INIT ──────────────────────────────────────────────────────────────────────
load();
if (scenarios.length) selectedScenId = scenarios[0].id;
renderProbanden();
buildScenarioGrid();
buildProbandSelect();
renderTagRow('deviation-tags');
document.getElementById('topbar-sub').textContent =
  new Date().toLocaleDateString('de-DE', { weekday:'short', year:'numeric', month:'short', day:'numeric' });

}); // end DOMContentLoaded
