/* COLLANCER OFFICE — Database layer.
 *
 * Tries node:sqlite first (local dev). Falls back to a pure-JS in-memory
 * store on Vercel/serverless where native SQLite may not be available.
 * The fallback implements the same prepare().run()/get()/all() API surface
 * used by agents.js, tasks.js and index.js.
 */

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

/* ---------------- In-memory fallback ---------------- */

function createMemoryDb() {
  const tables = { agents: [], tasks: [], events: [], messages: [] };
  let eventSeq = 0;

  function matchWhere(row, whereClause, params) {
    // Supports the small set of WHERE patterns used by this app.
    const p = [...params];
    // id = ?
    let m = whereClause.match(/id\s*=\s*\?/);
    if (m) { const v = p.shift(); if (String(row.id) !== String(v)) return false; }
    // id > ?
    m = whereClause.match(/id\s*>\s*\?/);
    if (m) { const v = p.shift(); if (!(Number(row.id) > Number(v))) return false; }
    // status = 'literal'
    const lit = whereClause.match(/status\s*=\s*'([^']+)'/);
    if (lit && row.status !== lit[1]) return false;
    // status IN ('a','b')
    const inl = whereClause.match(/status\s+IN\s*\(([^)]+)\)/i);
    if (inl) {
      const vals = inl[1].split(',').map(s => s.trim().replace(/'/g, ''));
      if (!vals.includes(row.status)) return false;
    }
    return true;
  }

  function orderRows(rows, sql) {
    const m = sql.match(/ORDER BY\s+([\w.]+)(?:\s+(ASC|DESC))?/i);
    if (!m) return rows;
    const col = m[1].includes('.') ? m[1].split('.')[1] : m[1];
    const dir = (m[2] || 'ASC').toUpperCase();
    const key = col === 'rowid' ? '__rowid' : col;
    return [...rows].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av === bv) return 0;
      const c = av < bv ? -1 : 1;
      return dir === 'DESC' ? -c : c;
    });
  }

  const api = {
    exec() { /* schema is implicit in memory */ },
    prepare(sql) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      return {
        run(...params) {
          if (/^INSERT INTO events/i.test(norm)) {
            eventSeq += 1;
            tables.events.push({ id: eventSeq, type: params[0], payload: params[1] || '{}', created_at: nowIso() });
            return { lastInsertRowid: eventSeq };
          }
          if (/^INSERT INTO tasks/i.test(norm) || /^INSERT OR IGNORE INTO tasks/i.test(norm)) {
            const cols = norm.match(/INSERT(?: OR IGNORE)? INTO tasks \(([^)]+)\)/i)[1].split(',').map(s => s.trim());
            // Support both positional (?) and named (@name) parameters
            let vals = params;
            if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && /@\w+/.test(norm)) {
              const obj = params[0];
              vals = cols.map(c => obj[c]);
            }
            const row = { __rowid: tables.tasks.length };
            // Parse VALUES to handle literals like 'pending', 0, '[]' mixed with ? params
            const tValsClause = norm.match(/VALUES\s*\(([^)]+)\)/i);
            const tValTokens = tValsClause ? tValsClause[1].split(',').map(s => s.trim()) : [];
            const tNamedObj = (params.length === 1 && typeof params[0] === 'object' && params[0] !== null) ? params[0] : null;
            let tPosIdx = 0;
            cols.forEach((c, i) => {
              const tok = tValTokens[i] || '?';
              const litM = tok.match(/^'([^']*)'$/);
              if (litM) { row[c] = litM[1]; return; }
              if (/^\d+$/.test(tok)) { row[c] = parseInt(tok, 10); return; }
              if (tok.startsWith('@') && tNamedObj) { row[c] = tNamedObj[tok.slice(1)] !== undefined ? tNamedObj[tok.slice(1)] : tNamedObj[c]; return; }
              row[c] = vals[tPosIdx++];
            });
            row.created_at = row.created_at || nowIso();
            row.updated_at = nowIso();
            tables.tasks.push(row);
            return {};
          }
          if (/^INSERT INTO agents/i.test(norm) || /^INSERT OR IGNORE INTO agents/i.test(norm)) {
            // OR IGNORE: skip if id already exists
            const cols = norm.match(/INSERT(?: OR IGNORE)? INTO agents \(([^)]+)\)/i)[1].split(',').map(s => s.trim());
            // Support both positional (?) and named (@name) parameters
            let avals = params;
            if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && /@\w+/.test(norm)) {
              const obj = params[0];
              avals = cols.map(c => obj[c]);
            }
            const idIdx = cols.indexOf('id');
            if (/OR IGNORE/i.test(norm) && tables.agents.some(r => String(r.id) === String(avals[idIdx]))) {
              return {};
            }
            const row = { __rowid: tables.agents.length };
            // Parse VALUES to handle literals like 'idle' mixed with @params
            const valsClause = norm.match(/VALUES\s*\(([^)]+)\)/i);
            const valTokens = valsClause ? valsClause[1].split(',').map(s => s.trim()) : [];
            const namedObj = (params.length === 1 && typeof params[0] === 'object' && params[0] !== null) ? params[0] : null;
            let posIdx = 0;
            cols.forEach((c, i) => {
              const tok = valTokens[i] || '?';
              const litM = tok.match(/^'([^']*)'$/);
              if (litM) { row[c] = litM[1]; return; }
              if (tok.startsWith('@') && namedObj) { row[c] = namedObj[tok.slice(1)] !== undefined ? namedObj[tok.slice(1)] : namedObj[c]; return; }
              row[c] = avals[posIdx++];
            });
            tables.agents.push(row);
            return {};
          }
          if (/^UPDATE agents SET/i.test(norm)) {
            const where = norm.split(/WHERE/i)[1] || '';
            const setPart = norm.split(/WHERE/i)[0];
            let pi = 0;
            for (const row of tables.agents) {
              // evaluate WHERE with trailing params
              const whereParams = params.slice(params.length - (where.match(/\?/g) || []).length);
              if (!matchWhere(row, where, whereParams)) continue;
              if (/status\s*=\s*\?/.test(setPart)) row.status = params[pi++];
              if (/status_note\s*=\s*COALESCE\(\?,\s*status_note\)/.test(setPart)) {
                const v = params[pi++]; if (v !== null && v !== undefined) row.status_note = v;
              }
              if (/current_task_id\s*=\s*\?/.test(setPart)) row.current_task_id = params[pi++];
              if (/context_used/.test(setPart) && /context_used\s*=\s*\?/.test(setPart)) row.context_used = params[pi++];
              row.updated_at = nowIso();
            }
            return {};
          }
          if (/^UPDATE tasks SET/i.test(norm)) {
            const where = norm.split(/WHERE/i)[1] || '';
            const setPart = norm.split(/WHERE/i)[0];
            let pi = 0;
            const need = {};
            if (/status\s*=\s*'running'/.test(setPart)) need.statusRunning = true;
            if (/status\s*=\s*'completed'/.test(setPart)) need.statusCompleted = true;
            if (/stage\s*=\s*1\b/.test(setPart)) need.stage1 = true;
            if (/stage\s*=\s*99\b/.test(setPart)) need.stage99 = true;
            if (/stage\s*=\s*\?/.test(setPart)) need.stageParam = true;
            if (/logs\s*=\s*\?/.test(setPart)) need.logsParam = true;
            for (const row of tables.tasks) {
              const whereParams = params.slice(params.length - (where.match(/\?/g) || []).length);
              if (!matchWhere(row, where, whereParams)) continue;
              if (need.statusRunning) row.status = 'running';
              if (need.statusCompleted) { row.status = 'completed'; row.completed_at = nowIso(); }
              if (need.stage1) row.stage = 1;
              if (need.stage99) row.stage = 99;
              if (need.stageParam) row.stage = params[pi++];
              if (need.logsParam) row.logs = params[pi++];
              row.updated_at = nowIso();
            }
            return {};
          }
          if (/^DELETE FROM/i.test(norm)) {
            const tbl = norm.match(/^DELETE FROM (\w+)/i)[1];
            const where = norm.split(/WHERE/i)[1] || '';
            tables[tbl] = tables[tbl].filter(row => {
              const whereParams = params.slice(params.length - (where.match(/\?/g) || []).length);
              return !matchWhere(row, where, whereParams);
            });
            return {};
          }
          return {};
        },
        get(...params) {
          const rows = this.all(...params);
          return rows[0];
        },
        all(...params) {
          if (/FROM agents/i.test(norm)) {
            let rows = tables.agents.filter(r => {
              const wm = norm.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s*$)/i);
              return wm ? matchWhere(r, wm[1], params) : true;
            });
            // success-stale check: updated_at < datetime('now','-6 seconds')
            if (/updated_at\s*<\s*datetime\('now',\s*'-6 seconds'\)/.test(norm)) {
              const cutoff = Date.now() - 6000;
              rows = rows.filter(r => new Date((r.updated_at || '').replace(' ', 'T') + 'Z').getTime() < cutoff);
            }
            rows = orderRows(rows, norm);
            const lm = norm.match(/LIMIT\s+(\d+|\?)/i);
            if (lm) {
              const n = lm[1] === '?' ? params[params.length - 1] : parseInt(lm[1], 10);
              rows = rows.slice(0, n);
            }
            // SELECT id FROM agents -> project id only
            if (/SELECT\s+id\s+FROM/i.test(norm)) return rows.map(r => ({ id: r.id }));
            return rows.map(r => ({ ...r }));
          }
          if (/FROM tasks/i.test(norm)) {
            let rows = tables.tasks.filter(r => {
              const wm = norm.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s*$)/i);
              return wm ? matchWhere(r, wm[1], params) : true;
            });
            rows = orderRows(rows, norm);
            const lm = norm.match(/LIMIT\s+(\d+|\?)/i);
            if (lm) {
              const n = lm[1] === '?' ? params[params.length - 1] : parseInt(lm[1], 10);
              rows = rows.slice(0, n);
            }
            return rows.map(r => ({ ...r }));
          }
          if (/FROM events/i.test(norm)) {
            if (/SELECT\s+MAX\(id\)/i.test(norm)) {
              return [{ m: tables.events.length ? Math.max(...tables.events.map(e => e.id)) : null }];
            }
            let rows = tables.events.filter(r => {
              const wm = norm.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s*$)/i);
              return wm ? matchWhere(r, wm[1], params) : true;
            });
            rows = orderRows(rows, norm);
            const lm = norm.match(/LIMIT\s+(\d+|\?)/i);
            if (lm) {
              const n = lm[1] === '?' ? params[params.length - 1] : parseInt(lm[1], 10);
              rows = rows.slice(0, n);
            }
            return rows.map(r => ({ ...r }));
          }
          return [];
        }
      };
    }
  };
  return api;
}

