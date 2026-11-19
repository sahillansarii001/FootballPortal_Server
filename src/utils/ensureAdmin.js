const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { connectDatabase, disconnectDatabase } = require('../config/database');
const User = require('../models/User');
const AuthService = require('../services/authService');
const { ROLES } = require('./constants');
const logger = require('./logger');

async function ensureAdmin() {
  try {
    await connectDatabase();

    const targetEmail = 'admin@footballportal.com';
    const targetPassword = 'AdminPassword123!';

    let admin = await User.findOne({ email: targetEmail.toLowerCase() }).select('+password');

    if (admin) {
      logger.info(`Existing user found for ${targetEmail}. Updating password and role to Super Admin...`);
      admin.password = targetPassword;
      admin.role = ROLES.SUPER_ADMIN;
      admin.isActive = true;
      await admin.save();
      logger.success(`Admin user updated successfully.`);
    } else {
      logger.info(`Creating new Super Admin with email ${targetEmail}...`);
      admin = await User.create({
        username: 'superadmin',
        email: targetEmail.toLowerCase(),
        password: targetPassword,
        fullName: 'Super Administrator',
        role: ROLES.SUPER_ADMIN,
        isActive: true
      });
      logger.success(`Super Admin created successfully with ID: ${admin._id}`);
    }

    // Verify login
    logger.info(`Verifying login credentials...`);
    const loginResult = await AuthService.login(targetEmail, targetPassword);

    if (loginResult && loginResult.token) {
      logger.success(`Verification SUCCESSFUL! Token generated for ${loginResult.user.email} (${loginResult.user.role})`);
    } else {
      logger.error(`Verification failed!`);
    }

    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error(`Error ensuring admin credentials: ${err.message}`);
    process.exit(1);
  }
}

ensureAdmin();
