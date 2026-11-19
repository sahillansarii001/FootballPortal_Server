const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

const authenticate = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return ApiResponse.unauthorized(res, 'Authentication token missing or invalid');
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return ApiResponse.unauthorized(res, 'User associated with this token no longer exists');
    }

    if (!user.isActive) {
      return ApiResponse.forbidden(res, 'Account is deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token has expired, please log in again');
    }
    return ApiResponse.unauthorized(res, 'Invalid token');
  }
};

module.exports = authenticate;
