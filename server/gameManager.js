const { v4: uuidv4 } = require('uuid');
const { applyBalanceDelta, applyRealBalanceDelta, penniesToDisplay } = require('./db');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MATCH_LENGTH = 1;
const MINIMUM_STAKE = 20; // 20p
const STAKE_OPTIONS = [20, 30, 40, 50, 60, 70, 80, 90, 100];
const SHOOT_ANNOUNCE_DELAY = 1000;
const SHOOT_RESULT_DELAY = 2300;
const DEALER_DRAW_DELAY = 2500;
const ROUND_TRANSITION_DELAY = 3000; // Delay before dealer gets new card at start of new round
const KING_CARD_VALUE = 13;
const KING_ANNOUNCEMENT_DELAY = 1200;
const KING_ANNOUNCEMENT_DURATION = 7200;

const games = new Map();
const socketToGame = new Map();

const CARD_ASSET_BASE = '/cards';
const FACE_DOWN_ASSET = `${CARD_ASSET_BASE}/Card_Face_Down.png`;

const CLOCKWISE_SEAT_ORDERS = {
  2: [0, 1],
  3: [0, 2, 1],
  4: [0, 2, 1, 3],
  5: [0, 2, 4, 1, 3],
  6: [0, 2, 4, 1, 3, 5]
};

const FIVE_LETTER_WORDS = [
  'ABOUT', 'ABOVE', 'ACORN', 'ACUTE', 'ADORE', 'AHEAD', 'ALERT', 'ALIVE', 'ALPHA', 'AMBER',
  'AMPLE', 'ANGEL', 'APRIL', 'ARBOR', 'ARGON', 'ARISE', 'ARROW', 'ASCOT', 'ASPEN', 'ATLAS',
  'AUDIO', 'AURIC', 'AVIAN', 'AWAKE', 'AZURE', 'BADGE', 'BASIL', 'BEACH', 'BELLE', 'BERRY',
  'BLADE', 'BLAZE', 'BLEND', 'BLINK', 'BLOOM', 'BOARD', 'BOOST', 'BOUND', 'BRAIN', 'BRAVE',
  'BRISK', 'BROOK', 'BRUSH', 'BUILT', 'BURST', 'CABIN', 'CANDY', 'CANOE', 'CARGO', 'CEDAR',
  'CHALK', 'CHARM', 'CHESS', 'CHIME', 'CIVIC', 'CLOUD', 'COAST', 'CORAL', 'CRANE', 'CREST',
  'CRISP', 'CROWN', 'CRUSH', 'CURVE', 'DAISY', 'DELTA', 'DREAM', 'DRIFT', 'DROVE', 'DRUID',
  'DWELL', 'EAGER', 'EAGLE', 'EARTH', 'ECLAT', 'ELATE', 'ELDER', 'ELFIN', 'EMBER', 'EMOTE',
  'ENACT', 'ENJOY', 'ENTER', 'EPOCH', 'EQUAL', 'EQUIP', 'ESSAY', 'EVERY', 'FAITH', 'FABLE',
  'FAVOR', 'FIBER', 'FIELD', 'FLAIR', 'FLAME', 'FLASH', 'FLINT', 'FLOUR', 'FLUME', 'FOCAL',
  'FOCUS', 'FORGE', 'FRAME', 'FRESH', 'FROND', 'FROST', 'FUROR', 'GAUGE', 'GHOST', 'GIANT',
  'GLADE', 'GLASS', 'GLIDE', 'GLOBE', 'GLORY', 'GLOVE', 'GNOME', 'GRACE', 'GRAIN', 'GRAND',
  'GRASP', 'GREEN', 'GRIND', 'GROVE', 'GUARD', 'GUIDE', 'HABIT', 'HASTE', 'HAVEN', 'HAZEL',
  'HEART', 'HELIX', 'HONEY', 'HORSE', 'HOUSE', 'HUMID', 'HUMOR', 'HURRY', 'ICING', 'IDEAL',
  'IGLOO', 'IMAGE', 'IMBUE', 'IMPEL', 'INNER', 'INPUT', 'IVORY', 'JAZZY', 'JEWEL', 'JOLLY',
  'JUMBO', 'JUNTO', 'JUROR', 'KARMA', 'KHAKI', 'KNACK', 'KNIFE', 'KOALA', 'LABEL', 'LADEN',
  'LASER', 'LATCH', 'LATTE', 'LAYER', 'LEARN', 'LEVEL', 'LIGHT', 'LILAC', 'LIMBO', 'LUMEN',
  'LUNAR', 'MAGIC', 'MAJOR', 'MAPLE', 'MARCH', 'MASON', 'METAL', 'MIGHT', 'MINOR', 'MIRTH',
  'MODEL', 'MONEY', 'MONTH', 'MORAL', 'MOTIF', 'MOUND', 'MOUTH', 'MOVER', 'MUSIC', 'NADIR',
  'NERVE', 'NINJA', 'NOBLE', 'NORTH', 'NOVEL', 'NURSE', 'NYLON', 'OASIS', 'OCEAN', 'OPALS',
  'ODDLY', 'OLIVE', 'OPERA', 'ORBIT', 'ORDER', 'ORION', 'OTHER', 'OZONE', 'PANDA', 'PANEL',
  'PAPER', 'PATCH', 'PATHS', 'PATIO', 'PEACH', 'PENNY', 'PHASE', 'PHONE', 'PILOT', 'PINCH',
  'PIVOT', 'PIXEL', 'PLAIN', 'PLANT', 'PLAZA', 'PLEAT', 'PLUME', 'POKER', 'POLAR', 'PRIDE',
  'PRIME', 'PRINT', 'PRISM', 'PRIZE', 'PROXY', 'PULSE', 'PUNCH', 'PUPIL', 'QUACK', 'QUART',
  'QUEEN', 'QUEUE', 'QUIET', 'QUILT', 'QUOTA', 'QUOTE', 'RADAR', 'RAPID', 'RATIO', 'RAVEN',
  'REACH', 'REACT', 'READY', 'REBEL', 'REFIT', 'REGAL', 'RELIC', 'RENEW', 'RHYME', 'RIDER',
  'RIVER', 'ROBIN', 'ROGUE', 'ROYAL', 'RUMOR', 'RURAL', 'SAFER', 'SAINT', 'SALAD', 'SALSA',
  'SAUCE', 'SCALE', 'SCARF', 'SCENE', 'SCOPE', 'SCOUT', 'SCRAP', 'SEPIA', 'SERVE', 'SHADE',
  'SHAKE', 'SHAPE', 'SHARE', 'SHINE', 'SHORE', 'SHOUT', 'SHRUB', 'SIEGE', 'SIGHT', 'SILKY',
  'SIXTH', 'SKIES', 'SKILL', 'SLATE', 'SLICE', 'SMIRK', 'SNACK', 'SNAKE', 'SNARE', 'SNOWY',
  'SOLAR', 'SOUND', 'SPACE', 'SPARK', 'SPEAK', 'SPEED', 'SPICE', 'SPIKE', 'SPINE', 'SPLIT',
  'SPOKE', 'SPORT', 'SPURT', 'SQUID', 'STACK', 'STAFF', 'STAGE', 'STAIR', 'STAMP', 'STAND',
  'STARK', 'STEAD', 'STEEL', 'STOCK', 'STONE', 'STORM', 'STORY', 'STUDY', 'STYLE', 'SUGAR',
  'SUITE', 'SUNNY', 'SUPER', 'SWIFT', 'SWIRL', 'SWORD', 'TABLE', 'TANGO', 'TAPER', 'TASTE',
  'TEACH', 'TEPID', 'THEME', 'THINK', 'THORN', 'THUMB', 'TIGER', 'TILDE', 'TIMBER', 'TODAY',
  'TOKEN', 'TOWER', 'TRACE', 'TRACK', 'TRAIT', 'TRAIL', 'TRAIN', 'TRIAD', 'TRICK', 'TRIED',
  'TRUCE', 'TRUST', 'TRUTH', 'TULIP', 'TUMOR', 'TUNIC', 'TURBO', 'TWICE', 'TWINE', 'TWIRL',
  'ULTRA', 'UNCLE', 'UNDER', 'UNION', 'UNITE', 'UNITY', 'URBAN', 'USUAL', 'VALOR', 'VALUE',
  'VAPOR', 'VAULT', 'VENOM', 'VIGOR', 'VIRAL', 'VITAL', 'VIVID', 'VOCAL', 'VOGUE', 'VOTER',
  'WACKY', 'WAGON', 'WALTZ', 'WATER', 'WEARY', 'WEDGE', 'WHARF', 'WHEAT', 'WHIRL', 'WIDER',
  'WINDY', 'WISER', 'WITCH', 'WITTY', 'WOMAN', 'WORLD', 'WORTH', 'WRIST', 'XENON', 'YACHT',
  'YEARN', 'YEAST', 'YIELD', 'YOUNG', 'YOUTH', 'ZEBRA', 'ZESTY', 'ZONAL', 'ZONED', 'ZONER'
];

