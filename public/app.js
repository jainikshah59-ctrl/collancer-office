/* COLLANCER OFFICE — frontend.
 * Vanilla JS + canvas. No build step. Munder Difflin v0.3.4 visual language.
 */
'use strict';

/* ================= API ================= */
const API = {
  async get(p) { const r = await fetch(p); return r.json(); },
  async post(p, body) {
    const r = await fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json();
  },
  agents() { return this.get('/api/agents'); },
  agent(id) { return this.get('/api/agents/' + id); },
  tasks() { return this.get('/api/tasks'); },
  events(since) { return this.get('/api/events?since=' + since); },
  assignTask(id, title, objective) { return this.post('/api/agents/' + id + '/task', { title, objective }); },
  brief(text) { return this.post('/api/brief', { text }); },
};

/* ================= state ================= */
const S = {
  agents: [],
  byId: {},
  tasks: [],
  selectedId: 'nova',
  tab: 'terminal',       // agent panel tab
  ccTab: 'floor',        // command center tab
  lastEventId: 0,
  myMessages: {},        // agentId -> [strings] queued by user
};

/* ================= utils ================= */
const $ = (sel, el) => (el || document).querySelector(sel);
const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACCENTS = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];

const STATUS_LABEL = { idle: 'idle', thinking: 'thinking', working: 'working', waiting: 'waiting', blocked: 'needs you', success: 'done', ghost: 'ghost', compacting: 'compacting', looping: 'looping' };

const INK = '#1A1320';
const SKIN = ['#F2C9A0', '#E8B088', '#D9A06F', '#C98F66'];
const HAIR = ['#3D2E4A', '#6B4A2F', '#8A8A8A', '#1A1320', '#B5762F'];

/* ================= pixel avatars =================
 * 24x24 sprite cell. Parametric: skin/hair/outfit + archetype headgear.
 * Frames: 0/2 idle (feet together), 1/3 step (feet apart, -1px lift).
 */
