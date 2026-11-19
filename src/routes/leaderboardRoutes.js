const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');

// Overall team points leaderboard
router.get('/', leaderboardController.getOverallLeaderboard);

// Top goal scorers leaderboard
router.get('/top-scorers', leaderboardController.getTopGoalScorers);

// Top penalty scorers leaderboard
router.get('/top-penalty-scorers', leaderboardController.getTopPenaltyScorers);

// Top goalkeepers based on penalties saved
router.get('/top-goalkeepers', leaderboardController.getTopGoalkeepers);

// All individual player records
router.get('/players', leaderboardController.getAllPlayerRecords);

// Tournament specific point table
router.get('/:tournamentId', leaderboardController.getTournamentStandings);

// Team ranking in a tournament
router.get('/:tournamentId/teams/:teamId', leaderboardController.getTeamRanking);

module.exports = router;
