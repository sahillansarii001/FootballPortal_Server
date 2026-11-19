const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');

// Tournament standings point table
router.get('/:tournamentId', leaderboardController.getTournamentStandings);

// Team specific standing in tournament
router.get('/:tournamentId/teams/:teamId', leaderboardController.getTeamRanking);

module.exports = router;
