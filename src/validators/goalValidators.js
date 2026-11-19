const { z } = require('zod');
const { GOAL_TYPES } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const recordGoalSchema = z.object({
  team: z.string().optional(),
  teamId: z.string().optional(),
  player: z.string().optional(),
  playerId: z.string().optional(),
  goalType: z.string().optional(),
  type: z.string().optional(),
  matchTime: z.string().optional(),
  minute: z.string().optional(),
  description: z.string().max(200).optional()
}).transform((data) => ({
  team: data.team || data.teamId,
  player: data.player || data.playerId,
  goalType: data.goalType || data.type || GOAL_TYPES.NORMAL,
  matchTime: data.matchTime || data.minute,
  description: data.description
}));

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