const SUITS = [
  { name: 'Diamonds', icon: '♦', file: 'diamonds' },
  { name: 'Hearts', icon: '♥', file: 'hearts' },
  { name: 'Clubs', icon: '♣', file: 'clubs' },
  { name: 'Spades', icon: '♠', file: 'spades' }
];

const RANKS = [
  { label: 'Ace', short: 'A', value: 1, file: 'ace' },
  { label: '2', short: '2', value: 2, file: '2' },
  { label: '3', short: '3', value: 3, file: '3' },
  { label: '4', short: '4', value: 4, file: '4' },
  { label: '5', short: '5', value: 5, file: '5' },
  { label: '6', short: '6', value: 6, file: '6' },
  { label: '7', short: '7', value: 7, file: '7' },
  { label: '8', short: '8', value: 8, file: '8' },
  { label: '9', short: '9', value: 9, file: '9' },
  { label: '10', short: '10', value: 10, file: '10' },
  { label: 'Jack', short: 'J', value: 11, file: 'jack' },
  { label: 'Queen', short: 'Q', value: 12, file: 'queen' },
  { label: 'King', short: 'K', value: 13, file: 'king' }
];

function generateGameCode() {
  if (!FIVE_LETTER_WORDS.length) {
    throw new Error('No table codes are available.');
  }
  const pool = FIVE_LETTER_WORDS;
  const maxAttempts = pool.length * 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = pool[Math.floor(Math.random() * pool.length)];
    if (!games.has(code)) {
  return code;
    }
  }
  const availableCode = pool.find((word) => !games.has(word));
  if (availableCode) {
    return availableCode;
  }
  throw new Error('All table codes are currently in use. Please close another table first.');
}

function createDeck() {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank) => {
      const assetFile = `${rank.file}_of_${suit.file}.png`;
      deck.push({
        id: uuidv4(),
        suit: suit.name,
        suitIcon: suit.icon,
        rank: rank.label,
        shortRank: rank.short,
        label: `${rank.label} of ${suit.name}`,
        value: rank.value,
        revealed: false,
        image: `${CARD_ASSET_BASE}/${assetFile}`
      });
    });
  });
  return deck;
}

