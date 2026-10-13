/* COLLANCER OFFICE — 20-agent registry.
 *
 * The full Collancer team, pre-seeded. Each agent gets a distinct accent from
 * the Munder Difflin palette and a sprite archetype. Accents cycle through the
 * 6 professional-saturation tones: coral, mint, sky, lemon, lilac, peach.
 * NOVA is the GOD agent (orchestrator) — the only one you brief.
 */
const { db, emit } = require('./db');

const AGENT_DEFS = [
  { id: 'nova',      name: 'NOVA',      role: 'Chief AI Officer',        department: 'executive',   accent: 'lemon',  archetype: 'wizard',      god: true },
  { id: 'strategos', name: 'STRATEGOS', role: 'Product Strategist',      department: 'product',     accent: 'coral',  archetype: 'scientist' },
  { id: 'oracle',    name: 'ORACLE',    role: 'Research Analyst',        department: 'product',     accent: 'mint',   archetype: 'astronaut' },
  { id: 'atlas',     name: 'ATLAS',     role: 'Software Architect',      department: 'engineering', accent: 'sky',    archetype: 'hacker' },
  { id: 'pixel',     name: 'PIXEL',     role: 'Frontend Engineer',       department: 'engineering', accent: 'lilac',  archetype: 'cat-villager' },
  { id: 'forge',     name: 'FORGE',     role: 'Backend Engineer',       department: 'engineering', accent: 'peach',  archetype: 'hacker' },
  { id: 'datawave',  name: 'DATAWAVE',  role: 'Database Engineer',       department: 'engineering', accent: 'coral',  archetype: 'scientist' },
  { id: 'circuit',   name: 'CIRCUIT',   role: 'Integrations Engineer',   department: 'engineering', accent: 'mint',   archetype: 'astronaut' },
  { id: 'aura',      name: 'AURA',      role: 'UI/UX Designer',          department: 'design',      accent: 'sky',    archetype: 'wizard' },
  { id: 'motion',    name: 'MOTION',    role: 'Interaction Designer',    department: 'design',      accent: 'lemon',  archetype: 'ninja' },
  { id: 'vision',    name: 'VISION',    role: 'Design Reviewer',         department: 'design',      accent: 'lilac',  archetype: 'cat-villager' },
  { id: 'sentinel',  name: 'SENTINEL',  role: 'Security Engineer',       department: 'quality',     accent: 'coral',  archetype: 'ninja' },
  { id: 'sherlock',  name: 'SHERLOCK',  role: 'QA Engineer',             department: 'quality',     accent: 'mint',   archetype: 'scientist' },
  { id: 'breaker',   name: 'BREAKER',   role: 'Adversarial Tester',      department: 'quality',     accent: 'sky',    archetype: 'hacker' },
  { id: 'gatekeeper',name: 'GATEKEEPER',role: 'Release Engineer',        department: 'quality',     accent: 'lemon',  archetype: 'astronaut' },
  { id: 'monet',     name: 'MONET',     role: 'Monetization Strategist', department: 'business',    accent: 'lilac',  archetype: 'wizard' },
  { id: 'ledger',    name: 'LEDGER',    role: 'Payments Engineer',       department: 'business',    accent: 'peach',  archetype: 'scientist' },
  { id: 'growth',    name: 'GROWTH',    role: 'Growth Strategist',       department: 'business',    accent: 'coral',  archetype: 'ninja' },
  { id: 'insight',   name: 'INSIGHT',   role: 'Analytics Engineer',      department: 'business',    accent: 'mint',   archetype: 'astronaut' },
  { id: 'relay',     name: 'RELAY',     role: 'Documentation Agent',     department: 'business',    accent: 'sky',    archetype: 'cat-villager' },
];

/** Insert all 20 agents if missing. Safe to call on every cold start. */
function seed() {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO agents (id, name, role, department, accent, archetype, status)
     VALUES (@id, @name, @role, @department, @accent, @archetype, 'idle')`
  );
  let inserted = 0;
  for (const def of AGENT_DEFS) {
    const { god, ...row } = def;
    inserted += stmt.run(row).changes;
  }
  return inserted;
}

function list() {
  return db.prepare('SELECT * FROM agents ORDER BY rowid').all();
}

function get(id) {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
}

function setStatus(id, status, note) {
  db.prepare("UPDATE agents SET status = ?, status_note = COALESCE(?, status_note), updated_at = datetime('now') WHERE id = ?")
    .run(status, note === undefined ? null : note, id);
  emit('agent', { id, status, note: note || '' });
}

function setTask(id, taskId) {
  db.prepare("UPDATE agents SET current_task_id = ?, updated_at = datetime('now') WHERE id = ?").run(taskId, id);
}

module.exports = { AGENT_DEFS, seed, list, get, setStatus, setTask };
