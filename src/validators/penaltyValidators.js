const { z } = require('zod');
const { PENALTY_OUTCOMES } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const recordPenaltySchema = z.object({
  team: z.string().regex(objectIdRegex, 'Invalid Team ID'),
  player: z.string().regex(objectIdRegex, 'Invalid Penalty Taker ID'),
  goalkeeper: z.string().regex(objectIdRegex, 'Invalid Goalkeeper ID').optional(),
  outcome: z.enum(Object.values(PENALTY_OUTCOMES))
});

module.exports = {
  recordPenaltySchema
};
