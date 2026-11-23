const { z } = require('zod');
const { MATCH_STATUS } = require('../utils/constants');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

function isValidFlexibleDate(val) {
  if (!val) return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10) - 1;
    const year = parseInt(ddmmyyyy[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    return !isNaN(d.getTime());
  }
  const parsed = Date.parse(str);
  return !isNaN(parsed);
}

function parseToIsoDateString(val) {
  if (!val) return val;
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
  return str;
}

const scheduleMatchSchema = z.object({
  tournament: z.string().optional(),
  tournamentId: z.string().optional(),
  matchNumber: z.number().int().positive('Match number must be positive').optional(),
  teamA: z.string().regex(objectIdRegex, 'Invalid Team A ID'),
  teamB: z.string().regex(objectIdRegex, 'Invalid Team B ID'),
  matchDate: z.string().refine((val) => isValidFlexibleDate(val), {
    message: 'Invalid match date format (expected YYYY-MM-DD or DD-MM-YYYY)'
  }).refine((val) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parsed = new Date(parseToIsoDateString(val));
    parsed.setHours(0, 0, 0, 0);
    return parsed >= today;
  }, {
    message: 'Match date cannot be in the past. Matches must be scheduled for today or a future date.'
  }),
  matchTime: z.string().optional().default('14:00'),
  venue: z.string().min(2, 'Venue is required'),
  stage: z.string().optional()
}).refine((data) => data.teamA !== data.teamB, {
  message: 'Team A and Team B must be different teams',
  path: ['teamB']
}).transform((data) => ({
  ...data,
  tournament: data.tournament || data.tournamentId,
  matchDate: parseToIsoDateString(data.matchDate)
}));

const updateMatchSchema = z.object({
  matchNumber: z.number().int().positive().optional(),
  teamA: z.string().regex(objectIdRegex).optional(),
  teamB: z.string().regex(objectIdRegex).optional(),
  matchDate: z.string().refine((val) => isValidFlexibleDate(val), {
    message: 'Invalid match date format (expected YYYY-MM-DD or DD-MM-YYYY)'
  }).optional(),
  matchTime: z.string().optional(),
  venue: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum(Object.values(MATCH_STATUS)).optional(),
  teamAScore: z.number().int().min(0).optional(),
  teamBScore: z.number().int().min(0).optional(),
  winner: z.string().nullable().optional(),
  matchResult: z.string().optional(),
  isFinalized: z.boolean().optional(),
  shootout: z.object({
    isShootout: z.boolean().optional(),
    teamAPenaltyScore: z.number().int().min(0).optional(),
    teamBPenaltyScore: z.number().int().min(0).optional(),
    teamAPenaltiesTaken: z.number().int().min(0).optional(),
    teamBPenaltiesTaken: z.number().int().min(0).optional(),
    round: z.number().int().min(0).optional(),
    isCompleted: z.boolean().optional(),
    shootoutWinner: z.string().nullable().optional()
  }).optional()
}).passthrough().transform((data) => ({
  ...data,
  ...(data.matchDate ? { matchDate: parseToIsoDateString(data.matchDate) } : {})
}));

module.exports = {
  scheduleMatchSchema,
  updateMatchSchema,
  isValidFlexibleDate,
  parseToIsoDateString
};
