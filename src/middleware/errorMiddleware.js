const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method
  });

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return ApiResponse.badRequest(res, `Invalid format for field: ${err.path}`);
  }

  // Mongoose Duplicate Key Error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return ApiResponse.conflict(res, `Duplicate field value entered: ${field} must be unique`, {
      field,
      value: err.keyValue[field]
    });
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((el) => el.message);
    return ApiResponse.badRequest(res, 'Validation error', errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorized(res, 'Invalid authorization token');
  }
  if (err.name === 'TokenExpiredError') {
    return ApiResponse.unauthorized(res, 'Authorization token expired');
  }

  return ApiResponse.error(
    res,
    err.message || 'Internal Server Error',
    process.env.NODE_ENV === 'development' ? err : null,
    err.statusCode || 500
  );
};

const notFoundHandler = (req, res) => {
  return ApiResponse.notFound(res, `Endpoint not found: ${req.method} ${req.originalUrl}`);
};

module.exports = {
  errorHandler,
  notFoundHandler
};
