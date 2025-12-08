const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const multer = require('multer');
const {
  getUserById
} = require('./db');
const {
  registerUser,
  verifyToken,
  chooseUsername,
  loginUser,
  getUserProfile
} = require('./authService');
const {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MATCH_LENGTH,
  MINIMUM_STAKE,
  STAKE_OPTIONS,
  createGame,
  joinGame,
  toggleReady,
  setDealerStake,
  handleStake,
  handleBet,
  handleShoot,
  handleAllIn,
  leaveGame,
  emitState
} = require('./gameManager');

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

const tmpUploadDir = path.join(__dirname, 'uploads', 'tmp');
fs.mkdirSync(tmpUploadDir, { recursive: true });
const upload = multer({ dest: tmpUploadDir });

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/auth/register', upload.single('identityImage'), async (req, res) => {
  try {
    const user = await registerUser(req.body || {}, req.file);
    res.json({
      status: 'pending',
      message: 'Registration received. Please check your email to continue.',
      user: {
        email: user.email,
        balanceDisplay: user.balanceDisplay
      }
    });
  } catch (err) {
    if (req.file) {
      fs.rm(req.file.path, { force: true }, () => {});
    }
    res.status(err.statusCode || 400).json({ message: err.message || 'Registration failed' });
  }
});

app.get('/api/auth/verify', (req, res) => {
  try {
    const { token } = req.query;
    const info = verifyToken(token);
    res.json({ success: true, ...info });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message || 'Verification failed' });
  }
});

app.post('/api/auth/username', (req, res) => {
  try {
    const { token, username } = req.body || {};
    const user = chooseUsername(token, username);
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message || 'Unable to save username' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await loginUser(req.body || {});
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message || 'Login failed' });
  }
});

app.get('/api/auth/profile', (req, res) => {
  try {
    const { userId } = req.query || {};
    const profile = getUserProfile(userId);
    if (!profile) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ success: true, user: profile });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Unable to load profile' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    matchLength: MATCH_LENGTH,
    minimumStake: MINIMUM_STAKE,
    stakeOptions: STAKE_OPTIONS
  });
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

function ensureSocketUser(socket) {
  if (!socket.data.user) {
    throw new Error('Please choose a username first.');
  }
  return socket.data.user;
}

function safeAction(socket, handler) {
  return async (payload = {}) => {
    try {
      await handler(payload);
    } catch (err) {
      socket.emit('action-error', { message: err.message || 'Action failed' });
    }
  };
}

io.on('connection', (socket) => {
  socket.on(
    'register-user',
    safeAction(socket, async ({ userId }) => {
      if (!userId) {
        throw new Error('Missing user id.');
      }
      const user = getUserById(userId);
      if (!user) {
        throw new Error('User not found. Please log in again.');
      }
      if (user.status !== 'active' || !user.username) {
        throw new Error('Please finish account setup before playing.');
      }
      socket.data.user = {
        id: user.userId || user.id,
        username: user.username,
        balance: user.balance
      };
      socket.emit('user-registered', {
        userId: user.id,
        username: user.username,
        balance: user.balance,
        balanceDisplay: user.balanceDisplay
      });
    })
  );

  socket.on(
    'create-game',
    safeAction(socket, async () => {
      const user = ensureSocketUser(socket);
      const game = createGame(io, socket, {
        id: user.id,
        username: user.username,
        balance: user.balance
      });
      socket.emit('game-created', { code: game.code });
    })
  );

  socket.on(
    'join-game',
    safeAction(socket, async ({ code }) => {
      const user = ensureSocketUser(socket);
      const game = joinGame(io, socket, {
        id: user.id,
        username: user.username,
        balance: user.balance
      }, code);
      socket.emit('game-joined', { code: game.code });
    })
  );

  socket.on(
    'toggle-ready',
    safeAction(socket, async ({ ready }) => {
      ensureSocketUser(socket);
      toggleReady(io, socket.id, !!ready);
    })
  );

  socket.on(
    'dealer-set-stake',
    safeAction(socket, async ({ amount }) => {
      ensureSocketUser(socket);
      setDealerStake(io, socket.id, amount);
    })
  );

  socket.on(
    'player-stake',
    safeAction(socket, async () => {
      ensureSocketUser(socket);
      handleStake(io, socket.id);
    })
  );

  socket.on(
    'player-bet',
    safeAction(socket, async ({ amount }) => {
      ensureSocketUser(socket);
      handleBet(io, socket.id, amount);
    })
  );

  socket.on(
    'player-shoot',
    safeAction(socket, async () => {
      ensureSocketUser(socket);
      handleShoot(io, socket.id);
    })
  );

  socket.on(
    'player-all-in',
    safeAction(socket, async () => {
      ensureSocketUser(socket);
      handleAllIn(io, socket.id);
    })
  );

  socket.on(
    'sign-out',
    safeAction(socket, async () => {
      leaveGame(io, socket.id);
      delete socket.data.user;
      socket.emit('signed-out');
    })
  );

  socket.on(
    'leave-table',
    safeAction(socket, async () => {
      leaveGame(io, socket.id);
    })
  );

  socket.on('disconnect', () => {
    leaveGame(io, socket.id);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Shoot Game server running on http://${HOST}:${PORT}`);
});
