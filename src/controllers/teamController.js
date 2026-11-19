const TeamService = require('../services/teamService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createTeam = asyncHandler(async (req, res) => {
  const team = await TeamService.createTeam(req.body);
  return ApiResponse.created(res, 'Team created successfully', team);
});

const updateTeam = asyncHandler(async (req, res) => {
  const team = await TeamService.updateTeam(req.params.id, req.body);
  return ApiResponse.success(res, 'Team updated successfully', team);
});

const deleteTeam = asyncHandler(async (req, res) => {
  const result = await TeamService.deleteTeam(req.params.id);
  return ApiResponse.success(res, result.message);
});

const getAllTeams = asyncHandler(async (req, res) => {
  const teams = await TeamService.getAllTeams(req.query);
  return ApiResponse.success(res, 'Teams fetched successfully', teams);
});

const getTeamById = asyncHandler(async (req, res) => {
  const team = await TeamService.getTeamById(req.params.id);
  return ApiResponse.success(res, 'Team fetched successfully', team);
});

const getTeamPlayers = asyncHandler(async (req, res) => {
  const players = await TeamService.getTeamPlayers(req.params.id);
  return ApiResponse.success(res, 'Team players fetched successfully', players);
});

const getTeamStatistics = asyncHandler(async (req, res) => {
  const stats = await TeamService.getTeamStatistics(req.params.id);
  return ApiResponse.success(res, 'Team statistics fetched successfully', stats);
});

module.exports = {
  createTeam,
  updateTeam,
  deleteTeam,
  getAllTeams,
  getTeamById,
  getTeamPlayers,
  getTeamStatistics
};
