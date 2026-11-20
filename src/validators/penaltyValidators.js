const { z } = require('zod');
const { PENALTY_OUTCOMES } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const recordPenaltySchema = z.object({
  team: z.string().optional(),
  teamId: z.string().optional(),
  player: z.string().optional(),
  playerId: z.string().optional(),
  goalkeeper: z.string().optional(),
  goalkeeperId: z.string().optional(),
  outcome: z.string()
}).transform((data) => {
  const team = data.team || data.teamId;
  const player = data.player || data.playerId;
  const goalkeeper = data.goalkeeper || data.goalkeeperId;
  let outcome = data.outcome;
  if (typeof outcome === 'string') {
    const lower = outcome.toLowerCase();
    if (lower === 'goal') outcome = PENALTY_OUTCOMES.GOAL;
    else if (lower === 'saved') outcome = PENALTY_OUTCOMES.SAVED;
    else if (lower === 'missed') outcome = PENALTY_OUTCOMES.MISSED;
    else outcome = PENALTY_OUTCOMES.GOAL;
  }
  return {
    team,
    player,
    goalkeeper,
    outcome
  };
}).refine((data) => Boolean(data.team && objectIdRegex.test(data.team)), {
  message: 'Invalid or missing Team ID',
  path: ['team']
}).refine((data) => Boolean(data.player && objectIdRegex.test(data.player)), {
  message: 'Invalid or missing Penalty Taker ID',
  path: ['player']
});

module.exports = {
  recordPenaltySchema
};
