const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const matchTimerController = require('../controllers/matchTimerController');
const goalController = require('../controllers/goalController');
const penaltyController = require('../controllers/penaltyController');
const summaryController = require('../controllers/summaryController');

const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');
const validate = require('../middleware/validateMiddleware');

const { scheduleMatchSchema, updateMatchSchema } = require('../validators/matchValidators');
const { recordGoalSchema, updateGoalSchema } = require('../validators/goalValidators');
const { recordPenaltySchema } = require('../validators/penaltyValidators');
const { ROLES } = require('../utils/constants');

// ==========================================
// Match Queries (Public)
// ==========================================
router.get('/', matchController.getAllMatches);
router.get('/upcoming', matchController.getUpcomingMatches);
router.get('/live', matchController.getLiveMatches);
router.get('/completed', matchController.getCompletedMatches);
router.get('/team/:teamId', matchController.getMatchesByTeam);

// Unified authoritative live match state (Frontend integration)
router.get('/:id/live', matchController.getLiveMatchState);

// Match Events & Timeline routes
router.get('/:id/events', matchController.getMatchEvents);
router.get('/:id/timeline', matchController.getMatchTimeline);

router.get('/:id', matchController.getMatchById);

// ==========================================
// Match Scheduling (Super Admin)
// ==========================================
router.post(
  '/',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(scheduleMatchSchema),
  matchController.scheduleMatch
);

router.put(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(updateMatchSchema),
  matchController.updateMatch
);

router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  matchController.deleteMatch
);

router.post(
  '/:id/end',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchController.endMatch
);

router.post(
  '/:id/finalize',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchController.endMatch
);

// ==========================================
// Live Match Timer Routes
// ==========================================
router.get('/:id/timer', matchTimerController.getTimerStatus);

router.post(
  '/:id/timer/start',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.startTimer
);

router.post(
  '/:id/start',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.startTimer
);

router.post(
  '/:id/timer/pause',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.pauseTimer
);

router.post(
  '/:id/pause',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.pauseTimer
);

router.post(
  '/:id/timer/resume',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.resumeTimer
);

router.post(
  '/:id/resume',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.resumeTimer
);

router.post(
  '/:id/timer/advance',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.advanceStage
);

router.post(
  '/:id/timer/reset',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.resetTimer
);

router.post(
  '/:id/timer/add-time',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.addTime
);

router.post(
  ['/:id/timer/stage', '/:id/timer/set-stage', '/:id/stage'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.setStage
);

router.post(
  ['/:id/halftime', '/:id/half-time'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  (req, res, next) => {
    req.body.stage = 'Half-Time';
    req.body.duration = 120;
    return matchTimerController.setStage(req, res, next);
  }
);

router.post(
  ['/:id/second-half', '/:id/secondhalf'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  (req, res, next) => {
    req.body.stage = 'Second Half';
    req.body.duration = 240;
    return matchTimerController.setStage(req, res, next);
  }
);

router.post(
  ['/:id/timer/set-time', '/:id/timer/time'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  matchTimerController.setClockTime
);

// ==========================================
// Goal Management Routes (supports /goals and /goal)
// ==========================================
router.get(['/:id/goals', '/:id/goal'], goalController.getMatchGoals);

router.post(
  ['/:id/goals', '/:id/goal'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  validate(recordGoalSchema),
  goalController.recordGoal
);

router.post(
  ['/:id/goals/undo', '/:id/goal/undo'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  goalController.undoGoal
);

router.delete(
  ['/:id/goals/:eventId', '/:id/goal/:eventId'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  goalController.undoGoal
);

router.put(
  ['/:id/goals/:eventId', '/:id/goal/:eventId'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  validate(updateGoalSchema),
  goalController.editGoal
);

// ==========================================
// Penalty Shootout Routes
// ==========================================
router.get('/:id/penalties', penaltyController.getMatchPenalties);

router.post(
  '/:id/penalties',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  validate(recordPenaltySchema),
  penaltyController.recordPenalty
);

// Sudden Death Toss & Decisive Kick Routes
router.post(
  '/:id/toss',
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  penaltyController.recordToss
);

router.post(
  ['/:id/toss/decisive-kick', '/:id/sudden-death/kick'],
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.MATCH_OPERATOR),
  penaltyController.recordDecisiveKick
);

// ==========================================
// Match Summary Route
// ==========================================
router.get('/:id/summary', summaryController.getMatchSummary);

module.exports = router;
