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

let tickerInterval = null;
const activeTickerLocks = new Set();

class TimerService {
  /**
   * Pure timestamp calculation of remaining seconds
   */
  static calculateRemainingTime(match) {
    if (!match.timer) {
      return STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];
    }

    const { stageDuration, startedTimestamp, pausedTimestamp, totalPausedDuration, isRunning, isPaused, remainingTime } = match.timer;

    if (!isRunning) {
      return remainingTime ?? stageDuration;
    }

    if (isPaused) {
      return remainingTime;
    }

    if (!startedTimestamp) {
      return stageDuration;
    }

    const now = Date.now();
    const started = new Date(startedTimestamp).getTime();
    const pausedTotal = totalPausedDuration || 0;
    const activeElapsedMs = Math.max(0, now - started - pausedTotal);
    const activeElapsedSec = Math.floor(activeElapsedMs / 1000);
    const calculatedRemaining = Math.max(0, stageDuration - activeElapsedSec);

    return calculatedRemaining;
  }

  /**
   * Start or resume match timer
   */
  static async startTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status === MATCH_STATUS.COMPLETED) {
      throw new Error('Cannot start timer for an already completed match');
    }

    // If currently paused, resume it
    if (match.timer.isRunning && match.timer.isPaused) {
      return TimerService.resumeTimer(matchId, userId);
    }

    if (match.timer.isRunning && !match.timer.isPaused) {
      return match; // Already running
    }

    const isInitialStart = match.status === MATCH_STATUS.UPCOMING;
    const tournament = await Tournament.findById(match.tournament);
    const halfDuration = tournament?.rules?.halfDurationSeconds || STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];

    const currentStage = match.timer.currentStage || TIMER_STAGES.FIRST_HALF;
    const stageDuration = STAGE_DURATIONS[currentStage] || halfDuration;

    match.status = currentStage === TIMER_STAGES.HALF_TIME ? MATCH_STATUS.HALF_TIME : MATCH_STATUS.LIVE;
    match.timer.currentStage = currentStage;
    match.timer.stageDuration = stageDuration;
    match.timer.remainingTime = stageDuration;
    match.timer.startedTimestamp = new Date();
    match.timer.pausedTimestamp = null;
    match.timer.totalPausedDuration = 0;
    match.timer.isRunning = true;
    match.timer.isPaused = false;

    await match.save();

    // If starting fresh from Upcoming, record MATCH_STARTED event
    if (isInitialStart) {
      const matchStartEvent = await MatchEvent.create({
        match: match._id,
        tournament: match.tournament,
        type: EVENT_TYPES.MATCH_STARTED,
        stage: currentStage,
        matchTime: '04:00',
        timestamp: new Date(),
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
      timestamp: new Date(),
      detail: { stage: currentStage, stageDuration },
      createdBy: userId
    });
    match.events.push(timerStartEvent._id);
    await match.save();

    // Broadcast
    socketEmitter.broadcastTimerEvent(matchId, 'timer:started', {
      matchId,
      currentStage,
      remainingTime: stageDuration,
      stageDuration,
      isRunning: true,
      isPaused: false
    });

    return match;
  }

  /**
   * Pause match timer
   */
  static async pauseTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    if (!match.timer.isRunning || match.timer.isPaused) {
      return match; // Not running or already paused
    }

    const remaining = TimerService.calculateRemainingTime(match);

    match.timer.remainingTime = remaining;
    match.timer.isPaused = true;
    match.timer.pausedTimestamp = new Date();

    await match.save();

    // Record event
    const event = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TIMER_PAUSED,
      stage: match.timer.currentStage,
      matchTime: `${remaining}s remaining`,
      timestamp: new Date(),
      detail: { remainingTime: remaining, pausedAt: match.timer.pausedTimestamp },
      createdBy: userId
    });
    match.events.push(event._id);
    await match.save();

    socketEmitter.broadcastTimerEvent(matchId, 'timer:paused', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: remaining,
      stageDuration: match.timer.stageDuration,
      isRunning: true,
      isPaused: true
    });

    return match;
  }

  /**
   * Resume match timer
   */
  static async resumeTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    if (!match.timer.isRunning || !match.timer.isPaused) {
      return match;
    }

    const now = Date.now();
    const pausedAt = match.timer.pausedTimestamp ? new Date(match.timer.pausedTimestamp).getTime() : now;
    const additionalPausedMs = Math.max(0, now - pausedAt);

    match.timer.totalPausedDuration = (match.timer.totalPausedDuration || 0) + additionalPausedMs;
    match.timer.pausedTimestamp = null;
    match.timer.isPaused = false;

    // Remaining time is preserved accurately
    const remaining = TimerService.calculateRemainingTime(match);
    match.timer.remainingTime = remaining;

    await match.save();

    // Record event
    const event = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TIMER_RESUMED,
      stage: match.timer.currentStage,
      matchTime: `${remaining}s remaining`,
      timestamp: new Date(),
      detail: { resumedAt: new Date(), remainingTime: remaining },
      createdBy: userId
    });
    match.events.push(event._id);
    await match.save();

    socketEmitter.broadcastTimerEvent(matchId, 'timer:resumed', {
      matchId,
      currentStage: match.timer.currentStage,
      remainingTime: remaining,
      stageDuration: match.timer.stageDuration,
      isRunning: true,
      isPaused: false
    });

    return match;
  }

  /**
   * Reset match timer (Super Admin only)
   */
  static async resetTimer(matchId, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const tournament = await Tournament.findById(match.tournament);
    const halfDuration = tournament?.rules?.halfDurationSeconds || STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];

    match.status = MATCH_STATUS.UPCOMING;
    match.timer.currentStage = TIMER_STAGES.FIRST_HALF;
    match.timer.stageDuration = halfDuration;
    match.timer.remainingTime = halfDuration;
    match.timer.startedTimestamp = null;
    match.timer.pausedTimestamp = null;
    match.timer.totalPausedDuration = 0;
    match.timer.isRunning = false;
    match.timer.isPaused = false;
    match.timer.stageHistory = [];

    await match.save();

    // Record event
    const event = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TIMER_RESET,
      stage: TIMER_STAGES.FIRST_HALF,
      matchTime: '00:00',
      timestamp: new Date(),
      detail: { resetBy: userId },
      createdBy: userId
    });
    match.events.push(event._id);
    await match.save();

    socketEmitter.broadcastTimerEvent(matchId, 'timer:reset', {
      matchId,
      currentStage: TIMER_STAGES.FIRST_HALF,
      remainingTime: halfDuration,
      stageDuration: halfDuration,
      isRunning: false,
      isPaused: false
    });

    return match;
  }

  /**
   * Automatically transition to next stage when stage time expires
   */
  static async advanceStage(matchId) {
    if (activeTickerLocks.has(matchId.toString())) {
      return null;
    }
    activeTickerLocks.add(matchId.toString());

    try {
      const match = await Match.findById(matchId);
      if (!match || !match.timer.isRunning) {
        return null;
      }

      const currentStage = match.timer.currentStage;
      let nextStage;

      // Handle Stage Transition with 2-Minute Draw Decider rule:
      // If regulation ends in a draw (e.g. 1-1), 2 minutes extra time is awarded
      if (currentStage === TIMER_STAGES.FIRST_HALF) {
        nextStage = TIMER_STAGES.TRANSITION_GAP;
      } else if (currentStage === TIMER_STAGES.TRANSITION_GAP) {
        nextStage = TIMER_STAGES.HALF_TIME;
      } else if (currentStage === TIMER_STAGES.HALF_TIME) {
        nextStage = TIMER_STAGES.SECOND_HALF;
      } else if (currentStage === TIMER_STAGES.SECOND_HALF) {
        if (match.teamAScore === match.teamBScore) {
          nextStage = TIMER_STAGES.EXTRA_TIME; // Draw -> 2 more minutes
        } else {
          nextStage = TIMER_STAGES.COMPLETED;
        }
      } else if (currentStage === TIMER_STAGES.EXTRA_TIME) {
        nextStage = TIMER_STAGES.COMPLETED;
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

      // Specific event for first half completion
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
      let nextStageDuration = STAGE_DURATIONS[nextStage];

      // Respect tournament custom rules if configured
      if (tournament?.rules) {
        if (nextStage === TIMER_STAGES.TRANSITION_GAP && tournament.rules.transitionDurationSeconds) {
          nextStageDuration = tournament.rules.transitionDurationSeconds;
        } else if (nextStage === TIMER_STAGES.HALF_TIME && tournament.rules.halfTimeDurationSeconds) {
          nextStageDuration = tournament.rules.halfTimeDurationSeconds;
        } else if (nextStage === TIMER_STAGES.SECOND_HALF && tournament.rules.halfDurationSeconds) {
          nextStageDuration = tournament.rules.halfDurationSeconds;
        }
      }

      // Check if next stage is Match Completed
      if (nextStage === TIMER_STAGES.COMPLETED) {
        match.timer.currentStage = TIMER_STAGES.COMPLETED;
        match.timer.stageDuration = 0;
        match.timer.remainingTime = 0;
        match.timer.isRunning = false;
        match.timer.isPaused = false;

        // Check scores for tie
        if (match.teamAScore === match.teamBScore) {
          // Tie requires penalty shootout
          match.status = MATCH_STATUS.PENALTY_SHOOTOUT;
          match.shootout.isShootout = true;
          match.matchResult = 'Full Time Draw - Penalty Shootout Required';
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
          // Official regular time completion
          match.status = MATCH_STATUS.COMPLETED;
          match.winner = match.teamAScore > match.teamBScore ? match.teamA : match.teamB;
          match.matchResult = 'Normal Time Win';
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
        // Transition to next non-terminal stage
        match.timer.currentStage = nextStage;
        match.timer.stageDuration = nextStageDuration;
        match.timer.remainingTime = nextStageDuration;
        match.timer.startedTimestamp = new Date();
        match.timer.pausedTimestamp = null;
        match.timer.totalPausedDuration = 0;
        match.timer.isRunning = true;
        match.timer.isPaused = false;

        if (nextStage === TIMER_STAGES.HALF_TIME) {
          match.status = MATCH_STATUS.HALF_TIME;
        } else {
          match.status = MATCH_STATUS.LIVE;
        }

        await match.save();

        // Determine specific milestone event type
        let stageEventType = EVENT_TYPES.STAGE_CHANGE;
        let eventMatchTime = 'Stage Kickoff';
        if (nextStage === TIMER_STAGES.TRANSITION_GAP) {
          stageEventType = EVENT_TYPES.TRANSITION_STARTED;
          eventMatchTime = '00:20';
        } else if (nextStage === TIMER_STAGES.HALF_TIME) {
          stageEventType = EVENT_TYPES.HALFTIME_STARTED;
          eventMatchTime = '02:00';
        } else if (nextStage === TIMER_STAGES.SECOND_HALF) {
          stageEventType = EVENT_TYPES.SECOND_HALF_STARTED;
          eventMatchTime = '04:00';
        }

        const stageEvent = await MatchEvent.create({
          match: match._id,
          tournament: match.tournament,
          type: stageEventType,
          stage: nextStage,
          matchTime: eventMatchTime,
          timestamp: new Date(),
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
          stageDuration: nextStageDuration
        });
      }

      return match;
    } finally {
      activeTickerLocks.delete(matchId.toString());
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
    await match.save();

    // Increment matches played for all players in both teams
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
   * cascades expired stages, and restores ticker state.
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
          // Paused matches preserve their exact remaining time
          logger.info(`Match #${match.matchNumber} is paused at stage ${match.timer.currentStage} with ${match.timer.remainingTime}s remaining`);
          continue;
        }

        // Active running match: check if stage has expired while server was offline
        let remaining = TimerService.calculateRemainingTime(match);
        let currentMatch = match;

        // Cascade through any expired stages
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
   * Background ticker that runs every interval (1 sec) to broadcast ticks and advance stages
   */
  static startTicker(intervalMs = 1000) {
    if (tickerInterval) {
      clearInterval(tickerInterval);
    }

    tickerInterval = setInterval(async () => {
      try {
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
            // Broadcast live tick to socket room
            socketEmitter.broadcastTimerUpdate(match._id, {
              matchId: match._id,
              currentStage: match.timer.currentStage,
              remainingTime: remaining,
              stageDuration: match.timer.stageDuration,
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
