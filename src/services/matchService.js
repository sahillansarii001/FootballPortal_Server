const Match = require('../models/Match');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const MatchEvent = require('../models/MatchEvent');
const PenaltyShootout = require('../models/PenaltyShootout');
const { MATCH_STATUS, STAGE_DURATIONS, TIMER_STAGES, EVENT_TYPES } = require('../utils/constants');

class MatchService {
  /**
   * Schedule a new match with validation to prevent scheduling conflicts
   */
  static async scheduleMatch(data) {
    const { tournament: tournamentId, matchNumber, teamA: teamAId, teamB: teamBId, matchDate, matchTime, venue } = data;

    if (teamAId === teamBId) {
      throw new Error('Team A and Team B must be different teams');
    }

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const teamA = await Team.findById(teamAId);
    const teamB = await Team.findById(teamBId);
    if (!teamA || !teamB) {
      throw new Error('One or both teams not found');
    }

    // Check unique match number in tournament
    const existingNumber = await Match.findOne({ tournament: tournamentId, matchNumber });
    if (existingNumber) {
      throw new Error(`Match number ${matchNumber} is already scheduled in this tournament`);
    }

    // Schedule collision prevention: check if teamA or teamB is already scheduled at the same date & time
    const targetDate = new Date(matchDate);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const conflictingMatch = await Match.findOne({
      matchDate: { $gte: startOfDay, $lte: endOfDay },
      matchTime,
      status: { $ne: MATCH_STATUS.COMPLETED },
      $or: [
        { teamA: { $in: [teamAId, teamBId] } },
        { teamB: { $in: [teamAId, teamBId] } }
      ]
    }).populate('teamA', 'name').populate('teamB', 'name');

    if (conflictingMatch) {
      const conflictingTeam =
        conflictingMatch.teamA._id.toString() === teamAId || conflictingMatch.teamB._id.toString() === teamAId
          ? teamA.name
          : teamB.name;
      throw new Error(
        `Scheduling Conflict: ${conflictingTeam} is already scheduled to play in Match #${conflictingMatch.matchNumber} on ${targetDate.toISOString().split('T')[0]} at ${matchTime}`
      );
    }

    const halfDuration = tournament.rules?.halfDurationSeconds || STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];

    const match = await Match.create({
      tournament: tournamentId,
      matchNumber,
      teamA: teamAId,
      teamB: teamBId,
      matchDate: targetDate,
      matchTime,
      venue,
      status: MATCH_STATUS.UPCOMING,
      timer: {
        currentStage: TIMER_STAGES.FIRST_HALF,
        stageDuration: halfDuration,
        remainingTime: halfDuration,
        startedTimestamp: null,
        pausedTimestamp: null,
        totalPausedDuration: 0,
        isRunning: false,
        isPaused: false
      }
    });

