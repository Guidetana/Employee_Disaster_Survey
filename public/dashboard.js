'use strict';

// ตัวเลือกช่วงจำนวนวันที่มีอาหาร (คำนวณจาก foodDays)
OPTIONS.foodBucket = [
  { value: 'd0', label: 'ไม่มีอาหาร (0 วัน)' },
  { value: 'd1_2', label: '1–2 วัน' },
  { value: 'd3_5', label: '3–5 วัน' },
  { value: 'd6_plus', label: '6 วันขึ้นไป' },
];
function foodBucket(n) {
  if (n <= 0) return 'd0';
  if (n <= 2) return 'd1_2';
  if (n <= 5) return 'd3_5';
  return 'd6_plus';
}

const CHARTS = [
  ['helpLevel', 'ระดับความต้องการความช่วยเหลือ'],
  ['canSleep', 'ที่พักปัจจุบันใช้นอนได้หรือไม่'],
  ['waterLevel', 'ระดับน้ำปัจจุบัน'],
  ['foodBucket', 'มีอาหารเพียงพอสำหรับ'],
  ['commute', 'การเดินทางมาทำงาน'],
  ['housingType', 'ลักษณะที่อยู่อาศัย'],
];

const COLUMNS = [
  ['submittedAt', 'อัปเดตล่าสุด'],
  ['fullName', 'ชื่อ-นามสกุล'],
  ['phone', 'เบอร์โทร'],
  ['helpLevel', 'ความต้องการ'],
  ['canSleep', 'ใช้นอนได้'],
  ['foodDays', 'อาหาร (วัน)'],
  ['waterLevel', 'ระดับน้ำ'],
  ['commute', 'การเดินทาง'],
  ['housingType', 'ที่อยู่อาศัย'],
  ['location', 'บริเวณที่พัก'],
  ['note', 'หมายเหตุ'],
  ['_actions', ''],
];

