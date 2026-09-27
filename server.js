'use strict';

// เซิร์ฟเวอร์รวบรวมข้อมูลพนักงานที่ได้รับผลกระทบจากน้ำท่วม
// - ไม่มี dependency ภายนอก (ใช้ Node.js >= 18 อย่างเดียว)
// - เก็บข้อมูลเป็นไฟล์ JSON ใน data/responses.json
// - Dashboard อัปเดตแบบ real-time ผ่าน Server-Sent Events (SSE)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { OPTIONS } = require('./public/options.js');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'responses.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
// ถ้าตั้งค่า DASHBOARD_PASSWORD หน้า Dashboard และ API ที่อ่านข้อมูลจะต้องใส่รหัสผ่าน (Basic Auth)
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';

// ---------- storage ----------

function loadResponses() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function saveResponses(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let responses = loadResponses();

// ---------- validation ----------

const keysOf = (arr) => arr.map((o) => o.value);

function normalizePhone(p) {
  return String(p || '').replace(/[^\d+]/g, '');
}

function validate(body) {
  const errors = {};
  const str = (k, max = 300) => String(body[k] ?? '').trim().slice(0, max);

  const rec = {
    fullName: str('fullName', 150),
    housingType: str('housingType'),
    floor: str('floor', 10),
    location: str('location', 500),
    canSleep: str('canSleep'),
    foodDays: str('foodDays', 5),
    waterLevel: str('waterLevel'),
    commute: str('commute'),
    phone: normalizePhone(body.phone),
    helpLevel: str('helpLevel'),
    note: str('note', 1000),
  };

  if (!rec.fullName) errors.fullName = 'กรุณากรอกชื่อ-นามสกุล';
  if (!keysOf(OPTIONS.housingType).includes(rec.housingType)) errors.housingType = 'กรุณาเลือกลักษณะที่อยู่อาศัย';
  if (rec.housingType === 'condo') {
    if (!/^\d{1,3}$/.test(rec.floor) || Number(rec.floor) < 1) errors.floor = 'กรุณาระบุชั้นเป็นตัวเลข';
    else rec.floor = Number(rec.floor);
  } else {
    rec.floor = null;
  }
  if (!rec.location) errors.location = 'กรุณาระบุบริเวณที่พักอาศัย';
  if (!keysOf(OPTIONS.canSleep).includes(rec.canSleep)) errors.canSleep = 'กรุณาเลือกว่าที่พักสามารถใช้นอนได้หรือไม่';
  if (!/^\d{1,3}$/.test(rec.foodDays)) errors.foodDays = 'กรุณาระบุจำนวนวันเป็นตัวเลข';
  else rec.foodDays = Number(rec.foodDays);
  if (!keysOf(OPTIONS.waterLevel).includes(rec.waterLevel)) errors.waterLevel = 'กรุณาเลือกระดับน้ำปัจจุบัน';
  if (!keysOf(OPTIONS.commute).includes(rec.commute)) errors.commute = 'กรุณาเลือกการเดินทางมาทำงาน';
  if (!/^\+?\d{9,12}$/.test(rec.phone)) errors.phone = 'กรุณากรอกเบอร์โทรให้ถูกต้อง';
  if (!keysOf(OPTIONS.helpLevel).includes(rec.helpLevel)) errors.helpLevel = 'กรุณาเลือกระดับความต้องการความช่วยเหลือ';

  return { rec, errors };
}

// ---------- realtime (SSE) ----------

const clients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000).unref();

// ---------- helpers ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!DASHBOARD_PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const [user, ...rest] = Buffer.from(header.slice(6), 'base64').toString().split(':');
  const expected = Buffer.from(`${DASHBOARD_USER}:${DASHBOARD_PASSWORD}`);
  const given = Buffer.from(`${user}:${rest.join(':')}`);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function requireAuth(req, res) {
  if (isAuthorized(req)) return true;
  send(res, 401, 'Unauthorized', { 'WWW-Authenticate': 'Basic realm="Dashboard", charset="UTF-8"' });
  return false;
}

function labelOf(field, value) {
  const o = (OPTIONS[field] || []).find((x) => x.value === value);
  return o ? o.label : value ?? '';
}

