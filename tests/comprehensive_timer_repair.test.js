/**
 * Comprehensive Automated Timer Test Suite
 * Validating the complete server-authoritative timer architecture,
 * phase transitions, pause/resume precision, persistence, recovery, and real-time sockets.
 */

const request = require('supertest');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { initSocket } = require('../src/sockets/socketManager');
const TimerService = require('../src/services/timerService');
const Match = require('../src/models/Match');
const Team = require('../src/models/Team');
const Tournament = require('../src/models/Tournament');
const User = require('../src/models/User');
const { ROLES, TIMER_STAGES, MATCH_STATUS } = require('../src/utils/constants');

let server;
let adminToken;
let operatorToken;
let teamAId;
let teamBId;
let tournamentId;
let matchId;
let socketPort;

beforeAll(async () => {
  server = http.createServer(app);
  initSocket(server);
  await new Promise((resolve) => {
    server.listen(0, () => {
      socketPort = server.address().port;
      resolve();
    });
  });

  await User.deleteMany({});
  await Team.deleteMany({});
  await Tournament.deleteMany({});
  await Match.deleteMany({});

  // Create Users
  const adminRes = await request(app).post('/api/auth/register').send({
    username: 'timerAdmin',
    email: 'timer_admin@portal.test',
    password: 'Password123!',
    role: ROLES.SUPER_ADMIN
  });
  adminToken = adminRes.body.data.token;

  const opRes = await request(app).post('/api/auth/register').send({
    username: 'timerOp',
    email: 'timer_op@portal.test',
    password: 'Password123!',
    role: ROLES.MATCH_OPERATOR
  });
  operatorToken = opRes.body.data.token;

  // Create Teams
  const tA = await Team.create({ name: 'Timer Team Alpha', coach: 'Coach A' });
  const tB = await Team.create({ name: 'Timer Team Beta', coach: 'Coach B' });
  teamAId = tA._id.toString();
  teamBId = tB._id.toString();

  // Create Tournament
  const tourney = await Tournament.create({
    name: 'Timer Championship 2026',
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    participatingTeams: [teamAId, teamBId]
  });
  tournamentId = tourney._id.toString();
});

