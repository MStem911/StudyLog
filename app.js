'use strict';

// ── Storage Keys ───────────────────────────────────────────────────────────
const KEY_PROBANDEN = 'sl_probanden';
const KEY_SESSIONS  = 'sl_sessions';
const KEY_SETTINGS  = 'sl_settings';
const KEY_STATIONS  = 'sl_stations';

// ── State ──────────────────────────────────────────────────────────────────
let probanden  = [];
let sessions   = [];
let settings   = { deviceLabel: '', lastExport: null };
let stations   = ['A', 'B', 'C', 'D', 'E'];

let currentScreen    = 'probanden';
let selectedStation  = stations[0];
let timerInterval    = null;
let timerStart       = null;
let timerElapsed     = 0;  // seconds
let sessionStartISO  = null;
let sessionEndISO    = null;
let sessionRunning   = false;

let detailSessionId  = null;
let confirmCallback  = null;

// ── Persistence ────────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem(KEY_PROBANDEN, JSON.stringify(probanden));
    localStorage.setItem(KEY_SESSIONS,  JSON.stringify(sessions));
    localStorage.setItem(KEY_SETTINGS,  JSON.stringify(settings));
    localStorage.setItem(KEY_STATIONS,  JSON.stringify(stations));
  } catch (e) {
    showToast('⚠ Speicherfehler: ' + e.message);
  }
}

function load() {
  try {
    const p = localStorage.getItem(KEY_PROBANDEN);
    const s = localStorage.getItem(KEY_SESSIONS);
    const st = localStorage.getItem(KEY_SETTINGS);
    const sta = localStorage.getItem(KEY_STATIONS);
    if (p)   probanden = JSON.parse(p);
    if (s)   sessions  = JSON.parse(s);
    if (st)  settings  = { ...settings, ...JSON.parse(st) };
    if (sta) stations  = JSON.parse(sta);
  } catch (e) {
    console.error('Load error', e);
  }
}

// ── Utility ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE') + '  ' +
         d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE');
}

function formatTimeOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showToast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), duration);
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Confirm Dialog ─────────────────────────────────────────────────────────
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

// ── Navigation ─────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const screen = document.getElementById('screen-' + name);
  if (screen) screen.classList.add('active');

  const btn = document.querySelector(`.nav-btn[data-screen="${name}"]`);
  if (btn) btn.classList.add('active');

  currentScreen = name;

  if (name === 'session')  renderSessionScreen();
  if (name === 'log')      renderLog();
  if (name === 'export')   renderExport();
  if (name === 'probanden') renderProbanden();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ── PROBANDEN SCREEN ───────────────────────────────────────────────────────
function renderProbanden(filter = '') {
  const list = document.getElementById('proband-list');
  const empty = document.getElementById('proband-empty');
  const label = document.getElementById('proband-count-label');

  const lower = filter.toLowerCase();
  const filtered = probanden.filter(p =>
    p.pseudo.toLowerCase().includes(lower) ||
    String(p.sensor).includes(lower)
  );

  label.textContent = `ANGELEGTE PROBANDEN (${filtered.length})`;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = filtered.map(p => {
    const done    = sessions.filter(s => s.probandId === p.id).length;
    const total   = stations.length;
    const status  = done === 0 ? 'open' : done >= total ? 'done' : 'partial';
    const badgeClass = { open: 'badge-open', done: 'badge-done', partial: 'badge-partial' }[status];
    const badgeLabel = { open: 'Offen', done: 'Fertig', partial: 'Laufend' }[status];
    const initials = p.pseudo.length >= 2 ? p.pseudo.slice(-2).toUpperCase() : p.pseudo.toUpperCase();
    const sub = `SNR: ${esc(p.sensor)}${p.note ? '  ·  ' + esc(p.note) : ''}`;
    return `
      <div class="proband-item" data-id="${esc(p.id)}">
        <div class="avatar">${esc(initials)}</div>
        <div class="proband-info">
          <div class="proband-name">${esc(p.pseudo)}</div>
          <div class="proband-sub">${sub}</div>
          <div class="proband-prog">${done} / ${total} Stationen</div>
        </div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>`;
  }).join('');

  list.querySelectorAll('.proband-item').forEach(el => {
    el.addEventListener('click', () => {
      // tap proband → jump to session screen with this proband pre-selected
      const id = el.dataset.id;
      showScreen('session');
      const sel = document.getElementById('sel-proband');
      sel.value = id;
      updateProbandBadge();
    });
  });
}

