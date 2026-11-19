const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');
const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');
const validate = require('../middleware/validateMiddleware');
const { createTournamentSchema, updateTournamentSchema } = require('../validators/tournamentValidators');
const { ROLES } = require('../utils/constants');

// Public routes
router.get('/', tournamentController.getAllTournaments);
router.get('/:id', tournamentController.getTournamentById);
router.get('/:id/standings', tournamentController.getTournamentStandings);

// Super Admin protected routes
router.post(
  '/',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(createTournamentSchema),
  tournamentController.createTournament
);

router.put(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(updateTournamentSchema),
  tournamentController.updateTournament
);

router.patch(
  '/:id/status',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  tournamentController.updateTournamentStatus
);

router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  tournamentController.deleteTournament
);

module.exports = router;
