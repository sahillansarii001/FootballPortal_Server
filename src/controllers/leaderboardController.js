const StandingsService = require('../services/standingsService');
const PlayerService = require('../services/playerService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getTournamentStandings = asyncHandler(async (req, res) => {
  const standings = await StandingsService.getPointTable(req.params.tournamentId);
  return ApiResponse.success(res, 'Tournament standings fetched successfully', standings);
});

const getTeamRanking = asyncHandler(async (req, res) => {
  const { tournamentId, teamId } = req.params;
  const ranking = await StandingsService.getTeamRanking(tournamentId, teamId);
  return ApiResponse.success(res, 'Team ranking fetched successfully', ranking);
});

const getOverallLeaderboard = asyncHandler(async (req, res) => {
  const leaderboard = await StandingsService.getOverallLeaderboard();
  return ApiResponse.success(res, 'Overall team leaderboard fetched successfully', leaderboard);
});

const getTopGoalScorers = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
  const scorers = await PlayerService.getTopGoalScorers(limit);
  return ApiResponse.success(res, 'Top goal scorers fetched successfully', scorers);
});

const getTopPenaltyScorers = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
  const scorers = await PlayerService.getTopPenaltyScorers(limit);
  return ApiResponse.success(res, 'Top penalty scorers fetched successfully', scorers);
});

const getTopGoalkeepers = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
  const goalkeepers = await PlayerService.getTopGoalkeepers(limit);
  return ApiResponse.success(res, 'Top goalkeepers fetched successfully', goalkeepers);
});

const getAllPlayerRecords = asyncHandler(async (req, res) => {
  const players = await PlayerService.getAllPlayers(req.query);
  return ApiResponse.success(res, 'Player records fetched successfully', players);
});

module.exports = {
  getTournamentStandings,
  getTeamRanking,
  getOverallLeaderboard,
  getTopGoalScorers,
  getTopPenaltyScorers,
  getTopGoalkeepers,
  getAllPlayerRecords
};