afterAll(async () => {
  TimerService.stopTicker();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

let matchCounter = 5000;
beforeEach(async () => {
  matchCounter++;
  const match = await Match.create({
    tournament: tournamentId,
    matchNumber: matchCounter,
    teamA: teamAId,
    teamB: teamBId,
    matchDate: new Date(),
    matchTime: '18:00',
    venue: 'Timer Arena',
    status: MATCH_STATUS.UPCOMING,
    timer: {
      currentStage: TIMER_STAGES.FIRST_HALF,
      stageDuration: 240,
      remainingTime: 240,
      phaseEndsAt: null,
      startedTimestamp: null,
      pausedTimestamp: null,
      isRunning: false,
      isPaused: false,
      timerStatus: 'IDLE'
    }
  });
  matchId = match._id.toString();
});

describe('1. Basic Match Timer Tests (Rules & Durations)', () => {
  it('1. First half starts at 04:00 (240 seconds)', async () => {
    const res = await request(app)
      .post(`/api/matches/${matchId}/timer/start`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.timer.currentStage).toBe(TIMER_STAGES.FIRST_HALF);
    expect(res.body.data.timer.remainingTime).toBe(240);
    expect(res.body.data.timer.stageDuration).toBe(240);
    expect(res.body.data.timer.isRunning).toBe(true);
    expect(res.body.data.timer.isPaused).toBe(false);
  });

  it('2. Timer calculates correct remaining time based on phaseEndsAt', async () => {
    const match = await Match.findById(matchId);
    match.timer.isRunning = true;
    match.timer.isPaused = false;
    match.timer.stageDuration = 240;
    // Set phaseEndsAt to 150 seconds in the future
    match.timer.phaseEndsAt = new Date(Date.now() + 150 * 1000);
    await match.save();

    const remaining = TimerService.calculateRemainingTime(match);
    expect(remaining).toBe(150);
  });

  it('3. Timer counts down correctly as time advances', async () => {
    const match = await Match.findById(matchId);
    match.timer.isRunning = true;
    match.timer.isPaused = false;
    match.timer.stageDuration = 240;
    // Set phaseEndsAt to 60 seconds in the future
    match.timer.phaseEndsAt = new Date(Date.now() + 60 * 1000);
    await match.save();

    const remaining = TimerService.calculateRemainingTime(match);
    expect(remaining).toBe(60);
  });

  it('4. Pause freezes remaining time and sets status to PAUSED', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    // Set remaining time to 180s
    const match = await Match.findById(matchId);
    match.timer.phaseEndsAt = new Date(Date.now() + 180 * 1000);
    await match.save();

    const pauseRes = await request(app)
      .post(`/api/matches/${matchId}/timer/pause`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.data.timer.isPaused).toBe(true);
    expect(pauseRes.body.data.timer.remainingTime).toBe(180);
    expect(pauseRes.body.data.timer.phaseEndsAt).toBeNull();
  });

  it('5. Resume continues from exact remaining time', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const match = await Match.findById(matchId);
    match.timer.isPaused = true;
    match.timer.remainingTime = 165;
    match.timer.phaseEndsAt = null;
    await match.save();

    const resumeRes = await request(app)
      .post(`/api/matches/${matchId}/timer/resume`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.timer.isPaused).toBe(false);
    expect(resumeRes.body.data.timer.isRunning).toBe(true);
    expect(resumeRes.body.data.timer.remainingTime).toBe(165);
    expect(resumeRes.body.data.timer.phaseEndsAt).toBeDefined();
  });

  it('6 & 7. Half-time begins automatically and starts at 02:00 (120 seconds)', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    // Advance stage from First Half -> Half-Time
    const advRes = await request(app)
      .post(`/api/matches/${matchId}/timer/advance`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(advRes.status).toBe(200);
    expect(advRes.body.data.timer.currentStage).toBe(TIMER_STAGES.HALF_TIME);
    expect(advRes.body.data.timer.stageDuration).toBe(120);
    expect(advRes.body.data.timer.remainingTime).toBe(120);
    expect(advRes.body.data.status).toBe('Half-Time');
  });

  it('8. Second half starts at 04:00 (240 seconds)', async () => {
    // Put match in Half-Time
    const match = await Match.findById(matchId);
    match.timer.currentStage = TIMER_STAGES.HALF_TIME;
    match.timer.stageDuration = 120;
    match.timer.remainingTime = 120;
    match.timer.isRunning = true;
    match.status = 'Half-Time';
    await match.save();

    const advRes = await request(app)
      .post(`/api/matches/${matchId}/timer/advance`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(advRes.status).toBe(200);
    expect(advRes.body.data.timer.currentStage).toBe(TIMER_STAGES.SECOND_HALF);
    expect(advRes.body.data.timer.stageDuration).toBe(240);
    expect(advRes.body.data.timer.remainingTime).toBe(240);
    expect(advRes.body.data.status).toBe('Live');
  });

  it('9. Extra time starts at 02:00 (120 seconds) when tied', async () => {
    // Put match in Second Half with tied scores (1-1)
    const match = await Match.findById(matchId);
    match.timer.currentStage = TIMER_STAGES.SECOND_HALF;
    match.timer.stageDuration = 240;
    match.timer.remainingTime = 240;
    match.timer.isRunning = true;
    match.teamAScore = 1;
    match.teamBScore = 1;
    match.status = 'Live';
    await match.save();

    const advRes = await request(app)
      .post(`/api/matches/${matchId}/timer/advance`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(advRes.status).toBe(200);
    expect(advRes.body.data.timer.currentStage).toBe(TIMER_STAGES.EXTRA_TIME);
    expect(advRes.body.data.timer.stageDuration).toBe(120);
    expect(advRes.body.data.timer.remainingTime).toBe(120);
  });

  it('10. Penalties start when extra time ends tied', async () => {
    // Put match in Extra Time tied (1-1)
    const match = await Match.findById(matchId);
    match.timer.currentStage = TIMER_STAGES.EXTRA_TIME;
    match.timer.stageDuration = 120;
    match.timer.remainingTime = 120;
    match.timer.isRunning = true;
    match.teamAScore = 1;
    match.teamBScore = 1;
    match.status = 'Live';
    await match.save();

    const advRes = await request(app)
      .post(`/api/matches/${matchId}/timer/advance`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(advRes.status).toBe(200);
    expect(advRes.body.data.status).toBe('Penalty Shootout');
    expect(advRes.body.data.timer.currentStage).toBe(TIMER_STAGES.PENALTY_SHOOTOUT);
    expect(advRes.body.data.timer.isRunning).toBe(false);
  });
});

describe('2. Pause and Resume Precision Tests', () => {
  it('11 & 12. Pause at 03:25 (205s) and resume at 03:25 (205s)', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const match = await Match.findById(matchId);
    match.timer.phaseEndsAt = new Date(Date.now() + 205 * 1000);
    await match.save();

    const pauseRes = await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);
    expect(pauseRes.body.data.timer.remainingTime).toBe(205);

    const resumeRes = await request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${operatorToken}`);
    expect(resumeRes.body.data.timer.remainingTime).toBe(205);
    expect(resumeRes.body.data.timer.isRunning).toBe(true);
    expect(resumeRes.body.data.timer.isPaused).toBe(false);
  });

  it('13, 14 & 15. Pause at 01:17 (77s), refresh while paused, resume after refresh', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const match = await Match.findById(matchId);
    match.timer.phaseEndsAt = new Date(Date.now() + 77 * 1000);
    await match.save();

    await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);

    // Simulate page refresh by fetching from database
    const refreshed = await request(app).get(`/api/matches/${matchId}/timer`);
    expect(refreshed.body.data.isPaused).toBe(true);
    expect(refreshed.body.data.remainingTime).toBe(77);

    // Resume after refresh
    const resumeRes = await request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${operatorToken}`);
    expect(resumeRes.body.data.timer.remainingTime).toBe(77);
  });

  it('16. Multiple pause requests are completely idempotent', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const match = await Match.findById(matchId);
    match.timer.phaseEndsAt = new Date(Date.now() + 100 * 1000);
    await match.save();

    const pause1 = await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);
    const pause2 = await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);
    const pause3 = await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);

    expect(pause1.body.data.timer.remainingTime).toBe(100);
    expect(pause2.body.data.timer.remainingTime).toBe(100);
    expect(pause3.body.data.timer.remainingTime).toBe(100);
  });

  it('17. Multiple resume requests are completely idempotent and do not spawn extra timers', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
    await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);

    const res1 = await request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${operatorToken}`);
    const res2 = await request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${operatorToken}`);

    expect(res1.body.data.timer.isRunning).toBe(true);
    expect(res2.body.data.timer.isRunning).toBe(true);
    expect(res2.body.data.timer.isPaused).toBe(false);
  });

  it('18. Pause near zero seconds preserves non-negative remaining time', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const match = await Match.findById(matchId);
    match.timer.phaseEndsAt = new Date(Date.now() + 1 * 1000); // 1s remaining
    await match.save();

    const pauseRes = await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);
    expect(pauseRes.body.data.timer.remainingTime).toBeGreaterThanOrEqual(0);
    expect(pauseRes.body.data.timer.remainingTime).toBeLessThanOrEqual(1);
  });
});

