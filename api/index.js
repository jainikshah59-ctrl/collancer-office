/* COLLANCER OFFICE — Vercel serverless adapter.
 * /tmp SQLite is ephemeral per instance; agents re-seed on cold start.
 */
process.env.OFFICE_DB_PATH = '/tmp/collancer-office.db';

const express = require('express');
const cors = require('cors');
const path = require('path');
const { db } = require('../server/db');
const Agents = require('../server/agents');
const Tasks = require('../server/tasks');

Agents.seed();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, office: 'collancer' }));

app.get('/api/agents', (req, res) => {
  try { Tasks.progress(); res.json(Agents.list()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/agents/:id', (req, res) => {
  try {
    Tasks.progress();
    const a = Agents.get(req.params.id);
    if (!a) return res.status(404).json({ ok: false, error: 'unknown agent' });
    res.json({ ...a, current_task: a.current_task_id ? Tasks.get(a.current_task_id) : null });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/agents/:id/task', (req, res) => {
  try { res.json({ ok: true, task: Tasks.create({ title: req.body.title, objective: req.body.objective, agent_id: req.params.id }) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.get('/api/tasks', (req, res) => {
  try { res.json(Tasks.list(50)); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    Tasks.progress();
    const t = Tasks.get(req.params.id);
    if (!t) return res.status(404).json({ ok: false, error: 'unknown task' });
    res.json(t);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/brief', (req, res) => {
  try { res.json({ ok: true, ...Tasks.brief(req.body.text) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

/* Muse bridge endpoints — let the external Muse executor claim and update tasks.
 * Secured by a shared bridge token (set BRIDGE_TOKEN env on Vercel). */
function checkBridge(req, res) {
  const token = process.env.BRIDGE_TOKEN || 'collancer-bridge-dev';
  if (req.headers['x-bridge-token'] !== token) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return false;
  }
  return true;
}

app.patch('/api/tasks/:id', (req, res) => {
  if (!checkBridge(req, res)) return;
  try {
    const updated = Tasks.bridgeUpdate(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ ok: false, error: 'unknown task' });
    res.json({ ok: true, task: updated });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.get('/api/events', (req, res) => {
  try {
    const since = parseInt(req.query.since || '0', 10) || 0;
    const rows = db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT 100').all(since);
    res.json(rows.reverse());
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* Serve the static office UI (public/ ships with the function bundle) */
app.use(express.static(path.join(__dirname, '../public')));

module.exports = app;
