const PenaltyShootout = require('../models/PenaltyShootout');
const Match = require('../models/Match');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const MatchEvent = require('../models/MatchEvent');
const TimerService = require('./timerService');
const { socketEmitter } = require('../sockets/socketManager');
const { PENALTY_OUTCOMES, EVENT_TYPES, MATCH_STATUS, DEFAULT_INITIAL_PENALTY_KICKS } = require('../utils/constants');
const { withTransaction } = require('../utils/transaction');

class PenaltyService {
  /**
   * Check if a shootout is mathematically decided
   */
  static evaluateShootoutWinner(teamAScore, teamBScore, teamATaken, teamBTaken, initialKicks = DEFAULT_INITIAL_PENALTY_KICKS) {
    const teamARemaining = Math.max(0, initialKicks - teamATaken);
    const teamBRemaining = Math.max(0, initialKicks - teamBTaken);

    const teamAMaxScore = teamAScore + teamARemaining;
    const teamBMaxScore = teamBScore + teamBRemaining;

    // Mathematical elimination during regulation initial kicks
    if (teamATaken <= initialKicks && teamBTaken <= initialKicks) {
      if (teamAScore > teamBMaxScore) {
        return { isDecided: true, winner: 'teamA', isSuddenDeath: false };
      }
      if (teamBScore > teamAMaxScore) {
        return { isDecided: true, winner: 'teamB', isSuddenDeath: false };
      }

      // If both teams have taken all initial kicks and still tied
      if (teamATaken === initialKicks && teamBTaken === initialKicks) {
        if (teamAScore > teamBScore) {
          return { isDecided: true, winner: 'teamA', isSuddenDeath: false };
        }
        if (teamBScore > teamAScore) {
          return { isDecided: true, winner: 'teamB', isSuddenDeath: false };
        }
        // Exactly tied after all initial kicks -> Enter Sudden Death!
        return { isDecided: false, winner: null, isSuddenDeath: true };
      }

      return { isDecided: false, winner: null, isSuddenDeath: false };
    }

    // In Sudden Death: decisions only happen when both teams have taken an equal number of kicks
    if (teamATaken === teamBTaken && teamATaken > initialKicks) {
      if (teamAScore > teamBScore) {
        return { isDecided: true, winner: 'teamA', isSuddenDeath: true };
      }
      if (teamBScore > teamAScore) {
        return { isDecided: true, winner: 'teamB', isSuddenDeath: true };
      }
    }

    return { isDecided: false, winner: null, isSuddenDeath: true };
  }

