import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run promote-admin -- user@example.com');
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await User.updateOne({ email }, { role: 'admin' });
    if (result.matchedCount !== 1) {
      console.error(`No account found for ${email}. Create the account before promoting it.`);
      process.exitCode = 1;
    } else {
      console.log(`Promoted ${email} to administrator.`);
    }
  } catch (error) {
    console.error('Could not promote administrator:', error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}
