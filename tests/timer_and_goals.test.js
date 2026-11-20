const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');
const Tournament = require('../src/models/Tournament');
const Match = require('../src/models/Match');
const TimerService = require('../src/services/timerService');
const { ROLES, TIMER_STAGES, GOAL_TYPES } = require('../src/utils/constants');

describe('Live Match Timer & Goal Management Suite', () => {
  let operatorToken;
  let adminToken;
  let matchId;
  let teamAId;
  let teamBId;
  let strikerAId;
  let defenderAId;

  beforeEach(async () => {
    await Match.deleteMany({});
    await Tournament.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await User.deleteMany({});

    // Create Admin & Operator
    const adminRes = await request(app).post('/api/auth/register').send({
      username: 'admin_tg',
      email: 'admin_tg@test.com',
      password: 'Password123!',
      role: ROLES.SUPER_ADMIN
    });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app).post('/api/auth/register').send({
      username: 'op_tg',
      email: 'op_tg@test.com',
      password: 'Password123!',
      role: ROLES.MATCH_OPERATOR
    });
    operatorToken = opRes.body.data.token;

    // Create Teams
    const teamARes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Alpha FC' });
    const teamBRes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Beta FC' });
    teamAId = teamARes.body.data._id;
    teamBId = teamBRes.body.data._id;

    // Create Players
    const strikerRes = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Alpha Striker',
      jerseyNumber: 9,
      team: teamAId,
      position: 'Forward'
    });
    strikerAId = strikerRes.body.data._id;

    const defRes = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Alpha Defender',
      jerseyNumber: 4,
      team: teamAId,
      position: 'Defender'
    });
    defenderAId = defRes.body.data._id;

    // Create Tournament
    const tourneyRes = await request(app).post('/api/tournaments').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Timer Cup',
      startDate: '2026-11-20',
      endDate: '2026-11-25',
      participatingTeams: [teamAId, teamBId]
    });

    // Schedule Match
    const matchRes = await request(app).post('/api/matches').set('Authorization', `Bearer ${adminToken}`).send({
      tournament: tourneyRes.body.data._id,
      matchNumber: 1,
      teamA: teamAId,
      teamB: teamBId,
      matchDate: '2026-11-20',
      matchTime: '15:00',
      venue: 'National Arena'
    });
    matchId = matchRes.body.data._id;
  });

  describe('Live Match Timer Operations', () => {
    it('should start timer and set match status to Live', async () => {
      const res = await request(app)
        .post(`/api/matches/${matchId}/timer/start`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Live');
      expect(res.body.data.timer.currentStage).toBe(TIMER_STAGES.FIRST_HALF);
      expect(res.body.data.timer.isRunning).toBe(true);
      expect(res.body.data.timer.isPaused).toBe(false);
      expect(res.body.data.timer.remainingTime).toBe(240);
    });

    it('should pause timer and preserve accurate remaining time', async () => {
      await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

      const pauseRes = await request(app)
        .post(`/api/matches/${matchId}/timer/pause`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(pauseRes.status).toBe(200);
      expect(pauseRes.body.data.timer.isPaused).toBe(true);
      expect(pauseRes.body.data.timer.pausedTimestamp).toBeDefined();
    });

    it('should resume paused timer seamlessly', async () => {
      await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);
      await request(app).post(`/api/matches/${matchId}/timer/pause`).set('Authorization', `Bearer ${operatorToken}`);

      const resumeRes = await request(app)
        .post(`/api/matches/${matchId}/timer/resume`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.data.timer.isPaused).toBe(false);
      expect(resumeRes.body.data.timer.isRunning).toBe(true);
    });

    it('should allow Super Admin to reset timer to First Half', async () => {
      await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

      const resetRes = await request(app)
        .post(`/api/matches/${matchId}/timer/reset`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.data.timer.currentStage).toBe(TIMER_STAGES.FIRST_HALF);
      expect(resetRes.body.data.timer.remainingTime).toBe(240);
      expect(resetRes.body.data.timer.isRunning).toBe(false);
    });

    it('should advance stages in order: First Half -> Half-Time -> Second Half -> Completed', async () => {
      await request(app).post(`/api/matches/${matchId}/timer/start`).set('Authorization', `Bearer ${operatorToken}`);

      // Advance from First Half -> Half-Time (120s)
      const stage1 = await request(app).post(`/api/matches/${matchId}/timer/advance`).set('Authorization', `Bearer ${operatorToken}`);
      expect(stage1.body.data.timer.currentStage).toBe(TIMER_STAGES.HALF_TIME);
      expect(stage1.body.data.timer.stageDuration).toBe(120);
      expect(stage1.body.data.status).toBe('Half-Time');

      // Advance from Half-Time -> Second Half (240s)
      const stage2 = await request(app).post(`/api/matches/${matchId}/timer/advance`).set('Authorization', `Bearer ${operatorToken}`);
      expect(stage2.body.data.timer.currentStage).toBe(TIMER_STAGES.SECOND_HALF);
      expect(stage2.body.data.timer.stageDuration).toBe(240);
      expect(stage2.body.data.status).toBe('Live');
    });
  });

  describe('Goal Management & Undo Logic', () => {
    it('should record a normal goal, increase team score, and update player stats', async () => {
      const res = await request(app)
        .post(`/api/matches/${matchId}/goals`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          team: teamAId,
          player: strikerAId,
          goalType: GOAL_TYPES.NORMAL,
          description: 'Top corner strike from 20 yards'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.match.teamAScore).toBe(1);
      expect(res.body.data.match.teamBScore).toBe(0);

      // Verify player goals incremented
      const playerRes = await request(app).get(`/api/players/${strikerAId}`);
      expect(playerRes.body.data.goals).toBe(1);
    });

    it('should correctly credit opposing team when an Own Goal is scored', async () => {
      // Defender A scores an own goal
      const res = await request(app)
        .post(`/api/matches/${matchId}/goals`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          team: teamAId,
          player: defenderAId,
          goalType: GOAL_TYPES.OWN_GOAL,
          description: 'Deflected clearance into own net'
        });

      expect(res.status).toBe(201);
      // Team B gets the goal!
      expect(res.body.data.match.teamAScore).toBe(0);
      expect(res.body.data.match.teamBScore).toBe(1);

      // Defender's goals should NOT increase for an own goal
      const playerRes = await request(app).get(`/api/players/${defenderAId}`);
      expect(playerRes.body.data.goals).toBe(0);
    });

    it('should undo a recorded goal, reverting score and player stats', async () => {
      // Record a goal
      await request(app)
        .post(`/api/matches/${matchId}/goals`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          team: teamAId,
          player: strikerAId,
          goalType: GOAL_TYPES.NORMAL
        });

      // Undo the goal
      const undoRes = await request(app)
        .post(`/api/matches/${matchId}/goals/undo`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(undoRes.status).toBe(200);
      expect(undoRes.body.data.teamAScore).toBe(0);

      // Player stats reverted
      const playerRes = await request(app).get(`/api/players/${strikerAId}`);
      expect(playerRes.body.data.goals).toBe(0);
    });
  });
});