function drawAvatar(ctx, agent, frame, facing) {
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--cth-' + agent.accent).trim() || '#4F9FAF';
  const accLight = getComputedStyle(document.documentElement).getPropertyValue('--cth-' + agent.accent + '-light').trim() || '#CFE5E9';
  const h = agent._hi || 0; // hash index for skin/hair variety
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 2) % HAIR.length];
  const step = (frame === 1 || frame === 3);
  const lift = step ? 1 : 0;
  const px = (x, y, w, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y - lift, w, hh); };

  const cx = 12; // center x
  // legs
  const legSpread = step ? 2 : 1;
  px(cx - 4 - (step ? 1 : 0), 17, 3, 4, '#3D2E4A');
  px(cx + 1 + (step ? 1 : 0), 17, 3, 4, '#3D2E4A');
  px(cx - 4 - (step ? 1 : 0), 20, 4, 2, INK);
  px(cx + 1 + (step ? 1 : 0), 20, 4, 2, INK);
  // body (outfit = accent)
  px(cx - 5, 10, 10, 8, acc);
  px(cx - 5, 10, 10, 1, INK);            // collar line
  px(cx - 5, 17, 10, 1, INK);            // belt line
  px(cx - 1, 13, 2, 2, accLight);        // detail button
  // arms
  px(cx - 7, 11, 2, 5, acc);
  px(cx + 5, 11, 2, 5, acc);
  px(cx - 7, 15, 2, 2, skin);
  px(cx + 5, 15, 2, 2, skin);
  // outline sides of body
  px(cx - 6, 10, 1, 8, INK);
  px(cx + 5, 10, 1, 8, INK);
  // head
  const hy = 2;
  px(cx - 4, hy, 8, 7, skin);
  px(cx - 4, hy, 8, 1, INK);
  px(cx - 5, hy + 1, 1, 5, INK);
  px(cx + 4, hy + 1, 1, 5, INK);
  px(cx - 4, hy + 7, 8, 1, INK);

  const arch = agent.archetype || 'hacker';
  if (facing === 'up') {
    // back of head: hair covers
    px(cx - 4, hy + 1, 8, 5, hair);
  } else if (arch === 'wizard') {
    // wide-brim hat
    px(cx - 7, hy - 1, 14, 2, INK);
    px(cx - 6, hy - 1, 12, 1, acc);
    px(cx - 3, hy - 6, 6, 5, acc);
    px(cx - 3, hy - 6, 1, 5, INK);
    px(cx + 2, hy - 6, 1, 5, INK);
    px(cx - 3, hy - 6, 6, 1, INK);
    px(cx - 1, hy - 3, 2, 1, accLight); // hat star
    // eyes
    px(cx - 2, hy + 4, 1, 1, INK); px(cx + 1, hy + 4, 1, 1, INK);
  } else if (arch === 'astronaut') {
    // helmet
    px(cx - 5, hy - 1, 10, 9, '#FCFAF0');
    px(cx - 5, hy - 1, 10, 1, INK); px(cx - 5, hy + 7, 10, 1, INK);
    px(cx - 6, hy, 1, 7, INK); px(cx + 5, hy, 1, 7, INK);
    px(cx - 3, hy + 2, 6, 4, '#4F9FAF'); // visor
    px(cx - 3, hy + 2, 6, 1, '#CFE5E9');
  } else if (arch === 'cat-villager') {
    // cat ears
    px(cx - 4, hy - 3, 3, 4, hair); px(cx - 4, hy - 3, 3, 1, INK);
    px(cx + 1, hy - 3, 3, 4, hair); px(cx + 1, hy - 3, 3, 1, INK);
    px(cx - 3, hy - 2, 1, 2, '#F3D3CD');
    px(cx + 2, hy - 2, 1, 2, '#F3D3CD');
    px(cx - 4, hy, 8, 2, hair);
    // eyes + whiskers
    px(cx - 2, hy + 4, 1, 1, INK); px(cx + 1, hy + 4, 1, 1, INK);
  } else if (arch === 'ninja') {
    // mask band
    px(cx - 4, hy + 1, 8, 3, INK);
    px(cx - 2, hy + 2, 1, 1, '#FFFDF5'); px(cx + 1, hy + 2, 1, 1, '#FFFDF5');
    px(cx - 4, hy, 8, 1, hair);
    // mask tails
    px(cx + 4, hy + 2, 3, 1, INK); px(cx + 6, hy + 3, 2, 1, INK);
  } else if (arch === 'scientist') {
    // wild hair + glasses
    px(cx - 5, hy, 2, 6, '#E8E4DA'); px(cx + 3, hy, 2, 6, '#E8E4DA');
    px(cx - 5, hy - 1, 2, 2, '#E8E4DA'); px(cx + 3, hy - 1, 2, 2, '#E8E4DA');
    px(cx - 3, hy + 3, 2, 2, INK); px(cx + 1, hy + 3, 2, 2, INK);
    px(cx - 1, hy + 4, 1, 1, INK);
  } else { // hacker: hood
    px(cx - 5, hy - 1, 10, 3, '#3D2E4A');
    px(cx - 5, hy - 1, 10, 1, INK);
    px(cx - 6, hy, 1, 6, INK); px(cx + 5, hy, 1, 6, INK);
    px(cx - 2, hy + 4, 1, 1, INK); px(cx + 1, hy + 4, 1, 1, INK);
  }
}

function portraitCanvas(agent, size) {
  const c = document.createElement('canvas');
  c.width = 24; c.height = 24;
  c.style.width = size + 'px'; c.style.height = size + 'px';
  drawAvatar(c.getContext('2d'), agent, 0, 'down');
  return c;
}

/* ================= office floor =================
 * Logical canvas 1088x704 (34x22 tiles at 32px). CSS scales it, pixelated.
 */
const TILE = 32, MAP_W = 34, MAP_H = 22;
const floor = $('#floor');
floor.width = MAP_W * TILE; floor.height = MAP_H * TILE;
const fx = floor.getContext('2d');
fx.imageSmoothingEnabled = false;

const C = {
  grassL: '#D4EAB0', grassD: '#B5D589',
  woodL: '#E5C896', woodD: '#C9A66B',
  path: '#E8D8B0', wall: '#8B6F47',
};

const ROOMS = [
  { name: 'CEO',       x: 1,  y: 1,  w: 8,  h: 5  },  // NOVA's office
  { name: 'BULLPEN',    x: 10, y: 1,  w: 12, h: 9  },  // main desks
  { name: 'STUDIO',     x: 23, y: 1,  w: 10, h: 9  },  // design corner
  { name: 'ARCHIVE',    x: 1,  y: 7,  w: 8,  h: 6  },  // task board + mailbox
  { name: 'LAB',        x: 10, y: 11, w: 12, h: 6  },  // terminal stations
  { name: 'CAFE',       x: 23, y: 11, w: 10, h: 9  },  // cafeteria
];

function inRoom(tx, ty) {
  for (const r of ROOMS) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
  return null;
}

