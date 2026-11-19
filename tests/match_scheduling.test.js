const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Tournament = require('../src/models/Tournament');
const Match = require('../src/models/Match');
const { ROLES } = require('../src/utils/constants');

describe('Match Scheduling Suite', () => {
  let adminToken;
  let tournamentId;
  let teamAId;
  let teamBId;
  let teamCId;

  beforeEach(async () => {
    await Match.deleteMany({});
    await Tournament.deleteMany({});
    await Team.deleteMany({});
    await User.deleteMany({});

    const adminRes = await request(app).post('/api/auth/register').send({
      username: 'admin_sched',
      email: 'admin_sched@test.com',
      password: 'Password123!',
      role: ROLES.SUPER_ADMIN
    });
    adminToken = adminRes.body.data.token;

    const teamARes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Arsenal Gunners' });
    const teamBRes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Chelsea Blues' });
    const teamCRes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Liverpool Reds' });

    teamAId = teamARes.body.data._id;
    teamBId = teamBRes.body.data._id;
    teamCId = teamCRes.body.data._id;

    const tourneyRes = await request(app).post('/api/tournaments').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'London Derby League',
      startDate: '2026-11-20',
      endDate: '2026-11-25',
      participatingTeams: [teamAId, teamBId, teamCId]
    });
    tournamentId = tourneyRes.body.data._id;
  });

  it('should schedule a match successfully', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tournament: tournamentId,
        matchNumber: 1,
        teamA: teamAId,
        teamB: teamBId,
        matchDate: '2026-11-21',
        matchTime: '15:00',
        venue: 'Emirates Stadium'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.matchNumber).toBe(1);
    expect(res.body.data.status).toBe('Upcoming');
    expect(res.body.data.timer.remainingTime).toBe(240);
  });

  it('should prevent scheduling collision: same team cannot play two matches at the same time', async () => {
    // Schedule match 1: Team A vs Team B at 15:00 on 2026-11-21
    await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tournament: tournamentId,
        matchNumber: 1,
        teamA: teamAId,
        teamB: teamBId,
        matchDate: '2026-11-21',
        matchTime: '15:00',
        venue: 'Emirates Stadium'
      });

    // Try to schedule match 2: Team A vs Team C at the same date & time (15:00 on 2026-11-21)
    const collisionRes = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tournament: tournamentId,
        matchNumber: 2,
        teamA: teamAId,
        teamB: teamCId,
        matchDate: '2026-11-21',
        matchTime: '15:00',
        venue: 'Anfield'
      });

    expect(collisionRes.status).toBe(500);
    expect(collisionRes.body.message).toContain('Scheduling Conflict');
    expect(collisionRes.body.message).toContain('Arsenal Gunners');
  });

  it('should reject scheduling match with same team as Team A and Team B', async () => {
    const res = await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tournament: tournamentId,
        matchNumber: 3,
        teamA: teamAId,
        teamB: teamAId,
        matchDate: '2026-11-22',
        matchTime: '18:00',
        venue: 'Emirates Stadium'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should retrieve matches categorized by upcoming, live, completed and team', async () => {
    await request(app)
      .post('/api/matches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tournament: tournamentId,
        matchNumber: 1,
        teamA: teamAId,
        teamB: teamBId,
        matchDate: '2026-11-21',
        matchTime: '15:00',
        venue: 'Emirates Stadium'
      });

    const upcomingRes = await request(app).get('/api/matches/upcoming');
    expect(upcomingRes.status).toBe(200);
    expect(upcomingRes.body.data.length).toBe(1);

    const teamMatchesRes = await request(app).get(`/api/matches/team/${teamAId}`);
    expect(teamMatchesRes.status).toBe(200);
    expect(teamMatchesRes.body.data.length).toBe(1);
  });
});
