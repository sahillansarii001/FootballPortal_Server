const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Team = require('../src/models/Team');
const Player = require('../src/models/Player');
const Tournament = require('../src/models/Tournament');
const Match = require('../src/models/Match');
const StandingsService = require('../src/services/standingsService');
const PenaltyService = require('../src/services/penaltyService');
const { ROLES, PENALTY_OUTCOMES, PLAYER_POSITIONS } = require('../src/utils/constants');

describe('Penalty Shootout, Leaderboard & Standings Suite', () => {
  let adminToken;
  let operatorToken;
  let tournamentId;
  let teamAId;
  let teamBId;
  let takerA1;
  let takerB1;
  let keeperA;
  let keeperB;
  let matchId;

  beforeEach(async () => {
    await Match.deleteMany({});
    await Tournament.deleteMany({});
    await Team.deleteMany({});
    await Player.deleteMany({});
    await User.deleteMany({});

    const adminRes = await request(app).post('/api/auth/register').send({
      username: 'admin_shootout',
      email: 'admin_shootout@test.com',
      password: 'Password123!',
      role: ROLES.SUPER_ADMIN
    });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app).post('/api/auth/register').send({
      username: 'op_shootout',
      email: 'op_shootout@test.com',
      password: 'Password123!',
      role: ROLES.MATCH_OPERATOR
    });
    operatorToken = opRes.body.data.token;

    const teamARes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Phoenix Knights' });
    const teamBRes = await request(app).post('/api/teams').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Thunderbolts FC' });
    teamAId = teamARes.body.data._id;
    teamBId = teamBRes.body.data._id;

    // Players
    const tA1 = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Taker A1',
      jerseyNumber: 10,
      team: teamAId,
      position: PLAYER_POSITIONS.FORWARD
    });
    takerA1 = tA1.body.data._id;

    const kA = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Keeper A',
      jerseyNumber: 1,
      team: teamAId,
      position: PLAYER_POSITIONS.GOALKEEPER
    });
    keeperA = kA.body.data._id;

    const tB1 = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Taker B1',
      jerseyNumber: 10,
      team: teamBId,
      position: PLAYER_POSITIONS.FORWARD
    });
    takerB1 = tB1.body.data._id;

    const kB = await request(app).post('/api/players').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Keeper B',
      jerseyNumber: 1,
      team: teamBId,
      position: PLAYER_POSITIONS.GOALKEEPER
    });
    keeperB = kB.body.data._id;

    // Tournament
    const tourneyRes = await request(app).post('/api/tournaments').set('Authorization', `Bearer ${adminToken}`).send({
      name: 'Shootout Championship',
      startDate: '2026-11-20',
      endDate: '2026-11-30',
      participatingTeams: [teamAId, teamBId],
      rules: {
        initialPenaltyKicks: 5,
        pointsForWin: 3,
        pointsForLoss: 0
      }
    });
    tournamentId = tourneyRes.body.data._id;

    // Scheduled match
    const matchRes = await request(app).post('/api/matches').set('Authorization', `Bearer ${adminToken}`).send({
      tournament: tournamentId,
      matchNumber: 1,
      teamA: teamAId,
      teamB: teamBId,
      matchDate: '2026-11-20',
      matchTime: '20:00',
      venue: 'Metropolitan Stadium'
    });
    matchId = matchRes.body.data._id;
  });

  describe('Penalty Decision Mathematics', () => {
    it('should correctly evaluate early mathematical elimination', () => {
      // 3 kicks taken each, Score: 3-0. Team B has only 2 kicks left, max possible is 2. Team A wins!
      const result = PenaltyService.evaluateShootoutWinner(3, 0, 3, 3, 5);
      expect(result.isDecided).toBe(true);
      expect(result.winner).toBe('teamA');
    });

    it('should trigger Sudden Death when scores are tied after 5 kicks each', () => {
      const result = PenaltyService.evaluateShootoutWinner(4, 4, 5, 5, 5);
      expect(result.isDecided).toBe(false);
      expect(result.isSuddenDeath).toBe(true);
    });

    it('should decide Sudden Death winner when both have taken equal kicks and one leads', () => {
      // Round 6: 6 kicks taken each, Score: 5-4. Team A wins!
      const result = PenaltyService.evaluateShootoutWinner(5, 4, 6, 6, 5);
      expect(result.isDecided).toBe(true);
      expect(result.winner).toBe('teamA');
      expect(result.isSuddenDeath).toBe(true);
    });
  });

  describe('Penalty Kick Recording & Match Finalization', () => {
    it('should record penalty kick and update goalkeeper saved stats when Saved', async () => {
      const res = await request(app)
        .post(`/api/matches/${matchId}/penalties`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          team: teamAId,
          player: takerA1,
          goalkeeper: keeperB,
          outcome: PENALTY_OUTCOMES.SAVED
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.penalty.outcome).toBe('Saved');

      // Goalkeeper saved stat incremented
      const keeperRes = await request(app).get(`/api/players/${keeperB}`);
      expect(keeperRes.body.data.penaltiesSaved).toBe(1);
    });

    it('should declare shootout winner, finalize match, and award 3 points to winner', async () => {
      // Team A scores
      await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamAId,
        player: takerA1,
        goalkeeper: keeperB,
        outcome: PENALTY_OUTCOMES.GOAL
      });
      // Team B misses
      await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamBId,
        player: takerB1,
        goalkeeper: keeperA,
        outcome: PENALTY_OUTCOMES.MISSED
      });

      // Team A scores
      await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamAId,
        player: takerA1,
        goalkeeper: keeperB,
        outcome: PENALTY_OUTCOMES.GOAL
      });
      // Team B misses
      await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamBId,
        player: takerB1,
        goalkeeper: keeperA,
        outcome: PENALTY_OUTCOMES.MISSED
      });

      // Team A scores (Score: 3 - 0 after Team A kick 3)
      await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamAId,
        player: takerA1,
        goalkeeper: keeperB,
        outcome: PENALTY_OUTCOMES.GOAL
      });
      // Team B misses (Score: 3 - 0 after Team B kick 3 -> Mathematical Win!)
      const decisiveKick = await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
        team: teamBId,
        player: takerB1,
        goalkeeper: keeperA,
        outcome: PENALTY_OUTCOMES.MISSED
      });

      expect(decisiveKick.body.data.evaluation.isDecided).toBe(true);

      // Verify match is completed
      const matchRes = await request(app).get(`/api/matches/${matchId}`);
      expect(matchRes.body.data.status).toBe('Completed');
      expect(matchRes.body.data.winner._id).toBe(teamAId);
      expect(matchRes.body.data.isFinalized).toBe(true);

      // Verify Tournament Standings: Team A gets 3 points, Team B gets 0 points
      const standingsRes = await request(app).get(`/api/standings/${tournamentId}`);
      expect(standingsRes.status).toBe(200);
      expect(standingsRes.body.data.length).toBe(2);

      const leader = standingsRes.body.data[0];
      expect(leader.team._id).toBe(teamAId);
      expect(leader.points).toBe(3);
      expect(leader.won).toBe(1);
      expect(leader.matchesPlayed).toBe(1);

      const runnerUp = standingsRes.body.data[1];
      expect(runnerUp.team._id).toBe(teamBId);
      expect(runnerUp.points).toBe(0);
      expect(runnerUp.lost).toBe(1);
    });

    it('should support Sudden Death Coin Toss & Decisive Kick when tied after 3 kicks', async () => {
      // Both teams score 3-3 in the regulation 3-kick shootout
      for (let i = 0; i < 3; i++) {
        await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
          team: teamAId,
          player: takerA1,
          goalkeeper: keeperB,
          outcome: PENALTY_OUTCOMES.GOAL
        });
        await request(app).post(`/api/matches/${matchId}/penalties`).set('Authorization', `Bearer ${operatorToken}`).send({
          team: teamBId,
          player: takerB1,
          goalkeeper: keeperA,
          outcome: PENALTY_OUTCOMES.GOAL
        });
      }

      // 1. Conduct Coin Toss: Team A wins toss and chooses 'ATTACK' (SHOOT)
      const tossRes = await request(app).post(`/api/matches/${matchId}/toss`).set('Authorization', `Bearer ${operatorToken}`).send({
        tossWinner: teamAId,
        choice: 'ATTACK'
      });
      expect(tossRes.status).toBe(200);
      expect(tossRes.body.data.toss.isTossConducted).toBe(true);
      expect(tossRes.body.data.toss.choice).toBe('ATTACK');
      expect(tossRes.body.data.toss.kickingTeam.toString()).toBe(teamAId);

      // 2. Execute Decisive Kick: Team A taker scores -> Team A wins immediately!
      const kickRes = await request(app).post(`/api/matches/${matchId}/toss/decisive-kick`).set('Authorization', `Bearer ${operatorToken}`).send({
        player: takerA1,
        goalkeeper: keeperB,
        outcome: PENALTY_OUTCOMES.GOAL
      });
      expect(kickRes.status).toBe(200);
      expect(kickRes.body.data.winner.toString()).toBe(teamAId);
      expect(kickRes.body.data.match.status).toBe('Completed');

      // 3. Strict Verification: Player A1 goals count should still be 0 (never incremented by shootout kicks)
      const playerRes = await request(app).get(`/api/players/${takerA1}`);
      expect(playerRes.body.data.goals).toBe(0);
      expect(playerRes.body.data.penaltiesScored).toBeGreaterThan(0);
    });
  });

  describe('Match Summary Retrieval', () => {
    it('should generate complete match summary with event history', async () => {
      const summaryRes = await request(app).get(`/api/matches/${matchId}/summary`);
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.success).toBe(true);
      expect(summaryRes.body.data.matchId).toBe(matchId);
      expect(summaryRes.body.data.matchDuration).toBeDefined();
      expect(summaryRes.body.data.teamA).toBeDefined();
      expect(summaryRes.body.data.teamB).toBeDefined();
    });
  });
});