    return Match.findById(match._id)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name');
  }

  static async updateMatch(id, updateData) {
    const match = await Match.findById(id);
    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status === MATCH_STATUS.COMPLETED && updateData.status !== MATCH_STATUS.COMPLETED) {
      throw new Error('Cannot modify a completed match');
    }

    // If date or time is modified, check collision
    const targetDate = updateData.matchDate ? new Date(updateData.matchDate) : match.matchDate;
    const targetTime = updateData.matchTime || match.matchTime;
    const teamAId = updateData.teamA || match.teamA.toString();
    const teamBId = updateData.teamB || match.teamB.toString();

    if (updateData.matchDate || updateData.matchTime || updateData.teamA || updateData.teamB) {
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const conflict = await Match.findOne({
        _id: { $ne: id },
        matchDate: { $gte: startOfDay, $lte: endOfDay },
        matchTime: targetTime,
        status: { $ne: MATCH_STATUS.COMPLETED },
        $or: [
          { teamA: { $in: [teamAId, teamBId] } },
          { teamB: { $in: [teamAId, teamBId] } }
        ]
      });

      if (conflict) {
        throw new Error(`Scheduling conflict detected at ${targetTime} on that date for one of the teams`);
      }
    }

    Object.assign(match, updateData);
    await match.save();

    return Match.findById(id)
      .populate('teamA', 'name logo')
      .populate('teamB', 'name logo')
      .populate('tournament', 'name');
  }

  static async deleteMatch(id) {
    const match = await Match.findById(id);
    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status === MATCH_STATUS.COMPLETED) {
      throw new Error('Cannot delete a completed match with recorded statistics');
    }

    await MatchEvent.deleteMany({ match: id });
    await PenaltyShootout.deleteMany({ match: id });
    await match.deleteOne();

    return { message: 'Match deleted successfully' };
  }

  static async getAllMatches(query = {}) {
    const filter = {};
    if (query.tournament) filter.tournament = query.tournament;
    if (query.status) filter.status = query.status;
    if (query.venue) filter.venue = { $regex: query.venue, $options: 'i' };

    return Match.find(filter)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name')
      .populate('winner', 'name logo')
      .sort({ matchDate: 1, matchTime: 1 });
  }

  static async getUpcomingMatches(tournamentId = null) {
    const filter = { status: MATCH_STATUS.UPCOMING };
    if (tournamentId) filter.tournament = tournamentId;

    return Match.find(filter)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name')
      .sort({ matchDate: 1, matchTime: 1 });
  }

  static async getLiveMatches(tournamentId = null) {
    const filter = { status: { $in: [MATCH_STATUS.LIVE, MATCH_STATUS.HALF_TIME, MATCH_STATUS.PENALTY_SHOOTOUT] } };
    if (tournamentId) filter.tournament = tournamentId;

    return Match.find(filter)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name')
      .sort({ matchDate: 1, matchTime: 1 });
  }

  static async getCompletedMatches(tournamentId = null) {
    const filter = { status: MATCH_STATUS.COMPLETED };
    if (tournamentId) filter.tournament = tournamentId;

    return Match.find(filter)
      .populate('teamA', 'name logo')
      .populate('teamB', 'name logo')
      .populate('winner', 'name logo')
      .populate('tournament', 'name')
      .sort({ matchDate: -1 });
  }

  static async getMatchById(id) {
    const match = await Match.findById(id)
      .populate('teamA', 'name logo coach captain players')
      .populate('teamB', 'name logo coach captain players')
      .populate('tournament', 'name rules')
      .populate('winner', 'name logo')
      .populate({
        path: 'events',
        match: { isUndone: false },
        populate: [
          { path: 'player', select: 'name jerseyNumber position' },
          { path: 'secondaryPlayer', select: 'name jerseyNumber position' },
          { path: 'team', select: 'name logo' }
        ]
      });

    if (!match) {
      throw new Error('Match not found');
    }

    return match;
  }

  static async getMatchesByTeam(teamId) {
    return Match.find({
      $or: [{ teamA: teamId }, { teamB: teamId }]
    })
      .populate('teamA', 'name logo')
      .populate('teamB', 'name logo')
      .populate('winner', 'name logo')
      .populate('tournament', 'name')
      .sort({ matchDate: -1 });
  }

  /**
   * Unified Authoritative Live Match State for frontend & socket sync
   */
  static async getLiveMatchState(id) {
    const TimerService = require('./timerService');
    const match = await Match.findById(id)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name rules')
      .populate('winner', 'name logo');

    if (!match) {
      throw new Error('Match not found');
    }

    const remainingTime = TimerService.calculateRemainingTime(match);

    const goals = await MatchEvent.find({
      match: id,
      type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
      isUndone: false
    })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .sort({ timestamp: 1 });

    const penalties = await PenaltyShootout.find({ match: id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('goalkeeper', 'name jerseyNumber position')
      .sort({ penaltyNumber: 1 });

    const events = await MatchEvent.find({ match: id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('secondaryPlayer', 'name jerseyNumber position')
      .sort({ timestamp: 1, createdAt: 1 });

    return {
      matchId: match._id,
      matchNumber: match.matchNumber,
      tournament: match.tournament,
      status: match.status,
      venue: match.venue,
      matchDate: match.matchDate,
      matchTime: match.matchTime,
      teamA: match.teamA,
      teamB: match.teamB,
      score: {
        teamA: match.teamAScore,
        teamB: match.teamBScore
      },
      timer: {
        currentStage: match.timer.currentStage,
        stageDuration: match.timer.stageDuration,
        remainingTime,
        isRunning: match.timer.isRunning,
        isPaused: match.timer.isPaused,
        startedTimestamp: match.timer.startedTimestamp,
        pausedTimestamp: match.timer.pausedTimestamp,
        totalPausedDuration: match.timer.totalPausedDuration,
        stageHistory: match.timer.stageHistory
      },
      currentStage: match.timer.currentStage,
      winner: match.winner,
      matchResult: match.matchResult,
      isFinalized: match.isFinalized,
      goals,
      penalties: {
        shootoutState: match.shootout,
        kicks: penalties
      },
      events
    };
  }

  /**
   * Complete chronologically arranged events
   */
  static async getMatchEvents(id) {
    return MatchEvent.find({ match: id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('secondaryPlayer', 'name jerseyNumber position')
      .populate('createdBy', 'username fullName')
      .sort({ timestamp: 1, createdAt: 1 });
  }

  /**
   * Chronological human-readable match timeline
   */
  static async getMatchTimeline(id) {
    const events = await MatchEvent.find({ match: id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('secondaryPlayer', 'name jerseyNumber position')
      .populate('createdBy', 'username fullName')
      .sort({ timestamp: 1, createdAt: 1 });

    return events.map((ev) => {
      let title = ev.type.replace(/_/g, ' ');
      if (ev.type === EVENT_TYPES.GOAL_SCORED || ev.type === 'GOAL') {
        title = `Goal scored by ${ev.player ? ev.player.name : 'Unknown'}`;
      } else if (ev.type === EVENT_TYPES.GOAL_REMOVED || ev.type === 'GOAL_UNDONE') {
        title = `Goal removed (VAR / correction)`;
      } else if (ev.type === EVENT_TYPES.PENALTY_SAVED) {
        title = `Penalty saved by ${ev.secondaryPlayer ? ev.secondaryPlayer.name : 'Goalkeeper'}`;
      } else if (ev.type === EVENT_TYPES.PENALTY_MISSED) {
        title = `Penalty missed by ${ev.player ? ev.player.name : 'Taker'}`;
      } else if (ev.type === EVENT_TYPES.PENALTY_TAKEN) {
        title = `Penalty scored by ${ev.player ? ev.player.name : 'Taker'}`;
      } else if (ev.type === EVENT_TYPES.FIRST_HALF_ENDED) {
        title = 'First Half Completed';
      } else if (ev.type === EVENT_TYPES.TRANSITION_STARTED) {
        title = '20-second Transition Started';
      } else if (ev.type === EVENT_TYPES.HALFTIME_STARTED) {
        title = 'Half-Time Started';
      } else if (ev.type === EVENT_TYPES.SECOND_HALF_STARTED) {
        title = 'Second Half Started';
      } else if (ev.type === EVENT_TYPES.MATCH_COMPLETED) {
        title = 'Match Completed';
      }

      return {
        id: ev._id,
        clockTime: ev.matchTime || '00:00',
        stage: ev.stage,
        type: ev.type,
        title,
        team: ev.team ? { id: ev.team._id, name: ev.team.name } : null,
        player: ev.player ? { id: ev.player._id, name: ev.player.name, jerseyNumber: ev.player.jerseyNumber } : null,
        secondaryPlayer: ev.secondaryPlayer ? { id: ev.secondaryPlayer._id, name: ev.secondaryPlayer.name } : null,
        detail: ev.detail,
        isUndone: ev.isUndone,
        timestamp: ev.timestamp || ev.createdAt
      };
    });
  }
}

module.exports = MatchService;