function shuffle(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function roomName(code) {
  return `game:${code}`;
}

function newPlayerState(user, socketId, seat, walletType = 'balance') {
  const usingReal = walletType === 'real';
  const walletBalance = usingReal ? user.realBalance : user.balance;
  return {
    userId: user.id,
    username: user.username,
    socketId,
    seat,
    ready: false,
    isDealer: false,
    balance: walletBalance,
    cards: [],
    turnsTaken: 0,
    gamesWon: 0,
    status: 'waiting',
    roundContribution: 0
  };
}

function addMessage(game, text) {
  const entry = {
    id: uuidv4(),
    text,
    createdAt: Date.now()
  };
  game.messageLog.push(entry);
  if (game.messageLog.length > 30) {
    game.messageLog.shift();
  }
  return entry;
}

function ensurePlayerContext(socketId) {
  const code = socketToGame.get(socketId);
  if (!code) {
    throw new Error('You are not seated at a table yet.');
  }
  const game = games.get(code);
  if (!game) {
    throw new Error('Game no longer exists.');
  }
  const playerIndex = game.players.findIndex((p) => p.socketId === socketId);
  if (playerIndex === -1) {
    throw new Error('Player not found at this table.');
  }
  const player = game.players[playerIndex];
  return { game, player, playerIndex };
}

function getBaseClockwiseOrder(count) {
  if (CLOCKWISE_SEAT_ORDERS[count]) {
    return CLOCKWISE_SEAT_ORDERS[count].filter((seat) => seat < count);
  }
  const order = [];
  for (let i = 0; i < count; i += 1) {
    order.push(i);
  }
  return order;
}

function rotateOrderExcludingSeat(order, seat) {
  if (!order.length) return [];
  const seatIndex = order.indexOf(seat);
  if (seatIndex === -1) {
    return [...order];
  }
  const after = order.slice(seatIndex + 1);
  const before = order.slice(0, seatIndex);
  return after.concat(before);
}

function buildTurnOrder(game) {
  if (game.dealerIndex === null || game.dealerIndex === undefined) {
    return [];
  }
  const count = game.players.length;
  if (count < 2) return [];
  const baseOrder = getBaseClockwiseOrder(count);
  return rotateOrderExcludingSeat(baseOrder, game.dealerIndex);
}

function getNextDealerClockwise(game) {
  // Get the next player clockwise from the current dealer
  // The turn order (excluding dealer) lists players in clockwise order
  // So the first player in the turn order is the next clockwise player
  const turnOrder = buildTurnOrder(game);
  if (turnOrder.length > 0) {
    return turnOrder[0];
  }
  // Fallback: just use the next index if turn order building fails
  const count = game.players.length;
  return (game.dealerIndex + 1) % count;
}

function rotateDealer(io, game) {
  const nextDealerIndex = getNextDealerClockwise(game);
  game.dealerIndex = nextDealerIndex;
  game.lastDealerIndex = nextDealerIndex; // Update for next match
  game.players.forEach((player, idx) => {
    player.isDealer = idx === nextDealerIndex;
    player.status = idx === nextDealerIndex ? 'dealer' : 'waiting';
  });
  // Rebuild turn order with new dealer
  game.turnOrder = buildTurnOrder(game);
  game.turnPointer = 0;
  const dealerUsername = game.players[nextDealerIndex].username;
  addMessage(game, `${dealerUsername} becomes the dealer for the next game.`);
  if (game.turnOrder.length > 0) {
    const turnAnnouncement = game.turnOrder
      .map((idx, position) => `${position + 1}: ${game.players[idx].username}`)
      .join(' | ');
    addMessage(game, `Turn order (clockwise) → ${turnAnnouncement}`);
  }
  emitState(io, game);
  // Emit dealer announcement for display on screen
  const room = roomName(game.code);
  io.to(room).emit('dealer-selected', { username: dealerUsername });
}

function applyWalletDelta(game, player, deltaPennies) {
  const nextBalance = player.balance + deltaPennies;
  if (nextBalance < 0) {
    throw new Error('Insufficient balance for this action.');
  }
  if (game.walletType === 'real') {
    const updated = applyRealBalanceDelta(player.userId, deltaPennies);
    player.balance = updated.real_balance;
    return updated;
  }
  const updated = applyBalanceDelta(player.userId, deltaPennies);
  player.balance = updated.balance;
  return updated;
}

function resetPlayersForGame(game) {
  game.players.forEach((player, index) => {
    player.isDealer = index === game.dealerIndex;
    player.cards = [];
    player.turnsTaken = 0;
    player.status = player.isDealer ? 'dealer' : 'waiting';
    player.roundContribution = 0;
  });
}

function trackContribution(player, amount) {
  player.roundContribution = (player.roundContribution || 0) + amount;
}

function refundCurrentGame(game) {
  if (!Array.isArray(game.players)) return;
  if (game.pot <= 0) return;
  game.players.forEach((player) => {
    if (player.roundContribution > 0) {
      applyWalletDelta(game, player, player.roundContribution);
      player.roundContribution = 0;
    }
  });
  game.pot = 0;
  addMessage(game, 'Game refunded due to player departure.');
}

function dealCards(game) {
  const deck = shuffle(createDeck());
  game.deck = deck;
  game.dealerCard = deck.pop();
  game.dealerCard.revealed = false;
  game.players.forEach((player) => {
    if (!player.isDealer) {
      player.cards = [deck.pop(), deck.pop(), deck.pop()].map((card) => ({
        ...card,
        revealed: false
      }));
    } else {
      player.cards = [];
    }
  });
}

function dealNewRoundCards(game) {
  // Discard all played cards and deal 3 new face-down cards to each non-dealer player
  if (!Array.isArray(game.deck)) {
    // If deck is empty or doesn't exist, create a new shuffled deck
    game.deck = shuffle(createDeck());
  }
  // Ensure we have enough cards
  const cardsNeeded = (game.players.length - 1) * 3; // 3 cards per non-dealer player
  if (game.deck.length < cardsNeeded) {
    // If not enough cards, create a new deck
    game.deck = shuffle(createDeck());
  }
  game.players.forEach((player) => {
    if (!player.isDealer) {
      // Discard old cards and deal 3 new face-down cards
      player.cards = [];
      for (let i = 0; i < 3; i++) {
        if (game.deck.length === 0) {
          game.deck = shuffle(createDeck());
        }
        const card = game.deck.pop();
        if (card) {
          player.cards.push({
            ...card,
            revealed: false
          });
        }
      }
    }
  });
  addMessage(game, 'New round! All players receive 3 new face-down cards.');
}

function cycleDealerCard(game) {
  if (!game.dealerCard) return;
  if (!Array.isArray(game.deck)) {
    game.deck = [];
  }
  // place current dealer card at bottom of the deck
  game.deck.unshift({
    ...game.dealerCard,
    revealed: false
  });
  if (game.deck.length === 0) {
    game.deck = shuffle(createDeck());
  }
  let nextCard = game.deck.pop();
  if (!nextCard) {
    game.deck = shuffle(createDeck());
    nextCard = game.deck.pop();
  }
  if (!nextCard) return;
  nextCard.revealed = false;
  game.dealerCard = nextCard;
  addMessage(game, 'Dealer draws a new face-down card.');
}

function collectMinimumBetFromPlayers(game) {
  const stake = MINIMUM_STAKE;
  if (!Array.isArray(game.players) || game.players.length <= 1) {
    return { collected: 0, contributors: 0, shortfalls: [] };
  }
  let collected = 0;
  let contributors = 0;
  const shortfalls = [];
  game.players.forEach((player) => {
    if (player.isDealer) return;
    const amount = Math.min(stake, player.balance);
    if (amount <= 0) {
      shortfalls.push(player.username);
      return;
    }
    applyWalletDelta(game, player, -amount);
    trackContribution(player, amount);
    collected += amount;
    contributors += 1;
    if (amount < stake) {
      shortfalls.push(player.username);
    }
  });
  if (collected > 0) {
    game.pot += collected;
  }
  return { collected, contributors, shortfalls };
}

function skipRoundAfterDealerKing(io, game) {
  const room = roomName(game.code);
  const current = Number.isFinite(game.currentRound) ? game.currentRound : 1;
  game.currentRound = current + 1;
  game.turnsThisRound = 0;
  emitState(io, game);
  schedule(game, () => {
    if (!games.has(game.code)) return;
    cycleDealerCard(game);
    dealNewRoundCards(game);
    emitState(io, game);
    game.kingSkipInProgress = false;
    maybeHandleDealerKing(io, game);
  }, ROUND_TRANSITION_DELAY);
}

function maybeHandleDealerKing(io, game) {
  if (!game || !game.dealerCard) {
    if (game) game.kingSkipInProgress = false;
    return false;
  }
  if (!game.dealerCard.revealed) {
    game.kingSkipInProgress = false;
    return false;
  }
  if (game.dealerCard.value !== KING_CARD_VALUE) {
    game.kingSkipInProgress = false;
    return false;
  }
  if (game.state !== 'awaiting-stake' && game.state !== 'active') {
    return false;
  }
  if (game.kingSkipInProgress) {
    return true;
  }
  game.kingSkipInProgress = true;
  const isRedKing = ['hearts', 'diamonds'].includes((game.dealerCard.suit || '').toLowerCase());
  let subtitle = 'Minimum bet taken from each player.';

  if (isRedKing) {
    subtitle = "It's red your lucky!";
    addMessage(game, 'Dealer reveals a red King. No minimum bet taken.');
    emitState(io, game);
  } else {
    const { collected, contributors, shortfalls } = collectMinimumBetFromPlayers(game);
    const perPlayerDisplay = penniesToDisplay(MINIMUM_STAKE);
    const collectedDisplay = penniesToDisplay(collected);
    const shortfallNote = shortfalls.length
      ? ` (${shortfalls.join(', ')} could not cover full amount)`
      : '';
    addMessage(
      game,
      `Dealer reveals a King. Minimum bet of ${perPlayerDisplay} taken from ${contributors} players. ${collectedDisplay} added to pot.${shortfallNote}`
    );
    emitState(io, game);
  }

  const room = roomName(game.code);
  schedule(game, () => {
    if (!games.has(game.code)) return;
    io.to(room).emit('table-announcement', {
      title: 'Dealer got a king!',
      subtitle,
      duration: KING_ANNOUNCEMENT_DURATION
    });
  }, KING_ANNOUNCEMENT_DELAY);
  skipRoundAfterDealerKing(io, game);
  return true;
}

function revealDealerCard(game) {
  if (game && game.dealerCard) {
    game.dealerCard.revealed = true;
  }
}
function getPlayersClockwiseOrder(game, startSeat = 0) {
  const count = game.players.length;
  const baseOrder = getBaseClockwiseOrder(count);
  if (!baseOrder.length) return [];
  const startIndex = baseOrder.indexOf(startSeat);
  if (startIndex === -1) {
    return baseOrder;
  }
  return baseOrder.slice(startIndex).concat(baseOrder.slice(0, startIndex));
}

function runDealerSelection(io, game) {
  clearPending(game);
  const deck = shuffle(createDeck());
  game.dealerDraws = [];
  game.state = 'dealer-selection';
  const room = roomName(game.code);
  
  // Get players in clockwise order starting from seat 0
  const clockwiseSeats = getPlayersClockwiseOrder(game, 0);
  const playersInOrder = clockwiseSeats.map(seat => 
    game.players.find(p => p.seat === seat)
  ).filter(p => p !== undefined);
  
  playersInOrder.forEach((player, idx) => {
    schedule(game, () => {
      if (!games.has(game.code)) return;
      const card = deck.pop();
      if (!card) return;
      const entry = {
        playerId: player.userId,
        username: player.username,
        card: card.label,
        cardImage: card.image,
        value: card.value,
        seat: player.seat,
        order: idx
      };
      game.dealerDraws.push(entry);
      addMessage(game, `${player.username} draws ${card.label} for dealer selection.`);
      emitState(io, game);
      if (idx === playersInOrder.length - 1) {
        schedule(game, () => finalizeDealerSelection(io, game), DEALER_DRAW_DELAY);
      }
    }, idx * DEALER_DRAW_DELAY);
  });
}

function finalizeDealerSelection(io, game) {
  if (!game.dealerDraws || game.dealerDraws.length === 0) {
    addMessage(game, 'Dealer selection failed. Restarting selection.');
    runDealerSelection(io, game);
    return;
  }
  const sortedDraws = [...game.dealerDraws].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return a.seat - b.seat;
  });
  const best = sortedDraws[0];
  const dealerIdx = game.players.findIndex((p) => p.userId === best.playerId);
  game.dealerIndex = dealerIdx;
  game.lastDealerIndex = dealerIdx; // Save for next match
  game.players.forEach((player, idx) => {
    player.isDealer = idx === dealerIdx;
    player.status = idx === dealerIdx ? 'dealer' : 'waiting';
  });
  // Build clockwise turn order (excluding dealer)
  game.turnOrder = buildTurnOrder(game);
  game.turnPointer = 0;
  game.currentPlayerIndex = null;
  const dealerUsername = game.players[dealerIdx].username;
  addMessage(game, `${dealerUsername} becomes the dealer with ${best.card}.`);
  if (game.turnOrder.length > 0) {
    const turnAnnouncement = game.turnOrder
      .map((idx, position) => `${position + 1}: ${game.players[idx].username}`)
      .join(' | ');
    addMessage(game, `Turn order (clockwise) → ${turnAnnouncement}`);
  }
  emitState(io, game);
  // Emit dealer announcement
  const room = roomName(game.code);
  io.to(room).emit('dealer-selected', { username: dealerUsername });
  schedule(game, () => beginNextGame(io, game), DEALER_DRAW_DELAY);
}

