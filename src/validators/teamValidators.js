const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters').max(80),
  logo: z.string().optional(),
  description: z.string().optional(),
  captain: z.string().optional().nullable(),
  captainName: z.string().optional(),
  coach: z.string().optional(),
  conference: z.string().optional()
});

const updateTeamSchema = createTeamSchema.partial();

module.exports = {
  createTeamSchema,
  updateTeamSchema
};
