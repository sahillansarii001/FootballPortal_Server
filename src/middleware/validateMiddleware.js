const ApiResponse = require('../utils/apiResponse');

const validate = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse(req.body);
    req.body = validated;
    next();
  } catch (err) {
    if (err.errors) {
      const formattedErrors = err.errors.map((e) => ({
        field: e.path && e.path.length > 0 ? e.path.join('.') : 'request',
        message: e.message
      }));
      const summary = formattedErrors.map((e) => (e.field !== 'request' ? `${e.field}: ${e.message}` : e.message)).join(', ');
      return ApiResponse.badRequest(res, `Validation failed: ${summary}`, formattedErrors);
    }
    return ApiResponse.badRequest(res, 'Invalid request data', err.message);
  }
};

module.exports = validate;