function schedule(game, fn, delay) {
  const timeout = setTimeout(() => {
    game.pendingTimeouts = game.pendingTimeouts.filter((t) => t !== timeout);
    fn();
  }, delay);
  game.pendingTimeouts.push(timeout);
}

function clearPending(game) {
  if (!game.pendingTimeouts) return;
  game.pendingTimeouts.forEach((t) => clearTimeout(t));
  game.pendingTimeouts = [];
}

function sanitizeGame(game) {
  return {
    code: game.code,
    walletType: game.walletType || 'balance',
    state: game.state,
    minPlayers: MIN_PLAYERS,
    stakeOptions: STAKE_OPTIONS,
    minimumStake: MINIMUM_STAKE,
    currentStake: game.currentStake,
    pot: game.pot,
    potDisplay: penniesToDisplay(game.pot),
    deckCount: Array.isArray(game.deck) ? game.deck.length : 0,
    dealerCard: game.dealerCard ? {
      revealed: !!game.dealerCard.revealed,
      label: game.dealerCard.revealed ? game.dealerCard.label : null,
      suit: game.dealerCard.revealed ? game.dealerCard.suit : null,
      icon: game.dealerCard.revealed ? game.dealerCard.suitIcon : null,
      value: game.dealerCard.revealed ? game.dealerCard.value : null,
      image: game.dealerCard.revealed ? game.dealerCard.image : FACE_DOWN_ASSET
    } : null,
    waitingForStake: game.state === 'awaiting-stake',
    gamesCompleted: game.gamesCompleted,
    matchLength: MATCH_LENGTH,
    dealerIndex: game.dealerIndex,
    turnOrder: game.turnOrder,
    currentPlayerIndex: game.currentPlayerIndex,
    messageLog: [...game.messageLog],
    dealId: game.dealId || 0,
    currentRound: game.currentRound || 1,
    assets: {
      faceDownCard: FACE_DOWN_ASSET
    },
    dealerDraws: (game.dealerDraws || []).map((entry) => ({
      playerId: entry.playerId,
      username: entry.username,
      card: entry.card,
      cardImage: entry.cardImage,
      order: entry.order ?? 0
    })),
    players: game.players.map((player, idx) => ({
      userId: player.userId,
      username: player.username,
      seat: player.seat,
      ready: player.ready,
      isDealer: player.isDealer,
      balance: player.balance,
      balanceDisplay: penniesToDisplay(player.balance),
      status: player.status,
      gamesWon: player.gamesWon,
      turnsTaken: player.turnsTaken,
      cards: player.cards.map((card) => ({
        id: card.id,
        label: card.revealed ? card.label : '*******',
        revealed: card.revealed,
        image: card.image
      })),
      cardsRemaining: player.cards.filter((card) => !card.revealed).length,
      isCurrentTurn: idx === game.currentPlayerIndex
    }))
  };
}

function emitState(io, game) {
  io.to(roomName(game.code)).emit('game-state', sanitizeGame(game));
}

function createGame(io, socket, user, { walletType = 'balance' } = {}) {
  if (socketToGame.has(socket.id)) {
    throw new Error('You are already seated at a table.');
  }
  const code = generateGameCode();
  const player = newPlayerState(user, socket.id, 0, walletType);
  const game = {
    code,
    hostId: socket.id,
    createdAt: Date.now(),
    walletType,
    players: [player],
    dealerIndex: null,
    lastDealerIndex: null,
    pot: 0,
    messageLog: [],
    currentStake: null,
    state: 'lobby',
    gamesCompleted: 0,
    dealId: 0,
    pendingTimeouts: [],
    deck: [],
    dealerCard: null,
    turnOrder: [],
    currentPlayerIndex: null,
    turnsThisRound: 0,
    dealerDraws: [],
    kingSkipInProgress: false
  };
  games.set(code, game);
  socketToGame.set(socket.id, code);
  socket.join(roomName(code));
  addMessage(game, `${player.username} opened a new table.`);
  emitState(io, game);
  return game;
}

