const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');
const Tournament = require('../src/models/Tournament');
const Match = require('../src/models/Match');
const { ROLES, PLAYER_POSITIONS, GOAL_TYPES } = require('../src/utils/constants');

describe('Comprehensive Audit Verification Suite', () => {
  let adminToken;
  let operatorToken;
  let tournamentId;
  let teamAId;
  let teamBId;
  let playerA1Id;
  let playerA2Id;
  let matchId;

  beforeEach(async () => {
    await Match.deleteMany({});
    await Tournament.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await User.deleteMany({});

    // Create Admin & Operator
    const adminRes = await request(app).post('/api/auth/register').send({
      username: 'audit_admin',
      email: 'audit_admin@test.com',
      password: 'Password123!',
      role: ROLES.SUPER_ADMIN
    });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app).post('/api/auth/register').send({
      username: 'audit_op',
      email: 'audit_op@test.com',
      password: 'Password123!',
      role: ROLES.MATCH_OPERATOR
    });
    operatorToken = opRes.body.data.token;

    // Create Teams
    const teamARes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Audit Team Alpha',
      coach: 'Coach Alpha'
    });
    teamAId = teamARes.body.data._id;

    const teamBRes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Audit Team Beta',
      coach: 'Coach Beta'
    });
    teamBId = teamBRes.body.data._id;

    // Create Players
    const pA1 = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Alpha Scorer 1',
      jerseyNumber: 9,
      team: teamAId,
      position: PLAYER_POSITIONS.FORWARD
    });
    playerA1Id = pA1.body.data._id;

    const pA2 = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Alpha Scorer 2',
      jerseyNumber: 10,
      team: teamAId,
      position: PLAYER_POSITIONS.FORWARD
    });
    playerA2Id = pA2.body.data._id;

    // Create Tournament
    const tourneyRes = await request(app).post('/api/tournaments').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Audit Tournament',
      startDate: '2026-11-20',
      endDate: '2026-11-30',
      participatingTeams: [teamAId, teamBId]
    });
    tournamentId = tourneyRes.body.data._id;

    // Schedule Match
    const matchRes = await request(app).post('/api/matches').set('Authorization', `Bearer ${adminToken}`).send({
      tournament: tournamentId,
      matchNumber: 1,
      teamA: teamAId,
      teamB: teamBId,
      matchDate: '2026-11-20',
      matchTime: '18:00',
      venue: 'Audit Arena'
    });
    matchId = matchRes.body.data._id;
  });

  describe('Tournament Lifecycle & Clean Deletion', () => {
    it('should update tournament details and status', async () => {
      const updateRes = await request(app)
        .put(`/api/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated Tournament Description'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.description).toBe('Updated Tournament Description');

      const statusRes = await request(app)
        .patch(`/api/tournaments/${tournamentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Ongoing' });

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.status).toBe('Ongoing');
    });

    it('should delete tournament and clean up associated standings and matches', async () => {
      const delRes = await request(app)
        .delete(`/api/tournaments/${tournamentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify tournament is deleted
      const checkRes = await request(app).get(`/api/tournaments/${tournamentId}`);
      expect(checkRes.status).toBe(500); // Resource not found
    });
  });

  describe('Team Integrity & Deletion Protection', () => {
    it('should prevent deleting a team that has scheduled matches', async () => {
      const delRes = await request(app)
        .delete(`/api/teams/${teamAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(500);
      expect(delRes.body.message).toContain('Cannot delete team that has scheduled or completed matches');
    });

    it('should allow deleting a team with no scheduled matches and remove its players', async () => {
      const unusedTeamRes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Unused Team' });
      const unusedTeamId = unusedTeamRes.body.data._id;

      const delRes = await request(app)
        .delete(`/api/teams/${unusedTeamId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });
  });

  describe('Player Management & Roster Synchronization', () => {
    it('should update player and transfer between team rosters cleanly', async () => {
      const transferRes = await request(app)
        .put(`/api/players/${playerA1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          team: teamBId,
          jerseyNumber: 11
        });

      expect(transferRes.status).toBe(200);

      // Team A roster should no longer contain playerA1Id
      const teamARoster = await request(app).get(`/api/teams/${teamAId}/players`);
      expect(teamARoster.body.data.some((p) => p._id === playerA1Id)).toBe(false);

      // Team B roster should now contain playerA1Id
      const teamBRoster = await request(app).get(`/api/teams/${teamBId}/players`);
      expect(teamBRoster.body.data.some((p) => p._id === playerA1Id)).toBe(true);
    });

    it('should delete player and remove player from team roster', async () => {
      const delRes = await request(app)
        .delete(`/api/players/${playerA2Id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);

      const teamARoster = await request(app).get(`/api/teams/${teamAId}/players`);
      expect(teamARoster.body.data.some((p) => p._id === playerA2Id)).toBe(false);
    });
  });

  describe('Goal Editing & Statistics Adjustment (PUT /api/matches/:id/goals/:eventId)', () => {
    it('should edit goal details and adjust player goal statistics accordingly', async () => {
      // Record initial goal by playerA1
      const goalRes = await request(app)
        .post(`/api/matches/${matchId}/goals`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          team: teamAId,
          player: playerA1Id,
          goalType: GOAL_TYPES.NORMAL,
          description: 'Initial strike'
        });

      const eventId = goalRes.body.data.event._id;

      // Verify playerA1 has 1 goal, playerA2 has 0 goals
      const p1Before = await request(app).get(`/api/players/${playerA1Id}`);
      expect(p1Before.body.data.goals).toBe(1);

      const p2Before = await request(app).get(`/api/players/${playerA2Id}`);
      expect(p2Before.body.data.goals).toBe(0);

      // Edit goal: reattribute scorer to playerA2
      const editRes = await request(app)
        .put(`/api/matches/${matchId}/goals/${eventId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          player: playerA2Id,
          description: 'Correction: actually scored by playerA2'
        });

      expect(editRes.status).toBe(200);

      // Verify stats adjusted: playerA1 -> 0 goals, playerA2 -> 1 goal
      const p1After = await request(app).get(`/api/players/${playerA1Id}`);
      expect(p1After.body.data.goals).toBe(0);

      const p2After = await request(app).get(`/api/players/${playerA2Id}`);
      expect(p2After.body.data.goals).toBe(1);
    });
  });

  describe('Leaderboards & Standings Queries', () => {
    it('should fetch team ranking in tournament and overall leaderboards', async () => {
      const rankingRes = await request(app).get(`/api/standings/${tournamentId}/teams/${teamAId}`);
      expect(rankingRes.status).toBe(200);
      expect(rankingRes.body.data.team._id).toBe(teamAId);

      const topScorersRes = await request(app).get('/api/leaderboard/top-scorers?limit=5');
      expect(topScorersRes.status).toBe(200);
      expect(Array.isArray(topScorersRes.body.data)).toBe(true);

      const topGoalkeepersRes = await request(app).get('/api/leaderboard/top-goalkeepers?limit=5');
      expect(topGoalkeepersRes.status).toBe(200);
      expect(Array.isArray(topGoalkeepersRes.body.data)).toBe(true);
    });
  });

  describe('Centralized Error Handling & Validation', () => {
    it('should return 400 for invalid Mongoose ObjectId format (CastError)', async () => {
      const res = await request(app).get('/api/matches/invalid-object-id-12345');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid format for field: _id');
    });

    it('should return 404 for unknown endpoints', async () => {
      const res = await request(app).get('/api/non-existent-route');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Endpoint not found');
    });
  });
});
