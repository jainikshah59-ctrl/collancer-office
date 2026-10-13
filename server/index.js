/* COLLANCER OFFICE — local Express server (port 3102). */
const path = require('path');
const express = require('express');
const cors = require('cors');

const { db } = require('./db');
const Agents = require('./agents');
const Tasks = require('./tasks');

const PORT = process.env.PORT || 3102;

Agents.seed();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, office: 'collancer' }));

app.get('/api/agents', (req, res) => {
  Tasks.progress();
  res.json(Agents.list());
});

app.get('/api/agents/:id', (req, res) => {
  Tasks.progress();
  const a = Agents.get(req.params.id);
  if (!a) return res.status(404).json({ ok: false, error: 'unknown agent' });
  const task = a.current_task_id ? Tasks.get(a.current_task_id) : null;
  res.json({ ...a, current_task: task });
});

app.post('/api/agents/:id/task', (req, res) => {
  try {
    const t = Tasks.create({ title: req.body.title, objective: req.body.objective, agent_id: req.params.id });
    res.json({ ok: true, task: t });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/tasks', (req, res) => res.json(Tasks.list(50)));

app.get('/api/tasks/:id', (req, res) => {
  Tasks.progress();
  const t = Tasks.get(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: 'unknown task' });
  res.json(t);
});

app.post('/api/brief', (req, res) => {
  try {
    res.json({ ok: true, ...Tasks.brief(req.body.text) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/* Polling endpoint (Vercel-safe). Local also offers SSE below. */
app.get('/api/events', (req, res) => {
  const since = parseInt(req.query.since || '0', 10) || 0;
  const rows = db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id DESC LIMIT 100').all(since);
  res.json(rows.reverse());
});

app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  let lastId = 0;
  try { lastId = (db.prepare('SELECT MAX(id) as m FROM events').get().m) || 0; } catch {}
  const timer = setInterval(() => {
    try {
      const rows = db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id').all(lastId);
      for (const ev of rows) {
        lastId = ev.id;
        res.write(`event: ${ev.type}\ndata: ${JSON.stringify({ id: ev.id, type: ev.type, payload: ev.payload })}\n\n`);
      }
    } catch {}
  }, 1500);
  req.on('close', () => clearInterval(timer));
});

app.use(express.static(path.join(__dirname, '../public')));

app.listen(PORT, () => console.log(`COLLANCER OFFICE on :${PORT}`));
