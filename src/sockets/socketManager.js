const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../utils/logger');
const User = require('../models/User');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true
    }
  });

  // Authentication middleware for socket connections
  // Attaches authenticated user object if token is provided; otherwise allows public guest read-only access
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwtSecret);
          const user = await User.findById(decoded.id).select('-password');
          if (user && user.isActive) {
            socket.user = user;
          }
        } catch (tokenErr) {
          logger.warn(`Socket auth token invalid: ${tokenErr.message}`);
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (User: ${socket.user ? socket.user.username : 'Public/Guest'})`);

    // Helper to send authoritative match state
    const sendMatchSync = async (matchId) => {
      try {
        const MatchService = require('../services/matchService');
        const state = await MatchService.getLiveMatchState(matchId);
        socket.emit('match:sync', state);
        socket.emit('sync:state', state);
      } catch (err) {
        logger.warn(`Failed to sync state for match ${matchId}: ${err.message}`);
      }
    };

    // Join match room with immediate state synchronization
    socket.on('join:match', async (matchId) => {
      if (matchId) {
        const room = `match:${matchId}`;
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room ${room}`);
        socket.emit('joined:match', { matchId, room });

        // Immediate synchronization with latest database state
        await sendMatchSync(matchId);
      }
    });

    // Client-initiated state sync (e.g. after network reconnection)
    socket.on('sync:match', async (matchId, ack) => {
      if (matchId) {
        try {
          const MatchService = require('../services/matchService');
          const state = await MatchService.getLiveMatchState(matchId);
          if (typeof ack === 'function') {
            ack({ success: true, data: state });
          }
          socket.emit('match:sync', state);
          socket.emit('sync:state', state);
        } catch (err) {
          if (typeof ack === 'function') {
            ack({ success: false, error: err.message });
          }
        }
      }
    });

    // Leave match room
    socket.on('leave:match', (matchId) => {
      if (matchId) {
        const room = `match:${matchId}`;
        socket.leave(room);
        logger.info(`Socket ${socket.id} left room ${room}`);
      }
    });

    // Join tournament room
    socket.on('join:tournament', (tournamentId) => {
      if (tournamentId) {
        const room = `tournament:${tournamentId}`;
        socket.join(room);
        logger.info(`Socket ${socket.id} joined tournament room ${room}`);
      }
    });

    // Leave tournament room
    socket.on('leave:tournament', (tournamentId) => {
      if (tournamentId) {
        const room = `tournament:${tournamentId}`;
        socket.leave(room);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

// Real-time broadcast helpers
const socketEmitter = {
  // Broadcast timer tick/update every second
  broadcastTimerUpdate: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('timer:update', data);
      io.to(`match:${matchId}`).emit('timer:updated', data);
    }
  },

  // Broadcast timer control events
  broadcastTimerEvent: (matchId, eventName, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit(eventName, data);
      if (eventName === 'timer:started') {
        io.to(`match:${matchId}`).emit('match:started', data);
      }
    }
  },

  // Broadcast match stage change and specific stage events
  broadcastStageChange: (matchId, data) => {
    if (io) {
      const payload = {
        ...data,
        phase: data.phase || data.currentStage,
        currentStage: data.currentStage || data.phase
      };
      io.to(`match:${matchId}`).emit('stage:change', payload);
      io.to(`match:${matchId}`).emit('match:phase_changed', payload);

      if (payload.currentStage === 'Transition Gap') {
        io.to(`match:${matchId}`).emit('stage:first_half_completed', payload);
        io.to(`match:${matchId}`).emit('stage:transition_started', payload);
      } else if (payload.currentStage === 'Half-Time') {
        io.to(`match:${matchId}`).emit('stage:half_time_started', payload);
      } else if (payload.currentStage === 'Second Half') {
        io.to(`match:${matchId}`).emit('stage:second_half_started', payload);
      }
    }
  },

  broadcastMatchPhaseChanged: (matchId, data) => {
    if (io) {
      const payload = {
        ...data,
        phase: data.phase || data.currentStage,
        currentStage: data.currentStage || data.phase
      };
      io.to(`match:${matchId}`).emit('match:phase_changed', payload);
      io.to(`match:${matchId}`).emit('stage:change', payload);
    }
  },

  // Broadcast live scoreboard
  broadcastScoreUpdate: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('score:update', data);
      io.to(`match:${matchId}`).emit('score:updated', data);
      io.emit('score:update', data);
      io.emit('score:updated', data);
    }
  },

  // Broadcast full match state sync
  broadcastMatchSync: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('match:sync', data);
      io.to(`match:${matchId}`).emit('sync:state', data);
      io.emit('match:updated', data);
    }
  },

  // Broadcast goal event
  broadcastGoalEvent: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('goal:scored', data);
      io.to(`match:${matchId}`).emit('goal:recorded', data);
      io.emit('goal:scored', data);
      io.emit('goal:recorded', data);
    }
  },

  // Broadcast goal removed/undone
  broadcastGoalUndone: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('goal:removed', data);
      io.to(`match:${matchId}`).emit('goal:undone', data);
      io.emit('goal:removed', data);
      io.emit('goal:undone', data);
    }
  },

  // Broadcast penalty updates
  broadcastPenaltyUpdate: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('penalty:update', data);
      if (data.outcome === 'Goal') {
        io.to(`match:${matchId}`).emit('penalty:taken', data);
      } else if (data.outcome === 'Saved') {
        io.to(`match:${matchId}`).emit('penalty:saved', data);
      } else if (data.outcome === 'Missed') {
        io.to(`match:${matchId}`).emit('penalty:missed', data);
      }
    }
  },

  // Broadcast shootout completion
  broadcastShootoutCompleted: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('penalty:completed', data);
      io.to(`match:${matchId}`).emit('match:result_declared', data);
    }
  },

  // Broadcast toss completed
  broadcastTossCompleted: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('match:toss-completed', data);
      io.to(`match:${matchId}`).emit('toss:completed', data);
    }
  },

  // Broadcast sudden death kick result
  broadcastSuddenDeathResult: (matchId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('match:sudden-death-result', data);
      io.to(`match:${matchId}`).emit('sudden_death:result', data);
    }
  },

  // Broadcast match completion & final result
  broadcastMatchCompleted: (matchId, tournamentId, data) => {
    if (io) {
      io.to(`match:${matchId}`).emit('match:completed', data);
      io.to(`match:${matchId}`).emit('match:result_declared', data);
      if (tournamentId) {
        io.to(`tournament:${tournamentId}`).emit('match:completed', data);
        io.to(`tournament:${tournamentId}`).emit('match:result_declared', data);
      }
    }
  },

  // Broadcast tournament standings update
  broadcastStandingsUpdate: (tournamentId, data) => {
    if (io) {
      io.to(`tournament:${tournamentId}`).emit('standings:update', data);
      io.emit('leaderboard:update', { tournamentId, standings: data });
      io.emit('teams:update', { tournamentId, standings: data });
    }
  },

  // Broadcast team changes
  broadcastTeamCreated: (data) => {
    if (io) {
      io.emit('team:created', data);
      io.emit('teams:update', data);
    }
  },
  broadcastTeamUpdate: (teamId, data) => {
    if (io) {
      io.emit('team:updated', { teamId, team: data });
      io.emit('teams:update', { teamId, team: data });
    }
  },
  broadcastTeamDeleted: (teamId) => {
    if (io) {
      io.emit('team:deleted', { teamId });
      io.emit('teams:update', { teamId });
    }
  },

  // Broadcast player changes
  broadcastPlayerCreated: (data) => {
    if (io) {
      io.emit('player:created', data);
      io.emit('teams:update', data);
    }
  },
  broadcastPlayerUpdate: (playerId, data) => {
    if (io) {
      io.emit('player:updated', { playerId, player: data });
      io.emit('teams:update', { playerId, player: data });
    }
  },
  broadcastPlayerDeleted: (playerId, teamId) => {
    if (io) {
      io.emit('player:deleted', { playerId, teamId });
      io.emit('teams:update', { playerId, teamId });
    }
  }
};

module.exports = {
  initSocket,
  getIO,
  socketEmitter
};
