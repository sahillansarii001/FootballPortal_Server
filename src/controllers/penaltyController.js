const PenaltyService = require('../services/penaltyService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const recordPenalty = asyncHandler(async (req, res) => {
  const result = await PenaltyService.recordPenalty(req.params.id, req.body, req.user?._id);
  return ApiResponse.created(res, 'Penalty kick recorded successfully', result);
});

const getMatchPenalties = asyncHandler(async (req, res) => {
  const result = await PenaltyService.getMatchPenalties(req.params.id);
  return ApiResponse.success(res, 'Match penalties fetched successfully', result);
});

module.exports = {
  recordPenalty,
  getMatchPenalties
};