function joinGame(io, socket, user, code, requestedWalletType = 'balance') {
  if (socketToGame.has(socket.id)) {
    throw new Error('You are already in a game.');
  }
  const formattedCode = (code || '').trim().toUpperCase();
  const game = games.get(formattedCode);
  if (!game) {
    throw new Error('Game code not found.');
  }
  if (game.walletType && game.walletType !== requestedWalletType) {
    throw new Error('This table uses a different balance type.');
  }
  if (game.players.length >= MAX_PLAYERS) {
    throw new Error(`This table already has ${MAX_PLAYERS} players.`);
  }
  if (game.state !== 'lobby') {
    throw new Error('Game already in progress.');
  }
  const seat = game.players.length;
  const player = newPlayerState(user, socket.id, seat, game.walletType);
  game.players.push(player);
  socketToGame.set(socket.id, game.code);
  socket.join(roomName(game.code));
  addMessage(game, `${player.username} joined the table.`);
  emitState(io, game);
  return game;
}

function toggleReady(io, socketId, ready) {
  const { game, player } = ensurePlayerContext(socketId);
  if (game.state !== 'lobby') {
    throw new Error('Ready status can only change while in the lobby.');
  }
  if (ready && player.balance <= 0) {
    throw new Error('Insufficient balance to ready up for this table.');
  }
  player.ready = ready;
  player.status = ready ? 'ready' : 'waiting';
  addMessage(game, `${player.username} is ${ready ? '' : 'not '}ready.`);
  emitState(io, game);
  const everyoneReady = game.players.length >= MIN_PLAYERS && game.players.length <= MAX_PLAYERS && game.players.every((p) => p.ready);
  if (everyoneReady) {
    startMatch(io, game);
  }
}

function startMatch(io, game) {
  if (game.players.length < MIN_PLAYERS) {
    addMessage(game, `Need at least ${MIN_PLAYERS} players to start.`);
    emitState(io, game);
    return;
  }
  if (game.players.length > MAX_PLAYERS) {
    addMessage(game, `Maximum ${MAX_PLAYERS} players allowed.`);
    emitState(io, game);
    return;
  }
  game.gamesCompleted = 0;
  game.turnOrder = [];
  game.currentPlayerIndex = null;
  game.turnsThisRound = 0;
  game.dealId = 0;
  game.currentRound = 0;
  game.dealerDraws = [];
  game.deck = [];
  game.dealerCard = null;
  game.players.forEach((player, idx) => {
    player.gamesWon = 0;
    player.seat = idx;
    player.ready = false;
    player.status = 'waiting';
    player.isDealer = false;
    player.roundContribution = 0;
  });
  
  // Check if there was a previous dealer (for subsequent matches)
  if (game.lastDealerIndex !== null && game.lastDealerIndex !== undefined) {
    // Rotate dealer clockwise from the last dealer
    game.dealerIndex = game.lastDealerIndex;
    rotateDealer(io, game);
    // Small delay before starting first game to show dealer rotation
    schedule(game, () => beginNextGame(io, game), 500);
  } else {
    // First match - do dealer selection
    game.dealerIndex = null;
    addMessage(game, 'All players ready. Selecting the dealer...');
    game.state = 'dealer-selection';
    emitState(io, game);
    runDealerSelection(io, game);
  }
}

function beginNextGame(io, game) {
  clearPending(game);
  game.kingSkipInProgress = false;
  game.dealId = (game.dealId || 0) + 1;
  game.currentRound = 1; // Start at round 1
  resetPlayersForGame(game);
  dealCards(game);
  if (!game.turnOrder || game.turnOrder.length === 0) {
  game.turnOrder = buildTurnOrder(game);
  }
  game.turnPointer = 0;
  game.turnsThisRound = 0;
  if (!game.turnOrder || !game.turnOrder.length) {
    addMessage(game, 'Not enough players to continue.');
    game.state = 'lobby';
    emitState(io, game);
    return;
  }
  game.currentPlayerIndex = game.turnOrder[0];
  game.currentStake = null;
  game.pot = 0;
  game.state = 'awaiting-stake';
  addMessage(game, `Game ${game.gamesCompleted + 1} is ready. Dealer must choose a stake.`);
  emitState(io, game);
  maybeHandleDealerKing(io, game);
}

function setDealerStake(io, socketId, amount) {
  const { game, player } = ensurePlayerContext(socketId);
  if (!player.isDealer) {
    throw new Error('Only the dealer can set the stake.');
  }
  if (game.state !== 'awaiting-stake') {
    throw new Error('Stake has already been set.');
  }
  if (!game.dealerCard) {
    throw new Error('Dealer card not ready.');
  }
  const wasFaceDown = !game.dealerCard.revealed;
  const parsed = Number(amount);
  if (!STAKE_OPTIONS.includes(parsed)) {
    throw new Error('Invalid stake amount.');
  }
  if (player.balance < parsed) {
    throw new Error('Insufficient balance to cover the stake.');
  }
  applyWalletDelta(game, player, -parsed);
  game.pot += parsed;
  trackContribution(player, parsed);
  game.currentStake = parsed;
  game.state = 'active';
  if (wasFaceDown) {
    addMessage(game, `${player.username} keeps the dealer card face down and sets the stake at ${penniesToDisplay(parsed)}.`);
  } else {
  addMessage(game, `${player.username} sets the stake at ${penniesToDisplay(parsed)} and feeds the pot.`);
  }
  emitState(io, game);
}

function dealerRevealWithMinimum(io, socketId) {
  const { game, player } = ensurePlayerContext(socketId);
  if (!player.isDealer) {
    throw new Error('Only the dealer can reveal the dealer card.');
  }
  if (game.state !== 'awaiting-stake') {
    throw new Error('Stake has already been set.');
  }
  if (!game.dealerCard) {
    throw new Error('Dealer card not ready.');
  }
  const stake = MINIMUM_STAKE;
  if (player.balance < stake) {
    throw new Error('Insufficient balance to cover the stake.');
  }
  revealDealerCard(game);
  applyWalletDelta(game, player, -stake);
  game.pot += stake;
  trackContribution(player, stake);
  game.currentStake = stake;
  game.state = 'active';
  addMessage(game, `${player.username} flips the dealer card and places the minimum stake of ${penniesToDisplay(stake)}.`);
  emitState(io, game);
  maybeHandleDealerKing(io, game);
}

function ensureTurn(game, player) {
  if (game.state !== 'active') {
    throw new Error('Action not allowed right now.');
  }
  if (game.players[game.currentPlayerIndex].userId !== player.userId) {
    throw new Error("It's not your turn.");
  }
}

