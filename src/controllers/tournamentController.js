const TournamentService = require('../services/tournamentService');
const StandingsService = require('../services/standingsService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createTournament = asyncHandler(async (req, res) => {
  const tournament = await TournamentService.createTournament(req.body, req.user._id);
  return ApiResponse.created(res, 'Tournament created successfully', tournament);
});

const updateTournament = asyncHandler(async (req, res) => {
  const tournament = await TournamentService.updateTournament(req.params.id, req.body);
  return ApiResponse.success(res, 'Tournament updated successfully', tournament);
});

const deleteTournament = asyncHandler(async (req, res) => {
  const result = await TournamentService.deleteTournament(req.params.id);
  return ApiResponse.success(res, result.message);
});

const getAllTournaments = asyncHandler(async (req, res) => {
  const tournaments = await TournamentService.getAllTournaments(req.query);
  return ApiResponse.success(res, 'Tournaments fetched successfully', tournaments);
});

const getTournamentById = asyncHandler(async (req, res) => {
  const tournament = await TournamentService.getTournamentById(req.params.id);
  return ApiResponse.success(res, 'Tournament details fetched successfully', tournament);
});

const updateTournamentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const tournament = await TournamentService.updateTournament(req.params.id, { status });
  return ApiResponse.success(res, 'Tournament status updated successfully', tournament);
});

const getTournamentStandings = asyncHandler(async (req, res) => {
  const standings = await StandingsService.getPointTable(req.params.id);
  return ApiResponse.success(res, 'Tournament standings fetched successfully', standings);
});

module.exports = {
  createTournament,
  updateTournament,
  deleteTournament,
  getAllTournaments,
  getTournamentById,
  updateTournamentStatus,
  getTournamentStandings
};