  /**
   * Record an individual penalty shootout kick
   */
  static async recordPenalty(matchId, penaltyData, userId = null) {
    const { team: teamId, player: playerId, goalkeeper: goalkeeperId, outcome } = penaltyData;

    return await withTransaction(async (session) => {
      const match = await Match.findById(matchId).session(session);
      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status === MATCH_STATUS.COMPLETED && match.isFinalized) {
        throw new Error('Penalty shootout has already completed and been finalized for this match');
      }

      const isTeamA = match.teamA.toString() === teamId;
      const isTeamB = match.teamB.toString() === teamId;
      if (!isTeamA && !isTeamB) {
        throw new Error('Team is not participating in this match');
      }

      const taker = await Player.findById(playerId).session(session);
      let goalkeeper = goalkeeperId ? await Player.findById(goalkeeperId).session(session) : null;
      if (!goalkeeper) {
        const opposingTeamId = isTeamA ? match.teamB : match.teamA;
        goalkeeper = (await Player.findOne({ team: opposingTeamId, position: 'Goalkeeper' }).session(session))
          || (await Player.findOne({ team: opposingTeamId }).session(session));
      }
      if (!taker) {
        throw new Error('Penalty taker player record not found');
      }

      const tournament = await Tournament.findById(match.tournament).session(session);
      const initialKicks = tournament?.rules?.initialPenaltyKicks || DEFAULT_INITIAL_PENALTY_KICKS;

      // Count existing penalties taken
      const totalPenaltiesCount = await PenaltyShootout.countDocuments({ match: matchId }).session(session);

      const penaltyNumber = totalPenaltiesCount + 1;
      const currentRound = Math.floor(totalPenaltiesCount / 2) + 1;
      const isSuddenDeath = currentRound > initialKicks;

      // Record the penalty
      const penalties = await PenaltyShootout.create(
        [
          {
            match: match._id,
            tournament: match.tournament,
            team: teamId,
            player: playerId,
            goalkeeper: goalkeeper?._id || goalkeeperId,
            penaltyNumber,
            round: currentRound,
            outcome,
            isSuddenDeath,
            timestamp: new Date()
          }
        ],
        { session }
      );
      const penalty = penalties[0];

      // Update player penalty stats
      if (outcome === PENALTY_OUTCOMES.GOAL) {
        taker.penaltiesScored += 1;
        await taker.save({ session });
      } else if (outcome === PENALTY_OUTCOMES.SAVED) {
        goalkeeper.penaltiesSaved += 1;
        await goalkeeper.save({ session });
      }

      // Update match shootout state
      if (isTeamA) {
        match.shootout.teamAPenaltiesTaken += 1;
        if (outcome === PENALTY_OUTCOMES.GOAL) {
          match.shootout.teamAPenaltyScore += 1;
        }
      } else {
        match.shootout.teamBPenaltiesTaken += 1;
        if (outcome === PENALTY_OUTCOMES.GOAL) {
          match.shootout.teamBPenaltyScore += 1;
        }
      }

      match.shootout.round = currentRound;
      match.shootout.isSuddenDeath = isSuddenDeath;
      match.status = MATCH_STATUS.PENALTY_SHOOTOUT;
      match.shootout.isShootout = true;

      // Check if shootout is mathematically decided
      const evaluation = PenaltyService.evaluateShootoutWinner(
        match.shootout.teamAPenaltyScore,
        match.shootout.teamBPenaltyScore,
        match.shootout.teamAPenaltiesTaken,
        match.shootout.teamBPenaltiesTaken,
        initialKicks
      );

      let winnerDeclared = false;
      if (evaluation.isDecided) {
        winnerDeclared = true;
        const winningTeamId = evaluation.winner === 'teamA' ? match.teamA : match.teamB;
        match.shootout.isCompleted = true;
        match.shootout.shootoutWinner = winningTeamId;
        match.winner = winningTeamId;
        match.status = MATCH_STATUS.COMPLETED;
        match.matchResult = `Penalty Shootout Win (${match.shootout.teamAPenaltyScore} - ${match.shootout.teamBPenaltyScore})`;

        await match.save({ session });

        // Finalize match, tournament standings, and win/loss records
        await TimerService.finalizeMatch(match._id);

        socketEmitter.broadcastShootoutCompleted(matchId, {
          matchId,
          winner: winningTeamId,
          teamAPenaltyScore: match.shootout.teamAPenaltyScore,
          teamBPenaltyScore: match.shootout.teamBPenaltyScore,
          matchResult: match.matchResult
        });

        socketEmitter.broadcastMatchCompleted(matchId, match.tournament, {
          matchId,
          status: MATCH_STATUS.COMPLETED,
          winner: winningTeamId,
          matchResult: match.matchResult,
          teamAScore: match.teamAScore,
          teamBScore: match.teamBScore,
          shootout: match.shootout
        });
      } else {
        await match.save({ session });
      }

      // Determine standardized event type
      let eventType = EVENT_TYPES.PENALTY_TAKEN;
      if (outcome === PENALTY_OUTCOMES.SAVED) {
        eventType = EVENT_TYPES.PENALTY_SAVED;
      } else if (outcome === PENALTY_OUTCOMES.MISSED) {
        eventType = EVENT_TYPES.PENALTY_MISSED;
      }

      // Create match event
      const events = await MatchEvent.create(
        [
          {
            match: match._id,
            tournament: match.tournament,
            type: eventType,
            team: teamId,
            player: playerId,
            secondaryPlayer: goalkeeperId,
            stage: 'Penalty Shootout',
            matchTime: `Penalty #${penaltyNumber} (Round ${currentRound})`,
            timestamp: new Date(),
            detail: {
              outcome,
              isSuddenDeath,
              penaltyNumber,
              round: currentRound,
              teamAPenaltyScore: match.shootout.teamAPenaltyScore,
              teamBPenaltyScore: match.shootout.teamBPenaltyScore,
              winnerDeclared
            },
            createdBy: userId
          }
        ],
        { session }
      );
      const event = events[0];
      match.events.push(event._id);
      await match.save({ session });

      const populatedPenalty = await PenaltyShootout.findById(penalty._id)
        .populate('team', 'name logo')
        .populate('player', 'name jerseyNumber position')
        .populate('goalkeeper', 'name jerseyNumber position');

      // Broadcast penalty update
      socketEmitter.broadcastPenaltyUpdate(matchId, {
        matchId,
        penalty: populatedPenalty,
        shootoutState: match.shootout,
        outcome,
        isDecided: evaluation.isDecided,
        isSuddenDeath: evaluation.isSuddenDeath
      });

      return {
        penalty: populatedPenalty,
        shootoutState: match.shootout,
        evaluation
      };
    });
  }

  /**
   * Get all penalties recorded for a match
   */
  static async getMatchPenalties(matchId) {
    const penalties = await PenaltyShootout.find({ match: matchId })
      .populate('team', 'name logo')
      .populate('player', 'name jerseyNumber position')
      .populate('goalkeeper', 'name jerseyNumber position')
      .sort({ penaltyNumber: 1 });

    const match = await Match.findById(matchId).select('shootout status winner');

    return {
      penalties,
      shootoutState: match?.shootout,
      status: match?.status,
      winner: match?.winner
    };
  }
}

module.exports = PenaltyService;
