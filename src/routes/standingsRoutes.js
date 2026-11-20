const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');

// Tournament standings point table (root auto-resolves default active tournament)
router.get('/', leaderboardController.getTournamentStandings);
router.get('/:tournamentId', leaderboardController.getTournamentStandings);
router.post('/:tournamentId/recalculate', leaderboardController.recalculateStandings);

// Team specific standing in tournament
router.get('/:tournamentId/teams/:teamId', leaderboardController.getTeamRanking);

module.exports = router;
