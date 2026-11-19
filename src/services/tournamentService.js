const Tournament = require('../models/Tournament');
const TournamentStanding = require('../models/TournamentStanding');
const Match = require('../models/Match');

class TournamentService {
  static async createTournament(data, createdById) {
    const tournament = await Tournament.create({
      ...data,
      createdBy: createdById
    });

    // If teams are specified, initialize their standings in TournamentStanding
    if (data.participatingTeams && data.participatingTeams.length > 0) {
      const standingsToCreate = data.participatingTeams.map((teamId, index) => ({
        tournament: tournament._id,
        team: teamId,
        position: index + 1,
        matchesPlayed: 0,
        won: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0
      }));

      await TournamentStanding.insertMany(standingsToCreate);
    }

    return Tournament.findById(tournament._id)
      .populate('participatingTeams', 'name logo')
      .populate('createdBy', 'username email fullName');
  }

  static async updateTournament(id, updateData) {
    const tournament = await Tournament.findById(id);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    // Check if new teams are added to participating teams
    if (updateData.participatingTeams) {
      for (const teamId of updateData.participatingTeams) {
        const existingStanding = await TournamentStanding.findOne({
          tournament: id,
          team: teamId
        });
        if (!existingStanding) {
          await TournamentStanding.create({
            tournament: id,
            team: teamId,
            position: 0,
            matchesPlayed: 0,
            won: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0
          });
        }
      }
    }

    Object.assign(tournament, updateData);
    await tournament.save();

    return Tournament.findById(id)
      .populate('participatingTeams', 'name logo')
      .populate('createdBy', 'username email fullName');
  }

  static async deleteTournament(id) {
    const tournament = await Tournament.findById(id);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    // Delete associated standings & matches
    await TournamentStanding.deleteMany({ tournament: id });
    await Match.deleteMany({ tournament: id });
    await tournament.deleteOne();

    return { message: 'Tournament and associated records deleted successfully' };
  }

  static async getAllTournaments(query = {}) {
    const filter = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search) {
      filter.name = { $regex: query.search, $options: 'i' };
    }

    return Tournament.find(filter)
      .populate('participatingTeams', 'name logo matchesPlayed totalPoints')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });
  }

  static async getTournamentById(id) {
    const tournament = await Tournament.findById(id)
      .populate('participatingTeams')
      .populate('createdBy', 'username email fullName');

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    return tournament;
  }
}

module.exports = TournamentService;