function drawFloorBase() {
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const room = inRoom(tx, ty);
      const even = (tx + ty) % 2 === 0;
      fx.fillStyle = room ? (even ? C.woodL : C.woodD) : (even ? C.grassL : C.grassD);
      fx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // walls
  fx.fillStyle = C.wall;
  for (const r of ROOMS) {
    const x = r.x * TILE, y = r.y * TILE, w = r.w * TILE, h = r.h * TILE;
    fx.fillRect(x - 3, y - 3, w + 6, 3);
    fx.fillRect(x - 3, y + h, w + 6, 3);
    fx.fillRect(x - 3, y, 3, h);
    fx.fillRect(x + w, y, 3, h);
    // room label signpost
    const lx = x + 8, ly = y - 14;
    fx.fillStyle = '#8B6F47'; fx.fillRect(lx + 20, ly, 4, 14);
    fx.fillStyle = '#F4E9C7'; fx.fillRect(lx, ly - 10, 90, 14);
    fx.fillStyle = '#1A1320'; fx.fillRect(lx, ly - 10, 90, 1); fx.fillRect(lx, ly + 3, 90, 1);
    fx.fillRect(lx, ly - 10, 1, 14); fx.fillRect(lx + 89, ly - 10, 1, 14);
    fx.fillStyle = '#1A1320'; fx.font = '8px "Press Start 2P", monospace';
    fx.fillText(r.name, lx + 4, ly + 1);
  }
}

/* stations */
const STATIONS = {
  terminal: { tx: 14, ty: 13, label: 'TERMINAL' },
  board:    { tx: 3,  ty: 9,  label: 'TASKS' },
  mailbox:  { tx: 2,  ty: 11, label: 'MAIL' },
  coffee:   { tx: 27, ty: 17, label: 'CAFE' },
};

function drawStations(t) {
  for (const [key, s] of Object.entries(STATIONS)) {
    const x = s.tx * TILE, y = s.ty * TILE;
    if (key === 'terminal') {
      // CRT monitor
      fx.fillStyle = '#1A1320'; fx.fillRect(x, y + 4, 28, 24);
      fx.fillStyle = '#FCFAF0'; fx.fillRect(x + 3, y + 7, 22, 15);
      fx.fillStyle = '#5CA97A';
      const blink = Math.floor(t / 500) % 2 === 0;
      for (let i = 0; i < 3; i++) fx.fillRect(x + 5, y + 9 + i * 4, 12 - i * 2, 2);
      if (blink) { fx.fillStyle = '#1A1320'; fx.fillRect(x + 19, y + 17, 4, 3); }
      fx.fillStyle = '#1A1320'; fx.fillRect(x + 10, y + 28, 8, 4);
    } else if (key === 'board') {
      // corkboard + sticky notes
      fx.fillStyle = '#8B6F47'; fx.fillRect(x - 2, y - 2, 36, 30);
      fx.fillStyle = '#C9A66B'; fx.fillRect(x, y, 32, 26);
      const notes = ['#F3E4BC', '#F3D3CD', '#D2E7DA', '#CFE5E9'];
      notes.forEach((n, i) => { fx.fillStyle = n; fx.fillRect(x + 3 + (i % 2) * 15, y + 3 + Math.floor(i / 2) * 12, 12, 9); });
    } else if (key === 'mailbox') {
      fx.fillStyle = '#8B6F47'; fx.fillRect(x + 12, y + 8, 4, 20);
      fx.fillStyle = '#4F9FAF'; fx.fillRect(x + 4, y, 20, 12);
      fx.fillStyle = '#1A1320'; fx.fillRect(x + 4, y, 20, 2);
      if (S.mailPending) { fx.fillStyle = '#D96A62'; fx.fillRect(x + 20, y - 8, 4, 10); } // flag up
    } else if (key === 'coffee') {
      fx.fillStyle = '#1A1320'; fx.fillRect(x, y + 6, 24, 22);
      fx.fillStyle = '#D99168'; fx.fillRect(x + 3, y + 9, 18, 16);
      fx.fillStyle = '#FCFAF0'; fx.fillRect(x + 6, y + 12, 12, 6);
    }
  }
}

/* desks + seats. Each agent claims a seat: {x, y} pixel center of chair. */
function deskAt(x, y) {
  // 32x32 desk + laptop, chair below at y+28
  fx.fillStyle = '#8B6F47'; fx.fillRect(x, y, 32, 24);
  fx.fillStyle = '#C9A66B'; fx.fillRect(x + 2, y + 2, 28, 20);
  fx.fillStyle = '#1A1320'; fx.fillRect(x + 10, y + 6, 12, 8);   // laptop
  fx.fillStyle = '#4F9FAF'; fx.fillRect(x + 11, y + 7, 10, 6);
  // chair
  fx.fillStyle = '#6B5878'; fx.fillRect(x + 10, y + 28, 12, 4);
  fx.fillStyle = '#3D2E4A'; fx.fillRect(x + 14, y + 32, 4, 6);
}

