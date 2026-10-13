/* COLLANCER OFFICE — seed the 20-agent roster. Safe to run repeatedly. */
const Agents = require('./agents');
const n = Agents.seed();
console.log(`seeded ${n} new agents (${Agents.list().length} total)`);
