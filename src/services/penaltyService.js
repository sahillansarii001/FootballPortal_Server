const PenaltyShootout = require('../models/PenaltyShootout');
const TossRecord = require('../models/TossRecord');
const Match = require('../models/Match');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const MatchEvent = require('../models/MatchEvent');
const TimerService = require('./timerService');
const StandingsService = require('./standingsService');
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
    const teamId = (penaltyData.team || penaltyData.teamId)?.toString();
    const playerId = (penaltyData.player || penaltyData.playerId)?.toString();
    const goalkeeperId = (penaltyData.goalkeeper || penaltyData.goalkeeperId)?.toString();
    const rawOutcome = (penaltyData.outcome || 'Goal').toString();
    const outcome = rawOutcome.charAt(0).toUpperCase() + rawOutcome.slice(1).toLowerCase();

    const result = await withTransaction(async (session) => {
      const match = await Match.findById(matchId).session(session);
      if (!match) {
        throw new Error('Match not found');
      }

      if (match.status === MATCH_STATUS.COMPLETED && match.isFinalized) {
        // Still allow recording if needed or return existing
      }

      const isTeamA = match.teamA.toString() === teamId;
      const isTeamB = match.teamB.toString() === teamId;
      if (!isTeamA && !isTeamB) {
        throw new Error('Team is not participating in this match');
      }

      let taker = await Player.findById(playerId).session(session);
      if (!taker) {
        taker = await Player.findOne({ team: teamId }).session(session);
        if (!taker) {
          const created = await Player.create(
            [
              {
                name: 'Penalty Taker',
                team: teamId,
                jerseyNumber: 10,
                position: 'Forward'
              }
            ],
            { session }
          );
          taker = created[0];
        }
      }

      let goalkeeper = goalkeeperId ? await Player.findById(goalkeeperId).session(session) : null;
      if (!goalkeeper) {
        const opposingTeamId = isTeamA ? match.teamB : match.teamA;
        goalkeeper = (await Player.findOne({ team: opposingTeamId, position: 'Goalkeeper' }).session(session))
          || (await Player.findOne({ team: opposingTeamId }).session(session));
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
      } else if (outcome === PENALTY_OUTCOMES.SAVED && goalkeeper) {
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
        match.isFinalized = true;
        match.timer.isRunning = false;
        match.timer.isPaused = false;
        match.timer.timerStatus = 'COMPLETED';
        match.timer.phaseEndsAt = null;
        match.matchResult = `Penalty Shootout Win (${match.shootout.teamAPenaltyScore} - ${match.shootout.teamBPenaltyScore})`;

        await match.save({ session });

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

      const query = PenaltyShootout.findById(penalty._id);
      if (session) query.session(session);
      const populatedPenalty = await query
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
        evaluation,
        tournamentId: match.tournament,
        isDecided: evaluation.isDecided
      };
    });

    if (result.isDecided && result.tournamentId) {
      await StandingsService.recalculateTournamentStandings(result.tournamentId);
    }

    return {
      penalty: result.penalty,
      shootoutState: result.shootoutState,
      evaluation: result.evaluation
    };
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

  /**
   * Record Coin Toss for Sudden Death (when tied after 3 kicks)
   */
  static async recordToss(matchId, tossData, userId = null) {
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    let winnerId = tossData.tossWinner;
    if (winnerId === 'A' || winnerId === 'teamA') {
      winnerId = match.teamA.toString();
    } else if (winnerId === 'B' || winnerId === 'teamB') {
      winnerId = match.teamB.toString();
    }

    const isTeamA = match.teamA.toString() === winnerId?.toString();
    const isTeamB = match.teamB.toString() === winnerId?.toString();
    if (!isTeamA && !isTeamB) {
      throw new Error('Toss winner must be one of the participating teams');
    }

    let rawChoice = (tossData.choice || 'ATTACK').toUpperCase();
    if (rawChoice === 'SHOOT') rawChoice = 'ATTACK';
    if (rawChoice === 'SAVE') rawChoice = 'DEFEND';
    if (!['ATTACK', 'DEFEND'].includes(rawChoice)) {
      throw new Error("Choice must be 'ATTACK' (SHOOT) or 'DEFEND' (SAVE)");
    }

    const kickingTeam = rawChoice === 'ATTACK' ? winnerId : (isTeamA ? match.teamB : match.teamA);
    const defendingTeam = kickingTeam.toString() === match.teamA.toString() ? match.teamB : match.teamA;

    match.toss = {
      isTossConducted: true,
      tossWinner: winnerId,
      choice: rawChoice,
      kickingTeam,
      defendingTeam,
      conductedAt: new Date()
    };
    match.shootout.isSuddenDeath = true;
    match.shootout.isShootout = true;
    match.status = MATCH_STATUS.PENALTY_SHOOTOUT;

    await match.save();

    await TossRecord.create({
      match: match._id,
      tournament: match.tournament,
      tossWinner: winnerId,
      choice: rawChoice,
      kickingTeam,
      defendingTeam,
      conductedBy: userId
    });

    const tossEvent = await MatchEvent.create({
      match: match._id,
      tournament: match.tournament,
      type: EVENT_TYPES.TOSS_CONDUCTED,
      stage: 'Sudden Death Coin Toss',
      matchTime: 'Sudden Death',
      timestamp: new Date(),
      detail: {
        tossWinner: winnerId,
        choice: rawChoice,
        kickingTeam,
        defendingTeam
      },
      createdBy: userId
    });
    match.events.push(tossEvent._id);
    await match.save();

    socketEmitter.broadcastTossCompleted(matchId, {
      matchId,
      tossWinner: winnerId,
      choice: rawChoice,
      kickingTeam,
      defendingTeam
    });

    return match;
  }

  /**
   * Record the single decisive sudden-death penalty kick
   */
  static async recordDecisiveKick(matchId, kickData, userId = null) {
    const result = await withTransaction(async (session) => {
      const match = await Match.findById(matchId).session(session);
      if (!match) {
        throw new Error('Match not found');
      }

      if (!match.toss || !match.toss.isTossConducted) {
        throw new Error('Coin toss must be conducted before decisive sudden-death kick');
      }

      const kickingTeamId = match.toss.kickingTeam;
      const defendingTeamId = match.toss.defendingTeam;

      let outcome = (kickData.outcome || 'GOAL').toUpperCase();
      if (outcome === 'GOAL') outcome = 'Goal';
      else if (outcome === 'SAVED') outcome = 'Saved';
      else if (outcome === 'MISSED') outcome = 'Missed';

      const taker = await Player.findById(kickData.player).session(session);
      if (!taker) {
        throw new Error('Kicking player not found');
      }

      let goalkeeper = kickData.goalkeeper ? await Player.findById(kickData.goalkeeper).session(session) : null;
      if (!goalkeeper) {
        goalkeeper = (await Player.findOne({ team: defendingTeamId, position: 'Goalkeeper' }).session(session))
          || (await Player.findOne({ team: defendingTeamId }).session(session));
      }

      // Update statistics: CRITICAL: Shootout/sudden-death kicks update penaltiesScored/Saved, NEVER goals!
      if (outcome === 'Goal') {
        taker.penaltiesScored += 1;
        await taker.save({ session });
      } else if (outcome === 'Saved' && goalkeeper) {
        goalkeeper.penaltiesSaved += 1;
        await goalkeeper.save({ session });
      }

      // Record PenaltyShootout attempt
      const totalPenaltiesCount = await PenaltyShootout.countDocuments({ match: matchId }).session(session);
      const penalties = await PenaltyShootout.create(
        [
          {
            match: match._id,
            tournament: match.tournament,
            team: kickingTeamId,
            player: taker._id,
            goalkeeper: goalkeeper?._id,
            penaltyNumber: totalPenaltiesCount + 1,
            round: 4,
            outcome,
            isSuddenDeath: true,
            timestamp: new Date()
          }
        ],
        { session }
      );

      // Determine Championship Winner:
      // If kicking team scored -> kicking team wins!
      // If kicking team missed or goalkeeper saved -> defending team wins!
      const winningTeamId = outcome === 'Goal' ? kickingTeamId : defendingTeamId;

      if (kickingTeamId.toString() === match.teamA.toString()) {
        match.shootout.teamAPenaltiesTaken += 1;
        if (outcome === 'Goal') match.shootout.teamAPenaltyScore += 1;
      } else {
        match.shootout.teamBPenaltiesTaken += 1;
        if (outcome === 'Goal') match.shootout.teamBPenaltyScore += 1;
      }

      match.toss.decisivePenaltyTaker = taker._id;
      match.toss.decisiveGoalkeeper = goalkeeper?._id;
      match.toss.decisiveOutcome = outcome.toUpperCase();
      match.toss.winner = winningTeamId;
      match.toss.completedAt = new Date();

      match.shootout.isCompleted = true;
      match.shootout.isSuddenDeath = true;
      match.shootout.shootoutWinner = winningTeamId;
      match.winner = winningTeamId;
      match.status = MATCH_STATUS.COMPLETED;
      match.isFinalized = true;
      match.timer.isRunning = false;
      match.timer.isPaused = false;
      match.timer.timerStatus = 'COMPLETED';
      match.timer.phaseEndsAt = null;
      match.matchResult = `Sudden Death Decided (${outcome === 'Goal' ? 'Sudden Death Goal' : 'Decisive Penalty Save'})`;

      await match.save({ session });

      // Update TossRecord with outcome
      await TossRecord.findOneAndUpdate(
        { match: matchId },
        {
          decisivePenaltyTaker: taker._id,
          decisiveGoalkeeper: goalkeeper?._id,
          decisiveOutcome: outcome.toUpperCase(),
          winner: winningTeamId
        },
        { session }
      );

      const suddenDeathEvent = await MatchEvent.create(
        [
          {
            match: match._id,
            tournament: match.tournament,
            type: EVENT_TYPES.SUDDEN_DEATH_DECIDED,
            stage: 'Sudden Death Decisive Kick',
            matchTime: 'Sudden Death',
            timestamp: new Date(),
            detail: {
              kickingTeam: kickingTeamId,
              defendingTeam: defendingTeamId,
              taker: taker._id,
              outcome,
              winner: winningTeamId
            },
            createdBy: userId
          }
        ],
        { session }
      );
      match.events.push(suddenDeathEvent[0]._id);
      await match.save({ session });

      // Broadcast events
      socketEmitter.broadcastSuddenDeathResult(matchId, {
        matchId,
        outcome,
        winner: winningTeamId,
        kickingTeam: kickingTeamId,
        defendingTeam: defendingTeamId,
        shootout: match.shootout
      });

      socketEmitter.broadcastMatchCompleted(matchId, match.tournament, {
        matchId,
        status: MATCH_STATUS.COMPLETED,
        winner: winningTeamId,
        matchResult: match.matchResult,
        teamAScore: match.teamAScore,
        teamBScore: match.teamBScore,
        shootout: match.shootout,
        toss: match.toss
      });

      return {
        match,
        tournamentId: match.tournament,
        penalty: penalties[0],
        winner: winningTeamId,
        outcome
      };
    });

    if (result.tournamentId) {
      await StandingsService.recalculateTournamentStandings(result.tournamentId);
    }

    return {
      match: result.match,
      penalty: result.penalty,
      winner: result.winner,
      outcome: result.outcome
    };
  }
}

module.exports = PenaltyService;
