/**
 * Standardized API Response Helper
 */

class ApiResponse {
  static success(res, message = 'Success', data = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data
    });
  }

  static created(res, message = 'Resource created successfully', data = null) {
    return res.status(201).json({
      success: true,
      message,
      data
    });
  }

  static error(res, message = 'Internal Server Error', error = null, statusCode = 500) {
    const response = {
      success: false,
      message,
      error: error ? (typeof error === 'string' ? error : error.message || error) : null
    };

    if (process.env.NODE_ENV === 'development' && error && error.stack) {
      response.stack = error.stack;
    }

    return res.status(statusCode).json(response);
  }

  static badRequest(res, message = 'Bad Request', error = null) {
    return ApiResponse.error(res, message, error, 400);
  }

  static unauthorized(res, message = 'Unauthorized access', error = null) {
    return ApiResponse.error(res, message, error, 401);
  }

  static forbidden(res, message = 'Forbidden: insufficient permissions', error = null) {
    return ApiResponse.error(res, message, error, 403);
  }

  static notFound(res, message = 'Resource not found', error = null) {
    return ApiResponse.error(res, message, error, 404);
  }

  static conflict(res, message = 'Conflict: resource already exists or conflict detected', error = null) {
    return ApiResponse.error(res, message, error, 409);
  }

  static paginated(res, message = 'Success', data = [], pagination = {}, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      pagination
    });
  }
}

module.exports = ApiResponse;
