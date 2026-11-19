const { z } = require('zod');
const { ROLES } = require('../utils/constants');

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(30),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().optional(),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR, ROLES.PUBLIC_USER]).optional()
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required')
});

module.exports = {
  registerSchema,
  loginSchema
};
