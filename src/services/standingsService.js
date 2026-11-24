const TournamentStanding = require('../models/TournamentStanding');
const Match = require('../models/Match');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const { socketEmitter } = require('../sockets/socketManager');
const { POINTS } = require('../utils/constants');

class StandingsService {
  /**
   * Recalculates all standings for a tournament from completed & finalized matches.
   * This is idempotent, preventing double counting.
   */
  static async recalculateTournamentStandings(tournamentId) {
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const participatingTeamIds = (tournament.participatingTeams || []).map((t) => t.toString());

    // Fetch all completed matches for this tournament
    const completedMatches = await Match.find({
      tournament: tournamentId,
      status: 'Completed'
    });

    // Initialize stats map for every participating team
    const teamStats = {};
    for (const teamId of participatingTeamIds) {
      teamStats[teamId] = {
        tournament: tournamentId,
        team: teamId,
        matchesPlayed: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      };
    }

    // Matrix to track head-to-head records between tied teams
    const h2h = {};
    const initH2H = (tA, tB) => {
      if (!h2h[tA]) h2h[tA] = {};
      if (!h2h[tA][tB]) h2h[tA][tB] = { points: 0, goalsFor: 0, goalsAgainst: 0 };
    };

    const winPoints = tournament.rules?.pointsForWin !== undefined ? tournament.rules.pointsForWin : POINTS.WIN; // 2
    const drawPoints = tournament.rules?.pointsForDraw !== undefined ? tournament.rules.pointsForDraw : (POINTS.DRAW !== undefined ? POINTS.DRAW : 0); // 0
    const lossPoints = tournament.rules?.pointsForLoss !== undefined ? tournament.rules.pointsForLoss : POINTS.LOSS; // 0

    // Accumulate stats from each completed match
    for (const match of completedMatches) {
      const teamAId = match.teamA.toString();
      const teamBId = match.teamB.toString();

      if (!teamStats[teamAId]) {
        teamStats[teamAId] = {
          tournament: tournamentId,
          team: teamAId,
          matchesPlayed: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        };
      }

      if (!teamStats[teamBId]) {
        teamStats[teamBId] = {
          tournament: tournamentId,
          team: teamBId,
          matchesPlayed: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        };
      }

      initH2H(teamAId, teamBId);
      initH2H(teamBId, teamAId);

      const scoreA = Number(match.teamAScore) || 0;
      const scoreB = Number(match.teamBScore) || 0;

      teamStats[teamAId].matchesPlayed += 1;
      teamStats[teamBId].matchesPlayed += 1;

      teamStats[teamAId].goalsFor += scoreA;
      teamStats[teamAId].goalsAgainst += scoreB;

      teamStats[teamBId].goalsFor += scoreB;
      teamStats[teamBId].goalsAgainst += scoreA;

      h2h[teamAId][teamBId].goalsFor += scoreA;
      h2h[teamAId][teamBId].goalsAgainst += scoreB;
      h2h[teamBId][teamAId].goalsFor += scoreB;
      h2h[teamBId][teamAId].goalsAgainst += scoreA;

      // Determine match winner / draw
      let matchWinner = null;
      if (match.winner) {
        matchWinner = match.winner.toString();
      } else if (scoreA > scoreB) {
        matchWinner = teamAId;
      } else if (scoreB > scoreA) {
        matchWinner = teamBId;
      }

      if (matchWinner === teamAId) {
        teamStats[teamAId].won += 1;
        teamStats[teamAId].points += winPoints;
        teamStats[teamBId].lost += 1;
        teamStats[teamBId].points += lossPoints;

        h2h[teamAId][teamBId].points += winPoints;
      } else if (matchWinner === teamBId) {
        teamStats[teamBId].won += 1;
        teamStats[teamBId].points += winPoints;
        teamStats[teamAId].lost += 1;
        teamStats[teamAId].points += lossPoints;

        h2h[teamBId][teamAId].points += winPoints;
      } else {
        // Draw (scoreA === scoreB and no shootout winner)
        teamStats[teamAId].drawn += 1;
        teamStats[teamAId].points += drawPoints;
        teamStats[teamBId].drawn += 1;
        teamStats[teamBId].points += drawPoints;

        h2h[teamAId][teamBId].points += drawPoints;
        h2h[teamBId][teamAId].points += drawPoints;
      }
    }

    // Calculate goal differences and prepare array for sorting
    const standingsArray = Object.values(teamStats).map((item) => {
      item.goalDifference = item.goalsFor - item.goalsAgainst;
      return item;
    });

    // Populate team names for stable sorting tie-breaker
    const teams = await Team.find({ _id: { $in: Object.keys(teamStats) } }).select('name logo');
    const teamNameMap = {};
    teams.forEach((t) => {
      teamNameMap[t._id.toString()] = t.name;
    });

    // Automatic Ranking System according to exact specifications:
    // 1. Highest Points (PTS)
    // 2. Highest Goal Difference (GD)
    // 3. Highest Goals For (GF)
    // 4. Head-to-Head result between tied teams
    // 5. Stable alphabetical tie-breaker
    standingsArray.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

      // Head-to-Head points between team A and team B
      const idA = a.team.toString();
      const idB = b.team.toString();
      const h2hPtsA = h2h[idA]?.[idB]?.points || 0;
      const h2hPtsB = h2h[idB]?.[idA]?.points || 0;
      if (h2hPtsB !== h2hPtsA) return h2hPtsB - h2hPtsA;

      // Head-to-Head goal difference between team A and team B
      const h2hGDA = (h2h[idA]?.[idB]?.goalsFor || 0) - (h2h[idA]?.[idB]?.goalsAgainst || 0);
      const h2hGDB = (h2h[idB]?.[idA]?.goalsFor || 0) - (h2h[idB]?.[idA]?.goalsAgainst || 0);
      if (h2hGDB !== h2hGDA) return h2hGDB - h2hGDA;

      // Stable tie-breaker: Team Name (asc)
      const nameA = teamNameMap[idA] || '';
      const nameB = teamNameMap[idB] || '';
      return nameA.localeCompare(nameB);
    });

    // Assign positions and upsert into TournamentStanding collection
    const updatedStandings = [];
    for (let i = 0; i < standingsArray.length; i++) {
      const standing = standingsArray[i];
      standing.position = i + 1;
      standing.lastUpdated = new Date();
      standing.matchesWon = standing.won;
      standing.matchesDrawn = standing.drawn;
      standing.matchesLost = standing.lost;
      standing.goalsScored = standing.goalsFor;
      standing.goalsConceded = standing.goalsAgainst;
      standing.totalPoints = standing.points;

      const upserted = await TournamentStanding.findOneAndUpdate(
        { tournament: tournamentId, team: standing.team },
        { $set: standing },
        { upsert: true, new: true }
      ).populate('team', 'name logo');

      updatedStandings.push(upserted);

      // Also sync team aggregate fields in Team collection
      await Team.findByIdAndUpdate(standing.team, {
        $set: {
          matchesPlayed: standing.matchesPlayed,
          matchesWon: standing.won,
          matchesDrawn: standing.drawn,
          matchesLost: standing.lost,
          goalsScored: standing.goalsFor,
          goalsConceded: standing.goalsAgainst,
          goalDifference: standing.goalDifference,
          totalPoints: standing.points
        }
      });
    }

    // Broadcast standings update
    socketEmitter.broadcastStandingsUpdate(tournamentId, updatedStandings);

    return updatedStandings;
  }

  static async getPointTable(tournamentId) {
    let resolvedTournamentId = tournamentId;
    if (!resolvedTournamentId || !/^[0-9a-fA-F]{24}$/.test(String(resolvedTournamentId))) {
      const active = (await Tournament.findOne({ status: 'Ongoing' })) || (await Tournament.findOne().sort({ createdAt: -1 }));
      if (!active) return [];
      resolvedTournamentId = active._id;
    }

    let standings = await TournamentStanding.find({ tournament: resolvedTournamentId })
      .populate('team', 'name logo coach')
      .sort({ position: 1 });

    // Clean out any orphaned records where team no longer exists
    standings = (standings || []).filter((s) => s && s.team != null);

    if (!standings || standings.length === 0) {
      try {
        standings = await this.recalculateTournamentStandings(resolvedTournamentId);
        standings = (standings || []).filter((s) => s && s.team != null);
      } catch (err) {
        // Fallback gracefully
      }
    }

    return standings.map((s) => {
      const obj = typeof s.toObject === 'function' ? s.toObject() : { ...s };
      obj.matchesWon = obj.matchesWon !== undefined ? obj.matchesWon : (obj.won || 0);
      obj.matchesDrawn = obj.matchesDrawn !== undefined ? obj.matchesDrawn : (obj.drawn || 0);
      obj.matchesLost = obj.matchesLost !== undefined ? obj.matchesLost : (obj.lost || 0);
      obj.goalsScored = obj.goalsScored !== undefined ? obj.goalsScored : (obj.goalsFor || 0);
      obj.goalsConceded = obj.goalsConceded !== undefined ? obj.goalsConceded : (obj.goalsAgainst || 0);
      obj.totalPoints = obj.totalPoints !== undefined ? obj.totalPoints : (obj.points || 0);
      return obj;
    });
  }

  static async getTeamRanking(tournamentId, teamId) {
    const standing = await TournamentStanding.findOne({
      tournament: tournamentId,
      team: teamId
    }).populate('team', 'name logo');

    if (!standing) {
      throw new Error('Ranking not found for the specified team in this tournament');
    }

    return standing;
  }

  static async getOverallLeaderboard() {
    return Team.find()
      .populate('captain', 'name jerseyNumber')
      .sort({ totalPoints: -1, goalDifference: -1, goalsScored: -1 });
  }
}

module.exports = StandingsService;
