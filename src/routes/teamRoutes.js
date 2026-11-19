const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');
const validate = require('../middleware/validateMiddleware');
const { createTeamSchema, updateTeamSchema } = require('../validators/teamValidators');
const { ROLES } = require('../utils/constants');

// Public routes
router.get('/', teamController.getAllTeams);
router.get('/:id', teamController.getTeamById);
router.get('/:id/players', teamController.getTeamPlayers);
router.get('/:id/stats', teamController.getTeamStatistics);

// Super Admin protected routes
router.post(
  '/',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(createTeamSchema),
  teamController.createTeam
);

router.put(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(updateTeamSchema),
  teamController.updateTeam
);

router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  teamController.deleteTeam
);

module.exports = router;
