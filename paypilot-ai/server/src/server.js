import 'dotenv/config';
import app from './app.js';
import connectDatabase from './config/database.js';
import { startRenewalReminderSchedule } from './Service/renewalReminders.js';

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev_jwt_secret_change_me_for_real_projects_123456' : '');

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set (32+ characters)');
}

process.env.JWT_SECRET = jwtSecret;

const port = Number(process.env.PORT) || 5000;

try {
  await connectDatabase();
  startRenewalReminderSchedule();
  app.listen(port, () => {
    console.info(`PayPilot API listening on port ${port}.`);
  });
} catch (error) {
  console.error('Server startup failed:', error);
  process.exitCode = 1;
}
