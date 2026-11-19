const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/env');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

class AuthService {
  static generateToken(user) {
    return jwt.sign(
      {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }

  static async register(userData) {
    const { username, email, password, fullName, role } = userData;

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        const error = new Error('Email is already registered');
        error.statusCode = 400;
        throw error;
      }
      const error = new Error('Username is already taken');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password,
      fullName,
      role: role || ROLES.PUBLIC_USER
    });

    const token = AuthService.generateToken(user);

    return {
      user: user.toJSON(),
      token
    };
  }

  static async login(email, password) {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error = new Error('Account has been deactivated');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    user.lastLogin = new Date();
    await user.save();

    const token = AuthService.generateToken(user);

    return {
      user: user.toJSON(),
      token
    };
  }

  static async getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user.toJSON();
  }

  static async seedInitialSuperAdmin() {
    try {
      const adminExists = await User.findOne({ role: ROLES.SUPER_ADMIN });
      if (!adminExists) {
        const defaultAdmin = await User.create({
          username: 'superadmin',
          email: 'admin@footballportal.com',
          password: 'AdminPassword123!',
          fullName: 'System Super Admin',
          role: ROLES.SUPER_ADMIN
        });
        logger.info(`Default Super Admin seeded: admin@footballportal.com / AdminPassword123!`);
        return defaultAdmin;
      }
    } catch (err) {
      logger.error(`Error seeding initial Super Admin: ${err.message}`);
    }
  }
}

module.exports = AuthService;
