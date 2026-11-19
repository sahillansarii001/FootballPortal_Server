const TimerService = require('../services/timerService');
const Match = require('../models/Match');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getTimerStatus = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (!match) {
    return ApiResponse.notFound(res, 'Match not found');
  }

  const remainingTime = TimerService.calculateRemainingTime(match);

  return ApiResponse.success(res, 'Timer status fetched successfully', {
    matchId: match._id,
    status: match.status,
    currentStage: match.timer.currentStage,
    stageDuration: match.timer.stageDuration,
    remainingTime,
    isRunning: match.timer.isRunning,
    isPaused: match.timer.isPaused,
    startedTimestamp: match.timer.startedTimestamp,
    pausedTimestamp: match.timer.pausedTimestamp,
    totalPausedDuration: match.timer.totalPausedDuration,
    stageHistory: match.timer.stageHistory
  });
});

const startTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.startTimer(req.params.id, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, 'Timer started successfully', {
    matchId: match._id,
    status: match.status,
    timer: {
      ...match.timer.toObject(),
      remainingTime
    }
  });
});

const pauseTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.pauseTimer(req.params.id, req.user?._id);
  return ApiResponse.success(res, 'Timer paused successfully', {
    matchId: match._id,
    timer: match.timer
  });
});

const resumeTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.resumeTimer(req.params.id, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, 'Timer resumed successfully', {
    matchId: match._id,
    timer: {
      ...match.timer.toObject(),
      remainingTime
    }
  });
});

const resetTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.resetTimer(req.params.id, req.user?._id);
  return ApiResponse.success(res, 'Timer reset successfully', {
    matchId: match._id,
    timer: match.timer
  });
});

const advanceStage = asyncHandler(async (req, res) => {
  const match = await TimerService.advanceStage(req.params.id);
  if (!match) {
    return ApiResponse.badRequest(res, 'Unable to advance stage: match not found or not running');
  }
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, 'Stage advanced successfully', {
    matchId: match._id,
    status: match.status,
    timer: {
      ...match.timer.toObject(),
      remainingTime
    }
  });
});

const addTime = asyncHandler(async (req, res) => {
  const seconds = req.body.seconds || 120;
  const match = await TimerService.addTime(req.params.id, seconds, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, 'Extra time added successfully', {
    matchId: match._id,
    timer: {
      ...match.timer.toObject(),
      remainingTime
    }
  });
});

module.exports = {
  getTimerStatus,
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  advanceStage,
  addTime
};