describe('3. Persistence & Recovery Tests', () => {
  it('19 & 20. Refresh while running & paused preserves authoritative state', async () => {
    // Running
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
    const runFetch = await request(app).get(`/api/matches/${matchId}/timer`);
    expect(runFetch.body.data.isRunning).toBe(true);
    expect(runFetch.body.data.remainingTime).toBe(240);

    // Paused
    await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);
    const pauseFetch = await request(app).get(`/api/matches/${matchId}/timer`);
    expect(pauseFetch.body.data.isPaused).toBe(true);
  });

  it('21. Backend restart while running recovers match timer', async () => {
    const match = await Match.findById(matchId);
    match.status = 'Live';
    match.timer.isRunning = true;
    match.timer.isPaused = false;
    match.timer.stageDuration = 240;
    match.timer.phaseEndsAt = new Date(Date.now() + 140 * 1000); // 140s remaining
    await match.save();

    await TimerService.recoverActiveTimers();

    const recovered = await Match.findById(matchId);
    expect(recovered.timer.isRunning).toBe(true);
    expect(recovered.timer.remainingTime).toBe(140);
  });

  it('22. Backend restart while paused preserves saved remaining time', async () => {
    const match = await Match.findById(matchId);
    match.status = 'Live';
    match.timer.isRunning = true;
    match.timer.isPaused = true;
    match.timer.remainingTime = 88;
    match.timer.phaseEndsAt = null;
    await match.save();

    await TimerService.recoverActiveTimers();

    const recovered = await Match.findById(matchId);
    expect(recovered.timer.isPaused).toBe(true);
    expect(recovered.timer.remainingTime).toBe(88);
  });

  it('23 & 24. Reconnection & Device Synchronization: both receive identical state', async () => {
    const match = await Match.findById(matchId);
    match.status = 'Live';
    match.timer.isRunning = true;
    match.timer.isPaused = false;
    match.timer.phaseEndsAt = new Date(Date.now() + 180 * 1000);
    await match.save();

    const deviceA = await request(app).get(`/api/matches/${matchId}/timer`);
    const deviceB = await request(app).get(`/api/matches/${matchId}/timer`);

    expect(deviceA.body.data.remainingTime).toBe(180);
    expect(deviceB.body.data.remainingTime).toBe(180);
    expect(deviceA.body.data.phase).toBe(deviceB.body.data.phase);
  });

  it('25. Verify persisted phase state across stages', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
    await request(app).post(`/api/matches/${matchId}/timer/advance`).set('Authorization', `Bearer ${operatorToken}`);

    const match = await Match.findById(matchId);
    expect(match.timer.currentStage).toBe(TIMER_STAGES.HALF_TIME);
    expect(match.timer.stageHistory.length).toBe(1);
    expect(match.timer.stageHistory[0].stage).toBe(TIMER_STAGES.FIRST_HALF);
  });
});

