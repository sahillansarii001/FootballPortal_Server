const http = require('http');
const ioClient = require('socket.io-client');
const app = require('../src/app');
const { initSocket, socketEmitter } = require('../src/sockets/socketManager');

describe('Socket.IO Real-Time Suite', () => {
  let server;
  let clientSocket;
  let port;

  beforeAll((done) => {
    server = http.createServer(app);
    initSocket(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    server.close(done);
  });

  it('should connect to socket and join a match room', (done) => {
    clientSocket = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      const testMatchId = '654321654321654321654321';

      clientSocket.emit('join:match', testMatchId);

      clientSocket.on('joined:match', (data) => {
        expect(data.matchId).toBe(testMatchId);
        expect(data.room).toBe(`match:${testMatchId}`);
        done();
      });
    });
  });

  it('should receive broadcasted score updates within match room', (done) => {
    const testMatchId = '654321654321654321654321';

    clientSocket.once('score:update', (data) => {
      expect(data.matchId).toBe(testMatchId);
      expect(data.teamAScore).toBe(2);
      expect(data.teamBScore).toBe(1);
      done();
    });

    socketEmitter.broadcastScoreUpdate(testMatchId, {
      matchId: testMatchId,
      teamAScore: 2,
      teamBScore: 1
    });
  });

  it('should receive broadcasted timer updates within match room', (done) => {
    const testMatchId = '654321654321654321654321';

    clientSocket.once('timer:update', (data) => {
      expect(data.matchId).toBe(testMatchId);
      expect(data.remainingTime).toBe(230);
      expect(data.currentStage).toBe('First Half');
      done();
    });

    socketEmitter.broadcastTimerUpdate(testMatchId, {
      matchId: testMatchId,
      remainingTime: 230,
      currentStage: 'First Half',
      isRunning: true,
      isPaused: false
    });
  });
});