let SEATS = []; // filled after agents load: [{agentId, x, y, deskX, deskY}]

function layoutSeats() {
  SEATS = [];
  const ids = S.agents.map((a) => a.id);
  const put = (agentId, tx, ty) => {
    const dx = tx * TILE, dy = ty * TILE;
    SEATS.push({ agentId, x: dx + 16, y: dy + 44, deskX: dx, deskY: dy });
  };
  let i = 0;
  const next = () => ids[i++];
  // CEO office: NOVA (first agent is nova)
  put(next(), 4, 2);
  // Bullpen: 2 rows x 5
  for (let r = 0; r < 2 && i < ids.length; r++)
    for (let c = 0; c < 5 && i < ids.length; c++) put(next(), 11 + c * 2, 3 + r * 3);
  // Studio: 1 row x 4
  for (let c = 0; c < 4 && i < ids.length; c++) put(next(), 24 + c * 2, 3);
  // Lab: 1 row x 4
  for (let c = 0; c < 4 && i < ids.length; c++) put(next(), 11 + c * 2, 12);
  // Cafe stools: rest
  let cx = 24;
  while (i < ids.length) { put(next(), cx, 14); cx += 2; if (cx > 31) cx = 24; }
}

function drawDesks() {
  for (const s of SEATS) {
    // skip cafe stools (drawn as stools)
    const room = inRoom(Math.floor(s.deskX / TILE), Math.floor(s.deskY / TILE));
    if (room && room.name === 'CAFE') {
      fx.fillStyle = '#8B6F47'; fx.fillRect(s.deskX + 8, s.deskY + 8, 16, 16);
      fx.fillStyle = '#C9A66B'; fx.fillRect(s.deskX + 10, s.deskY + 10, 12, 12);
    } else {
      deskAt(s.deskX, s.deskY);
    }
  }
}

/* agent floor entities */
const ENT = {}; // agentId -> {x, y, tx, ty, dir, frame, frameT, mode}
function entFor(id) {
  if (!ENT[id]) {
    const seat = SEATS.find((s) => s.agentId === id);
    ENT[id] = { x: seat ? seat.x : 100, y: seat ? seat.y : 100, tx: null, ty: null, dir: 'up', frame: 0, frameT: 0, mode: 'seat' };
  }
  return ENT[id];
}

function seatOf(id) { return SEATS.find((s) => s.agentId === id); }

function updateEntities(dt, now) {
  for (const a of S.agents) {
    const e = entFor(a.id);
    const seat = seatOf(a.id);
    // decide target by status
    let want = null; // {x, y, mode}
    if (a.status === 'thinking') {
      const s = STATIONS.terminal;
      want = { x: s.tx * TILE + 16 + (hashN(a.id) % 3) * 36, y: s.ty * TILE + 52, mode: 'queue' };
    } else if (a.status === 'working') {
      const s = STATIONS.terminal;
      want = { x: s.tx * TILE + 16, y: s.ty * TILE + 44, mode: 'station' };
    } else if (a.status === 'blocked') {
      want = { x: 17 * TILE, y: 20 * TILE, mode: 'entrance' }; // entrance
    } else if (seat) {
      want = { x: seat.x, y: seat.y, mode: 'seat' };
    }
    if (want) {
      const dx = want.x - e.x, dy = want.y - e.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 3) {
        const sp = 80 * dt; // 80 px/sec per spec
        e.x += (dx / dist) * Math.min(sp, dist);
        e.y += (dy / dist) * Math.min(sp, dist);
        e.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        e.frameT += dt;
        if (e.frameT > 0.125) { e.frameT = 0; e.frame = (e.frame + 1) % 4; }
        e.mode = 'walk';
      } else {
        e.mode = want.mode;
        e.frame = 0;
        e.dir = want.mode === 'seat' || want.mode === 'station' ? 'up' : e.dir;
      }
    }
  }
}

