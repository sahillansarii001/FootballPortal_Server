const mongoose = require('mongoose');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const StandingsService = require('./standingsService');
const { socketEmitter } = require('../sockets/socketManager');
const {
  MATCH_STATUS,
  TIMER_STAGES,
  STAGE_DURATIONS,
  STAGE_ORDER,
  EVENT_TYPES
} = require('../utils/constants');
const logger = require('../utils/logger');

// Hardcoded core timer interval - 1-second ticks
const TIMER_TICK_INTERVAL_MS = 1000;

let tickerInterval = null;
const activeTickerLocks = new Set();

class TimerService {
  /**
   * Structured Diagnostic Logger for Match Timer Architecture
   */
  static logTimerAction(action, details) {
    const { matchId, prevStatus, newStatus, phase, remainingMs, source = 'API', userId = 'OFFICIAL' } = details;
    logger.info(
      `[TIMER_DIAGNOSTIC] [${action}] Match: ${matchId} | Prev: ${prevStatus} -> New: ${newStatus} | Phase: ${phase} | RemainingMs: ${remainingMs}ms | Source: ${source} | User: ${userId}`
    );
  }

  /**
   * Pure timestamp calculation of remaining seconds based on authoritative phaseEndsAt.
   * For running timer: remainingMs = max(0, phaseEndsAt - currentServerTime)
   * For paused timer: remainingMs = savedRemainingMs
   */
  static calculateRemainingTime(match) {
    if (!match || !match.timer) {
      return STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];
    }

    const { stageDuration, startedTimestamp, phaseEndsAt, isRunning, isPaused, remainingTime } = match.timer;

    // Completed matches return 0 unless explicitly running with active remaining time
    if ((match.status === MATCH_STATUS.COMPLETED || match.timer.currentStage === TIMER_STAGES.COMPLETED) && !isRunning && (!remainingTime || remainingTime <= 0)) {
      return 0;
    }

    // Penalty shootout returns 0 unless active timer was explicitly started or set
    if ((match.status === MATCH_STATUS.PENALTY_SHOOTOUT || match.timer.currentStage === TIMER_STAGES.PENALTY_SHOOTOUT) && !isRunning && (!remainingTime || remainingTime <= 0)) {
      return 0;
    }

    // Paused or not running: return exact saved remaining seconds
    if (!isRunning || isPaused) {
      return Math.max(0, typeof remainingTime === 'number' ? remainingTime : (stageDuration || 240));
    }

    // Running with phaseEndsAt timestamp (authoritative source of truth)
    if (phaseEndsAt) {
      const remainingMs = new Date(phaseEndsAt).getTime() - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    // Fallback if phaseEndsAt not set yet
    if (startedTimestamp) {
      const elapsedSec = Math.floor((Date.now() - new Date(startedTimestamp).getTime()) / 1000);
      return Math.max(0, (stageDuration || 240) - elapsedSec);
    }

    return stageDuration || 240;
  }

  /**
   * Start or resume match timer
   */
  static async startTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const prevStatus = match.timer.timerStatus || (match.timer.isRunning ? (match.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'NOT_STARTED');
    TimerService.logTimerAction('START_CLOCK_REQUESTED', {
      matchId,
      prevStatus,
      newStatus: 'RUNNING',
      phase: match.timer.currentStage || TIMER_STAGES.FIRST_HALF,
      remainingMs: (match.timer.remainingTime || 240) * 1000,
      userId: userId || 'OFFICIAL'
    });

    // Prevent timer on completed match unless reset
    if (match.status === MATCH_STATUS.COMPLETED) {
      TimerService.logTimerAction('START_CLOCK_REJECTED', {
        matchId,
        prevStatus: 'COMPLETED',
        newStatus: 'REJECTED',
        phase: match.timer.currentStage,
        remainingMs: 0,
        userId: userId || 'OFFICIAL'
      });
      throw new Error('Cannot start timer on completed match. Reset match first.');
    }

    if (match.status === MATCH_STATUS.PENALTY_SHOOTOUT) {
      match.status = MATCH_STATUS.LIVE;
      match.timer.currentStage = TIMER_STAGES.EXTRA_TIME;
      if (match.shootout) match.shootout.isShootout = false;
    }

    // If currently paused, resume it idempotently
    if (match.timer.isRunning && match.timer.isPaused) {
      return TimerService.resumeTimer(matchId, userId);
    }

    // If already running, return current match idempotently without changing timestamps
    if (match.timer.isRunning && !match.timer.isPaused) {
      return match;
    }

    const isInitialStart = match.status === MATCH_STATUS.UPCOMING;
    const tournament = await Tournament.findById(match.tournament);
    const halfDuration = tournament?.rules?.halfDurationSeconds || STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];

    const currentStage = match.timer.currentStage || TIMER_STAGES.FIRST_HALF;
    const stageDuration = STAGE_DURATIONS[currentStage] || halfDuration;
    const now = new Date();
    const phaseEndsAt = new Date(now.getTime() + stageDuration * 1000);

    match.status = currentStage === TIMER_STAGES.HALF_TIME ? MATCH_STATUS.HALF_TIME : MATCH_STATUS.LIVE;
    match.timer.currentStage = currentStage;
    match.timer.stageDuration = stageDuration;
    match.timer.remainingTime = stageDuration;
    match.timer.startedTimestamp = now;
    match.timer.phaseEndsAt = phaseEndsAt;
    match.timer.pausedTimestamp = null;
    match.timer.totalPausedDuration = 0;
    match.timer.isRunning = true;
    match.timer.isPaused = false;
    match.timer.timerStatus = 'RUNNING';

    await match.save();