function handleStake(io, socketId) {
  const { game, player } = ensurePlayerContext(socketId);
  ensureTurn(game, player);
  if (!Array.isArray(player.cards) || player.cards.length === 0) {
    throw new Error('You do not have any cards.');
  }
  if (!game.dealerCard) {
    throw new Error('Dealer card has not been revealed yet.');
  }
  let kingHandled = false;
  if (!game.dealerCard.revealed) {
    revealDealerCard(game);
    kingHandled = maybeHandleDealerKing(io, game);
    if (kingHandled) {
      return;
    }
  }
  if (player.balance < MINIMUM_STAKE) {
    throw new Error('Insufficient balance for the minimum stake.');
  }
  const stake = MINIMUM_STAKE;
  applyWalletDelta(game, player, -stake);
  game.pot += stake;
  trackContribution(player, stake);
  game.state = 'resolving-stake';
  addMessage(game, `${player.username} places minimum stake of ${penniesToDisplay(stake)}.`);
  const room = roomName(game.code);
  io.to(room).emit('stake-announcement', {
    playerId: player.userId,
    username: player.username,
    amount: stake,
    mode: 'stake'
  });
  schedule(game, () => {
    if (!games.has(game.code)) {
      return;
    }
    // Reveal all cards
    const revealedCards = [];
    player.cards.forEach((card, index) => {
      if (!card.revealed) {
        card.revealed = true;
        revealedCards.push({
          cardIndex: index,
          card: card.label,
          cardImage: card.image,
          suit: card.suit,
          value: card.value
        });
      }
    });
    
    io.to(room).emit('stake-flip', {
      playerId: player.userId,
      username: player.username,
      mode: 'stake',
      cards: revealedCards
    });
    
    // Check if any card wins
    const dealerCard = game.dealerCard;
    const winningCards = revealedCards.filter(
      (c) => c.suit === dealerCard.suit && c.value > dealerCard.value
    );
    const success = winningCards.length > 0;
    const bestCard = success
      ? winningCards.sort((a, b) => b.value - a.value)[0]
      : revealedCards.sort((a, b) => b.value - a.value)[0];
    
    schedule(game, () => {
      if (!games.has(game.code)) return;
      if (success) {
        // Refund the stake then pay up to an equal amount as winnings
        let payout = 0;
        if (game.pot >= stake) {
          game.pot -= stake;
          applyWalletDelta(game, player, stake);
          payout += stake;
}
        const bonus = Math.min(stake, game.pot);
        if (bonus > 0) {
          game.pot -= bonus;
          applyWalletDelta(game, player, bonus);
          payout += bonus;
        }
        addMessage(
          game,
          `${player.username}'s stake wins with ${bestCard.card}! They collect ${penniesToDisplay(payout)} and play continues.`
        );
        io.to(room).emit('stake-resolution', {
          winner: player.username,
          card: bestCard.card,
          winnings: penniesToDisplay(payout),
          mode: 'stake',
          continues: true
        });
      } else {
        const cardLabels = revealedCards.map((c) => c.card).join(', ');
        addMessage(game, `${player.username}'s stake (${cardLabels}) misses. Next player.`);
        io.to(room).emit('stake-resolution', {
          winner: null,
          card: bestCard.card,
          winnings: penniesToDisplay(0),
          mode: 'stake',
          continues: true
        });
      }
      game.state = 'active';
      completeTurn(io, game);
    }, SHOOT_RESULT_DELAY);
  }, SHOOT_ANNOUNCE_DELAY);
}

function handleBet(io, socketId, amount) {
  const { game, player } = ensurePlayerContext(socketId);
  ensureTurn(game, player);
  if (!Array.isArray(player.cards) || player.cards.length === 0) {
    throw new Error('You do not have any cards.');
  }
  if (!game.dealerCard) {
    throw new Error('Dealer card has not been revealed yet.');
  }
  if (game.dealerCard && !game.dealerCard.revealed) {
    revealDealerCard(game);
    const handled = maybeHandleDealerKing(io, game);
    if (handled) return;
  }
  const parsed = Number(amount);
  const minBet = MINIMUM_STAKE + 10; // 10p more than minimum stake
  const shootCost = Math.max(game.pot, MINIMUM_STAKE);
  const maxBet = Math.max(shootCost - 10, minBet); // 10p less than shoot cost
  if (isNaN(parsed) || parsed < minBet) {
    throw new Error(`Bet must be at least ${penniesToDisplay(minBet)}.`);
  }
  if (parsed > maxBet) {
    throw new Error(`Bet cannot exceed ${penniesToDisplay(maxBet)} (10p less than shoot cost).`);
  }
  if (parsed % 10 !== 0) {
    throw new Error('Bet must be divisible by 10p.');
  }
  if (player.balance < parsed) {
    throw new Error(`Insufficient balance for bet of ${penniesToDisplay(parsed)}.`);
  }
  const stake = parsed;
  applyWalletDelta(game, player, -stake);
  game.pot += stake;
  trackContribution(player, stake);
  game.state = 'resolving-bet';
  addMessage(game, `${player.username} bets ${penniesToDisplay(stake)}.`);
  const room = roomName(game.code);
  io.to(room).emit('bet-announcement', {
    playerId: player.userId,
    username: player.username,
    amount: stake,
    mode: 'bet'
  });
  schedule(game, () => {
    if (!games.has(game.code)) {
      return;
    }
    // Reveal all cards
    const revealedCards = [];
    player.cards.forEach((card, index) => {
      if (!card.revealed) {
        card.revealed = true;
        revealedCards.push({
          cardIndex: index,
          card: card.label,
          cardImage: card.image,
          suit: card.suit,
          value: card.value
        });
      }
    });
    
    io.to(room).emit('bet-flip', {
      playerId: player.userId,
      username: player.username,
      mode: 'bet',
      cards: revealedCards
    });
    
    // Check if any card wins
    if (revealedCards.length === 0) {
      // No cards to reveal - this shouldn't happen but guard against it
      addMessage(game, `${player.username}'s bet failed - no cards to reveal.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    const dealerCard = game.dealerCard;
    if (!dealerCard) {
      addMessage(game, `${player.username}'s bet failed - dealer card missing.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    const winningCards = revealedCards.filter(
      (c) => c.suit === dealerCard.suit && c.value > dealerCard.value
    );
    const success = winningCards.length > 0;
    const bestCard = success
      ? winningCards.sort((a, b) => b.value - a.value)[0]
      : revealedCards.sort((a, b) => b.value - a.value)[0];
    
    if (!bestCard) {
      // Fallback if bestCard is somehow undefined
      addMessage(game, `${player.username}'s bet failed - error processing cards.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    
    schedule(game, () => {
      if (!games.has(game.code)) return;
      if (success) {
        // Refund the stake then pay up to an equal amount as winnings
        let payout = 0;
        if (game.pot >= stake) {
          game.pot -= stake;
          applyWalletDelta(game, player, stake);
          payout += stake;
        }
        const bonus = Math.min(stake, game.pot);
        if (bonus > 0) {
          game.pot -= bonus;
          applyWalletDelta(game, player, bonus);
          payout += bonus;
        }
        addMessage(
          game,
          `${player.username}'s bet wins with ${bestCard.card}! They collect ${penniesToDisplay(payout)} and play continues.`
        );
        io.to(room).emit('bet-resolution', {
          winner: player.username,
          card: bestCard.card,
          winnings: penniesToDisplay(payout),
          mode: 'bet',
          continues: true
        });
      } else {
        const cardLabels = revealedCards.map((c) => c.card).join(', ');
        addMessage(game, `${player.username}'s bet (${cardLabels}) misses. Next player.`);
        io.to(room).emit('bet-resolution', {
          winner: null,
          card: bestCard.card,
          winnings: penniesToDisplay(0),
          mode: 'bet',
          continues: true
        });
      }
      game.state = 'active';
      completeTurn(io, game);
    }, SHOOT_RESULT_DELAY);
  }, SHOOT_ANNOUNCE_DELAY);
}