document.getElementById('search-input').addEventListener('input', e => {
  renderProbanden(e.target.value);
});

document.getElementById('btn-add-proband').addEventListener('click', () => {
  const form = document.getElementById('add-form');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    document.getElementById('inp-pseudo').focus();
  }
});

document.getElementById('btn-cancel-proband').addEventListener('click', () => {
  document.getElementById('add-form').classList.add('hidden');
  clearAddForm();
});

document.getElementById('btn-save-proband').addEventListener('click', () => {
  const pseudo  = document.getElementById('inp-pseudo').value.trim();
  const sensorRaw = document.getElementById('inp-sensor').value.trim();
  const note    = document.getElementById('inp-note').value.trim();

  if (!pseudo) { showToast('⚠ Bitte Pseudonym eingeben'); return; }
  if (!sensorRaw) { showToast('⚠ Bitte Sensoriknummer eingeben'); return; }

  const sensor = parseInt(sensorRaw, 10);
  if (isNaN(sensor) || sensor < 1 || sensor > 12) {
    showToast('⚠ Sensoriknummer muss zwischen 1 und 12 liegen'); return;
  }

  // Duplicate check
  if (probanden.some(p => String(p.sensor) === String(sensor))) {
    showToast('⚠ Sensoriknummer ' + sensor + ' bereits vergeben'); return;
  }
  if (probanden.some(p => p.pseudo.toLowerCase() === pseudo.toLowerCase())) {
    showToast('⚠ Pseudonym bereits vergeben'); return;
  }

  probanden.push({ id: uid(), pseudo, sensor, note, createdAt: new Date().toISOString() });
  save();
  clearAddForm();
  document.getElementById('add-form').classList.add('hidden');
  renderProbanden(document.getElementById('search-input').value);
  showToast('✓ ' + pseudo + ' angelegt');
});

