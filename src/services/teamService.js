const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');

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

    // Delete or unassign players
    await Player.deleteMany({ team: id });
    await team.deleteOne();

    return { message: 'Team and its players deleted successfully' };
  }

  static async getAllTeams(query = {}) {
    const filter = {};
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }

    return Team.find(filter)
      .populate('captain', 'name jerseyNumber position')
      .populate('players')
      .sort({ totalPoints: -1, goalDifference: -1, goalsScored: -1 });
  }

  static async getTeamById(id) {
    const team = await Team.findById(id)
      .populate('captain', 'name jerseyNumber position')
      .populate('players');

    if (!team) {
      throw new Error('Team not found');
    }

    return team;
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