    TimerService.logTimerAction('START_CLOCK_SUCCESS', {
      matchId,
      prevStatus,
      newStatus: 'RUNNING',
      phase: currentStage,
      remainingMs: stageDuration * 1000,
      userId: userId || 'OFFICIAL'
    });
    TimerService.logTimerAction('TIMER_STATE_CHANGED', {
      matchId,
      prevStatus,
      newStatus: 'RUNNING',
      phase: currentStage,
      remainingMs: stageDuration * 1000,
      userId: userId || 'OFFICIAL'
    });

    // If starting fresh from Upcoming, record MATCH_STARTED event
    if (isInitialStart) {
      const matchStartEvent = await MatchEvent.create({
        match: match._id,
        tournament: match.tournament,
        type: EVENT_TYPES.MATCH_STARTED,
        stage: currentStage,
        matchTime: '04:00',
        timestamp: now,
        detail: { stage: currentStage, stageDuration },
        createdBy: userId
      });
      match.events.push(matchStartEvent._id);
    }

    // Record TIMER_STARTED Event
    const timerStartEvent = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TIMER_STARTED,
      stage: currentStage,
      matchTime: `${stageDuration}s remaining`,
      timestamp: now,
      detail: { stage: currentStage, stageDuration },
      createdBy: userId
    });
    match.events.push(timerStartEvent._id);
    await match.save();

    // Broadcast authoritative state
    socketEmitter.broadcastTimerEvent(matchId, 'timer:started', {
      matchId,
      currentStage,
      remainingTime: stageDuration,
      stageDuration,
      phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
      matchId,
      currentStage,
      remainingTime: stageDuration,
      stageDuration,
      phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    return match;
  }

  /**
   * Pause match timer
   * Freezes remaining time, saves exact remaining seconds to MongoDB, clears phaseEndsAt.
   * Repeated pause requests are completely idempotent.
   */
  static async pauseTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const prevStatus = match.timer.timerStatus || (match.timer.isRunning ? (match.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'NOT_STARTED');
    TimerService.logTimerAction('PAUSE_CLOCK_REQUESTED', {
      matchId,
      prevStatus,
      newStatus: 'PAUSED',
      phase: match.timer.currentStage,
      remainingMs: (match.timer.remainingTime || 0) * 1000,
      userId: userId || 'OFFICIAL'
    });

    // If not running or already paused, return idempotently
    if (!match.timer.isRunning || match.timer.isPaused) {
      return match;
    }

    if (match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.PENALTY_SHOOTOUT) {
      if (match.status === MATCH_STATUS.PENALTY_SHOOTOUT && (match.timer.remainingTime > 0)) {
        match.status = MATCH_STATUS.LIVE;
        match.timer.currentStage = TIMER_STAGES.EXTRA_TIME;
        if (match.shootout) match.shootout.isShootout = false;
      } else {
        return match;
      }
    }

    const remaining = TimerService.calculateRemainingTime(match);
    const now = new Date();

    match.timer.remainingTime = remaining;
    match.timer.isPaused = true;
    match.timer.phaseEndsAt = null; // Cleared while paused
    match.timer.pausedTimestamp = now;
    match.timer.timerStatus = 'PAUSED';

    await match.save();

    TimerService.logTimerAction('PAUSE_CLOCK_SUCCESS', {
      matchId,
      prevStatus,
      newStatus: 'PAUSED',
      phase: match.timer.currentStage,
      remainingMs: remaining * 1000,
      userId: userId || 'OFFICIAL'
    });
    TimerService.logTimerAction('TIMER_STATE_CHANGED', {
      matchId,
      prevStatus,
      newStatus: 'PAUSED',
      phase: match.timer.currentStage,
      remainingMs: remaining * 1000,
      userId: userId || 'OFFICIAL'
    });

    // Record event
    const event = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TIMER_PAUSED,
      stage: match.timer.currentStage,
      matchTime: `${remaining}s remaining`,
      timestamp: now,
      detail: { remainingTime: remaining, pausedAt: now },
      createdBy: userId
    });
    match.events.push(event._id);
    await match.save();

    socketEmitter.broadcastTimerEvent(matchId, 'timer:paused', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: remaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: null,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: true
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: remaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: null,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: true
    });

    return match;
  }

  /**
   * Resume match timer
   * Reads saved remaining seconds and creates new phaseEndsAt = Date.now() + remainingTime * 1000.
   * Repeated resume requests are completely idempotent.
   */
  static async resumeTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const prevStatus = match.timer.timerStatus || (match.timer.isRunning ? (match.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'NOT_STARTED');
    TimerService.logTimerAction('RESUME_CLOCK_REQUESTED', {
      matchId,
      prevStatus,
      newStatus: 'RUNNING',
      phase: match.timer.currentStage,
      remainingMs: (match.timer.remainingTime || 240) * 1000,
      userId: userId || 'OFFICIAL'
    });

    if (!match.timer.isRunning) {
      return TimerService.startTimer(matchId, userId);
    }

    // Already running and not paused: return idempotently
    if (!match.timer.isPaused) {
      return match;
    }

    if (match.status === MATCH_STATUS.COMPLETED || match.status === MATCH_STATUS.PENALTY_SHOOTOUT) {
      if (match.status === MATCH_STATUS.PENALTY_SHOOTOUT && (match.timer.remainingTime > 0)) {
        match.status = MATCH_STATUS.LIVE;
        match.timer.currentStage = TIMER_STAGES.EXTRA_TIME;
        if (match.shootout) match.shootout.isShootout = false;
      } else {
        return match;
      }
    }

    const savedRemaining = Math.max(0, match.timer.remainingTime ?? match.timer.stageDuration ?? 240);

    // If remaining time already reached 0 while paused, advance stage instead
    if (savedRemaining <= 0) {
      return TimerService.advanceStage(matchId);
    }

    const now = new Date();
    const phaseEndsAt = new Date(now.getTime() + savedRemaining * 1000);

    match.timer.phaseEndsAt = phaseEndsAt;
    match.timer.startedTimestamp = now;
    match.timer.pausedTimestamp = null;
    match.timer.isPaused = false;
    match.timer.isRunning = true;
    match.timer.timerStatus = 'RUNNING';
    match.timer.remainingTime = savedRemaining;

    await match.save();

    TimerService.logTimerAction('RESUME_CLOCK_SUCCESS', {
      matchId,
      prevStatus,
      newStatus: 'RUNNING',
      phase: match.timer.currentStage,
      remainingMs: savedRemaining * 1000,
      userId: userId || 'OFFICIAL'
    });
    TimerService.logTimerAction('TIMER_STATE_CHANGED', {
      matchId,
      prevStatus,
      newStatus: 'RUNNING',
      phase: match.timer.currentStage,
      remainingMs: savedRemaining * 1000,
      userId: userId || 'OFFICIAL'
    });

    // Record event
    const event = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TIMER_RESUMED,
      stage: match.timer.currentStage,
      matchTime: `${savedRemaining}s remaining`,
      timestamp: now,
      detail: { resumedAt: now, remainingTime: savedRemaining },
      createdBy: userId
    });
    match.events.push(event._id);
    await match.save();

    socketEmitter.broadcastTimerEvent(matchId, 'timer:resumed', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: savedRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: savedRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    return match;
  }

  /**
   * Reset match timer and clean prior match events (Super Admin / Operator)
   */
  static async resetTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const tournament = await Tournament.findById(match.tournament);
    const halfDuration = tournament?.rules?.halfDurationSeconds || STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];

    // 1. Cache previous match run data before wiping so history is retained in cache
    const previousEvents = await MatchEvent.find({ match: matchId }).lean();
    const PenaltyShootout = require('../models/PenaltyShootout');
    const TossRecord = require('../models/TossRecord');
    const previousPenalties = await PenaltyShootout.find({ match: matchId }).lean();
    const previousToss = await TossRecord.find({ match: matchId }).lean();

    const previousRun = {
      resetAt: new Date(),
      resetBy: userId,
      finalScoreA: match.teamAScore,
      finalScoreB: match.teamBScore,
      winner: match.winner,
      matchResult: match.matchResult,
      eventsCount: previousEvents.length,
      events: previousEvents,
      penalties: previousPenalties,
      toss: previousToss
    };

    if (!match.previousRuns) {
      match.previousRuns = [];
    }
    match.previousRuns.push(previousRun);

    // 2. Adjust player goals count for goals scored in this match run
    const Player = require('../models/Player');
    for (const ev of previousEvents) {
      if ((ev.type === EVENT_TYPES.GOAL_SCORED || ev.type === 'GOAL') && ev.player && !ev.isUndone) {
        await Player.findByIdAndUpdate(ev.player, {
          $inc: { goals: -1 }
        });
      }
    }

    // 3. Delete prior match events, penalties, and toss records for this match
    await MatchEvent.deleteMany({ match: matchId });
    await PenaltyShootout.deleteMany({ match: matchId });
    await TossRecord.deleteMany({ match: matchId });

    // 4. Reset match state
    match.status = MATCH_STATUS.UPCOMING;
    match.isFinalized = false;
    match.teamAScore = 0;
    match.teamBScore = 0;
    match.winner = null;
    match.matchResult = 'Scheduled';
    match.goals = [];
    match.events = [];
    match.shootout = {
      isShootout: false,
      teamAPenaltyScore: 0,
      teamBPenaltyScore: 0,
      teamAPenaltiesTaken: 0,
      teamBPenaltiesTaken: 0,
      round: 1,
      isSuddenDeath: false,
      isCompleted: false,
      shootoutWinner: null
    };
    match.toss = {
      isTossConducted: false,
      tossWinner: null,
      choice: null,
      kickingTeam: null,
      defendingTeam: null,
      decisivePenaltyTaker: null,
      decisiveGoalkeeper: null,
      decisiveOutcome: null,
      winner: null,
      conductedAt: null,
      completedAt: null
    };
    match.timer.currentStage = TIMER_STAGES.FIRST_HALF;
    match.timer.stageDuration = halfDuration;
    match.timer.remainingTime = halfDuration;
    match.timer.startedTimestamp = null;
    match.timer.phaseEndsAt = null;
    match.timer.pausedTimestamp = null;
    match.timer.totalPausedDuration = 0;
    match.timer.isRunning = false;
    match.timer.isPaused = false;
    match.timer.timerStatus = 'IDLE';
    match.timer.stageHistory = [];

    await match.save();

    if (match.tournament) {
      await StandingsService.recalculateTournamentStandings(match.tournament);
    }

    // 5. Broadcast to all sockets: timer:reset, score:update, match:sync, and timeline event
    socketEmitter.broadcastTimerEvent(matchId, 'timer:reset', {
      matchId,
      currentStage: TIMER_STAGES.FIRST_HALF,
      remainingTime: halfDuration,
      stageDuration: halfDuration,
      phaseEndsAt: null,
      serverTime: Date.now(),
      isRunning: false,
      isPaused: false
    });

    socketEmitter.broadcastScoreUpdate(matchId, {
      matchId: match._id.toString(),
      teamAScore: 0,
      teamBScore: 0,
      score: { teamA: 0, teamB: 0 },
      goals: []
    });

    try {
      const MatchService = require('./matchService');
      const liveState = await MatchService.getLiveMatchState(matchId);
      socketEmitter.broadcastMatchSync(matchId, liveState);
    } catch (e) {
      // fallback
    }

    socketEmitter.broadcastTimelineEvent(matchId, {
      type: 'MATCH_RESET',
      matchId,
      events: [],
      goals: []
    });

    return match;
  }

  /**
   * Add extra time (seconds) to timer
   */
  static async addTime(matchId, secondsToAdd = 120, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const currentRemaining = TimerService.calculateRemainingTime(match);
    const newRemaining = Math.max(0, currentRemaining) + Number(secondsToAdd);
    const now = new Date();
    const phaseEndsAt = new Date(now.getTime() + newRemaining * 1000);

    match.timer.remainingTime = newRemaining;
    match.timer.stageDuration = Math.max(match.timer.stageDuration || 0, newRemaining);
    match.timer.startedTimestamp = now;
    match.timer.phaseEndsAt = phaseEndsAt;
    match.timer.pausedTimestamp = null;
    match.timer.totalPausedDuration = 0;
    match.timer.isRunning = true;
    match.timer.isPaused = false;
    match.timer.timerStatus = 'RUNNING';

    // If match was in Penalty Shootout, Completed, or idle, bring it back to Live Extra Time
    if (match.status === MATCH_STATUS.PENALTY_SHOOTOUT || match.timer.currentStage === TIMER_STAGES.PENALTY_SHOOTOUT || match.status === MATCH_STATUS.COMPLETED) {
      match.status = MATCH_STATUS.LIVE;
      match.timer.currentStage = TIMER_STAGES.EXTRA_TIME;
      if (match.shootout) {
        match.shootout.isShootout = false;
      }
    } else if (match.status === MATCH_STATUS.UPCOMING) {
      match.status = MATCH_STATUS.LIVE;
      match.timer.currentStage = match.timer.currentStage || TIMER_STAGES.FIRST_HALF;
    }

    await match.save();

    TimerService.logTimerAction('ADD_TIME_SUCCESS', {
      matchId,
      prevStatus: 'UPDATED',
      newStatus: 'RUNNING',
      phase: match.timer.currentStage,
      remainingMs: newRemaining * 1000,
      userId: userId || 'OFFICIAL'
    });

    socketEmitter.broadcastStageChange(matchId, {
      matchId,
      previousStage: match.timer.currentStage,
      currentStage: match.timer.currentStage,
      status: match.status,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now()
    });

    socketEmitter.broadcastMatchPhaseChanged(matchId, {
      matchId,
      phase: match.timer.currentStage,
      status: match.status,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now()
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:started', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:updated', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false
    });

    socketEmitter.broadcastTimerUpdate(matchId, {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: true,
      isPaused: false,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore
    });

    try {
      const MatchService = require('./matchService');
      const liveState = await MatchService.getLiveMatchState(matchId);
      socketEmitter.broadcastMatchSync(matchId, liveState);
    } catch (e) {
      // fallback
    }

    return match;
  }

  /**
   * Directly and authoritatively set match stage and clock duration (Super Admin / Operator)
   */
  static async setStage(matchId, stageName, durationSeconds = null, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const prevStage = match.timer.currentStage || TIMER_STAGES.FIRST_HALF;
    const normalizedKey = (stageName || '').trim().toLowerCase();
    let targetStage = TIMER_STAGES.FIRST_HALF;

    if (normalizedKey.includes('extra') || normalizedKey.includes('draw')) {
      targetStage = TIMER_STAGES.EXTRA_TIME;
    } else if (normalizedKey.includes('second') || normalizedKey.includes('2nd')) {
      targetStage = TIMER_STAGES.SECOND_HALF;
    } else if (normalizedKey.includes('break') || normalizedKey.includes('half-time') || normalizedKey.includes('halftime')) {
      targetStage = TIMER_STAGES.HALF_TIME;
    } else if (normalizedKey.includes('penalty') || normalizedKey.includes('shootout')) {
      targetStage = TIMER_STAGES.PENALTY_SHOOTOUT;
    } else if (normalizedKey.includes('complete') || normalizedKey.includes('finish') || normalizedKey.includes('ft')) {
      targetStage = TIMER_STAGES.COMPLETED;
    } else if (normalizedKey.includes('first') || normalizedKey.includes('1st')) {
      targetStage = TIMER_STAGES.FIRST_HALF;
    } else {
      targetStage = stageName;
    }

    // Determine duration
    let stageDuration;
    if (typeof durationSeconds === 'number' && durationSeconds >= 0) {
      stageDuration = durationSeconds;
    } else if (STAGE_DURATIONS[targetStage] !== undefined) {
      stageDuration = STAGE_DURATIONS[targetStage];
    } else {
      stageDuration = 240;
    }

    // Archive previous stage into stageHistory if running
    if (match.timer.startedTimestamp && prevStage !== targetStage) {
      match.timer.stageHistory.push({
        stage: prevStage,
        startedAt: match.timer.startedTimestamp,
        endedAt: new Date(),
        durationSeconds: match.timer.stageDuration
      });
    }

    const now = new Date();

    if (targetStage === TIMER_STAGES.PENALTY_SHOOTOUT) {
      match.status = MATCH_STATUS.PENALTY_SHOOTOUT;
      match.timer.currentStage = TIMER_STAGES.PENALTY_SHOOTOUT;
      match.timer.stageDuration = 0;
      match.timer.remainingTime = 0;
      match.timer.phaseEndsAt = null;
      match.timer.isRunning = false;
      match.timer.isPaused = false;
      match.timer.timerStatus = 'COMPLETED';
      match.shootout = match.shootout || {};
      match.shootout.isShootout = true;
      match.matchResult = 'Draw - Penalty Shootout Active';
    } else if (targetStage === TIMER_STAGES.COMPLETED) {
      match.status = MATCH_STATUS.COMPLETED;
      match.timer.currentStage = TIMER_STAGES.COMPLETED;
      match.timer.stageDuration = 0;
      match.timer.remainingTime = 0;
      match.timer.phaseEndsAt = null;
      match.timer.isRunning = false;
      match.timer.isPaused = false;
      match.timer.timerStatus = 'COMPLETED';
    } else {
      const phaseEndsAt = new Date(now.getTime() + stageDuration * 1000);
      match.timer.currentStage = targetStage;
      match.timer.stageDuration = stageDuration;
      match.timer.remainingTime = stageDuration;
      match.timer.startedTimestamp = now;
      match.timer.phaseEndsAt = phaseEndsAt;
      match.timer.pausedTimestamp = null;
      match.timer.totalPausedDuration = 0;
      match.timer.isRunning = true;
      match.timer.isPaused = false;
      match.timer.timerStatus = 'RUNNING';
      match.timer.lastTransitionAt = now;

      if (targetStage === TIMER_STAGES.HALF_TIME) {
        match.status = MATCH_STATUS.HALF_TIME;
      } else {
        match.status = MATCH_STATUS.LIVE;
      }
    }

    await match.save();

    TimerService.logTimerAction('STAGE_MANUALLY_SET', {
      matchId,
      prevStatus: prevStage,
      newStatus: targetStage,
      phase: targetStage,
      remainingMs: stageDuration * 1000,
      userId: userId || 'OFFICIAL'
    });

    try {
      const stageEvent = await MatchEvent.create({
        match: match._id,
        tournament: match.tournament,
        type: EVENT_TYPES.STAGE_CHANGE,
        stage: targetStage,
        matchTime: `${Math.floor(stageDuration / 60)}:${String(stageDuration % 60).padStart(2, '0')}`,
        timestamp: now,
        detail: { previousStage: prevStage, newStage: targetStage, duration: stageDuration },
        createdBy: userId
      });
      match.events.push(stageEvent._id);
      await match.save();
    } catch (e) {
      // ignore event logging error
    }

    socketEmitter.broadcastStageChange(matchId, {
      matchId,
      previousStage: prevStage,
      currentStage: targetStage,
      status: match.status,
      remainingTime: stageDuration,
      stageDuration: stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now()
    });

    socketEmitter.broadcastMatchPhaseChanged(matchId, {
      matchId,
      phase: targetStage,
      status: match.status,
      remainingTime: stageDuration,
      stageDuration: stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now()
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
      matchId,
      currentStage: targetStage,
      remainingTime: stageDuration,
      stageDuration: stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: match.timer.isRunning,
      isPaused: match.timer.isPaused
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:started', {
      matchId,
      currentStage: targetStage,
      remainingTime: stageDuration,
      stageDuration: stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: match.timer.isRunning,
      isPaused: match.timer.isPaused
    });

    socketEmitter.broadcastTimerUpdate(matchId, {
      matchId,
      currentStage: targetStage,
      remainingTime: stageDuration,
      stageDuration: stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: match.timer.isRunning,
      isPaused: match.timer.isPaused,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore
    });

    try {
      const MatchService = require('./matchService');
      const liveState = await MatchService.getLiveMatchState(matchId);
      socketEmitter.broadcastMatchSync(matchId, liveState);
    } catch (e) {
      // fallback
    }

    return match;
  }

  /**
   * Set clock remaining seconds directly (Super Admin / Operator)
   */
  static async setClockTime(matchId, seconds = 240, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const newRemaining = Math.max(0, Number(seconds));
    const now = new Date();
    const phaseEndsAt = newRemaining > 0 ? new Date(now.getTime() + newRemaining * 1000) : null;

    match.timer.remainingTime = newRemaining;
    match.timer.stageDuration = Math.max(match.timer.stageDuration || 0, newRemaining);
    match.timer.startedTimestamp = now;
    match.timer.phaseEndsAt = phaseEndsAt;
    match.timer.pausedTimestamp = null;
    match.timer.totalPausedDuration = 0;
    match.timer.isRunning = newRemaining > 0;
    match.timer.isPaused = false;
    match.timer.timerStatus = newRemaining > 0 ? 'RUNNING' : 'IDLE';

    // If resetting time while in Penalty Shootout, Completed, or Upcoming:
    if (newRemaining > 0) {
      if (match.status === MATCH_STATUS.PENALTY_SHOOTOUT || match.status === MATCH_STATUS.COMPLETED || match.timer.currentStage === TIMER_STAGES.PENALTY_SHOOTOUT) {
        match.status = MATCH_STATUS.LIVE;
        if (newRemaining === 240) {
          match.timer.currentStage = TIMER_STAGES.SECOND_HALF;
        } else if (newRemaining === 120) {
          match.timer.currentStage = TIMER_STAGES.EXTRA_TIME;
        }
        if (match.shootout) {
          match.shootout.isShootout = false;
        }
      } else if (match.status === MATCH_STATUS.UPCOMING) {
        match.status = MATCH_STATUS.LIVE;
        match.timer.currentStage = TIMER_STAGES.FIRST_HALF;
      }
    }

    await match.save();

    TimerService.logTimerAction('SET_CLOCK_TIME_SUCCESS', {
      matchId,
      prevStatus: 'UPDATED',
      newStatus: match.timer.timerStatus,
      phase: match.timer.currentStage,
      remainingMs: newRemaining * 1000,
      userId: userId || 'OFFICIAL'
    });

    socketEmitter.broadcastStageChange(matchId, {
      matchId,
      previousStage: match.timer.currentStage,
      currentStage: match.timer.currentStage,
      status: match.status,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now()
    });

    socketEmitter.broadcastMatchPhaseChanged(matchId, {
      matchId,
      phase: match.timer.currentStage,
      status: match.status,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now()
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: match.timer.isRunning,
      isPaused: match.timer.isPaused
    });

    socketEmitter.broadcastTimerEvent(matchId, 'timer:started', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: match.timer.isRunning,
      isPaused: match.timer.isPaused
    });

    socketEmitter.broadcastTimerUpdate(matchId, {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: newRemaining,
      stageDuration: match.timer.stageDuration,
      phaseEndsAt: match.timer.phaseEndsAt,
      serverTime: Date.now(),
      isRunning: match.timer.isRunning,
      isPaused: match.timer.isPaused,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore
    });

    try {
      const MatchService = require('./matchService');
      const liveState = await MatchService.getLiveMatchState(matchId);
      socketEmitter.broadcastMatchSync(matchId, liveState);
    } catch (e) {
      // fallback
    }

    return match;
  }

  /**
   * Automatically transition to next stage when stage time expires.
   * Phase Progression:
   * FIRST_HALF (4m) -> HALF_TIME (2m) -> SECOND_HALF (4m) -> EXTRA_TIME (2m if tied) -> PENALTIES (if tied) -> COMPLETED
   * If a team leads after second half or extra time, match completes directly.
   * Protected with atomic lock to guarantee exactly-once transition.
   */
  static async advanceStage(matchId) {
    const lockKey = matchId.toString();
    if (activeTickerLocks.has(lockKey)) {
      return null;
    }
    activeTickerLocks.add(lockKey);

    try {
      const match = await Match.findById(matchId);
      if (!match || !match.timer.isRunning) {
        return null;
      }

      // Completed matches can never advance
      if (match.status === MATCH_STATUS.COMPLETED || match.timer.currentStage === TIMER_STAGES.COMPLETED) {
        return match;
      }

      const currentStage = match.timer.currentStage;
      let nextStage;

      // Phase Progression Engine
      if (currentStage === TIMER_STAGES.FIRST_HALF) {
        nextStage = TIMER_STAGES.HALF_TIME;
      } else if (currentStage === TIMER_STAGES.TRANSITION_GAP) {
        nextStage = TIMER_STAGES.HALF_TIME;
      } else if (currentStage === TIMER_STAGES.HALF_TIME) {
        nextStage = TIMER_STAGES.SECOND_HALF;
      } else if (currentStage === TIMER_STAGES.SECOND_HALF) {
        if (match.teamAScore === match.teamBScore) {
          nextStage = TIMER_STAGES.EXTRA_TIME; // Scores tied -> 2-minute extra time
        } else {
          nextStage = TIMER_STAGES.COMPLETED;  // Lead -> match complete
        }
      } else if (currentStage === TIMER_STAGES.EXTRA_TIME) {
        if (match.teamAScore === match.teamBScore) {
          nextStage = TIMER_STAGES.PENALTY_SHOOTOUT; // Still tied -> penalty shootout
        } else {
          nextStage = TIMER_STAGES.COMPLETED;        // Lead -> match complete
        }
      } else {
        return match;
      }

      // Archive previous stage in stageHistory
      match.timer.stageHistory.push({
        stage: currentStage,
        startedAt: match.timer.startedTimestamp || new Date(),
        endedAt: new Date(),
        durationSeconds: match.timer.stageDuration
      });

      TimerService.logTimerAction('PHASE_TRANSITION', {
        matchId,
        prevStatus: currentStage,
        newStatus: nextStage,
        phase: nextStage,
        remainingMs: (STAGE_DURATIONS[nextStage] || 0) * 1000,
        userId: 'TICKER_AUTO'
      });

      // Milestone event for first half completion
      if (currentStage === TIMER_STAGES.FIRST_HALF) {
        const firstHalfEndEvent = await MatchEvent.create({
          match: match._id,
          tournament: match.tournament,
          type: EVENT_TYPES.FIRST_HALF_ENDED,
          stage: TIMER_STAGES.FIRST_HALF,
          matchTime: '00:00',
          timestamp: new Date(),
          detail: { stage: currentStage, score: { teamA: match.teamAScore, teamB: match.teamBScore } }
        });
        match.events.push(firstHalfEndEvent._id);
      }

      const tournament = await Tournament.findById(match.tournament);
      let nextStageDuration = STAGE_DURATIONS[nextStage] || 0;

      // Respect tournament custom rules if configured
      if (tournament?.rules) {
        if (nextStage === TIMER_STAGES.HALF_TIME && tournament.rules.halfTimeDurationSeconds) {
          nextStageDuration = tournament.rules.halfTimeDurationSeconds;
        } else if (nextStage === TIMER_STAGES.SECOND_HALF && tournament.rules.halfDurationSeconds) {
          nextStageDuration = tournament.rules.halfDurationSeconds;
        }
      }

      // Case A: Penalty Shootout (tied after Extra Time)
      if (nextStage === TIMER_STAGES.PENALTY_SHOOTOUT) {
        match.timer.currentStage = TIMER_STAGES.PENALTY_SHOOTOUT;
        match.timer.stageDuration = 0;
        match.timer.remainingTime = 0;
        match.timer.phaseEndsAt = null;
        match.timer.isRunning = false;
        match.timer.isPaused = false;
        match.timer.timerStatus = 'COMPLETED';
        match.status = MATCH_STATUS.PENALTY_SHOOTOUT;
        match.shootout = match.shootout || {};
        match.shootout.isShootout = true;
        match.matchResult = 'Extra Time Draw - Penalty Shootout Active';
        match.timer.lastTransitionAt = new Date();
        await match.save();

        socketEmitter.broadcastStageChange(matchId, {
          matchId,
          previousStage: currentStage,
          currentStage: TIMER_STAGES.PENALTY_SHOOTOUT,
          status: MATCH_STATUS.PENALTY_SHOOTOUT,
          teamAScore: match.teamAScore,
          teamBScore: match.teamBScore,
          needsShootout: true
        });

        socketEmitter.broadcastMatchPhaseChanged(matchId, {
          matchId,
          phase: TIMER_STAGES.PENALTY_SHOOTOUT,
          status: MATCH_STATUS.PENALTY_SHOOTOUT,
          needsShootout: true
        });

        return match;
      }

      // Case B: Match Completed
      if (nextStage === TIMER_STAGES.COMPLETED) {
        match.timer.currentStage = TIMER_STAGES.COMPLETED;
        match.timer.stageDuration = 0;
        match.timer.remainingTime = 0;
        match.timer.phaseEndsAt = null;
        match.timer.isRunning = false;
        match.timer.isPaused = false;
        match.timer.timerStatus = 'COMPLETED';
        match.timer.lastTransitionAt = new Date();

        if (match.teamAScore === match.teamBScore) {
          // If second half completed tied and extra time was skipped, fallback to shootout
          match.status = MATCH_STATUS.PENALTY_SHOOTOUT;
          match.shootout.isShootout = true;
          match.matchResult = 'Draw - Penalty Shootout Required';
          await match.save();

          socketEmitter.broadcastStageChange(matchId, {
            matchId,
            previousStage: currentStage,
            currentStage: TIMER_STAGES.COMPLETED,
            status: MATCH_STATUS.PENALTY_SHOOTOUT,
            teamAScore: match.teamAScore,
            teamBScore: match.teamBScore,
            needsShootout: true
          });
        } else {
          // Normal Time / Extra Time Win
          match.status = MATCH_STATUS.COMPLETED;
          match.winner = match.teamAScore > match.teamBScore ? match.teamA : match.teamB;
          match.matchResult = currentStage === TIMER_STAGES.EXTRA_TIME ? 'Extra Time Win' : 'Normal Time Win';
          await match.save();

          await TimerService.finalizeMatch(match._id);

          socketEmitter.broadcastMatchCompleted(matchId, match.tournament, {
            matchId,
            status: MATCH_STATUS.COMPLETED,
            winner: match.winner,
            matchResult: match.matchResult,
            teamAScore: match.teamAScore,
            teamBScore: match.teamBScore
          });
        }

        const matchCompleteEvent = await MatchEvent.create({
          match: match._id,
          tournament: match.tournament,
          type: EVENT_TYPES.MATCH_COMPLETED,
          stage: TIMER_STAGES.COMPLETED,
          matchTime: '00:00',
          timestamp: new Date(),
          detail: {
            finalScore: { teamA: match.teamAScore, teamB: match.teamBScore },
            winner: match.winner,
            matchResult: match.matchResult
          }
        });
        match.events.push(matchCompleteEvent._id);
        await match.save();
      } else {
        // Case C: Transition to next running stage (Half-Time, Second Half, Extra Time)
        const now = new Date();
        const phaseEndsAt = new Date(now.getTime() + nextStageDuration * 1000);

        match.timer.currentStage = nextStage;
        match.timer.stageDuration = nextStageDuration;
        match.timer.remainingTime = nextStageDuration;
        match.timer.startedTimestamp = now;
        match.timer.phaseEndsAt = phaseEndsAt;
        match.timer.pausedTimestamp = null;
        match.timer.totalPausedDuration = 0;
        match.timer.isRunning = true;
        match.timer.isPaused = false;
        match.timer.timerStatus = 'RUNNING';
        match.timer.lastTransitionAt = now;

        if (nextStage === TIMER_STAGES.HALF_TIME) {
          match.status = MATCH_STATUS.HALF_TIME;
        } else {
          match.status = MATCH_STATUS.LIVE;
        }

        await match.save();

        let stageEventType = EVENT_TYPES.STAGE_CHANGE;
        let eventMatchTime = 'Stage Kickoff';
        if (nextStage === TIMER_STAGES.HALF_TIME) {
          stageEventType = EVENT_TYPES.HALFTIME_STARTED;
          eventMatchTime = '02:00';
        } else if (nextStage === TIMER_STAGES.SECOND_HALF) {
          stageEventType = EVENT_TYPES.SECOND_HALF_STARTED;
          eventMatchTime = '04:00';
        } else if (nextStage === TIMER_STAGES.EXTRA_TIME) {
          stageEventType = EVENT_TYPES.STAGE_CHANGE;
          eventMatchTime = '02:00 (ET)';
        }

        const stageEvent = await MatchEvent.create({
          match: match._id,
          tournament: match.tournament,
          type: stageEventType,
          stage: nextStage,
          matchTime: eventMatchTime,
          timestamp: now,
          detail: { previousStage: currentStage, newStage: nextStage, duration: nextStageDuration }
        });
        match.events.push(stageEvent._id);
        await match.save();

        socketEmitter.broadcastStageChange(matchId, {
          matchId,
          previousStage: currentStage,
          currentStage: nextStage,
          status: match.status,
          remainingTime: nextStageDuration,
          stageDuration: nextStageDuration,
          phaseEndsAt,
          serverTime: Date.now()
        });

        socketEmitter.broadcastMatchPhaseChanged(matchId, {
          matchId,
          phase: nextStage,
          status: match.status,
          remainingTime: nextStageDuration,
          stageDuration: nextStageDuration,
          phaseEndsAt,
          serverTime: Date.now()
        });

        socketEmitter.broadcastTimerEvent(matchId, 'timer:sync', {
          matchId,
          currentStage: nextStage,
          remainingTime: nextStageDuration,
          stageDuration: nextStageDuration,
          phaseEndsAt,
          serverTime: Date.now(),
          isRunning: true,
          isPaused: false
        });
      }

      return match;
    } finally {
      activeTickerLocks.delete(lockKey);
    }
  }

  /**
   * Finalize match: updates player stats and tournament standings (idempotent, prevents double-counting)
   */
  static async finalizeMatch(matchId) {
    const match = await Match.findById(matchId);
    if (!match || match.isFinalized) {
      return match;
    }

    match.isFinalized = true;
    match.status = MATCH_STATUS.COMPLETED;
    match.timer.isRunning = false;
    match.timer.isPaused = false;
    match.timer.timerStatus = 'COMPLETED';
    match.timer.phaseEndsAt = null;

    // Check if match had a penalty shootout winner or sudden death winner
    const penA = match.shootout?.teamAPenaltyScore ?? 0;
    const penB = match.shootout?.teamBPenaltyScore ?? 0;
    const hasPenalties = Boolean(match.shootout?.isShootout || penA > 0 || penB > 0);

    if (!match.winner) {
      if (match.shootout?.shootoutWinner) {
        match.winner = match.shootout.shootoutWinner;
      } else if (penA > penB) {
        match.winner = match.teamA;
        match.shootout = match.shootout || {};
        match.shootout.shootoutWinner = match.teamA;
        match.shootout.isShootout = true;
        match.shootout.isCompleted = true;
      } else if (penB > penA) {
        match.winner = match.teamB;
        match.shootout = match.shootout || {};
        match.shootout.shootoutWinner = match.teamB;
        match.shootout.isShootout = true;
        match.shootout.isCompleted = true;
      } else if (match.toss?.winner) {
        match.winner = match.toss.winner;
      }
    }

    if (hasPenalties && match.winner) {
      match.shootout = match.shootout || {};
      match.shootout.isShootout = true;
      match.shootout.isCompleted = true;
      if (!match.shootout.shootoutWinner) match.shootout.shootoutWinner = match.winner;
    }
    await match.save();

    const teamAPlayers = await Player.find({ team: match.teamA });
    const teamBPlayers = await Player.find({ team: match.teamB });

    const isTeamAWinner = match.winner && match.winner.toString() === match.teamA.toString();
    const isTeamBWinner = match.winner && match.winner.toString() === match.teamB.toString();

    for (const player of teamAPlayers) {
      player.matchesPlayed += 1;
      if (isTeamAWinner) player.wins += 1;
      else if (isTeamBWinner) player.losses += 1;
      await player.save();
    }

    for (const player of teamBPlayers) {
      player.matchesPlayed += 1;
      if (isTeamBWinner) player.wins += 1;
      else if (isTeamAWinner) player.losses += 1;
      await player.save();
    }

    // Recalculate tournament standings cleanly
    await StandingsService.recalculateTournamentStandings(match.tournament);

    return match;
  }

  /**
   * Server restart recovery: scans all active matches on boot, calculates elapsed time,
   * cascades expired stages, and restores ticker state without resetting timers.
   */
  static async recoverActiveTimers() {
    try {
      logger.info('Recovering active match timers after server boot...');
      const activeMatches = await Match.find({
        status: { $in: [MATCH_STATUS.LIVE, MATCH_STATUS.HALF_TIME] }
      });

      for (const match of activeMatches) {
        if (!match.timer || !match.timer.isRunning) continue;

        if (match.timer.isPaused) {
          logger.info(`Match #${match.matchNumber} is paused at stage ${match.timer.currentStage} with ${match.timer.remainingTime}s remaining`);
          continue;
        }

        // Active running match: check if phaseEndsAt has expired while server was offline
        let remaining = TimerService.calculateRemainingTime(match);
        let currentMatch = match;

        // Cascade through any expired stages exactly once
        while (remaining <= 0 && currentMatch.timer.isRunning && currentMatch.status !== MATCH_STATUS.COMPLETED) {
          logger.info(`Match #${currentMatch.matchNumber}: stage ${currentMatch.timer.currentStage} expired during server downtime. Advancing stage...`);
          currentMatch = await TimerService.advanceStage(currentMatch._id);
          if (!currentMatch || !currentMatch.timer.isRunning) break;
          remaining = TimerService.calculateRemainingTime(currentMatch);
        }

        if (currentMatch && currentMatch.timer.isRunning) {
          currentMatch.timer.remainingTime = remaining;
          await currentMatch.save();
          logger.success(`Match #${currentMatch.matchNumber} recovered at stage: ${currentMatch.timer.currentStage} with ${remaining}s remaining`);
        }
      }
    } catch (err) {
      logger.error(`Error recovering active timers: ${err.message}`);
    }
  }

  /**
   * Background ticker that checks for phase expiration and broadcasts live ticks.
   */
  static startTicker(intervalMs = TIMER_TICK_INTERVAL_MS) {
    if (tickerInterval) {
      clearInterval(tickerInterval);
    }

    tickerInterval = setInterval(async () => {
      try {
        if (!mongoose.connection || mongoose.connection.readyState !== 1) {
          // Database is temporarily disconnected or reconnecting; skip tick until reconnected
          return;
        }

        const liveMatches = await Match.find({
          'timer.isRunning': true,
          'timer.isPaused': false,
          status: { $in: [MATCH_STATUS.LIVE, MATCH_STATUS.HALF_TIME] }
        });

        for (const match of liveMatches) {
          const remaining = TimerService.calculateRemainingTime(match);

          if (remaining <= 0) {
            // Stage time finished, automatically move to next stage!
            await TimerService.advanceStage(match._id);
          } else {
            // Broadcast live tick to socket room (clients compute smooth display from phaseEndsAt)
            socketEmitter.broadcastTimerUpdate(match._id, {
              matchId: match._id,
              currentStage: match.timer.currentStage,
              remainingTime: remaining,
              stageDuration: match.timer.stageDuration,
              phaseEndsAt: match.timer.phaseEndsAt,
              serverTime: Date.now(),
              isRunning: true,
              isPaused: false,
              teamAScore: match.teamAScore,
              teamBScore: match.teamBScore
            });
          }
        }
      } catch (err) {
        logger.error(`Error in timer ticker tick: ${err.message}`);
      }
    }, intervalMs);

    logger.info(`Live match timer engine started with ${intervalMs}ms interval`);
  }

  static stopTicker() {
    if (tickerInterval) {
      clearInterval(tickerInterval);
      tickerInterval = null;
      logger.info('Live match timer engine stopped');
    }
  }
}

module.exports = TimerService;