function hashN(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

function drawStatusOverlay(x, y, status, now) {
  const oy = y - 34;
  if (status === 'thinking' || status === 'working') {
    const n = 1 + Math.floor(now / 400) % 3;
    fx.fillStyle = '#1A1320';
    for (let i = 0; i < n; i++) fx.fillRect(x - 6 + i * 6, oy, 3, 3);
  } else if (status === 'blocked') {
    const pulse = Math.floor(now / 400) % 2 === 0;
    fx.fillStyle = pulse ? '#D96A62' : '#F3D3CD';
    fx.fillRect(x - 2, oy - 6, 4, 8);
    fx.fillRect(x - 2, oy + 3, 4, 3);
    fx.fillStyle = '#1A1320';
    fx.fillRect(x - 3, oy - 7, 6, 1); fx.fillRect(x - 3, oy + 7, 6, 1);
  } else if (status === 'success') {
    // 4-frame star burst
    const f = Math.floor(now / 125) % 4;
    fx.fillStyle = '#DCAB3C';
    const r = 4 + f * 2;
    fx.fillRect(x - 1, oy - r, 2, r * 2);
    fx.fillRect(x - r, oy - 1, r * 2, 2);
    if (f > 1) { fx.fillRect(x - r + 2, oy - r + 2, 3, 3); fx.fillRect(x + r - 5, oy + r - 5, 3, 3); }
  }
}

function drawEntities(now) {
  // sort by y for depth
  const list = S.agents.map((a) => ({ a, e: entFor(a.id) })).sort((p, q) => p.e.y - q.e.y);
  for (const { a, e } of list) {
    const selected = a.id === S.selectedId;
    if (selected) {
      fx.strokeStyle = '#1A1320'; fx.lineWidth = 2;
      fx.strokeRect(Math.round(e.x) - 14, Math.round(e.y) - 26, 28, 30);
    }
    // shadow
    fx.fillStyle = 'rgba(26,19,32,0.18)';
    fx.fillRect(Math.round(e.x) - 8, Math.round(e.y) + 2, 16, 4);
    // sprite (draw at 1x into 24x24 then blit)
    const spr = getSprite(a, e.frame, e.dir);
    fx.drawImage(spr, Math.round(e.x) - 12, Math.round(e.y) - 24);
    drawStatusOverlay(Math.round(e.x), Math.round(e.y), a.status, now);
    // nameplate
    fx.font = '8px "Press Start 2P", monospace';
    const nm = a.name;
    const w = fx.measureText(nm).width;
    fx.fillStyle = 'rgba(255,248,231,0.92)';
    fx.fillRect(Math.round(e.x) - w / 2 - 3, Math.round(e.y) + 8, w + 6, 12);
    fx.fillStyle = '#1A1320';
    fx.fillText(nm, Math.round(e.x) - w / 2, Math.round(e.y) + 17);
  }
}

const SPR_CACHE = {};
function getSprite(agent, frame, dir) {
  const key = agent.id + ':' + frame + ':' + dir + ':' + document.documentElement.dataset.cthTheme;
  if (!SPR_CACHE[key]) {
    const c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    drawAvatar(c.getContext('2d'), agent, frame, dir);
    SPR_CACHE[key] = c;
  }
  return SPR_CACHE[key];
}

let lastT = 0;
function floorLoop(t) {
  const now = t || performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  if (!document.hidden) {
    fx.clearRect(0, 0, floor.width, floor.height);
    drawFloorBase();
    drawStations(now);
    drawDesks();
    updateEntities(dt, now);
    drawEntities(now);
  }
  requestAnimationFrame(floorLoop);
}

/* click to select agent */
floor.addEventListener('click', (ev) => {
  const r = floor.getBoundingClientRect();
  const sx = floor.width / r.width, sy = floor.height / r.height;
  const mx = (ev.clientX - r.left) * sx, my = (ev.clientY - r.top) * sy;
  let best = null, bd = 28;
  for (const a of S.agents) {
    const e = entFor(a.id);
    const d = Math.hypot(e.x - mx, (e.y - 12) - my);
    if (d < bd) { bd = d; best = a.id; }
  }
  if (best) selectAgent(best);
});

/* ================= agent strip ================= */
function gaugePct(a) {
  if (a.status === 'working') return 45 + (hashN(a.id + (a.current_task_id || '')) % 30);
  if (a.status === 'thinking') return 25;
  if (a.status === 'success') return 90;
  return 12;
}

function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = '';
  const order = ['nova', ...S.agents.filter((a) => a.id !== 'nova').map((a) => a.id)];
  for (const id of order) {
    const a = S.byId[id];
    if (!a) continue;
    const card = document.createElement('div');
    card.className = 'agent-card' + (a.id === 'nova' ? ' god' : '') + (a.id === S.selectedId ? ' selected' : '');
    const label = STATUS_LABEL[a.status] || a.status;
    const pct = gaugePct(a);
    const gcolor = pct >= 80 ? 'var(--cth-coral)' : pct >= 60 ? 'var(--cth-lemon)' : 'var(--cth-' + a.accent + ')';
    const ctx = a.status_note || a.role;
    card.innerHTML =
      '<div class="row1">' +
        '<div class="portrait" style="background:var(--cth-' + a.accent + '-light)"></div>' +
        '<div class="name">' + esc(a.name) + '</div>' +
        (a.id === 'nova' ? '<span class="boss-tag">BOSS</span>' : '') +
        '<span class="pixel-badge" data-status="' + esc(a.status) + '"><span class="dot"></span>' + esc(label) + '</span>' +
      '</div>' +
      '<div class="context">' + esc(ctx) + '</div>' +
      '<div class="note">' + esc(a.status === 'idle' ? 'at desk, awaiting' : (a.status_note || '')) + '</div>' +
      '<div class="gauge"><div class="fill" style="width:' + pct + '%;background:' + gcolor + '"></div></div>';
    card.querySelector('.portrait').appendChild(portraitCanvas(a, 36));
    card.addEventListener('click', () => selectAgent(a.id));
    strip.appendChild(card);
  }
}

