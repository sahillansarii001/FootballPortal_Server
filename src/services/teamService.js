const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const TournamentStanding = require('../models/TournamentStanding');

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

class TeamService {
  static async createTeam(data) {
    const trimmedName = (data.name || '').trim();
    if (!trimmedName) {
      const err = new Error('Team name is required');
      err.statusCode = 400;
      throw err;
    }

    const existing = await Team.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
    });
    if (existing) {
      const err = new Error(`Team with name "${trimmedName}" already exists`);
      err.statusCode = 400;
      throw err;
    }

    const payload = { ...data, name: trimmedName };
    if (payload.captain && typeof payload.captain === 'string' && !/^[0-9a-fA-F]{24}$/.test(payload.captain)) {
      payload.captainName = payload.captain.trim();
      delete payload.captain;
    }

    const team = await Team.create(payload);

    // Synchronize team with active tournament and standings
    try {
      const activeTournament = (await Tournament.findOne({ status: 'Ongoing' })) || (await Tournament.findOne().sort({ createdAt: -1 }));
      if (activeTournament) {
        if (!activeTournament.participatingTeams.some((t) => t.toString() === team._id.toString())) {
          activeTournament.participatingTeams.push(team._id);
          await activeTournament.save();
        }
        await TournamentStanding.findOneAndUpdate(
          { tournament: activeTournament._id, team: team._id },
          {
            $setOnInsert: {
              tournament: activeTournament._id,
              team: team._id,
              matchesPlayed: 0,
              matchesWon: 0,
              matchesLost: 0,
              goalsScored: 0,
              goalsConceded: 0,
              goalDifference: 0,
              totalPoints: 0,
              won: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              points: 0,
              position: 99
            }
          },
          { upsert: true, new: true }
        );
      }
    } catch (e) {
      // Non-fatal tournament sync
    }

    return team;
  }

  static async updateTeam(id, updateData) {
    const team = await Team.findById(id);
    if (!team) {
      const err = new Error('Team not found');
      err.statusCode = 404;
      throw err;
    }

    if (updateData.name && updateData.name.trim().toLowerCase() !== team.name.toLowerCase()) {
      const trimmedName = updateData.name.trim();
      const existing = await Team.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') }
      });
      if (existing) {
        const err = new Error(`Team with name "${trimmedName}" already exists`);
        err.statusCode = 400;
        throw err;
      }
      updateData.name = trimmedName;
    }

    const payload = { ...updateData };
    if (payload.captain && typeof payload.captain === 'string' && !/^[0-9a-fA-F]{24}$/.test(payload.captain)) {
      payload.captainName = payload.captain.trim();
      delete payload.captain;
    }

    Object.assign(team, payload);
    await team.save();

    return Team.findById(id).populate('captain', 'name jerseyNumber position').populate('players');
  }

  static async deleteTeam(id) {
    const team = await Team.findById(id);
    if (!team) {
      throw new Error('Team not found');
    }

    // Check if team is involved in any matches
    const matchCount = await Match.countDocuments({
      $or: [{ teamA: id }, { teamB: id }]
    });

    if (matchCount > 0) {
      throw new Error('Cannot delete team that has scheduled or completed matches');
    }

    // Delete or unassign players and clean tournament references
    await Player.deleteMany({ team: id });
    await Tournament.updateMany({}, { $pull: { participatingTeams: id } });
    await TournamentStanding.deleteMany({ team: id });
    await team.deleteOne();

    return { message: 'Team and its players deleted successfully' };
  }

  static async getAllTeams(query = {}) {
    const filter = {};
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }

    const teams = await Team.find(filter)
      .populate('captain', 'name jerseyNumber position')
      .populate('players')
      .sort({ totalPoints: -1, goalDifference: -1, goalsScored: -1 })
      .lean();

    const teamIds = teams.map((t) => t._id);

    // Fetch all active players for these teams to guarantee 100% sync
    const allPlayers = await Player.find({ team: { $in: teamIds } })
      .sort({ jerseyNumber: 1 })
      .lean();

    const playersByTeam = {};
    allPlayers.forEach((p) => {
      const tid = p.team ? p.team.toString() : '';
      if (!playersByTeam[tid]) playersByTeam[tid] = [];
      playersByTeam[tid].push(p);
    });

    // Also sync Team.players array in database if any player is not yet in team.players
    for (const team of teams) {
      const tid = team._id.toString();
      const currentPlayers = playersByTeam[tid] || [];
      const currentIds = currentPlayers.map((p) => p._id.toString());
      const existingIds = (team.players || []).map((p) => (p._id ? p._id.toString() : p.toString()));
      const needsSync = currentIds.some((id) => !existingIds.includes(id));
      if (needsSync) {
        Team.findByIdAndUpdate(team._id, { $addToSet: { players: { $each: currentPlayers.map((p) => p._id) } } }).catch(() => {});
      }
    }

    // Fetch completed matches for real form calculation
    const completedMatches = await Match.find({
      $or: [{ teamA: { $in: teamIds } }, { teamB: { $in: teamIds } }],
      status: 'Completed',
      isFinalized: true
    })
      .sort({ matchDate: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    return teams.map((team, idx) => {
      const tid = team._id.toString();
      const squadPlayers = playersByTeam[tid] && playersByTeam[tid].length > 0
        ? playersByTeam[tid]
        : (Array.isArray(team.players) ? team.players : []);

      const teamMatches = completedMatches
        .filter((m) => (m.teamA && m.teamA.toString() === tid) || (m.teamB && m.teamB.toString() === tid))
        .slice(0, 3);

      const form = teamMatches.map((m) => {
        const isTeamA = m.teamA && m.teamA.toString() === tid;
        const myScore = isTeamA ? (m.score?.teamA ?? m.teamAScore ?? 0) : (m.score?.teamB ?? m.teamBScore ?? 0);
        const oppScore = isTeamA ? (m.score?.teamB ?? m.teamBScore ?? 0) : (m.score?.teamA ?? m.teamAScore ?? 0);
        if (m.winner) {
          return m.winner.toString() === tid ? 'W' : 'L';
        }
        if (myScore > oppScore) return 'W';
        return 'L';
      });

      const position = idx + 1;
      const seed = `#${position} SEED`;

      return {
        ...team,
        players: squadPlayers,
        form,
        position,
        seed,
        stats: {
          matchesPlayed: team.matchesPlayed || 0,
          matchesWon: team.matchesWon || 0,
          matchesLost: team.matchesLost || 0,
          goalsScored: team.goalsScored || 0,
          goalsConceded: team.goalsConceded || 0,
          goalDifference: team.goalDifference || 0,
          totalPoints: team.totalPoints || 0
        }
      };
    });
  }

  static async getTeamById(id) {
    const team = await Team.findById(id)
      .populate('captain', 'name jerseyNumber position')
      .populate('players')
      .lean();

    if (!team) {
      throw new Error('Team not found');
    }

    const squadPlayers = await Player.find({ team: id }).sort({ jerseyNumber: 1 }).lean();
    const completedMatches = await Match.find({
      $or: [{ teamA: id }, { teamB: id }],
      status: 'Completed',
      isFinalized: true
    })
      .sort({ matchDate: -1, updatedAt: -1, createdAt: -1 })
      .limit(3)
      .lean();

    const tid = team._id.toString();
    const form = completedMatches.map((m) => {
      const isTeamA = m.teamA && m.teamA.toString() === tid;
      const myScore = isTeamA ? (m.score?.teamA ?? m.teamAScore ?? 0) : (m.score?.teamB ?? m.teamBScore ?? 0);
      const oppScore = isTeamA ? (m.score?.teamB ?? m.teamBScore ?? 0) : (m.score?.teamA ?? m.teamAScore ?? 0);
      if (m.winner) {
        return m.winner.toString() === tid ? 'W' : 'L';
      }
      if (myScore > oppScore) return 'W';
      return 'L';
    });

    return {
      ...team,
      players: squadPlayers.length > 0 ? squadPlayers : (team.players || []),
      form,
      stats: {
        matchesPlayed: team.matchesPlayed || 0,
        matchesWon: team.matchesWon || 0,
        matchesLost: team.matchesLost || 0,
        goalsScored: team.goalsScored || 0,
        goalsConceded: team.goalsConceded || 0,
        goalDifference: team.goalDifference || 0,
        totalPoints: team.totalPoints || 0
      }
    };
  }

  static async getTeamPlayers(teamId) {
    const team = await Team.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    return Player.find({ team: teamId }).sort({ jerseyNumber: 1 });
  }

  static async getTeamStatistics(teamId) {
    const team = await Team.findById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const matches = await Match.find({
      $or: [{ teamA: teamId }, { teamB: teamId }],
      status: 'Completed'
    }).populate('teamA', 'name').populate('teamB', 'name');

    const topScorers = await Player.find({ team: teamId })
      .sort({ goals: -1 })
      .limit(5);

    return {
      team: {
        _id: team._id,
        name: team.name,
        logo: team.logo,
        coach: team.coach
      },
      stats: {
        matchesPlayed: team.matchesPlayed,
        matchesWon: team.matchesWon,
        matchesLost: team.matchesLost,
        goalsScored: team.goalsScored,
        goalsConceded: team.goalsConceded,
        goalDifference: team.goalDifference,
        totalPoints: team.totalPoints,
        winRate: team.matchesPlayed > 0 ? ((team.matchesWon / team.matchesPlayed) * 100).toFixed(1) + '%' : '0%'
      },
      recentMatches: matches.slice(-5),
      topScorers
    };
  }
}

module.exports = TeamService;
