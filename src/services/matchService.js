const Match = require('../models/Match');
const Team = require('../models/Team');
const Tournament = require('../models/Tournament');
const MatchEvent = require('../models/MatchEvent');
const PenaltyShootout = require('../models/PenaltyShootout');
const Player = require('../models/Player');
const TossRecord = require('../models/TossRecord');
const { MATCH_STATUS, STAGE_DURATIONS, TIMER_STAGES, EVENT_TYPES } = require('../utils/constants');

class MatchService {
  /**
   * Schedule a new match with validation to prevent scheduling conflicts
   */
  static async scheduleMatch(data) {
    let tournamentId = data.tournament || data.tournamentId;
    const { teamA: teamAId, teamB: teamBId, matchDate, matchTime, venue, stage } = data;

    if (teamAId === teamBId) {
      throw new Error('Team A and Team B must be different teams');
    }

    // Resolve tournament: if provided ID is valid ObjectId, find it; otherwise pick active tournament
    let tournament = null;
    if (tournamentId && /^[0-9a-fA-F]{24}$/.test(tournamentId)) {
      tournament = await Tournament.findById(tournamentId);
    }
    if (!tournament) {
      tournament = (await Tournament.findOne({ status: 'Ongoing' })) || (await Tournament.findOne());
      if (!tournament) {
        const User = require('../models/User');
        const adminUser = await User.findOne({ role: 'SuperAdmin' });
        tournament = await Tournament.create({
          name: 'Alliance Premier League - Season 9',
          description: 'Official APL Season 9 Championship Tournament',
          startDate: new Date(),
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          status: 'Ongoing',
          createdBy: adminUser ? adminUser._id : null
        });
      }
      tournamentId = tournament._id.toString();
    }

    const teamA = await Team.findById(teamAId);
    const teamB = await Team.findById(teamBId);
    if (!teamA || !teamB) {
      throw new Error('One or both teams not found');
    }

    // Auto-calculate matchNumber if not provided or collision
    let matchNumber = data.matchNumber;
    if (!matchNumber || matchNumber <= 0) {
      const highestMatch = await Match.findOne({ tournament: tournamentId }).sort({ matchNumber: -1 });
      matchNumber = highestMatch ? (highestMatch.matchNumber || 0) + 1 : 1;
    } else {
      const existingNumber = await Match.findOne({ tournament: tournamentId, matchNumber });
      if (existingNumber) {
        const highestMatch = await Match.findOne({ tournament: tournamentId }).sort({ matchNumber: -1 });
        matchNumber = highestMatch ? (highestMatch.matchNumber || 0) + 1 : matchNumber + 1;
      }
    }

    // Robust date parsing supporting YYYY-MM-DD and DD-MM-YYYY
    let targetDate;
    if (typeof matchDate === 'string' && /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.test(matchDate.trim())) {
      const parts = matchDate.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      targetDate = new Date(Date.UTC(parseInt(parts[3], 10), parseInt(parts[2], 10) - 1, parseInt(parts[1], 10)));
    } else {
      targetDate = new Date(matchDate);
    }
    if (isNaN(targetDate.getTime())) {
      targetDate = new Date();
    }

    // Schedule collision prevention: check if teamA or teamB is already scheduled at the same date & time
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

    // Ensure match date cannot be scheduled before today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduledDate = new Date(targetDate);
    scheduledDate.setHours(0, 0, 0, 0);
    if (scheduledDate < today) {
      throw new Error('Match date cannot be in the past. Matches must be scheduled for today or a future date.');
    }

    const halfDuration = tournament.rules?.halfDurationSeconds || STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF];

