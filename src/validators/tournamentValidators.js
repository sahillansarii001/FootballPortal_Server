const { z } = require('zod');
const { TOURNAMENT_STATUS } = require('../utils/constants');

const createTournamentSchema = z.object({
  name: z.string().min(2, 'Tournament name must be at least 2 characters').max(100),
  description: z.string().optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format'
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format'
  }),
  participatingTeams: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Team ID')).optional(),
  status: z.enum(Object.values(TOURNAMENT_STATUS)).optional(),
  rules: z.object({
    halfDurationSeconds: z.number().int().positive().optional(),
    transitionDurationSeconds: z.number().int().nonnegative().optional(),
    halfTimeDurationSeconds: z.number().int().nonnegative().optional(),
    initialPenaltyKicks: z.number().int().positive().optional(),
    pointsForWin: z.number().int().nonnegative().optional(),
    pointsForLoss: z.number().int().nonnegative().optional()
  }).optional()
});

const updateTournamentSchema = createTournamentSchema.partial();

module.exports = {
  createTournamentSchema,
  updateTournamentSchema
};
