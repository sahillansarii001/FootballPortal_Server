const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const PenaltyShootout = require('../models/PenaltyShootout');
const { EVENT_TYPES, STAGE_DURATIONS, TIMER_STAGES } = require('../utils/constants');

class SummaryService {
  static async getMatchSummary(matchId) {
    const match = await Match.findById(matchId)
      .populate('teamA', 'name logo coach')
      .populate('teamB', 'name logo coach')
      .populate('winner', 'name logo')
      .populate('tournament', 'name rules');

    if (!match) {
      throw new Error('Match not found');
    }

    // Retrieve active goal events
    const goalEvents = await MatchEvent.find({
      match: matchId,
      type: EVENT_TYPES.GOAL,
      isUndone: false
    })
      .populate('player', 'name jerseyNumber position')
      .populate('team', 'name logo')
      .sort({ createdAt: 1 });

    const goalScorers = goalEvents.map((ev) => ({
      eventId: ev._id,
      player: ev.player ? { id: ev.player._id, name: ev.player.name, jerseyNumber: ev.player.jerseyNumber } : null,
      team: ev.team ? { id: ev.team._id, name: ev.team.name } : null,
      goalType: ev.detail.goalType,
      timestamp: ev.matchTime,
      stage: ev.stage,
      description: ev.detail.description
    }));

    // Retrieve penalty shootout if applicable
    let penaltyShootoutResult = null;
    const penalties = await PenaltyShootout.find({ match: matchId })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('goalkeeper', 'name jerseyNumber position')
      .sort({ penaltyNumber: 1 });

    if (penalties.length > 0 || match.shootout?.isShootout) {
      const penaltyTakers = penalties.map((p) => ({
        penaltyNumber: p.penaltyNumber,
        round: p.round,
        team: p.team ? p.team.name : 'Unknown',
        player: p.player ? { name: p.player.name, jerseyNumber: p.player.jerseyNumber } : null,
        outcome: p.outcome,
        isSuddenDeath: p.isSuddenDeath
      }));

      const savingGoalkeepers = penalties
        .filter((p) => p.outcome === 'Saved')
        .map((p) => ({
          penaltyNumber: p.penaltyNumber,
          round: p.round,
          goalkeeper: p.goalkeeper ? { name: p.goalkeeper.name, jerseyNumber: p.goalkeeper.jerseyNumber } : null,
          againstTeam: p.team ? p.team.name : 'Unknown'
        }));

      penaltyShootoutResult = {
        isShootout: true,
        teamAPenaltyScore: match.shootout?.teamAPenaltyScore || 0,
        teamBPenaltyScore: match.shootout?.teamBPenaltyScore || 0,
        shootoutWinner: match.shootout?.shootoutWinner,
        penaltiesTakenCount: penalties.length,
        penaltyTakers,
        savingGoalkeepers
      };
    }

    // Retrieve all match events timeline
    const allEvents = await MatchEvent.find({ match: matchId, isUndone: false })
      .populate('player', 'name jerseyNumber')
      .populate('secondaryPlayer', 'name jerseyNumber')
      .populate('team', 'name')
      .sort({ createdAt: 1 });

    // Calculate match duration
    let totalDurationSeconds =
      (STAGE_DURATIONS[TIMER_STAGES.FIRST_HALF] || 240) +
      (STAGE_DURATIONS[TIMER_STAGES.TRANSITION_GAP] || 20) +
      (STAGE_DURATIONS[TIMER_STAGES.HALF_TIME] || 120) +
      (STAGE_DURATIONS[TIMER_STAGES.SECOND_HALF] || 240);

    const matchDurationFormatted = `${Math.floor(totalDurationSeconds / 60)} minutes and ${totalDurationSeconds % 60} seconds`;

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
      finalScore: {
        teamA: match.teamAScore,
        teamB: match.teamBScore
      },
      winner: match.winner,
      matchResult: match.matchResult,
      isFinalized: match.isFinalized,
      matchDuration: matchDurationFormatted,
      matchDurationSeconds: totalDurationSeconds,
      goalScorers,
      penaltyShootoutResult,
      eventsTimeline: allEvents
    };
  }
}

module.exports = SummaryService;
