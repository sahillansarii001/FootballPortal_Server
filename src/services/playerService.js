const Player = require('../models/Player');
const Team = require('../models/Team');
const MatchEvent = require('../models/MatchEvent');

class PlayerService {
  static async createPlayer(data) {
    const team = await Team.findById(data.team);
    if (!team) {
      throw new Error('Team not found');
    }

    const existingJersey = await Player.findOne({
      team: data.team,
      jerseyNumber: data.jerseyNumber
    });

    if (existingJersey) {
      throw new Error(`Jersey number ${data.jerseyNumber} is already assigned in ${team.name}`);
    }

    const player = await Player.create(data);

    // Add player to team's players array
    await Team.findByIdAndUpdate(data.team, {
      $addToSet: { players: player._id }
    });

    return player;
  }

  static async updatePlayer(id, updateData) {
    const player = await Player.findById(id);
    if (!player) {
      throw new Error('Player not found');
    }

    const targetTeam = updateData.team || player.team;
    const targetJersey = updateData.jerseyNumber || player.jerseyNumber;

    if (
      (updateData.jerseyNumber && updateData.jerseyNumber !== player.jerseyNumber) ||
      (updateData.team && updateData.team.toString() !== player.team.toString())
    ) {
      const existing = await Player.findOne({
        _id: { $ne: id },
        team: targetTeam,
        jerseyNumber: targetJersey
      });

      if (existing) {
        throw new Error(`Jersey number ${targetJersey} is already assigned in that team`);
      }
    }

    // If team changed, update both teams' players arrays
    if (updateData.team && updateData.team.toString() !== player.team.toString()) {
      await Team.findByIdAndUpdate(player.team, { $pull: { players: player._id } });
      await Team.findByIdAndUpdate(updateData.team, { $addToSet: { players: player._id } });
    }

    Object.assign(player, updateData);
    await player.save();

    return Player.findById(id).populate('team', 'name logo');
  }

  static async deletePlayer(id) {
    const player = await Player.findById(id);
    if (!player) {
      throw new Error('Player not found');
    }

    await Team.findByIdAndUpdate(player.team, { $pull: { players: player._id } });
    await player.deleteOne();

    return { message: 'Player deleted successfully' };
  }

  static async getAllPlayers(query = {}) {
    const filter = {};
    if (query.team) {
      filter.team = query.team;
    }
    if (query.position) {
      filter.position = query.position;
    }
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }

    return Player.find(filter)
      .populate('team', 'name logo')
      .sort({ goals: -1, matchesPlayed: -1 });
  }

  static async getPlayerById(id) {
    const player = await Player.findById(id).populate('team');
    if (!player) {
      throw new Error('Player not found');
    }
    return player;
  }

  static async getPlayersByTeam(teamId) {
    return Player.find({ team: teamId }).sort({ jerseyNumber: 1 });
  }

  static async getPlayerStatistics(id) {
    const player = await Player.findById(id).populate('team', 'name logo');
    if (!player) {
      throw new Error('Player not found');
    }

    const events = await MatchEvent.find({
      player: id,
      isUndone: false
    }).populate('match', 'matchNumber matchDate');

    return {
      player,
      stats: {
        matchesPlayed: player.matchesPlayed,
        goals: player.goals,
        penaltiesScored: player.penaltiesScored,
        penaltiesSaved: player.penaltiesSaved,
        wins: player.wins,
        losses: player.losses,
        goalsPerMatch: player.matchesPlayed > 0 ? (player.goals / player.matchesPlayed).toFixed(2) : '0.00'
      },
      events
    };
  }

  static async getTopGoalScorers(limit = 10) {
    return Player.find({ goals: { $gt: 0 } })
      .populate('team', 'name logo')
      .sort({ goals: -1, matchesPlayed: 1 })
      .limit(limit);
  }

  static async getTopPenaltyScorers(limit = 10) {
    return Player.find({ penaltiesScored: { $gt: 0 } })
      .populate('team', 'name logo')
      .sort({ penaltiesScored: -1 })
      .limit(limit);
  }

  static async getTopGoalkeepers(limit = 10) {
    return Player.find({ penaltiesSaved: { $gt: 0 } })
      .populate('team', 'name logo')
      .sort({ penaltiesSaved: -1 })
      .limit(limit);
  }
}

module.exports = PlayerService;