function handleShoot(io, socketId) {
  const { game, player, playerIndex } = ensurePlayerContext(socketId);
  ensureTurn(game, player);
  if (!Array.isArray(player.cards) || player.cards.length === 0) {
    throw new Error('No cards available to flip.');
  }
  if (!game.dealerCard) {
    throw new Error('Dealer card has not been revealed yet.');
  }
  if (game.dealerCard && !game.dealerCard.revealed) {
    revealDealerCard(game);
    const handled = maybeHandleDealerKing(io, game);
    if (handled) return;
  }
  const unrevealedCards = player.cards.filter((c) => !c.revealed);
  if (unrevealedCards.length === 0) {
    throw new Error('All cards already revealed.');
  }
  const shootCost = Math.max(game.pot, MINIMUM_STAKE);
  if (player.balance < shootCost) {
    throw new Error('Insufficient balance to shoot. Consider going all in.');
  }
  applyWalletDelta(game, player, -shootCost);
  game.pot += shootCost;
  trackContribution(player, shootCost);
  game.state = 'resolving-shoot';
  addMessage(game, `${player.username} yells SHOOT and risks ${penniesToDisplay(shootCost)}!`);
  const room = roomName(game.code);
  io.to(room).emit('shoot-announcement', {
    playerId: player.userId,
    username: player.username,
    potDisplay: penniesToDisplay(game.pot),
    mode: 'shoot'
  });
  schedule(game, () => {
    if (!games.has(game.code)) {
      return;
    }
    // Reveal all cards
    const revealedCards = [];
    player.cards.forEach((card, index) => {
      if (!card.revealed) {
    card.revealed = true;
        revealedCards.push({
          cardIndex: index,
          card: card.label,
          cardImage: card.image,
          suit: card.suit,
          value: card.value
        });
      }
    });
    
    io.to(room).emit('shoot-flip', {
      playerId: player.userId,
      username: player.username,
      mode: 'shoot',
      cards: revealedCards
    });
    
    // Check if any card wins
    if (revealedCards.length === 0) {
      // No cards to reveal - this shouldn't happen but guard against it
      addMessage(game, `${player.username}'s shoot failed - no cards to reveal.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    const dealerCard = game.dealerCard;
    if (!dealerCard) {
      addMessage(game, `${player.username}'s shoot failed - dealer card missing.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    const winningCards = revealedCards.filter(
      (c) => c.suit === dealerCard.suit && c.value > dealerCard.value
    );
    const success = winningCards.length > 0;
    const bestCard = success
      ? winningCards.sort((a, b) => b.value - a.value)[0]
      : revealedCards.sort((a, b) => b.value - a.value)[0];
    
    if (!bestCard) {
      // Fallback if bestCard is somehow undefined
      addMessage(game, `${player.username}'s shoot failed - error processing cards.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    
    schedule(game, () => {
      if (!games.has(game.code)) return;
      if (success) {
        const winnings = game.pot;
        addMessage(game, `${player.username} wins ${penniesToDisplay(winnings)} with ${bestCard.card}!`);
        io.to(room).emit('shoot-resolution', {
          winner: player.username,
          card: bestCard.card,
          winnings: penniesToDisplay(winnings),
          mode: 'shoot',
          continues: false
        });
        endGame(io, game, playerIndex);
      } else {
        const cardLabels = revealedCards.map((c) => c.card).join(', ');
        addMessage(game, `${player.username}'s cards (${cardLabels}) miss. Play continues.`);
        io.to(room).emit('shoot-resolution', {
          winner: null,
          card: bestCard.card,
          winnings: penniesToDisplay(0),
          mode: 'shoot',
          continues: true
        });
        game.state = 'active';
        completeTurn(io, game);
      }
    }, SHOOT_RESULT_DELAY);
  }, SHOOT_ANNOUNCE_DELAY);
}

