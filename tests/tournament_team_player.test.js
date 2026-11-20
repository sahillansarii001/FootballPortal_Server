const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');
const Tournament = require('../src/models/Tournament');
const { ROLES, PLAYER_POSITIONS } = require('../src/utils/constants');

describe('Tournament, Team & Player Management Suite', () => {
  let adminToken;

  beforeEach(async () => {
    await Tournament.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await User.deleteMany({});

    const adminRes = await request(app).post('/api/auth/register').send({
      username: 'admin_tourney',
      email: 'admin_tourney@test.com',
      password: 'Password123!',
      role: ROLES.SUPER_ADMIN
    });
    adminToken = adminRes.body.data.token;
  });

  describe('Tournament CRUD', () => {
    it('should create a new tournament with custom rules', async () => {
      const res = await request(app)
        .post('/api/tournaments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Champions Cup 2026',
          description: 'Winter Championship',
          startDate: '2026-12-01',
          endDate: '2026-12-10',
          rules: {
            halfDurationSeconds: 240,
            transitionDurationSeconds: 20,
            halfTimeDurationSeconds: 120,
            initialPenaltyKicks: 5,
            pointsForWin: 3,
            pointsForLoss: 0
          }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Champions Cup 2026');
      expect(res.body.data.rules.halfDurationSeconds).toBe(240);
    });

    it('should fetch all tournaments publicly without token', async () => {
      await request(app)
        .post('/api/tournaments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Open Tournament',
          startDate: '2026-12-01',
          endDate: '2026-12-10'
        });

      const res = await request(app).get('/api/tournaments');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('Team & Player Operations', () => {
    let teamAId;
    let teamBId;

    beforeEach(async () => {
      const teamARes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Manchester Blue',
          coach: 'Pep G',
          description: 'Positional masters'
        });
      teamAId = teamARes.body.data._id;

      const teamBRes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Madrid White',
          coach: 'Carlo A',
          description: 'European royalty'
        });
      teamBId = teamBRes.body.data._id;
    });

    it('should prevent creating duplicate team name', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Manchester Blue'
        });

      expect([400, 500]).toContain(res.status);
      expect(res.body.message).toContain('already exists');
    });

    it('should create player and automatically link to team players roster', async () => {
      const playerRes = await request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Erling H',
          jerseyNumber: 9,
          team: teamAId,
          position: PLAYER_POSITIONS.FORWARD
        });

      expect(playerRes.status).toBe(201);
      expect(playerRes.body.data.name).toBe('Erling H');
      expect(playerRes.body.data.jerseyNumber).toBe(9);

      // Verify team roster
      const teamRes = await request(app).get(`/api/teams/${teamAId}/players`);
      expect(teamRes.status).toBe(200);
      expect(teamRes.body.data.length).toBe(1);
      expect(teamRes.body.data[0].name).toBe('Erling H');
    });

    it('should reject duplicate jersey number in the same team', async () => {
      await request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Player One',
          jerseyNumber: 10,
          team: teamAId,
          position: PLAYER_POSITIONS.MIDFIELDER
        });

      const duplicateRes = await request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Player Two',
          jerseyNumber: 10,
          team: teamAId,
          position: PLAYER_POSITIONS.FORWARD
        });

      expect([400, 500]).toContain(duplicateRes.status);
      expect(duplicateRes.body.message).toContain('Jersey number 10 is already assigned');
    });

    it('should allow same jersey number in different teams', async () => {
      const p1 = await request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Team A Striker',
          jerseyNumber: 9,
          team: teamAId,
          position: PLAYER_POSITIONS.FORWARD
        });

      const p2 = await request(app)
        .post('/api/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Team B Striker',
          jerseyNumber: 9,
          team: teamBId,
          position: PLAYER_POSITIONS.FORWARD
        });

      expect(p1.status).toBe(201);
      expect(p2.status).toBe(201);
    });
  });
});
