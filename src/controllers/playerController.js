const PlayerService = require('../services/playerService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { socketEmitter } = require('../sockets/socketManager');

const createPlayer = asyncHandler(async (req, res) => {
  const player = await PlayerService.createPlayer(req.body);
  socketEmitter.broadcastPlayerCreated(player);
  return ApiResponse.created(res, 'Player created successfully', player);
});

const updatePlayer = asyncHandler(async (req, res) => {
  const player = await PlayerService.updatePlayer(req.params.id, req.body);
  socketEmitter.broadcastPlayerUpdate(req.params.id, player);
  return ApiResponse.success(res, 'Player updated successfully', player);
});

const deletePlayer = asyncHandler(async (req, res) => {
  const result = await PlayerService.deletePlayer(req.params.id);
  socketEmitter.broadcastPlayerDeleted(req.params.id);
  return ApiResponse.success(res, result.message);
});

const getAllPlayers = asyncHandler(async (req, res) => {
  const players = await PlayerService.getAllPlayers(req.query);
  return ApiResponse.success(res, 'Players fetched successfully', players);
});

const getPlayerById = asyncHandler(async (req, res) => {
  const player = await PlayerService.getPlayerById(req.params.id);
  return ApiResponse.success(res, 'Player fetched successfully', player);
});

const getPlayerStatistics = asyncHandler(async (req, res) => {
  const stats = await PlayerService.getPlayerStatistics(req.params.id);
  return ApiResponse.success(res, 'Player statistics fetched successfully', stats);
});

const getPlayersByTeam = asyncHandler(async (req, res) => {
  const players = await PlayerService.getPlayersByTeam(req.params.teamId);
  return ApiResponse.success(res, 'Players by team fetched successfully', players);
});

module.exports = {
  createPlayer,
  updatePlayer,
  deletePlayer,
  getAllPlayers,
  getPlayerById,
  getPlayerStatistics,
  getPlayersByTeam
};