/* ================= sidebar ================= */
function selectAgent(id) {
  S.selectedId = id;
  S.tab = 'terminal';
  renderStrip();
  renderDetail();
}

function accentVar(a) { return 'var(--cth-' + a.accent + ')'; }

function renderDetail() {
  const a = S.byId[S.selectedId];
  // preserve in-progress typing across re-renders
  const keepQ = $('#q-input') ? $('#q-input').value : '';
  const keepBrief = $('#brief-input') ? $('#brief-input').value : '';
  const el = $('#detail');
  if (!a) {
    el.innerHTML = '<div class="pixel-panel-title">No agent</div><p class="muted">Select an agent on the floor or strip.</p>';
    return;
  }
  if (a.id === 'nova') return renderCommandCenter(a, el);
  const label = STATUS_LABEL[a.status] || a.status;
  const tasks = S.tasks.filter((t) => t.agent_id === a.id).slice(0, 8);
  const cur = a.current_task_id ? S.tasks.find((t) => t.id === a.current_task_id) : null;
  const logs = cur ? JSON.parse(cur.logs || '[]') : [];
  const msgs = S.myMessages[a.id] || [];

  let body = '';
  if (S.tab === 'terminal') {
    body =
      '<div class="live-row"><span class="live-dot"></span><span>live &middot; ' + esc(a.name.toLowerCase()) + '</span></div>' +
      '<div class="log-view" style="margin-top:8px">' +
      (logs.length ? logs.map((l) => '<p class="log-line"><span class="t">' + esc((l.at || '').slice(11, 19)) + '</span> ' + esc(l.text) + '</p>').join('') : '<p class="log-line muted">quiet. no output yet.</p>') +
      '</div>';
  } else if (S.tab === 'tasks') {
    body = tasks.length
      ? tasks.map(taskRow).join('')
      : '<p class="muted">No tasks yet. Queue one below.</p>';
  } else {
    body = msgs.length
      ? msgs.map((m) => '<div class="task-row"><div class="t-title">' + esc(m) + '</div><div class="t-meta">you &middot; queued</div></div>').join('')
      : '<p class="muted">No messages. Agents message each other as they work.</p>';
  }

  el.innerHTML =
    '<div class="detail-header">' +
      '<div class="portrait" style="background:var(--cth-' + a.accent + '-light)"></div>' +
      '<div class="who"><div class="name">' + esc(a.name) + '</div>' +
      '<div class="sub">' + esc(a.role) + ' &middot; ' + esc(a.department) + '</div></div>' +
      '<span class="pixel-badge" data-status="' + esc(a.status) + '"><span class="dot"></span>' + esc(label) + '</span>' +
    '</div>' +
    '<div class="tabs" style="--tab-accent:' + accentVar(a) + '">' +
      ['terminal', 'tasks', 'messages'].map((t) => '<button class="tab' + (S.tab === t ? ' active' : '') + '" data-tab="' + t + '">' + t + '</button>').join('') +
    '</div>' +
    '<div class="tab-body">' + body + '</div>' +
    '<div class="composer">' +
      '<div class="q-head"><span class="q-title">QUEUE</span><span class="q-count">' + msgs.length + '</span></div>' +
      '<textarea id="q-input" placeholder="> brief ' + esc(a.name.toLowerCase()) + '..."></textarea>' +
      '<div class="q-actions"><button class="pixel-btn pixel-btn-primary pixel-btn-md" id="q-send">Send</button></div>' +
    '</div>';

  el.querySelector('.portrait').appendChild(portraitCanvas(a, 32));
  $$('.tab', el).forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; renderDetail(); }));
  if (keepQ) $('#q-input', el).value = keepQ;
  if (keepBrief && $('#brief-input', el)) $('#brief-input', el).value = keepBrief;
  $('#q-send', el).addEventListener('click', async () => {
    const ta = $('#q-input', el);
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    (S.myMessages[a.id] = S.myMessages[a.id] || []).push(text);
    toast(a.accent, a.name + ' got your brief.', 'Queued: ' + text.slice(0, 60));
    const r = await API.assignTask(a.id, text.slice(0, 80), text);
    if (!r.ok) toast('coral', 'Could not queue that.', r.error || 'error');
    await refresh(false);
  });
}