function toCsv(list) {
  const cols = [
    ['submittedAt', 'วันเวลาที่ส่ง'],
    ['fullName', 'ชื่อ-นามสกุล'],
    ['housingType', 'ลักษณะที่อยู่อาศัย'],
    ['floor', 'ชั้น'],
    ['location', 'บริเวณที่พักอาศัย'],
    ['canSleep', 'ที่พักใช้นอนได้'],
    ['foodDays', 'อาหารเพียงพอ (วัน)'],
    ['waterLevel', 'ระดับน้ำปัจจุบัน'],
    ['commute', 'การเดินทางมาทำงาน'],
    ['phone', 'เบอร์โทร'],
    ['helpLevel', 'ระดับความต้องการความช่วยเหลือ'],
    ['note', 'หมายเหตุ'],
  ];
  const esc = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // กัน CSV injection ใน Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const rows = list.map((r) =>
    cols.map(([k]) => esc(OPTIONS[k] ? labelOf(k, r[k]) : k === 'submittedAt' ? new Date(r[k]).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : r[k])).join(',')
  );
  return '﻿' + [cols.map(([, h]) => esc(h)).join(','), ...rows].join('\r\n');
}

// ---------- routes ----------

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'POST' && p === '/api/responses') {
    let body;
    try {
      const raw = await readBody(req);
      body = req.headers['content-type']?.includes('application/json')
        ? JSON.parse(raw || '{}')
        : Object.fromEntries(new URLSearchParams(raw));
    } catch (err) {
      return sendJson(res, err.status || 400, { ok: false, message: 'ข้อมูลไม่ถูกต้อง' });
    }
    const { rec, errors } = validate(body);
    if (Object.keys(errors).length) return sendJson(res, 422, { ok: false, errors });

    // ใช้เบอร์โทรเป็นตัวระบุ: ถ้าเคยส่งแล้วจะอัปเดตข้อมูลเดิมเป็นสถานการณ์ล่าสุด
    const now = new Date().toISOString();
    const idx = responses.findIndex((r) => r.phone === rec.phone);
    let saved;
    let updated = false;
    if (idx >= 0) {
      saved = { ...responses[idx], ...rec, updatedAt: now, submittedAt: now };
      responses[idx] = saved;
      updated = true;
    } else {
      saved = { id: crypto.randomUUID(), ...rec, createdAt: now, submittedAt: now };
      responses.push(saved);
    }
    saveResponses(responses);
    broadcast('upsert', saved);
    return sendJson(res, 200, { ok: true, updated });
  }

  if (req.method === 'GET' && p === '/healthz') {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && p === '/api/options') {
    return sendJson(res, 200, OPTIONS);
  }

  // ---- ต้องผ่านการยืนยันตัวตน (ถ้าเปิดใช้งาน) ----
  if (p === '/dashboard' || p === '/dashboard.html' || p === '/dashboard.js' || p.startsWith('/api/')) {
    if (!requireAuth(req, res)) return;
  }

  if (req.method === 'GET' && p === '/api/responses') {
    return sendJson(res, 200, responses);
  }

  if (req.method === 'GET' && p === '/api/export.csv') {
    const date = new Date().toISOString().slice(0, 10);
    return send(res, 200, toCsv(responses), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="flood-survey-${date}.csv"`,
    });
  }

  if (req.method === 'DELETE' && p.startsWith('/api/responses/')) {
    const id = decodeURIComponent(p.slice('/api/responses/'.length));
    const before = responses.length;
    responses = responses.filter((r) => r.id !== id);
    if (responses.length === before) return sendJson(res, 404, { ok: false });
    saveResponses(responses);
    broadcast('delete', { id });
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && p === '/events') {
    if (!requireAuth(req, res)) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const map = { '/': '/index.html', '/dashboard': '/dashboard.html' };
    const file = path.normalize(path.join(PUBLIC_DIR, map[p] || p));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Not found');
      send(res, 200, req.method === 'HEAD' ? undefined : buf, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
    });
    return;
  }

  send(res, 405, 'Method not allowed');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'เกิดข้อผิดพลาดในระบบ' });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`แบบฟอร์ม:   http://localhost:${PORT}/`);
    console.log(`Dashboard:  http://localhost:${PORT}/dashboard`);
    if (!DASHBOARD_PASSWORD) console.log('คำเตือน: ยังไม่ได้ตั้ง DASHBOARD_PASSWORD — ใครก็เปิด Dashboard ได้');
  });
}

module.exports = { server, validate };
