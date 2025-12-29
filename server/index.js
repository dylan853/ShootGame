const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const multer = require('multer');
const {
  getUserById,
  STARTING_BALANCE
} = require('./db');
const {
  registerUser,
  verifyToken,
  chooseUsername,
  loginUser,
  verifyLoginPassword,
  getUserProfile,
  updateSettings
} = require('./authService');
const {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MATCH_LENGTH,
  MINIMUM_STAKE,
  STAKE_OPTIONS,
  createGame,
  joinGame,
  findJoinableDemoGame,
  toggleReady,
  dealerRevealWithMinimum,
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

const BLOCKED_COUNTRIES = new Set([
  'AU',
  'AT',
  'KN',
  'FR',
  'DE',
  'NL',
  'ES',
  'GB',
  'US',
  'KP',
  'IR',
  'MM',
  'CU',
  'SY',
  'RU'
]);
// const BLOCKED_COUNTRIES = new Set([]);
const DEV_ALLOWLIST_IP = '217.155.49.78';

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

const tmpUploadDir = path.join(__dirname, 'uploads', 'tmp');
fs.mkdirSync(tmpUploadDir, { recursive: true });
const upload = multer({ dest: tmpUploadDir });

app.get('/api/geo', async (req, res) => {
  const geo = await lookupGeo(req);
  res.json({ success: true, ...geo });
});

function getClientIp(req) {
  const rawIp =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.ip ||
    '';
  return rawIp.replace('::ffff:', '');
}

async function lookupGeo(req) {
  const ip = getClientIp(req);
  return lookupGeoForIp(ip);
}

async function lookupGeoForIp(ip) {
  if (!ip || ip === DEV_ALLOWLIST_IP) {
    return { ip, country: null, blocked: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { ip, country: null, blocked: false };
    }
    const data = await response.json();
    const country = (data.country || '').toUpperCase();
    const blocked = BLOCKED_COUNTRIES.has(country);
    return { ip, country, blocked };
  } catch (err) {
    return { ip, country: null, blocked: false };
  }
}

function getSocketIp(socket) {
  const rawIp =
    (socket.handshake?.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    socket.handshake?.address ||
    '';
  return rawIp.replace('::ffff:', '');
}

function formatPennies(value) {
  const pennies = Number.isFinite(value) ? value : 0;
  return `£${(pennies / 100).toFixed(2)}`;
}

function ensureGuestIdentity(socket) {
  if (socket.data.user && socket.data.user.isGuest) {
    socket.data.user.balance = STARTING_BALANCE;
    socket.data.user.realBalance = 0;
    socket.data.user.username = '';
    return socket.data.user;
  }
  const guestUser = {
    id: `guest-${uuidv4()}`,
    username: '',
    balance: STARTING_BALANCE,
    realBalance: 0,
    isGuest: true
  };
  socket.data.user = guestUser;
  return guestUser;
}

async function lookupGeoForSocket(socket) {
  const ip = getSocketIp(socket);
  return lookupGeoForIp(ip);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post(
  '/api/auth/register',
  upload.fields([
    { name: 'identityImage', maxCount: 1 },
    { name: 'billImage', maxCount: 1 },
    { name: 'creditCardImage', maxCount: 1 }
  ]),
  async (req, res) => {
  try {
    const { user, verificationToken } = await registerUser(req.body || {}, req.files || {});
    res.json({
      status: 'pending',
      message: 'Registration received. Please check your email to continue.',
      user: {
        email: user.email,
      balanceDisplay: user.balanceDisplay
      },
      verificationToken
    });
  } catch (err) {
    ['identityImage', 'billImage', 'creditCardImage'].forEach((field) => {
      const fileArr = (req.files && req.files[field]) || [];
      fileArr.forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    });
    res.status(err.statusCode || 400).json({ message: err.message || 'Registration failed' });
  }
  }
);

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
    const result = await loginUser(req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message || 'Login failed' });
  }
});

app.post('/api/auth/login/password', async (req, res) => {
  try {
    const { challengeToken, password } = req.body || {};
    const user = await verifyLoginPassword(challengeToken, password);
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message || 'Password verification failed' });
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

app.post('/api/auth/settings', async (req, res) => {
  try {
    const { userId, updates } = req.body || {};
    const user = await updateSettings(userId, updates || {});
    res.json({ success: true, user });
  } catch (err) {
    res.status(err.statusCode || 400).json({ message: err.message || 'Unable to save settings' });
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

// Apply no-cache headers globally to ensure fresh loads
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

const publicDir = path.join(__dirname, 'public');
app.use(
  express.static(publicDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  })
);
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
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
        balance: user.balance,
        realBalance: user.realBalance || 0
      };
      socket.emit('user-registered', {
        userId: user.id,
        username: user.username,
        balance: user.balance,
        balanceDisplay: user.balanceDisplay,
        realBalance: user.realBalance || 0,
        realBalanceDisplay: user.realBalanceDisplay
      });
    })
  );

  socket.on(
    'register-guest',
    safeAction(socket, async () => {
      const guest = ensureGuestIdentity(socket);
      socket.emit('guest-registered', {
        userId: guest.id,
        username: guest.username,
        balance: guest.balance,
        balanceDisplay: formatPennies(guest.balance),
        realBalance: 0,
        realBalanceDisplay: formatPennies(0),
        isGuest: true
      });
    })
  );

  socket.on(
    'create-game',
    safeAction(socket, async ({ tableType } = {}) => {
      const user = ensureSocketUser(socket);
      const walletType = tableType === 'real' ? 'real' : 'balance';
      if (walletType === 'real') {
        const geo = await lookupGeoForSocket(socket);
        if (geo.blocked) {
          throw new Error('Real-money tables are not available in your region.');
        }
      }
      const game = createGame(io, socket, {
        id: user.id,
        username: user.username,
        balance: user.balance,
        realBalance: user.realBalance || 0
      }, { walletType });
      socket.emit('game-created', { code: game.code, walletType });
    })
  );

  socket.on(
    'create-demo-table',
    safeAction(socket, async () => {
      const guest = ensureGuestIdentity(socket);
      const game = createGame(io, socket, guest, { walletType: 'balance', isDemo: true });
      socket.emit('game-created', { code: game.code, walletType: game.walletType, isDemo: true });
    })
  );

  socket.on(
    'join-game',
    safeAction(socket, async ({ code, tableType } = {}) => {
      const user = ensureSocketUser(socket);
      const walletType = tableType === 'real' ? 'real' : 'balance';
      if (walletType === 'real') {
        const geo = await lookupGeoForSocket(socket);
        if (geo.blocked) {
          throw new Error('Real-money tables are not available in your region.');
        }
      }
      const game = joinGame(io, socket, {
        id: user.id,
        username: user.username,
        balance: user.balance,
        realBalance: user.realBalance || 0
      }, code, walletType);
      socket.emit('game-joined', { code: game.code, walletType: game.walletType });
    })
  );

  socket.on(
    'join-demo-table',
    safeAction(socket, async () => {
      const guest = ensureGuestIdentity(socket);
      const openGame = findJoinableDemoGame();
      if (openGame) {
        const game = joinGame(io, socket, guest, openGame.code, 'balance');
        socket.emit('game-joined', { code: game.code, walletType: game.walletType, isDemo: true });
        return;
      }
      const game = createGame(io, socket, guest, { walletType: 'balance', isDemo: true });
      socket.emit('game-created', { code: game.code, walletType: game.walletType, isDemo: true });
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
    'dealer-reveal-minimum',
    safeAction(socket, async () => {
      ensureSocketUser(socket);
      dealerRevealWithMinimum(io, socket.id);
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