    const match = await Match.create({
      tournament: tournamentId,
      matchNumber,
      teamA: teamAId,
      teamB: teamBId,
      matchDate: targetDate,
      matchTime: matchTime || '14:00',
      venue,
      stage: stage || 'Group Stage',
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

    // Ensure participatingTeams and standings exist for both teams
    if (tournament && Array.isArray(tournament.participatingTeams)) {
      let needsSave = false;
      if (!tournament.participatingTeams.map(t => t.toString()).includes(teamAId.toString())) {
        tournament.participatingTeams.push(teamAId);
        needsSave = true;
      }
      if (!tournament.participatingTeams.map(t => t.toString()).includes(teamBId.toString())) {
        tournament.participatingTeams.push(teamBId);
        needsSave = true;
      }
      if (needsSave) {
        await tournament.save();
      }
    }

    const TournamentStanding = require('../models/TournamentStanding');
    for (const tId of [teamAId, teamBId]) {
      const standingExists = await TournamentStanding.findOne({ tournament: tournamentId, team: tId });
      if (!standingExists) {
        await TournamentStanding.create({
          tournament: tournamentId,
          team: tId,
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

    return Match.findById(match._id)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name');
  }

  static async updateMatch(id, updateData) {
    const match = await Match.findById(id);
    if (!match) {
      return null;
    }

    if (match.status === MATCH_STATUS.COMPLETED && updateData.status !== MATCH_STATUS.COMPLETED) {
      if (updateData.status === MATCH_STATUS.UPCOMING || updateData.status === MATCH_STATUS.LIVE) {
        match.isFinalized = false;
      }
    }

    // If date or time is modified, check collision
    let targetDate = match.matchDate;
    if (updateData.matchDate) {
      if (typeof updateData.matchDate === 'string' && /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.test(updateData.matchDate.trim())) {
        const parts = updateData.matchDate.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        targetDate = new Date(Date.UTC(parseInt(parts[3], 10), parseInt(parts[2], 10) - 1, parseInt(parts[1], 10)));
      } else {
        targetDate = new Date(updateData.matchDate);
      }
      updateData.matchDate = targetDate;
    }
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
      return null;
    }

    // Clean up all fixture-specific event and shootout records
    // Note: Cumulative player career goals and penalty records are preserved
    // in the Top Scorers / Golden Boot registry and are not wiped out.
    await MatchEvent.deleteMany({ match: id });
    await PenaltyShootout.deleteMany({ match: id });
    await TossRecord.deleteMany({ match: id });

    const tournamentId = match.tournament;
    await match.deleteOne();

    // Recalculate standings so points, wins, and goals are updated
    if (tournamentId) {
      const StandingsService = require('./standingsService');
      await StandingsService.recalculateTournamentStandings(tournamentId);
    }

    return { message: 'Match deleted successfully' };
  }

  static attachLiveTimer(match) {
    if (!match) return match;
    const TimerService = require('./timerService');
    const matchObj = typeof match.toObject === 'function' ? match.toObject() : match;
    if (matchObj.timer) {
      const remainingTime = TimerService.calculateRemainingTime(matchObj);
      matchObj.timer.remainingTime = remainingTime;
      matchObj.timer.remainingMs = remainingTime * 1000;
      matchObj.timer.serverTime = Date.now();
      matchObj.timer.timerStatus = matchObj.timer.timerStatus || (matchObj.timer.isRunning ? (matchObj.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'NOT_STARTED');
    }
    if (!matchObj.goals && matchObj.events && Array.isArray(matchObj.events)) {
      matchObj.goals = matchObj.events.filter((e) => (e.type === EVENT_TYPES.GOAL_SCORED || e.type === 'GOAL') && !e.isUndone);
    }
    return matchObj;
  }

  static async getAllMatches(query = {}) {
    const filter = {};
    if (query.tournament) filter.tournament = query.tournament;
    if (query.status) filter.status = query.status;
    if (query.venue) filter.venue = { $regex: query.venue, $options: 'i' };

    const matches = await Match.find(filter)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name')
      .populate('winner', 'name logo')
      .populate('shootout.shootoutWinner', 'name logo')
      .populate({
        path: 'events',
        match: { isUndone: false, type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] } },
        populate: [
          { path: 'player', select: 'name jerseyNumber position club' },
          { path: 'team', select: 'name logo' }
        ]
      })
      .sort({ matchDate: 1, matchTime: 1 });

    return matches.map((m) => MatchService.attachLiveTimer(m));
  }

  static async getUpcomingMatches(tournamentId = null) {
    const filter = { status: MATCH_STATUS.UPCOMING };
    if (tournamentId) filter.tournament = tournamentId;

    const matches = await Match.find(filter)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name')
      .sort({ matchDate: 1, matchTime: 1 });

    return matches.map((m) => MatchService.attachLiveTimer(m));
  }

  static async getLiveMatches(tournamentId = null) {
    const filter = { status: { $in: [MATCH_STATUS.LIVE, MATCH_STATUS.HALF_TIME, MATCH_STATUS.PENALTY_SHOOTOUT] } };
    if (tournamentId) filter.tournament = tournamentId;

    const matches = await Match.find(filter)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name')
      .populate('winner', 'name logo')
      .populate('shootout.shootoutWinner', 'name logo')
      .populate({
        path: 'events',
        match: { isUndone: false, type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] } },
        populate: [
          { path: 'player', select: 'name jerseyNumber position club' },
          { path: 'team', select: 'name logo' }
        ]
      })
      .sort({ matchDate: 1, matchTime: 1 });

    return matches.map((m) => MatchService.attachLiveTimer(m));
  }

  static async getCompletedMatches(tournamentId = null) {
    const filter = { status: MATCH_STATUS.COMPLETED };
    if (tournamentId) filter.tournament = tournamentId;

    const matches = await Match.find(filter)
      .populate('teamA', 'name logo')
      .populate('teamB', 'name logo')
      .populate('winner', 'name logo')
      .populate('shootout.shootoutWinner', 'name logo')
      .populate('tournament', 'name')
      .populate({
        path: 'events',
        match: { isUndone: false, type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] } },
        populate: [
          { path: 'player', select: 'name jerseyNumber position club' },
          { path: 'team', select: 'name logo' }
        ]
      })
      .sort({ matchDate: -1 });

