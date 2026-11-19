const request = require('supertest');
const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');
const Tournament = require('../src/models/Tournament');
const Match = require('../src/models/Match');
const TimerService = require('../src/services/timerService');
const StandingsService = require('../src/services/standingsService');
const { initSocket } = require('../src/sockets/socketManager');
const { ROLES, TIMER_STAGES, GOAL_TYPES } = require('../src/utils/constants');

describe('Advanced Real-Time, Event History & Recovery Suite', () => {
  let adminToken;
  let operatorToken;
  let tournamentId;
  let teamAId;
  let teamBId;
  let strikerAId;
  let matchId;
  let testServer;
  let socketPort;

  beforeAll((done) => {
    testServer = http.createServer(app);
    initSocket(testServer);
    testServer.listen(0, () => {
      socketPort = testServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    testServer.close(done);
  });

  beforeEach(async () => {
    await Match.deleteMany({});
    await Tournament.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await User.deleteMany({});

    // Auth Users
    const adminRes = await request(app).post('/api/auth/register').send({
      username: 'admin_rec',
      email: 'admin_rec@test.com',
      password: 'Password123!',
      role: ROLES.SUPER_ADMIN
    });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app).post('/api/auth/register').send({
      username: 'op_rec',
      email: 'op_rec@test.com',
      password: 'Password123!',
      role: ROLES.MATCH_OPERATOR
    });
    operatorToken = opRes.body.data.token;

    // Teams
    const teamARes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Real Madrid' });
    const teamBRes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Barcelona' });
    teamAId = teamARes.body.data._id;
    teamBId = teamBRes.body.data._id;

    // Player
    const strikerRes = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Vinicius Jr',
      jerseyNumber: 7,
      team: teamAId,
      position: 'Forward'
    });
    strikerAId = strikerRes.body.data._id;

    // Tournament
    const tourneyRes = await request(app).post('/api/tournaments').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Supercopa 2026',
      startDate: '2026-11-20',
      endDate: '2026-11-30',
      participatingTeams: [teamAId, teamBId]
    });
    tournamentId = tourneyRes.body.data._id;

    // Match
    const matchRes = await request(app).post('/api/matches').set('Authorization', `Bearer ${adminToken}`).send({
      tournament: tournamentId,
      matchNumber: 1,
      teamA: teamAId,
      teamB: teamBId,
      matchDate: '2026-11-20',
      matchTime: '21:00',
      venue: 'Santiago Bernabeu'
    });
    matchId = matchRes.body.data._id;
  });

  describe('Unified Authoritative State Endpoint (GET /api/matches/:id/live)', () => {
    it('should return complete current match state in one API call', async () => {
      // Start match and record a goal
      await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
      await request(app).post(`/api/matches/${matchId}/goals`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamAId,
        player: strikerAId,
        goalType: GOAL_TYPES.NORMAL,
        description: 'Curled into the far corner'
      });

      const res = await request(app).get(`/api/matches/${matchId}/live`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const state = res.body.data;
      expect(state.matchId).toBe(matchId);
      expect(state.teamA.name).toBe('Real Madrid');
      expect(state.teamB.name).toBe('Barcelona');
      expect(state.score.teamA).toBe(1);
      expect(state.score.teamB).toBe(0);
      expect(state.currentStage).toBe(TIMER_STAGES.FIRST_HALF);
      expect(state.timer.isRunning).toBe(true);
      expect(state.timer.remainingTime).toBeLessThanOrEqual(240);
      expect(state.goals.length).toBe(1);
      expect(state.goals[0].player.name).toBe('Vinicius Jr');
      expect(state.events.length).toBeGreaterThanOrEqual(2); // MATCH_STARTED, TIMER_STARTED, GOAL_SCORED
    });
  });

  describe('Chronological Match Events & Timeline (GET /api/matches/:id/timeline)', () => {
    it('should produce chronological timeline with match-clock and actual timestamp', async () => {
      await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
      await request(app).post(`/api/matches/${matchId}/goals`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamAId,
        player: strikerAId,
        goalType: GOAL_TYPES.NORMAL
      });

      const res = await request(app).get(`/api/matches/${matchId}/timeline`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const timeline = res.body.data;
      expect(timeline.length).toBeGreaterThanOrEqual(2);

      // Verify each event has clockTime and real timestamp
      timeline.forEach((item) => {
        expect(item.clockTime).toBeDefined();
        expect(item.timestamp).toBeDefined();
        expect(item.title).toBeDefined();
      });

      // Verify ordering
      for (let i = 0; i < timeline.length - 1; i++) {
        const timeA = new Date(timeline[i].timestamp).getTime();
        const timeB = new Date(timeline[i + 1].timestamp).getTime();
        expect(timeA).toBeLessThanOrEqual(timeB);
      }
    });

    it('should maintain audit history when a goal is removed without deleting past record', async () => {
      const goalRes = await request(app).post(`/api/matches/${matchId}/goals`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamAId,
        player: strikerAId,
        goalType: GOAL_TYPES.NORMAL
      });
      const goalEventId = goalRes.body.data.event._id;

      // Undo goal
      await request(app).post(`/api/matches/${matchId}/goals/undo`).set('Authorization', `Bearer ${operatorToken}`).send({
        eventId: goalEventId
      });

      const eventsRes = await request(app).get(`/api/matches/${matchId}/events`);
      expect(eventsRes.status).toBe(200);

      // Both the original goal event (marked isUndone: true) and the GOAL_REMOVED correction event exist
      const originalGoal = eventsRes.body.data.find((e) => e._id.toString() === goalEventId.toString());
      expect(originalGoal.isUndone).toBe(true);

      const undoEvent = eventsRes.body.data.find((e) => e.type === 'GOAL_REMOVED');
      expect(undoEvent).toBeDefined();
      expect(undoEvent.correctionEventId.toString()).toBe(goalEventId.toString());
    });
  });

  describe('Server Restart Recovery Mechanism', () => {
    it('should recover active match timer and calculate remaining time accurately after restart', async () => {
      // Simulate an active match started 50 seconds ago
      const fiftySecondsAgo = new Date(Date.now() - 50 * 1000);
      const match = await Match.findById(matchId);
      match.status = 'Live';
      match.timer.currentStage = TIMER_STAGES.FIRST_HALF;
      match.timer.stageDuration = 240;
      match.timer.remainingTime = 240;
      match.timer.startedTimestamp = fiftySecondsAgo;
      match.timer.pausedTimestamp = null;
      match.timer.totalPausedDuration = 0;
      match.timer.isRunning = true;
      match.timer.isPaused = false;
      await match.save();

      // Trigger restart recovery
      await TimerService.recoverActiveTimers();

      const recovered = await Match.findById(matchId);
      expect(recovered.timer.isRunning).toBe(true);
      // Expected remaining is ~190s (240 - 50)
      expect(recovered.timer.remainingTime).toBeLessThanOrEqual(192);
      expect(recovered.timer.remainingTime).toBeGreaterThanOrEqual(185);
    });

    it('should cascade expired stages if server was offline past stage duration', async () => {
      // First Half is 240s. Simulate match started 250s ago (10s into Transition Gap)
      const pastStartedAt = new Date(Date.now() - 250 * 1000);
      const match = await Match.findById(matchId);
      match.status = 'Live';
      match.timer.currentStage = TIMER_STAGES.FIRST_HALF;
      match.timer.stageDuration = 240;
      match.timer.remainingTime = 240;
      match.timer.startedTimestamp = pastStartedAt;
      match.timer.isRunning = true;
      match.timer.isPaused = false;
      await match.save();

      // Trigger restart recovery
      await TimerService.recoverActiveTimers();

      const recovered = await Match.findById(matchId);
      // Stage must have advanced to Transition Gap or beyond
      expect(recovered.timer.currentStage).not.toBe(TIMER_STAGES.FIRST_HALF);
    });
  });

  describe('Reconnection State Synchronization via Socket.IO', () => {
    it('should immediately emit authoritative match:sync when client joins match room', (done) => {
      const client = ioClient(`http://localhost:${socketPort}`, {
        transports: ['websocket'],
        forceNew: true
      });

      client.on('connect', () => {
        client.emit('join:match', matchId);

        client.on('match:sync', (state) => {
          expect(state.matchId.toString()).toBe(matchId.toString());
          expect(state.teamA).toBeDefined();
          expect(state.teamB).toBeDefined();
          expect(state.timer).toBeDefined();
          client.disconnect();
          done();
        });
      });
    });
  });

  describe('Idempotency & Duplicate Prevention', () => {
    it('should not award duplicate points when finalizeMatch is called multiple times', async () => {
      const match = await Match.findById(matchId);
      match.status = 'Completed';
      match.teamAScore = 2;
      match.teamBScore = 0;
      match.winner = teamAId;
      await match.save();

      // First finalization
      await TimerService.finalizeMatch(matchId);

      const standings1 = await StandingsService.getPointTable(tournamentId);
      const points1 = standings1.find((s) => s.team._id.toString() === teamAId.toString()).points;
      expect(points1).toBe(3);

      // Attempt second finalization (duplicate call)
      await TimerService.finalizeMatch(matchId);

      const standings2 = await StandingsService.getPointTable(tournamentId);
      const points2 = standings2.find((s) => s.team._id.toString() === teamAId.toString()).points;
      // Points must still be strictly 3 (no duplication!)
      expect(points2).toBe(3);
    });
  });
});
