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

    const participatingTeamIds = tournament.participatingTeams.map((t) => t.toString());

    // Fetch all finalized matches for this tournament
    const completedMatches = await Match.find({
      tournament: tournamentId,
      status: 'Completed',
      isFinalized: true
    });

    // Initialize stats map for every participating team
    const teamStats = {};
    for (const teamId of participatingTeamIds) {
      teamStats[teamId] = {
        tournament: tournamentId,
        team: teamId,
        matchesPlayed: 0,
        won: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      };
    }

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
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0
        };
      }

      teamStats[teamAId].matchesPlayed += 1;
      teamStats[teamBId].matchesPlayed += 1;

      teamStats[teamAId].goalsFor += match.teamAScore;
      teamStats[teamAId].goalsAgainst += match.teamBScore;

      teamStats[teamBId].goalsFor += match.teamBScore;
      teamStats[teamBId].goalsAgainst += match.teamAScore;

      if (match.winner) {
        const winnerId = match.winner.toString();
        const winPoints = tournament.rules?.pointsForWin !== undefined ? tournament.rules.pointsForWin : POINTS.WIN;
        if (winnerId === teamAId) {
          teamStats[teamAId].won += 1;
          teamStats[teamAId].points += winPoints;
          teamStats[teamBId].lost += 1;
        } else if (winnerId === teamBId) {
          teamStats[teamBId].won += 1;
          teamStats[teamBId].points += winPoints;
          teamStats[teamAId].lost += 1;
        }
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

    // Sort order: 1. Total Points (desc), 2. Goal Difference (desc), 3. Goals Scored (desc), 4. Team Name (asc)
    standingsArray.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      const nameA = teamNameMap[a.team.toString()] || '';
      const nameB = teamNameMap[b.team.toString()] || '';
      return nameA.localeCompare(nameB);
    });

    // Assign positions and upsert into TournamentStanding collection
    const updatedStandings = [];
    for (let i = 0; i < standingsArray.length; i++) {
      const standing = standingsArray[i];
      standing.position = i + 1;
      standing.lastUpdated = new Date();
      standing.matchesWon = standing.won;
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
      obj.matchesWon = obj.matchesWon !== undefined ? obj.matchesWon : obj.won;
      obj.matchesLost = obj.matchesLost !== undefined ? obj.matchesLost : obj.lost;
      obj.goalsScored = obj.goalsScored !== undefined ? obj.goalsScored : obj.goalsFor;
      obj.goalsConceded = obj.goalsConceded !== undefined ? obj.goalsConceded : obj.goalsAgainst;
      obj.totalPoints = obj.totalPoints !== undefined ? obj.totalPoints : obj.points;
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
