const { z } = require('zod');
const { GOAL_TYPES } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const recordGoalSchema = z.object({
  team: z.string().regex(objectIdRegex, 'Invalid Team ID'),
  player: z.string().regex(objectIdRegex, 'Invalid Player ID'),
  goalType: z.enum(Object.values(GOAL_TYPES)).default(GOAL_TYPES.NORMAL),
  matchTime: z.string().optional(),
  description: z.string().max(200).optional()
});

const updateGoalSchema = z.object({
  player: z.string().regex(objectIdRegex, 'Invalid Player ID').optional(),
  goalType: z.enum(Object.values(GOAL_TYPES)).optional(),
  matchTime: z.string().optional(),
  description: z.string().max(200).optional()
});

module.exports = {
  recordGoalSchema,
  updateGoalSchema
};
