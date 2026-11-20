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
  const timerStatus = match.timer.timerStatus || (match.timer.isRunning ? (match.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'IDLE');

  return ApiResponse.success(res, 'Timer status fetched successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    currentStage: match.timer.currentStage,
    stageDuration: match.timer.stageDuration,
    remainingTime,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    timerStatus,
    isRunning: match.timer.isRunning,
    isPaused: match.timer.isPaused,
    startedTimestamp: match.timer.startedTimestamp,
    pausedTimestamp: match.timer.pausedTimestamp,
    totalPausedDuration: match.timer.totalPausedDuration,
    stageHistory: match.timer.stageHistory,
    serverTime: Date.now()
  });
});

const startTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.startTimer(req.params.id, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  const timerStatus = match.timer.timerStatus || (match.timer.isRunning ? (match.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'IDLE');

  return ApiResponse.success(res, 'Timer started successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    timerStatus,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});

const pauseTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.pauseTimer(req.params.id, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  const timerStatus = 'PAUSED';

  return ApiResponse.success(res, 'Timer paused successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    timerStatus,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: null,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});

const resumeTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.resumeTimer(req.params.id, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  const timerStatus = 'RUNNING';

  return ApiResponse.success(res, 'Timer resumed successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    timerStatus,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});

const resetTimer = asyncHandler(async (req, res) => {
  const match = await TimerService.resetTimer(req.params.id, req.user?._id);
  return ApiResponse.success(res, 'Timer reset successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    timerStatus: 'IDLE',
    remainingMs: match.timer.remainingTime * 1000,
    phaseEndsAt: null,
    serverTime: Date.now(),
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
    phase: match.timer.currentStage,
    timerStatus: match.timer.timerStatus,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});

const addTime = asyncHandler(async (req, res) => {
  const seconds = req.body.seconds || 120;
  const match = await TimerService.addTime(req.params.id, seconds, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, 'Extra time added successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    currentStage: match.timer.currentStage,
    timerStatus: match.timer.timerStatus,
    isRunning: match.timer.isRunning,
    isPaused: match.timer.isPaused,
    remainingTime,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});

const setStage = asyncHandler(async (req, res) => {
  const stage = req.body.stage || req.body.targetStage;
  const duration = req.body.duration !== undefined ? req.body.duration : req.body.durationSeconds;
  if (!stage) {
    return ApiResponse.badRequest(res, 'Stage is required');
  }
  const match = await TimerService.setStage(req.params.id, stage, duration, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, `Stage set to ${match.timer.currentStage} successfully`, {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    currentStage: match.timer.currentStage,
    timerStatus: match.timer.timerStatus,
    isRunning: match.timer.isRunning,
    isPaused: match.timer.isPaused,
    remainingTime,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});

const setClockTime = asyncHandler(async (req, res) => {
  const seconds = req.body.seconds;
  if (typeof seconds !== 'number' || seconds < 0) {
    return ApiResponse.badRequest(res, 'Valid seconds number required');
  }
  const match = await TimerService.setClockTime(req.params.id, seconds, req.user?._id);
  const remainingTime = TimerService.calculateRemainingTime(match);
  return ApiResponse.success(res, 'Clock time set successfully', {
    matchId: match._id,
    status: match.status,
    phase: match.timer.currentStage,
    currentStage: match.timer.currentStage,
    timerStatus: match.timer.timerStatus,
    isRunning: match.timer.isRunning,
    isPaused: match.timer.isPaused,
    remainingTime,
    remainingMs: remainingTime * 1000,
    phaseEndsAt: match.timer.phaseEndsAt,
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
    }
  });
});
    serverTime: Date.now(),
    timer: {
      ...match.timer.toObject(),
      remainingTime,
      remainingMs: remainingTime * 1000
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
  addTime,
  setStage,
  setClockTime
};