function handleAllIn(io, socketId) {
  const { game, player } = ensurePlayerContext(socketId);
  ensureTurn(game, player);
  if (!Array.isArray(player.cards) || player.cards.length === 0) {
    throw new Error('No cards available to flip.');
  }
  if (!game.dealerCard) {
    throw new Error('Dealer card has not been revealed yet.');
  }
  if (game.dealerCard && !game.dealerCard.revealed) {
    revealDealerCard(game);
    const handled = maybeHandleDealerKing(io, game);
    if (handled) return;
  }
  const unrevealedCards = player.cards.filter((c) => !c.revealed);
  if (unrevealedCards.length === 0) {
    throw new Error('All cards already revealed.');
  }
  const stake = player.balance;
  if (stake <= 0) {
    throw new Error('No balance available to go all in.');
  }
  applyWalletDelta(game, player, -stake);
  game.pot += stake;
  trackContribution(player, stake);
  game.state = 'resolving-allin';
  addMessage(game, `${player.username} GOES ALL IN with ${penniesToDisplay(stake)}!`);
  const room = roomName(game.code);
  io.to(room).emit('shoot-announcement', {
    playerId: player.userId,
    username: player.username,
    potDisplay: penniesToDisplay(game.pot),
    mode: 'all-in',
    amountDisplay: penniesToDisplay(stake)
  });
  schedule(game, () => {
    if (!games.has(game.code)) {
      return;
    }
    // Reveal all cards
    const revealedCards = [];
    player.cards.forEach((card, index) => {
      if (!card.revealed) {
        card.revealed = true;
        revealedCards.push({
          cardIndex: index,
          card: card.label,
          cardImage: card.image,
          suit: card.suit,
          value: card.value
        });
      }
    });
    
    io.to(room).emit('shoot-flip', {
      playerId: player.userId,
      username: player.username,
      mode: 'all-in',
      cards: revealedCards
    });
    
    // Check if any card wins
    if (revealedCards.length === 0) {
      // No cards to reveal - this shouldn't happen but guard against it
      addMessage(game, `${player.username}'s all-in failed - no cards to reveal.`);
        game.state = 'active';
      completeTurn(io, game);
      return;
    }
    const dealerCard = game.dealerCard;
    if (!dealerCard) {
      addMessage(game, `${player.username}'s all-in failed - dealer card missing.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    const winningCards = revealedCards.filter(
      (c) => c.suit === dealerCard.suit && c.value > dealerCard.value
    );
    const success = winningCards.length > 0;
    const bestCard = success
      ? winningCards.sort((a, b) => b.value - a.value)[0]
      : revealedCards.sort((a, b) => b.value - a.value)[0];
    
    if (!bestCard) {
      // Fallback if bestCard is somehow undefined
      addMessage(game, `${player.username}'s all-in failed - error processing cards.`);
      game.state = 'active';
      completeTurn(io, game);
      return;
    }
    
    schedule(game, () => {
      if (!games.has(game.code)) return;
      if (success) {
        // Refund the stake then pay up to an equal amount as winnings (without driving the pot negative)
        let payout = 0;
        if (game.pot >= stake) {
          game.pot -= stake;
          applyWalletDelta(game, player, stake);
          payout += stake;
        }
        const bonus = Math.min(stake, game.pot);
        if (bonus > 0) {
          game.pot -= bonus;
          applyWalletDelta(game, player, bonus);
          payout += bonus;
        }
        addMessage(
          game,
          `${player.username}'s all-in hits with ${bestCard.card}! They collect ${penniesToDisplay(payout)} and play continues.`
        );
        io.to(room).emit('shoot-resolution', {
          winner: player.username,
          card: bestCard.card,
          winnings: penniesToDisplay(payout),
          mode: 'all-in',
          continues: true
        });
      } else {
        const cardLabels = revealedCards.map((c) => c.card).join(', ');
        addMessage(game, `${player.username}'s all-in (${cardLabels}) misses. Next player.`);
        io.to(room).emit('shoot-resolution', {
          winner: null,
          card: bestCard.card,
          winnings: penniesToDisplay(0),
          mode: 'all-in',
          continues: true
        });
      }
      game.state = 'active';
      completeTurn(io, game);
    }, SHOOT_RESULT_DELAY);
  }, SHOOT_ANNOUNCE_DELAY);
}

function completeTurn(io, game) {
  const actingIndex = game.currentPlayerIndex;
  const actingPlayer = game.players[actingIndex];
  actingPlayer.turnsTaken += 1;
  if (actingPlayer.turnsTaken >= 3) {
    addMessage(game, `${actingPlayer.username} has completed all turns.`);
  }
  if (game.turnOrder.length > 0) {
    game.turnsThisRound += 1;
    if (game.turnsThisRound >= game.turnOrder.length) {
      game.turnsThisRound = 0;
      // Increment round number for next round
      game.currentRound = (game.currentRound || 1) + 1;
      // Delay before starting next round to allow players to see results
      addMessage(game, 'Round complete. Next round starting...');
      emitState(io, game);
      schedule(game, () => {
        if (!games.has(game.code)) return;
        cycleDealerCard(game);
        dealNewRoundCards(game);
        emitState(io, game);
        maybeHandleDealerKing(io, game);
      }, ROUND_TRANSITION_DELAY);
    }
  }
  const next = pickNextPlayer(game);
  if (next === null) {
    const dealerIdx = game.dealerIndex;
    addMessage(game, `Three rounds are complete. Dealer ${game.players[dealerIdx].username} claims the pot.`);
    endGame(io, game, dealerIdx);
    return;
  }
  game.currentPlayerIndex = next;
  emitState(io, game);
}

function pickNextPlayer(game) {
  for (let i = 1; i <= game.turnOrder.length; i += 1) {
    const pointer = (game.turnPointer + i) % game.turnOrder.length;
    const idx = game.turnOrder[pointer];
    const player = game.players[idx];
    if (player.turnsTaken < 3) {
      game.turnPointer = pointer;
      return idx;
    }
  }
  return null;
}

function endGame(io, game, winnerIndex) {
  const winner = game.players[winnerIndex] || null;
  if (winner && game.pot > 0) {
    applyWalletDelta(game, winner, game.pot);
  }
  if (winner) {
  winner.gamesWon += 1;
  }
  game.pot = 0;
  game.state = 'post-game';
  game.gamesCompleted += 1;
  emitState(io, game);
  const room = roomName(game.code);
  // Emit game-ended with delay so players can see who won
  schedule(game, () => {
  io.to(room).emit('game-ended', {
    winner: winner ? winner.username : null,
    gamesCompleted: game.gamesCompleted,
    matchLength: MATCH_LENGTH
  });
  }, 1500);
  schedule(game, () => {
  if (game.gamesCompleted >= MATCH_LENGTH) {
      // Clear announcement before going to lobby
    schedule(game, () => {
        io.to(room).emit('clear-announcement');
        schedule(game, () => concludeMatch(io, game), 100);
      }, 3000);
  } else {
      // Clear announcement and rotate dealer for next game
    schedule(game, () => {
        io.to(room).emit('clear-announcement');
        schedule(game, () => {
          rotateDealer(io, game);
          schedule(game, () => beginNextGame(io, game), 1500);
        }, 100);
      }, 3000);
    }
    }, 2000);
}

function concludeMatch(io, game) {
  clearPending(game);
  const topWins = Math.max(...game.players.map((p) => p.gamesWon));
  const winners = game.players.filter((p) => p.gamesWon === topWins).map((p) => p.username);
  addMessage(game, `Match complete! Top scorer(s): ${winners.join(', ')}.`);
  
  // Save the current dealer index before resetting for the next match
  game.lastDealerIndex = game.dealerIndex;
  
  game.state = 'lobby';
  game.gamesCompleted = 0;
  game.turnOrder = [];
  game.currentPlayerIndex = null;
  game.turnsThisRound = 0;
  game.dealId = 0;
  game.dealerIndex = null;
  game.dealerDraws = [];
  game.dealerCard = null;
  game.deck = [];
  game.players.forEach((player) => {
    player.ready = false;
    player.status = 'waiting';
    player.cards = [];
    player.turnsTaken = 0;
    player.roundContribution = 0;
    player.isDealer = false;
  });
  emitState(io, game);
}

function leaveGame(io, socketId) {
  const code = socketToGame.get(socketId);
  if (!code) return;
  const game = games.get(code);
  if (!game) {
    socketToGame.delete(socketId);
    return;
  }
  if (game.state !== 'lobby' && game.pot > 0) {
    refundCurrentGame(game);
  }
  const index = game.players.findIndex((p) => p.socketId === socketId);
  if (index === -1) {
    socketToGame.delete(socketId);
    return;
  }
  const [player] = game.players.splice(index, 1);
  socketToGame.delete(socketId);
  addMessage(game, `${player.username} left the table.`);
  if (game.players.length === 0) {
    clearPending(game);
    games.delete(code);
    return;
  }
  game.players.forEach((p, idx) => {
    p.seat = idx;
    p.isDealer = false;
    p.roundContribution = 0;
  });
  game.dealerIndex = null;
  game.dealerDraws = [];
  game.dealerCard = null;
  game.deck = [];
  game.state = 'lobby';
  game.gamesCompleted = 0;
  game.dealId = 0;
  clearPending(game);
  game.pot = 0;
  game.turnOrder = [];
  game.currentPlayerIndex = null;
  game.turnsThisRound = 0;
  game.players.forEach((p) => {
    p.cards = [];
    p.turnsTaken = 0;
    p.ready = false;
    p.status = 'waiting';
  });
  emitState(io, game);
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MATCH_LENGTH,
  MINIMUM_STAKE,
  STAKE_OPTIONS,
  createGame,
  joinGame,
  toggleReady,
  dealerRevealWithMinimum,
  setDealerStake,
  handleStake,
  handleBet,
  handleShoot,
  handleAllIn,
  leaveGame,
  emitState,
  sanitizeGame
};