function taskRow(t) {
  const a = S.byId[t.agent_id];
  const logs = JSON.parse(t.logs || '[]');
  return '<div class="task-row">' +
    '<div class="t-title">' + esc(t.title) + '</div>' +
    '<div class="t-meta">' + esc(t.status) + (a ? ' &middot; ' + esc(a.name) : '') + ' &middot; ' + esc((t.created_at || '').slice(11, 16)) + '</div>' +
    (logs.length ? '<div class="mono muted" style="font-size:12px;margin-top:4px">' + esc(logs[logs.length - 1].text) + '</div>' : '') +
  '</div>';
}

/* ================= command center (NOVA) ================= */
function renderCommandCenter(a, el) {
  const keepBrief = $('#brief-input') ? $('#brief-input').value : '';
  const label = STATUS_LABEL[a.status] || a.status;
  const recent = S.tasks.slice(0, 10);
  let body = '';
  if (S.ccTab === 'floor') {
    body = S.agents.filter((x) => x.id !== 'nova').map((x) => {
      const l = STATUS_LABEL[x.status] || x.status;
      return '<div class="task-row" style="display:flex;align-items:center;gap:8px">' +
        '<span class="pixel-badge" data-status="' + esc(x.status) + '"><span class="dot"></span>' + esc(l) + '</span>' +
        '<span style="flex:1"><b>' + esc(x.name) + '</b> <span class="muted">' + esc(x.role) + '</span></span>' +
        '<button class="pixel-btn pixel-btn-secondary pixel-btn-sm" data-pick="' + x.id + '">open</button></div>';
    }).join('');
  } else if (S.ccTab === 'tasks') {
    body = recent.length ? recent.map(taskRow).join('') : '<p class="muted">No tasks on the board yet.</p>';
  } else {
    body = '<div class="log-view">' +
      (S.eventFeed.slice(-30).reverse().map((e) => '<p class="log-line"><span class="t">' + esc((e.created_at || '').slice(11, 19)) + '</span> ' + esc(e.text) + '</p>').join('') || '<p class="log-line muted">quiet on the floor.</p>') +
      '</div>';
  }

  el.innerHTML =
    '<div class="detail-header">' +
      '<div class="portrait" style="background:var(--cth-' + a.accent + '-light)"></div>' +
      '<div class="who"><div class="cmd-title">COMMAND CENTER</div>' +
      '<div class="sub">runs the floor</div></div>' +
      '<span class="pixel-badge" data-status="' + esc(a.status) + '"><span class="dot"></span>' + esc(label) + '</span>' +
    '</div>' +
    '<div class="tab-body" style="padding-bottom:0">' +
      '<div class="brief-box">' +
        '<div class="brief-title">Brief NOVA</div>' +
        '<textarea id="brief-input" placeholder="Tell NOVA what the office should do. She routes it to the right agent."></textarea>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="pixel-btn pixel-btn-primary pixel-btn-md" id="brief-send">Send brief</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="tabs tabbar-scroll" style="--tab-accent:' + accentVar(a) + ';overflow-x:auto">' +
      ['floor', 'tasks', 'activity'].map((t) => '<button class="tab' + (S.ccTab === t ? ' active' : '') + '" data-cctab="' + t + '">' + t + '</button>').join('') +
    '</div>' +
    '<div class="tab-body">' + body + '</div>';

  el.querySelector('.portrait').appendChild(portraitCanvas(a, 32));
  $$('[data-cctab]', el).forEach((b) => b.addEventListener('click', () => { S.ccTab = b.dataset.cctab; renderDetail(); }));
  $$('[data-pick]', el).forEach((b) => b.addEventListener('click', () => selectAgent(b.dataset.pick)));
  if (keepBrief) $('#brief-input', el).value = keepBrief;
  $('#brief-send', el).addEventListener('click', async () => {
    const ta = $('#brief-input', el);
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    const r = await API.brief(text);
    if (r.ok) {
      const who = (r.routed_to || '').toUpperCase();
      toast(a.accent, 'NOVA routed your brief to ' + who + '.', text.slice(0, 60));
      selectAgent(r.routed_to || 'nova');
    } else {
      toast('coral', 'Brief failed.', r.error || 'error');
    }
    await refresh(false);
  });
}

