/**
 * Async handler wrapper to eliminate try-catch boilerplate in route handlers/controllers
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
