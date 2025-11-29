// Place this file at: src/scripts/seed.js
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import PlanLimits from '../models/PlanLimits.js';
import User from '../models/User.js';

async function run() {
  try {
    await connectDB();

    // 1) Seed PlanLimits
    const plans = [
      { plan: 'basic',   maxPosts: 10,    maxFileSizeMB: 10,  allowedMime: ['application/pdf','image/png','image/jpeg','image/webp'], canChangeCover: false },
      { plan: 'premium', maxPosts: 1000,  maxFileSizeMB: 100, allowedMime: ['application/pdf','image/png','image/jpeg','image/webp'], canChangeCover: true  },
    ];

    for (const p of plans) {
      await PlanLimits.updateOne({ plan: p.plan }, { $set: p }, { upsert: true });
    }
    console.log('✔ PlanLimits seeded/updated');

    // 2) Seed demo user (and an admin)
    const demoEmail = 'demo.user@example.com';
    let demo = await User.findOne({ email: demoEmail });
    if (!demo) {
      demo = new User({
        name: 'Demo User',
        email: demoEmail,
        plan: 'basic',
        about: 'This is a seeded demo user. You can log in and test uploads.',
        age: 21,
        city: 'Bengaluru',
        country: 'India',
        skills: ['HTML','CSS','JS'],
        languages: ['English']
      });
      await demo.setPassword('secret123'); // change after testing
      await demo.save();
      console.log(`✔ Demo user created: ${demo.email} / password: secret123`);
    } else {
      console.log(`ℹ Demo user already exists: ${demo.email}`);
    }

    const adminEmail = 'admin@example.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = new User({
        name: 'Admin',
        email: adminEmail,
        role: 'admin',
        plan: 'premium',
        city: 'Admin City',
        country: 'IN',
      });
      await admin.setPassword('admin123'); // change after testing
      await admin.save();
      console.log(`✔ Admin user created: ${admin.email} / password: admin123`);
    } else {
      console.log(`ℹ Admin user already exists: ${admin.email}`);
    }

  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('Mongo connection closed.');
  }
}

run();