const state = {
  rows: new Map(),
  filters: {},
  q: '',
  sort: { key: 'submittedAt', dir: -1 },
  newIds: new Set(),
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labelOf = (field, v) => (OPTIONS[field].find((o) => o.value === v) || {}).label || v || '';
const shortLabel = (field, v) => labelOf(field, v).replace(/^\d\.\s*/, '');

function withDerived(r) {
  return { ...r, foodBucket: foodBucket(r.foodDays) };
}

// ---------- filtering ----------

function matches(r, skipField) {
  for (const [k, v] of Object.entries(state.filters)) {
    if (k === skipField || !v) continue;
    if (r[k] !== v) return false;
  }
  if (state.q) {
    const hay = [r.fullName, r.location, r.phone, r.note].join(' ').toLowerCase();
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

function filtered(skipField) {
  return [...state.rows.values()].filter((r) => matches(r, skipField));
}

// ---------- render ----------

function renderKpis(list) {
  const total = list.length;
  const cantSleep = list.filter((r) => r.canSleep === 'no').length;
  const noPlace = list.filter((r) => r.helpLevel === 'no_place').length;
  const evac = list.filter((r) => r.helpLevel === 'relatives' || r.helpLevel === 'no_place').length;
  const lowFood = list.filter((r) => r.foodDays <= 2).length;
  const cantWork = list.filter((r) => r.commute !== 'can_commute').length;
  const tiles = [
    ['', 'ผู้ตอบแบบสำรวจ', total, state.rows.size === total ? 'ทั้งหมด' : `จากทั้งหมด ${state.rows.size} คน`],
    ['danger', 'ต้องการที่พัก (ยังไม่มีที่ไป)', noPlace, 'ระดับ 2 — เร่งด่วน'],
    ['warn', 'ต้องการออกจากที่พัก', evac, 'ระดับ 1 + 2'],
    ['danger', 'ที่พักใช้นอนไม่ได้', cantSleep, pct(cantSleep, total)],
    ['warn', 'อาหารเหลือ ≤ 2 วัน', lowFood, pct(lowFood, total)],
    ['', 'มาทำงานไม่ได้', cantWork, pct(cantWork, total)],
  ];
  $('kpis').innerHTML = tiles.map(([cls, label, val, sub]) => `
    <div class="card kpi ${cls}">
      <div class="k-label">${label}</div>
      <div class="k-value">${val}</div>
      <div class="k-sub">${sub}</div>
    </div>`).join('');
}

function pct(n, total) {
  return total ? `${Math.round((n / total) * 100)}% ของที่แสดง` : '—';
}

function renderCharts() {
  $('charts').innerHTML = CHARTS.map(([field, title]) => {
    // แต่ละกราฟนับตามตัวกรองอื่น ๆ ยกเว้นตัวกรองของตัวเอง เพื่อให้ยังเห็นตัวเลือกอื่นอยู่
    const list = filtered(field);
    const counts = Object.fromEntries(OPTIONS[field].map((o) => [o.value, 0]));
    list.forEach((r) => { if (r[field] in counts) counts[r[field]]++; });
    const max = Math.max(1, ...Object.values(counts));
    const rows = OPTIONS[field].map((o) => {
      const c = counts[o.value];
      const sel = state.filters[field] === o.value ? ' selected' : '';
      const p = list.length ? Math.round((c / list.length) * 100) : 0;
      return `<div class="bar-row${sel}" data-field="${field}" data-value="${o.value}" title="${esc(o.label)}">
        <span class="bar-label">${esc(shortLabel(field, o.value))}</span>
        <span class="bar-val">${c} <small>(${p}%)</small></span>
        <div class="bar-track"><div class="bar-fill" style="width:${(c / max) * 100}%"></div></div>
      </div>`;
    }).join('');
    return `<div class="card chart"><h3>${title}</h3>${rows}<div class="chart-hint">คลิกที่แถบเพื่อกรองข้อมูล</div></div>`;
  }).join('');
}

function tag(field, v) {
  const danger = { canSleep: ['no'], helpLevel: ['no_place'], waterLevel: ['waist', 'chest'], commute: [] };
  const warn = { helpLevel: ['relatives'], waterLevel: ['knee'], commute: ['home_flooded', 'area_flooded'] };
  const ok = { canSleep: ['yes'], waterLevel: ['none'], commute: ['can_commute'], helpLevel: ['food_only'] };
  const cls = danger[field]?.includes(v) ? 'danger' : warn[field]?.includes(v) ? 'warn' : ok[field]?.includes(v) ? 'ok' : '';
  return `<span class="tag ${cls}">${esc(shortLabel(field, v))}</span>`;
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderTable(list) {
  const { key, dir } = state.sort;
  const sorted = [...list].sort((a, b) => {
    const x = a[key] ?? '', y = b[key] ?? '';
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'th') * dir;
  });

  $('thead').innerHTML = COLUMNS.map(([k, label]) => {
    if (k === '_actions') return '<th></th>';
    const arrow = key === k ? (dir > 0 ? '▲' : '▼') : '';
    return `<th data-sort="${k}">${label} <span class="arrow">${arrow}</span></th>`;
  }).join('');

  if (!sorted.length) {
    $('tbody').innerHTML = `<tr><td colspan="${COLUMNS.length}" class="empty">${state.rows.size ? 'ไม่พบข้อมูลตามตัวกรอง' : 'ยังไม่มีผู้กรอกข้อมูล'}</td></tr>`;
    return;
  }

  $('tbody').innerHTML = sorted.map((r) => `
    <tr class="${state.newIds.has(r.id) ? 'new' : ''}">
      <td style="white-space:nowrap">${fmtTime(r.submittedAt)}</td>
      <td><strong>${esc(r.fullName)}</strong></td>
      <td style="white-space:nowrap"><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td>
      <td>${tag('helpLevel', r.helpLevel)}</td>
      <td>${tag('canSleep', r.canSleep)}</td>
      <td class="num">${r.foodDays <= 2 ? `<span class="tag ${r.foodDays === 0 ? 'danger' : 'warn'}">${r.foodDays}</span>` : r.foodDays}</td>
      <td>${tag('waterLevel', r.waterLevel)}</td>
      <td>${tag('commute', r.commute)}</td>
      <td>${esc(labelOf('housingType', r.housingType))}${r.floor ? ` ชั้น ${esc(r.floor)}` : ''}</td>
      <td><div class="loc">${esc(r.location)}</div></td>
      <td><div class="loc">${esc(r.note)}</div></td>
      <td><button class="link-btn" data-delete="${esc(r.id)}" title="ลบรายการนี้">ลบ</button></td>
    </tr>`).join('');
  state.newIds.clear();
}

function render() {
  const list = filtered();
  renderKpis(list);
  renderCharts();
  renderTable(list);
  const active = Object.values(state.filters).filter(Boolean).length + (state.q ? 1 : 0);
  $('count').textContent = `แสดง ${list.length} จาก ${state.rows.size} คน${active ? ` · ใช้ตัวกรอง ${active} รายการ` : ''}`;
  $('tableCount').textContent = `${list.length} รายการ`;
  document.querySelectorAll('[data-filter]').forEach((s) => { s.value = state.filters[s.dataset.filter] || ''; });
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

// ---------- filters UI ----------

document.querySelectorAll('[data-filter]').forEach((sel) => {
  const field = sel.dataset.filter;
  sel.innerHTML = '<option value="">ทั้งหมด</option>' +
    OPTIONS[field].map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
  sel.addEventListener('change', () => { state.filters[field] = sel.value; render(); });
});

$('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });

$('clearBtn').addEventListener('click', () => {
  state.filters = {};
  state.q = '';
  $('q').value = '';
  render();
});

$('charts').addEventListener('click', (e) => {
  const row = e.target.closest('.bar-row');
  if (!row) return;
  const { field, value } = row.dataset;
  state.filters[field] = state.filters[field] === value ? '' : value;
  render();
});

$('thead').addEventListener('click', (e) => {
  const th = e.target.closest('[data-sort]');
  if (!th) return;
  const k = th.dataset.sort;
  state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'submittedAt' ? -1 : 1) };
  render();
});

$('tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete]');
  if (!btn) return;
  const r = state.rows.get(btn.dataset.delete);
  if (!r || !confirm(`ลบข้อมูลของ "${r.fullName}" ใช่หรือไม่?`)) return;
  const res = await fetch(`/api/responses/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
  if (!res.ok) alert('ลบไม่สำเร็จ');
});

// ---------- data + realtime ----------

async function loadAll() {
  const res = await fetch('/api/responses', { cache: 'no-store' });
  const list = await res.json();
  state.rows = new Map(list.map((r) => [r.id, withDerived(r)]));
  render();
}

function connect() {
  const live = $('live');
  const es = new EventSource('/events');
  es.addEventListener('open', () => {
    live.classList.add('on');
    $('liveText').textContent = 'Real-time: เชื่อมต่อแล้ว';
    loadAll(); // โหลดใหม่ทุกครั้งที่ต่อสำเร็จ กันข้อมูลตกหล่นระหว่างหลุด
  });
  es.addEventListener('error', () => {
    live.classList.remove('on');
    $('liveText').textContent = 'ขาดการเชื่อมต่อ กำลังเชื่อมต่อใหม่...';
  });
  es.addEventListener('upsert', (e) => {
    const r = JSON.parse(e.data);
    state.rows.set(r.id, withDerived(r));
    state.newIds.add(r.id);
    scheduleRender();
  });
  es.addEventListener('delete', (e) => {
    state.rows.delete(JSON.parse(e.data).id);
    scheduleRender();
  });
}

render();
connect();
