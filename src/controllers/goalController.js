const GoalService = require('../services/goalService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const recordGoal = asyncHandler(async (req, res) => {
  const result = await GoalService.recordGoal(req.params.id, req.body, req.user?._id);
  return ApiResponse.created(res, 'Goal recorded successfully', result);
});

const getMatchGoals = asyncHandler(async (req, res) => {
  const goals = await GoalService.getMatchGoals(req.params.id);
  return ApiResponse.success(res, 'Match goals fetched successfully', goals);
});

const getPlayerGoals = asyncHandler(async (req, res) => {
  const goals = await GoalService.getPlayerGoals(req.params.playerId);
  return ApiResponse.success(res, 'Player goals fetched successfully', goals);
});

const undoGoal = asyncHandler(async (req, res) => {
  const eventId = req.body?.eventId || req.query?.eventId;
  const result = await GoalService.undoGoal(req.params.id, eventId, req.user?._id);
  return ApiResponse.success(res, result.message, result);
});

const editGoal = asyncHandler(async (req, res) => {
  const updatedEvent = await GoalService.editGoal(req.params.id, req.params.eventId, req.body);
  return ApiResponse.success(res, 'Goal updated successfully', updatedEvent);
});

module.exports = {
  recordGoal,
  getMatchGoals,
  getPlayerGoals,
  undoGoal,
  editGoal
};