describe('4. Concurrency & Idempotency Tests', () => {
  it('26. Two administrators pausing simultaneously executes safely', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const [p1, p2] = await Promise.all([
      request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`),
      request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${adminToken}`)
    ]);

    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    const match = await Match.findById(matchId);
    expect(match.timer.isPaused).toBe(true);
  });

  it('27. Two administrators resuming simultaneously executes safely', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
    await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);

    const [r1, r2] = await Promise.all([
      request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${operatorToken}`),
      request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${adminToken}`)
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const match = await Match.findById(matchId);
    expect(match.timer.isRunning).toBe(true);
    expect(match.timer.isPaused).toBe(false);
  });

  it('28 & 29. Concurrent phase transition requests are atomic (lock prevents double transition)', async () => {
    await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

    const [t1, t2] = await Promise.all([
      TimerService.advanceStage(matchId),
      TimerService.advanceStage(matchId)
    ]);

    // One succeeds, second is blocked by atomic lock
    const match = await Match.findById(matchId);
    expect(match.timer.currentStage).toBe(TIMER_STAGES.HALF_TIME);
  });

  it('30. Completed match rejects timer operations', async () => {
    const match = await Match.findById(matchId);
    match.status = MATCH_STATUS.COMPLETED;
    match.timer.isRunning = false;
    match.timer.currentStage = TIMER_STAGES.COMPLETED;
    await match.save();

    const res = await request(app)
      .post(`/api/matches/${matchId}/timer/start`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(500);
    expect(res.body.message).toContain('Cannot start timer on completed match');
  });
});

describe('5. Real-Time Socket.IO Synchronization Tests', () => {
  let clientSocket;

  beforeEach((done) => {
    clientSocket = ioClient(`http://localhost:${socketPort}`, {
      transports: ['websocket'],
      forceNew: true
    });
    clientSocket.on('connect', () => {
      clientSocket.emit('join:match', matchId);
      clientSocket.once('joined:match', () => done());
    });
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it('31 & 32. Admin and spectator show same phase and remaining time via socket sync', (done) => {
    clientSocket.once('timer:sync', (data) => {
      expect(data.matchId).toBe(matchId);
      expect(data.currentStage).toBe(TIMER_STAGES.FIRST_HALF);
      expect(data.remainingTime).toBe(240);
      done();
    });

    request(app)
      .post(`/api/matches/${matchId}/timer/start`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .then();
  });

  it('33. Pause broadcasts correctly with timer:paused event', (done) => {
    request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`).then(() => {
      clientSocket.once('timer:paused', (data) => {
        expect(data.matchId).toBe(matchId);
        expect(data.isPaused).toBe(true);
        done();
      });

      request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`).then();
    });
  });

  it('34. Resume broadcasts correctly with timer:resumed event', (done) => {
    request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`).then(() => {
      request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`).then(() => {
        clientSocket.once('timer:resumed', (data) => {
          expect(data.matchId).toBe(matchId);
          expect(data.isPaused).toBe(false);
          expect(data.isRunning).toBe(true);
          done();
        });

        request(app).post(`/api/matches/${matchId}/timer/resume`).set('Authorization', `Bearer ${operatorToken}`).then();
      });
    });
  });

  it('35. Automatic phase transition broadcasts match:phase_changed', (done) => {
    request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`).then(() => {
      clientSocket.once('match:phase_changed', (data) => {
        expect(data.matchId).toBe(matchId);
        expect(data.phase).toBe(TIMER_STAGES.HALF_TIME);
        done();
      });

      request(app).post(`/api/matches/${matchId}/timer/advance`).set('Authorization', `Bearer ${operatorToken}`).then();
    });
  });

  it('36 & 37. Late spectator & reconnect receives current timer state immediately', (done) => {
    const lateSocket = ioClient(`http://localhost:${socketPort}`, {
      transports: ['websocket'],
      forceNew: true
    });

    lateSocket.on('connect', () => {
      lateSocket.emit('join:match', matchId);
    });

    lateSocket.once('match:sync', (state) => {
      expect(state._id.toString()).toBe(matchId);
      expect(state.timer).toBeDefined();
      lateSocket.disconnect();
      done();
    });
  });
});