    return matches.map((m) => MatchService.attachLiveTimer(m));
  }

  static async getMatchById(id) {
    let query = null;
    if (id && !isNaN(Number(id)) && !/^[0-9a-fA-F]{24}$/.test(String(id))) {
      query = { matchNumber: Number(id) };
    } else {
      query = { _id: id };
    }

    const match = await Match.findOne(query)
      .populate('teamA', 'name logo coach captain players')
      .populate('teamB', 'name logo coach captain players')
      .populate('tournament', 'name rules')
      .populate('winner', 'name logo')
      .populate('shootout.shootoutWinner', 'name logo')
      .populate({
        path: 'events',
        match: { isUndone: false },
        populate: [
          { path: 'player', select: 'name jerseyNumber position club' },
          { path: 'secondaryPlayer', select: 'name jerseyNumber position club' },
          { path: 'team', select: 'name logo' }
        ]
      });

    if (!match) {
      return null;
    }

    const matchObj = MatchService.attachLiveTimer(match);
    const goals = await MatchEvent.find({
      match: match._id,
      type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
      isUndone: false
    })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position club')
      .sort({ timestamp: 1, createdAt: 1 });

    const penalties = await PenaltyShootout.find({ match: match._id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position club')
      .populate('goalkeeper', 'name jerseyNumber position club')
      .sort({ penaltyNumber: 1 });

    matchObj.goals = goals;
    matchObj.penalties = {
      shootoutState: matchObj.shootout,
      kicks: penalties
    };
    return matchObj;
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
    let query = null;
    if (id && !isNaN(Number(id)) && !/^[0-9a-fA-F]{24}$/.test(String(id))) {
      query = { matchNumber: Number(id) };
    } else {
      query = { _id: id };
    }

    const match = await Match.findOne(query)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('tournament', 'name rules')
      .populate('winner', 'name logo');

    if (!match) {
      return null;
    }

    const remainingTime = TimerService.calculateRemainingTime(match);

    let goals = await MatchEvent.find({
      match: match._id,
      type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] },
      isUndone: false
    })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .sort({ timestamp: 1 });

    // Defensive safeguard: If match was restarted at 0-0 in First Half or Upcoming, purge prior ghost goals
    if (match.teamAScore === 0 && match.teamBScore === 0 && (match.timer?.currentStage === TIMER_STAGES.FIRST_HALF || match.status === MATCH_STATUS.UPCOMING) && goals.length > 0) {
      await MatchEvent.deleteMany({
        match: match._id,
        type: { $in: [EVENT_TYPES.GOAL_SCORED, 'GOAL'] }
      });
      match.events = [];
      await match.save();
      goals = [];
    }

    const penalties = await PenaltyShootout.find({ match: match._id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('goalkeeper', 'name jerseyNumber position')
      .sort({ penaltyNumber: 1 });

    const events = await MatchEvent.find({ match: match._id })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('secondaryPlayer', 'name jerseyNumber position')
      .sort({ timestamp: 1, createdAt: 1 });

    return {
      _id: match._id,
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
        remainingMs: remainingTime * 1000,
        isRunning: match.timer.isRunning,
        isPaused: match.timer.isPaused,
        phaseEndsAt: match.timer.phaseEndsAt,
        timerStatus: match.timer.timerStatus || (match.timer.isRunning ? (match.timer.isPaused ? 'PAUSED' : 'RUNNING') : 'NOT_STARTED'),
        startedTimestamp: match.timer.startedTimestamp,
        pausedTimestamp: match.timer.pausedTimestamp,
        totalPausedDuration: match.timer.totalPausedDuration,
        stageHistory: match.timer.stageHistory,
        serverTime: Date.now()
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

  static async resolveMatchId(id) {
    if (!id) return null;
    if (!isNaN(Number(id)) && !/^[0-9a-fA-F]{24}$/.test(String(id))) {
      const m = await Match.findOne({ matchNumber: Number(id) });
      return m ? m._id : null;
    }
    return id;
  }

  /**
   * Complete chronologically arranged events
   */
  static async getMatchEvents(id) {
    const matchId = await MatchService.resolveMatchId(id);
    if (!matchId) return [];
    return MatchEvent.find({ match: matchId })
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
    const matchId = await MatchService.resolveMatchId(id);
    if (!matchId) return [];
    const events = await MatchEvent.find({ match: matchId })
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
