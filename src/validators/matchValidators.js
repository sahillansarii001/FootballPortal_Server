const { z } = require('zod');
const { MATCH_STATUS } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const scheduleMatchSchema = z.object({
  tournament: z.string().regex(objectIdRegex, 'Invalid Tournament ID'),
  matchNumber: z.number().int().positive('Match number must be positive'),
  teamA: z.string().regex(objectIdRegex, 'Invalid Team A ID'),
  teamB: z.string().regex(objectIdRegex, 'Invalid Team B ID'),
  matchDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid match date format'
  }),
  matchTime: z.string().min(1, 'Match time is required (e.g. 15:00)'),
  venue: z.string().min(2, 'Venue is required')
}).refine((data) => data.teamA !== data.teamB, {
  message: 'Team A and Team B must be different teams',
  path: ['teamB']
});

const updateMatchSchema = z.object({
  matchNumber: z.number().int().positive().optional(),
  teamA: z.string().regex(objectIdRegex).optional(),
  teamB: z.string().regex(objectIdRegex).optional(),
  matchDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid match date format'
  }).optional(),
  matchTime: z.string().optional(),
  venue: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum(Object.values(MATCH_STATUS)).optional(),
  teamAScore: z.number().int().min(0).optional(),
  teamBScore: z.number().int().min(0).optional()
});

module.exports = {
  scheduleMatchSchema,
  updateMatchSchema
};