/* ---------------- Try sqlite, fall back to memory ---------------- */

let db;
let usingMemory = false;
try {
  const { DatabaseSync } = require('node:sqlite');
  const path = require('path');
  const fs = require('fs');
  const dbPath = process.env.OFFICE_DB_PATH || path.join(__dirname, '../data/office.db');
  try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch {}
  const real = new DatabaseSync(dbPath);
  real.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
  department TEXT NOT NULL, accent TEXT NOT NULL DEFAULT 'sky',
  archetype TEXT NOT NULL DEFAULT 'hacker', status TEXT NOT NULL DEFAULT 'idle',
  status_note TEXT DEFAULT '', current_task_id TEXT,
  context_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, objective TEXT DEFAULT '',
  agent_id TEXT REFERENCES agents(id), status TEXT NOT NULL DEFAULT 'pending',
  stage INTEGER NOT NULL DEFAULT 0, logs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT,
  type TEXT NOT NULL DEFAULT 'progress', content TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
  db = real;
} catch (e) {
  usingMemory = true;
  db = createMemoryDb();
}

function emit(type, payload) {
  try {
    db.prepare('INSERT INTO events (type, payload) VALUES (?, ?)').run(type, JSON.stringify(payload || {}));
  } catch {}
}

module.exports = { db, emit, usingMemory };
