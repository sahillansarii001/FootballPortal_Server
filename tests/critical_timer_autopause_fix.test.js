const mongoose = require('mongoose');
const Match = require('../src/models/Match');
const Team = require('../src/models/Team');
const Tournament = require('../src/models/Tournament');
const User = require('../src/models/User');
const TimerService = require('../src/services/timerService');
const MatchService = require('../src/services/matchService');
const { socketEmitter } = require('../src/sockets/socketManager');
const { MATCH_STATUS, TIMER_STAGES, ROLES } = require('../src/utils/constants');

describe('Critical Timer Auto-Pause Bug Fix & Comprehensive Verification', () => {
  let tournament;
  let teamA;
  let teamB;
  let adminUser;
  let testMatch;

  beforeAll(async () => {
    adminUser = await User.create({
      username: 'auditadmin',
      email: 'auditadmin@test.com',
      password: 'HashedPassword123!',
      role: ROLES.SUPER_ADMIN,
      isActive: true
    });

    tournament = await Tournament.create({
      name: 'Audit Cup 2026',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      rules: {
        halfDurationSeconds: 240,
        halfTimeDurationSeconds: 120,
        extraTimeDurationSeconds: 120
      },
      status: 'Ongoing'
    });

    teamA = await Team.create({ name: 'Alpha FC', code: 'ALP' });
    teamB = await Team.create({ name: 'Beta FC', code: 'BET' });
  });

  afterAll(async () => {
    await Match.deleteMany({ tournament: tournament._id });
    await Team.deleteMany({ _id: { $in: [teamA._id, teamB._id] } });
    await Tournament.deleteMany({ _id: tournament._id });
    await User.deleteMany({ _id: adminUser._id });
  });

  beforeEach(async () => {
    testMatch = await Match.create({
      tournament: tournament._id,
      matchNumber: 999,
      teamA: teamA._id,
      teamB: teamB._id,
      venue: 'National Arena',
      matchDate: new Date(),
      matchTime: '15:00',
      status: MATCH_STATUS.UPCOMING,
      timer: {
        currentStage: TIMER_STAGES.FIRST_HALF,
        stageDuration: 240,
        remainingTime: 240,
        isRunning: false,
        isPaused: false,
        phaseEndsAt: null,
        timerStatus: 'NOT_STARTED'
      }
    });
  });

  afterEach(async () => {
    await Match.findByIdAndDelete(testMatch._id);
  });

  // TEST 1: START CLOCK - MUST REMAIN RUNNING AND NEVER AUTO-PAUSE
  test('TEST 1: Starting the match timer switches state to RUNNING and does NOT auto-pause', async () => {
    // 1. Initial State
    expect(testMatch.timer.isRunning).toBe(false);
    expect(testMatch.timer.isPaused).toBe(false);
    expect(testMatch.status).toBe(MATCH_STATUS.UPCOMING);

    // 2. Start Clock
    const started = await TimerService.startTimer(testMatch._id, adminUser._id);
    expect(started.timer.isRunning).toBe(true);
    expect(started.timer.isPaused).toBe(false);
    expect(started.timer.timerStatus).toBe('RUNNING');
    expect(started.status).toBe(MATCH_STATUS.LIVE);
    expect(started.timer.phaseEndsAt).toBeDefined();

    // 3. Verify it calculates remaining time from phaseEndsAt
    const remaining = TimerService.calculateRemainingTime(started);
    expect(remaining).toBeGreaterThanOrEqual(239);
    expect(remaining).toBeLessThanOrEqual(240);

    // 4. Authoritative state attached to live match
    const liveMatch = await MatchService.getLiveMatchState(testMatch._id);
    expect(liveMatch.timer.isRunning).toBe(true);
    expect(liveMatch.timer.isPaused).toBe(false);
    expect(liveMatch.timer.timerStatus).toBe('RUNNING');
    expect(liveMatch.timer.remainingTime).toBe(remaining);
  });

  // TEST 2: PAUSE & RESUME PRECISION
  test('TEST 2: Pause freezes exact remaining time; resume continues without resetting to 04:00', async () => {
    // 1. Start match
    await TimerService.startTimer(testMatch._id, adminUser._id);

    // 2. Simulate 60 seconds elapsed (remaining: 180s = 03:00)
    const match = await Match.findById(testMatch._id);
    match.timer.phaseEndsAt = new Date(Date.now() + 180 * 1000);
    await match.save();

    // 3. Official pauses at 03:00
    const paused = await TimerService.pauseTimer(testMatch._id, adminUser._id);
    expect(paused.timer.isRunning).toBe(true);
    expect(paused.timer.isPaused).toBe(true);
    expect(paused.timer.timerStatus).toBe('PAUSED');
    expect(paused.timer.phaseEndsAt).toBeNull();
    expect(paused.timer.remainingTime).toBe(180);

    // 4. Verify repeated calculateRemainingTime returns frozen 180s
    expect(TimerService.calculateRemainingTime(paused)).toBe(180);

    // 5. Official clicks Resume Clock
    const resumed = await TimerService.resumeTimer(testMatch._id, adminUser._id);
    expect(resumed.timer.isRunning).toBe(true);
    expect(resumed.timer.isPaused).toBe(false);
    expect(resumed.timer.timerStatus).toBe('RUNNING');
    expect(resumed.timer.phaseEndsAt).toBeDefined();

    // 6. Confirm it resumes from 180s, NOT from 240s (04:00)
    const resumedRemaining = TimerService.calculateRemainingTime(resumed);
    expect(resumedRemaining).toBe(180);
    expect(resumedRemaining).not.toBe(240);
  });

  // TEST 3: PAGE REFRESH & PERSISTENCE
  test('TEST 3: Re-fetching match (simulating browser page refresh) preserves running status and remaining time', async () => {
    // 1. Start timer
    await TimerService.startTimer(testMatch._id, adminUser._id);

    // 2. Set remaining to 142s
    const match = await Match.findById(testMatch._id);
    match.timer.phaseEndsAt = new Date(Date.now() + 142 * 1000);
    await match.save();

    // 3. Simulate client page refresh calling getMatchById
    const refreshed = await MatchService.getMatchById(testMatch._id);
    expect(refreshed.status).toBe(MATCH_STATUS.LIVE);
    expect(refreshed.timer.isRunning).toBe(true);
    expect(refreshed.timer.isPaused).toBe(false);
    expect(refreshed.timer.timerStatus).toBe('RUNNING');
    expect(refreshed.timer.remainingTime).toBe(142);
  });

  // TEST 4: MULTI-CLIENT SOCKET SYNCHRONIZATION
  test('TEST 4: Socket broadcast events reflect correct authoritative RUNNING/PAUSED status to all clients', async () => {
    const broadcastEvents = [];
    const originalBroadcast = socketEmitter.broadcastTimerEvent;

    socketEmitter.broadcastTimerEvent = (matchId, eventName, data) => {
      broadcastEvents.push({ matchId, eventName, data });
    };

    try {
      // 1. Start timer
      await TimerService.startTimer(testMatch._id, adminUser._id);
      const startBroadcast = broadcastEvents.find(e => e.eventName === 'timer:started');
      expect(startBroadcast).toBeDefined();
      expect(startBroadcast.data.isRunning).toBe(true);
      expect(startBroadcast.data.isPaused).toBe(false);

      // 2. Pause timer
      await TimerService.pauseTimer(testMatch._id, adminUser._id);
      const pauseBroadcast = broadcastEvents.find(e => e.eventName === 'timer:paused');
      expect(pauseBroadcast).toBeDefined();
      expect(pauseBroadcast.data.isRunning).toBe(true);
      expect(pauseBroadcast.data.isPaused).toBe(true);

      // 3. Resume timer
      await TimerService.resumeTimer(testMatch._id, adminUser._id);
      const resumeBroadcast = broadcastEvents.find(e => e.eventName === 'timer:resumed');
      expect(resumeBroadcast).toBeDefined();
      expect(resumeBroadcast.data.isRunning).toBe(true);
      expect(resumeBroadcast.data.isPaused).toBe(false);
    } finally {
      socketEmitter.broadcastTimerEvent = originalBroadcast;
    }
  });

  // TEST 5: UNRELATED DASHBOARD UPDATES DO NOT PAUSE TIMER
  test('TEST 5: Updating scores or adding goals does not alter or pause running timer', async () => {
    // 1. Start timer
    await TimerService.startTimer(testMatch._id, adminUser._id);

    // 2. Score update
    const match = await Match.findById(testMatch._id);
    match.teamAScore = 1;
    match.teamBScore = 0;
    await match.save();

    // 3. Verify timer remains intact
    const reloaded = await MatchService.getMatchById(testMatch._id);
    expect(reloaded.teamAScore).toBe(1);
    expect(reloaded.timer.isRunning).toBe(true);
    expect(reloaded.timer.isPaused).toBe(false);
    expect(reloaded.timer.timerStatus).toBe('RUNNING');
  });

  // TEST 6: SERVER RESTART RECOVERY WITHOUT ACCIDENTAL PAUSE
  test('TEST 6: Server reboot recovery maintains active running timers without setting them to PAUSED', async () => {
    // 1. Start timer with 100 seconds remaining
    await TimerService.startTimer(testMatch._id, adminUser._id);
    const match = await Match.findById(testMatch._id);
    match.timer.phaseEndsAt = new Date(Date.now() + 100 * 1000);
    await match.save();

    // 2. Run recovery
    await TimerService.recoverActiveTimers();

    // 3. Confirm recovered match is still RUNNING, not PAUSED
    const recovered = await Match.findById(testMatch._id);
    expect(recovered.timer.isRunning).toBe(true);
    expect(recovered.timer.isPaused).toBe(false);
    expect(recovered.timer.timerStatus).toBe('RUNNING');
    expect(TimerService.calculateRemainingTime(recovered)).toBe(100);
  });

  // TEST 7: IDEMPOTENCY OF DUPLICATE REQUESTS
  test('TEST 7: Multiple consecutive start requests do not create duplicate timers or alter phaseEndsAt', async () => {
    // 1. First start
    const first = await TimerService.startTimer(testMatch._id, adminUser._id);
    const initialPhaseEndsAt = new Date(first.timer.phaseEndsAt).getTime();

    // 2. Rapid second start
    const second = await TimerService.startTimer(testMatch._id, adminUser._id);
    const secondPhaseEndsAt = new Date(second.timer.phaseEndsAt).getTime();

    // 3. Timestamps must match exactly (idempotent, no timer jump)
    expect(secondPhaseEndsAt).toBe(initialPhaseEndsAt);
    expect(second.timer.isRunning).toBe(true);
    expect(second.timer.isPaused).toBe(false);

    // 4. Multiple pause calls
    await TimerService.pauseTimer(testMatch._id, adminUser._id);
    const pause1Remaining = (await Match.findById(testMatch._id)).timer.remainingTime;
    await TimerService.pauseTimer(testMatch._id, adminUser._id);
    const pause2Remaining = (await Match.findById(testMatch._id)).timer.remainingTime;

    expect(pause2Remaining).toBe(pause1Remaining);
  });

  // TEST 8: STATE MACHINE TRANSITION VALIDATION
  test('TEST 8: Strict state machine prevents invalid transitions on completed matches', async () => {
    // 1. Mark match completed
    const match = await Match.findById(testMatch._id);
    match.status = MATCH_STATUS.COMPLETED;
    match.timer.currentStage = TIMER_STAGES.COMPLETED;
    match.timer.timerStatus = 'COMPLETED';
    match.timer.isRunning = false;
    await match.save();

    // 2. Attempt start on completed match should be rejected
    await expect(TimerService.startTimer(testMatch._id, adminUser._id)).rejects.toThrow(
      'Cannot start timer on completed match'
    );
  });
});
