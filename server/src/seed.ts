import { initDatabase } from './db/database';
import { usersRepo } from './db/repositories';
import { hashPassword } from './auth/passwords';
import { env } from './env';
import { logger } from './logger';

/**
 * Creates the demo agent account so the app is usable immediately after setup. Safe to run
 * repeatedly: it skips creation if the account already exists.
 */
async function seed(): Promise<void> {
  initDatabase();

  const email = env.SEED_AGENT_EMAIL.toLowerCase();
  const existing = usersRepo.findByEmail(email);
  if (existing) {
    logger.info({ email }, 'seed agent already exists');
  }

  const passwordHash = await hashPassword(env.SEED_AGENT_PASSWORD);
  let agent = existing;
  if (!agent) {
    agent = usersRepo.create({ email, name: env.SEED_AGENT_NAME, role: 'agent', passwordHash });
    logger.info({ email }, 'seed agent created');
    console.log(`\nDemo agent ready:\n  email:    ${email}\n  password: ${env.SEED_AGENT_PASSWORD}\n`);
  }

  // Generate 100 dummy sessions
  const { sessionsRepo } = await import('./db/repositories');
  logger.info('Generating 100 dummy sessions for the dashboard...');
  
  const issueTypes = ['Connectivity Issue', 'Setup Assistance', 'Firmware Update', 'Hardware Troubleshooting', 'Account Access'];
  
  for (let i = 0; i < 100; i++) {
    // Random start time within the last 30 days
    const daysAgo = Math.random() * 30;
    const started = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Random duration between 2 and 45 minutes
    const durationMs = (Math.random() * 43 + 2) * 60 * 1000;
    const ended = new Date(started.getTime() + durationMs);
    
    const session = sessionsRepo.create({
      title: issueTypes[Math.floor(Math.random() * issueTypes.length)],
      agentId: agent.id,
      agentName: agent.name,
      inviteCode: `DUMMY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    });
    
    // Force status and timestamps using setStatus
    sessionsRepo.setStatus(session.id, 'ended', { 
      startedAt: started.toISOString(), 
      endedAt: ended.toISOString() 
    });
    
    // Optionally override createdAt to match startedAt directly via raw db if needed, but setStatus handles the crucial parts.
    const { getDb } = await import('./db/database');
    getDb().prepare('UPDATE sessions SET created_at = ? WHERE id = ?').run(started.toISOString(), session.id);
  }
  logger.info('Dummy sessions seeded.');
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'seed failed');
    process.exit(1);
  });
