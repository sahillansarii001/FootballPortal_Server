const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');
const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');
const validate = require('../middleware/validateMiddleware');
const { createPlayerSchema, updatePlayerSchema } = require('../validators/playerValidators');
const { ROLES } = require('../utils/constants');

// Public routes
router.get('/', playerController.getAllPlayers);
router.get('/:id', playerController.getPlayerById);
router.get('/:id/stats', playerController.getPlayerStatistics);
router.get('/team/:teamId', playerController.getPlayersByTeam);

// Super Admin protected routes
router.post(
  '/',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(createPlayerSchema),
  playerController.createPlayer
);

router.put(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate(updatePlayerSchema),
  playerController.updatePlayer
);

router.delete(
  '/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  playerController.deletePlayer
);

module.exports = router;
