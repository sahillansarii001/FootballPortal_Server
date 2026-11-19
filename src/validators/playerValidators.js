const { z } = require('zod');
const { PLAYER_POSITIONS } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const createPlayerSchema = z.object({
  name: z.string().min(2, 'Player name must be at least 2 characters').max(60),
  jerseyNumber: z.number().int().min(1, 'Jersey number must be >= 1').max(99, 'Jersey number must be <= 99'),
  club: z.string().max(100).optional(),
  team: z.string().regex(objectIdRegex, 'Invalid Team ID'),
  position: z.enum(Object.values(PLAYER_POSITIONS)).optional()
});

const updatePlayerSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  jerseyNumber: z.number().int().min(1).max(99).optional(),
  club: z.string().max(100).optional(),
  team: z.string().regex(objectIdRegex, 'Invalid Team ID').optional(),
  position: z.enum(Object.values(PLAYER_POSITIONS)).optional()
});

module.exports = {
  createPlayerSchema,
  updatePlayerSchema
};
