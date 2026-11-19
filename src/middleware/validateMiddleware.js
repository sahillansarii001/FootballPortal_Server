const ApiResponse = require('../utils/apiResponse');

const validate = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse(req.body);
    req.body = validated;
    next();
  } catch (err) {
    if (err.errors) {
      const formattedErrors = err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message
      }));
      return ApiResponse.badRequest(res, 'Validation failed', formattedErrors);
    }
    return ApiResponse.badRequest(res, 'Invalid request data', err.message);
  }
};

module.exports = validate;
