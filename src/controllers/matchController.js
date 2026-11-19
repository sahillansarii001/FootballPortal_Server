const MatchService = require('../services/matchService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const scheduleMatch = asyncHandler(async (req, res) => {
  const match = await MatchService.scheduleMatch(req.body);
  return ApiResponse.created(res, 'Match scheduled successfully', match);
});

const updateMatch = asyncHandler(async (req, res) => {
  const match = await MatchService.updateMatch(req.params.id, req.body);
  return ApiResponse.success(res, 'Match updated successfully', match);
});

const deleteMatch = asyncHandler(async (req, res) => {
  const result = await MatchService.deleteMatch(req.params.id);
  return ApiResponse.success(res, result.message);
});

const getAllMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getAllMatches(req.query);
  return ApiResponse.success(res, 'Matches fetched successfully', matches);
});

const getUpcomingMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getUpcomingMatches(req.query.tournament);
  return ApiResponse.success(res, 'Upcoming matches fetched successfully', matches);
});

const getLiveMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getLiveMatches(req.query.tournament);
  return ApiResponse.success(res, 'Live matches fetched successfully', matches);
});

const getCompletedMatches = asyncHandler(async (req, res) => {
  const matches = await MatchService.getCompletedMatches(req.query.tournament);
  return ApiResponse.success(res, 'Completed matches fetched successfully', matches);
});

const getMatchById = asyncHandler(async (req, res) => {
  const match = await MatchService.getMatchById(req.params.id);
  return ApiResponse.success(res, 'Match fetched successfully', match);
});

const getMatchesByTeam = asyncHandler(async (req, res) => {
  const matches = await MatchService.getMatchesByTeam(req.params.teamId);
  return ApiResponse.success(res, 'Team matches fetched successfully', matches);
});

const getLiveMatchState = asyncHandler(async (req, res) => {
  const state = await MatchService.getLiveMatchState(req.params.id);
  return ApiResponse.success(res, 'Authoritative live match state fetched successfully', state);
});

const getMatchEvents = asyncHandler(async (req, res) => {
  const events = await MatchService.getMatchEvents(req.params.id);
  return ApiResponse.success(res, 'Match events fetched successfully', events);
});

const getMatchTimeline = asyncHandler(async (req, res) => {
  const timeline = await MatchService.getMatchTimeline(req.params.id);
  return ApiResponse.success(res, 'Match chronological timeline fetched successfully', timeline);
});

module.exports = {
  scheduleMatch,
  updateMatch,
  deleteMatch,
  getAllMatches,
  getUpcomingMatches,
  getLiveMatches,
  getCompletedMatches,
  getMatchById,
  getMatchesByTeam,
  getLiveMatchState,
  getMatchEvents,
  getMatchTimeline
};
