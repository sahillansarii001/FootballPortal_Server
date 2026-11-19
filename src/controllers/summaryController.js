const SummaryService = require('../services/summaryService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getMatchSummary = asyncHandler(async (req, res) => {
  const summary = await SummaryService.getMatchSummary(req.params.id);
  return ApiResponse.success(res, 'Match summary generated successfully', summary);
});

module.exports = {
  getMatchSummary
};
