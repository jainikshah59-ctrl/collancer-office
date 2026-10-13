/* COLLANCER OFFICE — Task queue with a serverless-safe state machine.
 *
 * No background processes: task progress is driven by ELAPSED TIME. Every read
 * calls progress(), which advances pending -> running -> completed based on
 * timestamps. This works on Vercel serverless where nothing persists between
 * invocations.
 *
 * Stage timeline (seconds since creation):
 *   0-3    pending    — agent is thinking (walking to station)
 *   3-25   running    — agent is working (log lines appear over time)
 *   25+    completed  — agent done, star burst, back to idle
 */
const crypto = require('crypto');
const { db, emit } = require('./db');
const Agents = require('./agents');

const THINK_S = 3;    // pending -> running
const WORK_S = 25;    // running -> completed

const WORK_LINES = [
  'Reading the briefing…',
  'Checking memory for related work…',
  'Drafting a plan…',
  'Working through the details…',
  'Double-checking edge cases…',
  'Polishing the result…',
];

function create({ title, objective, agent_id }) {
  if (!title || !String(title).trim()) throw new Error('title required');
  const agent = Agents.get(agent_id);
  if (!agent) throw new Error('unknown agent: ' + agent_id);
  const id = 'task_' + crypto.randomUUID().slice(0, 8);
  db.prepare(`INSERT INTO tasks (id, title, objective, agent_id, status, stage, logs)
    VALUES (?, ?, ?, ?, 'pending', 0, '[]')`)
    .run(id, String(title).trim(), String(objective || '').trim(), agent_id);
  Agents.setTask(agent_id, id);
  Agents.setStatus(agent_id, 'thinking', String(title).trim());
  emit('task', { id, agent_id, status: 'pending', title });
  return get(id);
}

function get(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function list(limit) {
  progress();
  return db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?').all(Math.min(limit || 50, 200));
}

/** Advance all open tasks by elapsed time. Idempotent. */
function progress() {
  // success flash -> idle (serverless-safe; no background timers on Vercel)
  try {
    const stale = db.prepare("SELECT id FROM agents WHERE status = 'success' AND updated_at < datetime('now', '-6 seconds')").all();
    for (const r of stale) Agents.setStatus(r.id, 'idle', '');
  } catch {}
  const rows = db.prepare("SELECT * FROM tasks WHERE status IN ('pending','running')").all();
  const now = Date.now();
  for (const t of rows) {
    const ageS = (now - new Date(t.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000;
    const logs = JSON.parse(t.logs || '[]');
    if (t.status === 'pending' && ageS >= THINK_S) {
      db.prepare("UPDATE tasks SET status = 'running', stage = 1, updated_at = datetime('now') WHERE id = ?").run(t.id);
      Agents.setStatus(t.agent_id, 'working', t.title);
      pushLog(t.id, 'Started work.');
      emit('task', { id: t.id, agent_id: t.agent_id, status: 'running', title: t.title });
    } else if (t.status === 'running') {
      // reveal work lines as time passes
      const want = Math.min(WORK_LINES.length, 1 + Math.floor((ageS - THINK_S) / 4));
      let changed = false;
      for (let i = logs.length; i < want; i++) {
        logs.push({ at: new Date().toISOString(), text: WORK_LINES[i] });
        changed = true;
      }
      if (changed) {
        db.prepare('UPDATE tasks SET logs = ?, stage = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(logs), 1 + want, "datetime('now')", t.id);
        emit('task', { id: t.id, agent_id: t.agent_id, status: 'running', progress: want });
      }
      if (ageS >= THINK_S + WORK_S) {
        logs.push({ at: new Date().toISOString(), text: 'Done. Result ready for review.' });
        db.prepare(`UPDATE tasks SET status = 'completed', stage = 99, logs = ?,
          completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
          .run(JSON.stringify(logs), t.id);
        Agents.setStatus(t.agent_id, 'success', 'Task complete');
        Agents.setTask(t.agent_id, null);
        emit('task', { id: t.id, agent_id: t.agent_id, status: 'completed', title: t.title });
        // back to idle shortly after the success flash
        setTimeout(() => {
          try {
            const a = Agents.get(t.agent_id);
            if (a && a.status === 'success') Agents.setStatus(t.agent_id, 'idle', '');
          } catch {}
        }, 4000).unref?.();
      }
    }
  }
}

function pushLog(taskId, text) {
  const t = get(taskId);
  if (!t) return;
  const logs = JSON.parse(t.logs || '[]');
  logs.push({ at: new Date().toISOString(), text });
  db.prepare("UPDATE tasks SET logs = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(logs), taskId);
}

/** Brief the GOD agent. NOVA thinks, then delegates to the best specialist. */
function brief(text) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('briefing text required');
  const lower = clean.toLowerCase();

  // simple routing by keyword
  let target = 'strategos';
  if (/secur|auth|vuln|xss|key/.test(lower)) target = 'sentinel';
  else if (/pay|wallet|refund|cashfree|upi/.test(lower)) target = 'ledger';
  else if (/design|ui|ux|pixel|align/.test(lower)) target = 'aura';
  else if (/front|css|react|component/.test(lower)) target = 'pixel';
  else if (/back|api|server|endpoint|db|firestore/.test(lower)) target = 'forge';
  else if (/data|schema|index|query/.test(lower)) target = 'datawave';
  else if (/test|qa|bug|edge/.test(lower)) target = 'sherlock';
  else if (/money|price|fee|revenue|monet/.test(lower)) target = 'monet';
  else if (/growth|viral|referral|share/.test(lower)) target = 'growth';
  else if (/analytic|track|metric/.test(lower)) target = 'insight';
  else if (/doc|readme|guide/.test(lower)) target = 'relay';
  else if (/research|competitor|market/.test(lower)) target = 'oracle';
  else if (/architec|structur/.test(lower)) target = 'atlas';

  const godTask = create({ title: clean.slice(0, 80), objective: clean, agent_id: 'nova' });
  // NOVA immediately delegates: mark the specialist task as the real work
  const work = create({ title: clean.slice(0, 80), objective: clean, agent_id: target });
  pushLog(godTask.id, `Routing to ${target.toUpperCase()}…`);
  db.prepare("UPDATE tasks SET status = 'completed', stage = 99, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(godTask.id);
  Agents.setStatus('nova', 'idle', '');
  Agents.setTask('nova', null);
  emit('brief', { text: clean, routed_to: target });
  return { god_task: godTask, task: work, routed_to: target };
}

module.exports = { create, get, list, progress, pushLog, brief };
