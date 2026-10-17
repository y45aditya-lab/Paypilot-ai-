import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- user@example.com');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const user = await User.findOneAndUpdate({ email }, { role: 'admin' }, { new: true });
console.log(user ? `${user.email} is now an admin` : 'No user with that email');
await mongoose.disconnect();