/* ================= toasts ================= */
function toast(accent, title, msg) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = '<div class="stripe" style="background:var(--cth-' + accent + ')"></div>' +
    '<div class="body"><div class="msg"><b>' + esc(title) + '</b><br><span class="muted">' + esc(msg || '') + '</span></div></div>';
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 5000);
  while (box.children.length > 4) box.firstChild.remove();
}

/* ================= data refresh ================= */
S.eventFeed = [];

async function refresh(reseed) {
  try {
    const agents = await API.agents();
    // hash index for sprite variety (stable per agent)
    for (const a of agents) a._hi = hashN(a.id);
    // detect status transitions for toasts
    for (const a of agents) {
      const prev = S.byId[a.id];
      if (prev && prev.status !== a.status) {
        if (a.status === 'success') toast(a.accent, a.name + ' is done!', a.status_note || 'task complete');
        if (a.status === 'blocked') toast('coral', a.name + ' needs you.', a.status_note || '');
      }
    }
    S.agents = agents;
    S.byId = {};
    for (const a of agents) S.byId[a.id] = a;
    if (reseed || SEATS.length === 0) layoutSeats();
  } catch (e) { /* offline — keep last state */ }
  try {
    S.tasks = await API.tasks();
  } catch (e) {}
  renderStrip();
  renderDetail();
}

async function pollEvents() {
  try {
    const evs = await API.events(S.lastEventId);
    for (const e of evs) {
      S.lastEventId = Math.max(S.lastEventId, e.id);
      let text = '';
      try {
        const p = JSON.parse(e.payload || '{}');
        if (e.type === 'task') text = (p.title || 'task') + ' — ' + p.status;
        else if (e.type === 'agent') text = p.id + ' is ' + p.status;
        else if (e.type === 'brief') text = 'brief routed to ' + (p.routed_to || '?');
        else text = e.type;
      } catch { text = e.type; }
      S.eventFeed.push({ created_at: e.created_at, text });
    }
    if (S.eventFeed.length > 200) S.eventFeed = S.eventFeed.slice(-200);
  } catch (e) {}
}

/* ================= chrome ================= */
$('#btn-theme').addEventListener('click', () => {
  const html = document.documentElement;
  const dark = html.dataset.cthTheme !== 'dark';
  html.dataset.cthTheme = dark ? 'dark' : 'light';
  $('#btn-theme').innerHTML = dark ? '&#9789;' : '&#9728;';
  for (const k of Object.keys(SPR_CACHE)) delete SPR_CACHE[k]; // re-render sprites for theme
});

$('#btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});

$('#btn-settings').addEventListener('click', () => {
  const root = $('#modal-root');
  root.innerHTML =
    '<div class="modal-backdrop"><div class="modal">' +
    '<div class="pixel-panel-title">Settings</div>' +
    '<p>Collancer Office runs its agents through Muse. No API keys, no CLI setup.</p>' +
    '<p class="muted">20 agents pre-seeded. Brief NOVA and she routes the work.</p>' +
    '<div class="m-actions"><button class="pixel-btn pixel-btn-primary pixel-btn-md" id="m-close">Close</button></div>' +
    '</div></div>';
  $('#m-close').addEventListener('click', () => { root.innerHTML = ''; });
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => { if (e.target.classList.contains('modal-backdrop')) root.innerHTML = ''; });
});

/* sidebar splitter */
(() => {
  const sp = $('#splitter'), sb = $('#sidebar');
  let drag = false;
  sp.addEventListener('mousedown', () => { drag = true; document.body.style.cursor = 'col-resize'; });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const w = Math.max(320, Math.min(640, window.innerWidth - e.clientX - 32));
    sb.style.width = w + 'px';
  });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.cursor = ''; });
})();

$('#btn-seed').addEventListener('click', async () => { await refresh(true); });

/* ================= init ================= */
(async function init() {
  await refresh(true);
  if (!S.byId[S.selectedId]) S.selectedId = (S.agents[0] || {}).id;
  renderStrip();
  renderDetail();
  requestAnimationFrame(floorLoop);
  setInterval(() => refresh(false), 2500);
  setInterval(pollEvents, 3000);
  setInterval(() => { if (S.ccTab === 'activity' && S.selectedId === 'nova') renderDetail(); }, 4000);
})();