function clearAddForm() {
  ['inp-pseudo', 'inp-sensor', 'inp-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

// ── SESSION SCREEN ─────────────────────────────────────────────────────────
function buildStationGrid() {
  const grid = document.getElementById('station-grid');
  grid.innerHTML = stations.map(s => `
    <button class="station-btn${s === selectedStation ? ' selected' : ''}" data-station="${esc(s)}">
      <span class="station-icon">⬡</span>${esc(s)}
    </button>`).join('');

  grid.querySelectorAll('.station-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedStation = btn.dataset.station;
      grid.querySelectorAll('.station-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

function buildProbandSelect() {
  const sel = document.getElementById('sel-proband');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Proband wählen —</option>' +
    probanden.map(p => `<option value="${esc(p.id)}">SNR ${esc(p.sensor)}  (${esc(p.pseudo)})</option>`).join('');
  if (probanden.some(p => p.id === current)) sel.value = current;
  updateProbandBadge();
}

function updateProbandBadge() {
  const sel = document.getElementById('sel-proband');
  const badge = document.getElementById('proband-badge');
  const id = sel.value;
  if (!id) {
    badge.classList.add('hidden');
    return;
  }
  const p = probanden.find(x => x.id === id);
  if (p) {
    badge.textContent = `✓  ${p.pseudo}${p.note ? '  ·  ' + p.note : ''}`;
    badge.classList.remove('hidden');
  }
}

document.getElementById('sel-proband').addEventListener('change', updateProbandBadge);

function renderSessionScreen() {
  buildProbandSelect();
  buildStationGrid();
  updateTimerUI();
}

// Timer logic
function startTimer() {
  if (sessionRunning) return;  // guard against double-start
  const probandId = document.getElementById('sel-proband').value;
  if (!probandId) { showToast('⚠ Bitte zuerst einen Probanden wählen'); return; }

  timerStart    = Date.now();
  timerElapsed  = 0;
  sessionRunning = true;
  sessionStartISO = new Date().toISOString();
  sessionEndISO   = null;

  document.getElementById('doc-card').classList.add('hidden');
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  document.getElementById('session-notes').value = '';

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
  timerElapsed   = Math.floor((Date.now() - timerStart) / 1000);

  updateTimerUI();
  document.getElementById('doc-card').classList.remove('hidden');
  document.getElementById('doc-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateTimerUI() {
  const display  = document.getElementById('timer-display');
  const status   = document.getElementById('timer-status');
  const meta     = document.getElementById('timer-meta');
  const btnStart = document.getElementById('btn-start');
  const btnStop  = document.getElementById('btn-stop');

  if (sessionRunning) {
    status.innerHTML = '<span class="status-running">● LÄUFT</span>';
    meta.textContent = 'Start: ' + formatTimeOnly(sessionStartISO) + '  ·  Station ' + selectedStation;
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
  } else if (sessionEndISO) {
    status.innerHTML = '<span class="status-done">✓ Abgeschlossen</span>';
    meta.textContent = `${formatTimeOnly(sessionStartISO)} → ${formatTimeOnly(sessionEndISO)}  ·  Dauer: ${formatTime(timerElapsed)}`;
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

// Tags
document.querySelectorAll('.tag').forEach(tag => {
  tag.addEventListener('click', () => tag.classList.toggle('active'));
});

// Save session
document.getElementById('btn-save-session').addEventListener('click', () => {
  const probandId = document.getElementById('sel-proband').value;
  if (!probandId)    { showToast('⚠ Kein Proband gewählt'); return; }
  if (!sessionStartISO) { showToast('⚠ Keine Sitzung gestartet'); return; }
  if (!sessionEndISO)   { showToast('⚠ Sitzung noch nicht gestoppt'); return; }

  const p = probanden.find(x => x.id === probandId);
  const deviations = Array.from(document.querySelectorAll('.tag.active')).map(t => t.dataset.tag);
  const notes      = document.getElementById('session-notes').value.trim();
  const scenario   = document.getElementById('sel-scenario').value;

  const session = {
    id:           uid(),
    probandId,
    pseudo:       p ? p.pseudo : '?',
    sensor:       p ? p.sensor : '?',
    station:      selectedStation,
    scenario,
    date:         formatDate(sessionStartISO),
    startISO:     sessionStartISO,
    endISO:       sessionEndISO,
    duration_s:   timerElapsed,
    deviations,
    notes,
    deviceLabel:  settings.deviceLabel || '',
    createdAt:    new Date().toISOString()
  };

  sessions.push(session);
  save();

  // Reset post-session state
  sessionStartISO = null;
  sessionEndISO   = null;
  timerElapsed    = 0;
  document.getElementById('doc-card').classList.add('hidden');
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  document.getElementById('session-notes').value = '';
  updateTimerUI();

  showToast('✓ Sitzung gespeichert');
  setTimeout(() => showScreen('log'), 600);
});

// ── LOG SCREEN ─────────────────────────────────────────────────────────────
function buildLogFilters() {
  const stationSel  = document.getElementById('log-filter-station');
  const probandSel  = document.getElementById('log-filter-proband');

  const stVal = stationSel.value;
  const prVal = probandSel.value;

  stationSel.innerHTML = '<option value="all">Alle Stationen</option>' +
    stations.map(s => `<option value="${esc(s)}">Station ${esc(s)}</option>`).join('');

  probandSel.innerHTML = '<option value="all">Alle Probanden</option>' +
    probanden.map(p => `<option value="${esc(p.id)}">${esc(p.pseudo)} (${esc(p.sensor)})</option>`).join('');

  if (stations.includes(stVal))             stationSel.value = stVal;
  if (probanden.some(p => p.id === prVal))  probandSel.value = prVal;
}

function getFilteredSessions() {
  const stVal = document.getElementById('log-filter-station').value;
  const prVal = document.getElementById('log-filter-proband').value;
  return sessions.filter(s =>
    (stVal === 'all' || s.station === stVal) &&
    (prVal === 'all' || s.probandId === prVal)
  ).slice().reverse();
}

function renderLog() {
  buildLogFilters();
  const list   = document.getElementById('log-list');
  const empty  = document.getElementById('log-empty');
  const label  = document.getElementById('log-count-label');
  const filtered = getFilteredSessions();

  label.textContent = `SITZUNGEN (${filtered.length})`;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = filtered.map(s => {
    const hasDev = s.deviations && s.deviations.length > 0;
    const devClass = hasDev ? ' has-deviation' : '';
    const devLine  = hasDev ? `<div class="log-dev">⚑  ${esc(s.deviations.join('  ·  '))}</div>` : '';
    const dur = formatTime(s.duration_s || 0);
    return `
      <div class="log-entry${devClass}" data-id="${esc(s.id)}">
        <div class="log-row-top">
          <span class="log-id">${esc(s.pseudo)}  ·  Station ${esc(s.station)}</span>
          <span class="log-time">${esc(formatTimeOnly(s.startISO))} – ${esc(formatTimeOnly(s.endISO))}</span>
        </div>
        <div class="log-meta">${esc(s.date)}  ·  ${esc(s.scenario)}  ·  Dauer: ${esc(dur)}</div>
        ${devLine}
      </div>`;
  }).join('');

  list.querySelectorAll('.log-entry').forEach(el => {
    el.addEventListener('click', () => openSessionDetail(el.dataset.id));
  });
}

document.getElementById('log-filter-station').addEventListener('change', renderLog);
document.getElementById('log-filter-proband').addEventListener('change', renderLog);

// Session Detail Modal
function openSessionDetail(id) {
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  detailSessionId = id;

  document.getElementById('detail-title').textContent = `${s.pseudo}  ·  Station ${s.station}`;

  const rows = [
    ['Datum',        s.date],
    ['Pseudonym',    s.pseudo],
    ['Sensoriknummer', s.sensor],
    ['Station',      s.station],
    ['Szenario',     s.scenario],
    ['Start',        formatTimeOnly(s.startISO)],
    ['Ende',         formatTimeOnly(s.endISO)],
    ['Dauer',        formatTime(s.duration_s || 0)],
    ['Abweichungen', s.deviations && s.deviations.length ? s.deviations.join(', ') : '—'],
    ['Anmerkungen',  s.notes || '—'],
    ['Gerät/Betreuer', s.deviceLabel || '—'],
  ];

  document.getElementById('detail-content').innerHTML = rows.map(([k, v]) => `
    <div class="detail-row">
      <span class="detail-key">${esc(k)}</span>
      <span class="detail-val">${esc(v)}</span>
    </div>`).join('');

  document.getElementById('detail-overlay').classList.remove('hidden');
}

document.getElementById('detail-close').addEventListener('click', () => {
  document.getElementById('detail-overlay').classList.add('hidden');
  detailSessionId = null;
});

document.getElementById('btn-delete-session').addEventListener('click', () => {
  if (!detailSessionId) return;
  const s = sessions.find(x => x.id === detailSessionId);
  showConfirm(
    'Sitzung löschen',
    `Soll die Sitzung von ${s ? s.pseudo : ''} (Station ${s ? s.station : ''}) wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`,
    () => {
      sessions = sessions.filter(x => x.id !== detailSessionId);
      save();
      document.getElementById('detail-overlay').classList.add('hidden');
      detailSessionId = null;
      renderLog();
      showToast('Sitzung gelöscht');
    }
  );
});

// Close detail on backdrop click
document.getElementById('detail-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('detail-overlay')) {
    document.getElementById('detail-overlay').classList.add('hidden');
    detailSessionId = null;
  }
});

// ── EXPORT SCREEN ──────────────────────────────────────────────────────────
function buildExportFilters() {
  const sel = document.getElementById('export-filter-station');
  const cur = sel.value;
  sel.innerHTML = '<option value="all">Alle Stationen</option>' +
    stations.map(s => `<option value="${esc(s)}">Station ${esc(s)}</option>`).join('');
  if (stations.includes(cur)) sel.value = cur;
}

function getExportSessions() {
  const stVal = document.getElementById('export-filter-station').value;
  return stVal === 'all' ? sessions : sessions.filter(s => s.station === stVal);
}

function renderStats() {
  const data  = getExportSessions();
  const total = data.length;
  const avgDur = total > 0
    ? Math.round(data.reduce((a, s) => a + (s.duration_s || 0), 0) / total)
    : 0;
  const devCount = data.filter(s => s.deviations && s.deviations.length > 0).length;

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${total}</div>
      <div class="stat-label">Sitzungen</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatTime(avgDur)}</div>
      <div class="stat-label">⌀ Dauer</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${devCount}</div>
      <div class="stat-label">Abweich.</div>
    </div>`;
}

function renderExport() {
  buildExportFilters();
  renderStats();

  const label = document.getElementById('inp-device-label');
  label.value = settings.deviceLabel || '';

  const lastInfo = document.getElementById('last-export-info');
  if (settings.lastExport) {
    lastInfo.textContent = formatDatetime(settings.lastExport);
  }
}

document.getElementById('export-filter-station').addEventListener('change', renderStats);

document.getElementById('inp-device-label').addEventListener('change', e => {
  settings.deviceLabel = e.target.value.trim();
  save();
});

function escCsvField(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

document.getElementById('btn-export-csv').addEventListener('click', () => {
  const data = getExportSessions();
  if (!data.length) { showToast('⚠ Keine Daten zum Exportieren'); return; }

  const headers = [
    'ID','Datum','Pseudonym','Sensoriknummer','Station','Szenario',
    'Start','Ende','Dauer_s','Dauer_mm:ss','Abweichungen','Anmerkungen','Geraet_Betreuer'
  ];

  const rows = data.map(s => [
    s.id, s.date, s.pseudo, s.sensor, s.station, s.scenario,
    s.startISO, s.endISO, s.duration_s || 0, formatTime(s.duration_s || 0),
    (s.deviations || []).join('; '), s.notes || '', s.deviceLabel || ''
  ].map(escCsvField).join(','));

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  downloadFile(csv, `studylog_${dateSlug()}.csv`, 'text/csv;charset=utf-8;');
  recordExport();
  showToast('✓ CSV exportiert (' + data.length + ' Sitzungen)');
});

document.getElementById('btn-export-json').addEventListener('click', () => {
  const data = getExportSessions();
  if (!data.length) { showToast('⚠ Keine Daten zum Exportieren'); return; }

  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `studylog_${dateSlug()}.json`, 'application/json');
  recordExport();
  showToast('✓ JSON exportiert (' + data.length + ' Sitzungen)');
});

function dateSlug() {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function recordExport() {
  settings.lastExport = new Date().toISOString();
  save();
  document.getElementById('last-export-info').textContent = formatDatetime(settings.lastExport);
}

// Clear all data
document.getElementById('btn-clear-data').addEventListener('click', () => {
  showConfirm(
    '⚠ Alle Daten löschen',
    'Alle Probanden und Sitzungsdaten werden unwiderruflich gelöscht. Bitte vorher exportieren!',
    () => {
      probanden = [];
      sessions  = [];
      settings.lastExport = null;
      save();
      renderProbanden();
      renderLog();
      renderExport();
      showToast('Alle Daten gelöscht');
    }
  );
});

// ── INIT ───────────────────────────────────────────────────────────────────
load();
renderProbanden();
buildStationGrid();
buildProbandSelect();

// Update topbar subtitle with date
document.getElementById('topbar-sub').textContent =
  new Date().toLocaleDateString('de-DE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
