const socket = io();

const storageKey = 'shootUser';
const state = {
  user: null,
  config: null,
  game: null,
  shootStage: null,
  renderedCardIds: new Set(),
  renderedSelectionIds: new Set(),
  lastCardGenerationKey: null,
  lastSelectionKey: null,
  tableAnnouncement: null,
  lastDealerCardKey: null,
  viewMode: 'topdown',
  pendingGameState: null,
  pendingGameTimeout: null,
  revealHoldUntil: null,
  announcementTimeout: null,
  cardRotations: new Map()
};

const BASE_PLAYER_LAYOUT = {
  // All cards are 30 units from their seats (toward center), maintaining consistent distance
  // This ensures cards are further from center while keeping equal spacing from seats
  0: { seat: { x: 50, y: 5 }, cards: { x: 50, y: 15 } },    // Top: seat at 5, cards at 35 (30 units down from seat)
  1: { seat: { x: 50, y: 95 }, cards: { x: 50, y: 85 } },   // Bottom: seat at 95, cards at 65 (30 units up from seat)
  2: { seat: { x: 100, y: 50 }, cards: { x: 82, y: 50 } },  // Right: seat at 100, cards at 70 (30 units left from seat)
  3: { seat: { x: 0, y: 50 }, cards: { x: 17, y: 50 } }     // Left: seat at 0, cards at 30 (30 units right from seat)
};

const EXTENDED_PLAYER_LAYOUT = {
  0: { seat: { x: 50, y: 6 }, cards: { x: 50, y: 26 } }, //12oclock
  1: { seat: { x: 50, y: 94 }, cards: { x: 50, y: 74 } }, //6oclock
  2: { seat: { x: 95, y: 28 }, cards: { x: 75, y: 34 } }, //2oclock + 6
  3: { seat: { x: 5, y: 72 }, cards: { x: 25, y: 66 } }, //8oclock - 6
  4: { seat: { x: 95, y: 72 }, cards: { x: 75, y: 66 } }, //4oclock - 6
  5: { seat: { x: 5, y: 28 }, cards: { x: 25, y: 34 } } //10oclock + 6
};

// Angled view: perspective where bottom (viewer) is closest, top is farthest
// Cards positioned closer to center and slightly forward from seats
// For 2-4 players: using base layout
const ANGLED_PLAYER_LAYOUT = {
  0: { seat: { x: 50, y: 10 }, cards: { x: 50, y: 26 } },    // Top: farthest away, higher up
  1: { seat: { x: 50, y: 90 }, cards: { x: 50, y: 58 } },    // Bottom: closest, at bottom
  2: { seat: { x: 110, y: 40 }, cards: { x: 83, y: 40 } },    // Right: on right side
  3: { seat: { x: -10, y: 40 }, cards: { x: 17, y: 40 } }     // Left: on left side
};

// Extended layout for 5/6 players in angled view
// Seats moved further out from center, cards closer to seats
const ANGLED_EXTENDED_PLAYER_LAYOUT = {
  0: { seat: { x: 50, y: 10 }, cards: { x: 50, y: 26 } },     // Top (12 o'clock)
  1: { seat: { x: 50, y: 90 }, cards: { x: 50, y: 58 } },     // Bottom (6 o'clock)
  2: { seat: { x: 105, y: 30 }, cards: { x: 80, y: 32 } },     // Top-right (2 o'clock)
  3: { seat: { x: -5, y: 72 }, cards: { x: 19, y: 52 } },     // Bottom-left (8 o'clock)
  4: { seat: { x: 105, y: 72 }, cards: { x: 81, y: 52 } },     // Bottom-right (4 o'clock)
  5: { seat: { x: -5, y: 30 }, cards: { x: 20, y: 32 } }      // Top-left (10 o'clock)
};

const CARD_HEIGHT_RATIO = 1.45;
const PILE_ROTATION_RANGE = 360;
const PILE_MIN_ROTATION_DIFF = 30;
const ANGLED_SIZE_SCALE = 0.7;
const CENTER_MOVE_DURATION = 800;
const CENTER_FLIP_START_DELAY = 400;
const CENTER_FLIP_PER_CARD_DELAY = 320;
const CENTER_FLIP_FINAL_HOLD = 2000;
const TABLE_ANNOUNCEMENT_DURATION = 6500;
const GAME_WIN_ANNOUNCEMENT_DURATION = 7500;

const ANGLED_CARD_FOLDERS = {
  default: {
    0: 'top',
    1: 'bottom',
    2: 'topright',
    3: 'bottomleft',
    4: 'bottomright',
    5: 'topleft'
  },
  compact: {
    0: 'top',
    1: 'bottom',
    2: 'right',
    3: 'left'
  }
};

const refs = {
  statusBadges: document.getElementById('status-badges'),
  lobbyPanel: document.getElementById('lobby-panel'),
  headerUser: document.getElementById('header-user'),
  headerUsername: document.getElementById('header-username'),
  headerLogout: document.getElementById('header-sign-out-btn'),
  headerInfoBtn: document.getElementById('header-info-btn'),
  headerSignin: document.getElementById('header-signin'),
  headerSignInBtn: document.getElementById('header-sign-in-btn'),
  infoModal: document.getElementById('info-modal'),
  infoModalClose: document.getElementById('info-modal-close'),
  infoUsername: document.getElementById('info-username'),
  infoBalance: document.getElementById('info-balance'),
  rulesBtn: document.getElementById('rules-btn'),
  rulesModal: document.getElementById('rules-modal'),
  rulesModalClose: document.getElementById('rules-modal-close'),
  createBtn: document.getElementById('create-game'),
  joinForm: document.getElementById('join-form'),
  joinCode: document.getElementById('join-code'),
  lobbyStatus: document.getElementById('lobby-status'),
  readyHint: document.getElementById('ready-hint'),
  actions: document.getElementById('actions'),
  hand: document.getElementById('hand'),
  messageLog: document.getElementById('message-log'),
  tableReady: document.getElementById('table-ready'),
  tableActionsOverlay: document.getElementById('table-actions'),
  tableAnnouncement: document.getElementById('table-announcement'),
  betSliderContainer: document.getElementById('bet-slider-container'),
  tickerSituation: document.getElementById('ticker-situation'),
  tickerInstructions: document.getElementById('ticker-instructions'),
  tableContainer: document.getElementById('table'),
  tableCircle: document.getElementById('table-circle'),
  potDisplay: document.getElementById('pot-display'),
  roundIndicator: document.getElementById('round-indicator'),
  dealerCard: document.getElementById('dealer-card'),
  deck: document.getElementById('deck'),
  gameCode: document.getElementById('game-code')
};

const START_MENU_IMAGE_PATHS = {
  landing: '/StartMenu/StartMenuRulesRegisterLogin.jpg',
  register1: '/StartMenu/StartMenuRegisterMenu1.jpg',
  register2: '/StartMenu/StartMenuRegisterMenu2.jpg',
  register3: '/StartMenu/StartMenuRegister3.jpg',
  checkEmail: '/StartMenu/StartMenuCheckEmail.jpg',
  username: '/StartMenu/StartMenuChooseUsername.jpg',
  login: '/StartMenu/StartMenuLogin.jpg',
  password: '/StartMenu/StartMenuEnterPassword.jpg',
  authed: '/StartMenu/StartMenuRulesPlayLogout.jpg',
  play: '/StartMenu/StartMenuCreateOrJoinTable.jpg',
  tableType: '/StartMenu/StartMenuTableTypeChooser.jpg'
};

const TASKBAR_DEFAULT_BASE = { width: 240, height: 70 };
const TASKBAR_RECTS = [
  { rect: [14, 14, 54, 55], handler: () => openStartMenuComplianceModal() },
  { rect: [93, 14, 132, 55], handler: () => openStartMenuCashierModal() },
  { rect: [175, 14, 213, 55], handler: () => openStartMenuSettingsModal() }
];
const TASKBAR_RECTS_BLOCKED = [
  { rect: [50, 14, 91, 55], handler: () => openStartMenuComplianceModal() },
  { rect: [140, 14, 179, 55], handler: () => openStartMenuSettingsModal() }
];
const TASKBAR_RECTS_NOT_LOGGED = [
  { rect: [97, 14, 139, 54], handler: () => openStartMenuComplianceModal() }
];

const COMPLIANCE_DOWNLOADS = [
  { rect: [37, 169, 125, 189], file: 'AML & CFT.pdf' },
  { rect: [38, 212, 178, 233], file: 'Business Feasibility.pdf' },
  { rect: [38, 256, 263, 274], file: 'Description Rules and Definitions.pdf' },
  { rect: [38, 299, 154, 317], file: 'Gaming Policies.pdf' },
  { rect: [37, 341, 121, 359], file: 'Jurisdiction.pdf' },
  { rect: [38, 384, 235, 405], file: 'KYC & Responsible Gaming.pdf' },
  { rect: [38, 427, 163, 449], file: 'Swot Analysis.pdf' },
  { rect: [37, 469, 110, 489], file: 'Who Am I.pdf' }
];

const COMPLIANCE_CLOSE_RECT = [36, 804, 110, 837];
const RULES_CLOSE_RECT = [922, 1170, 1028, 1220];
const SETTINGS_BUTTON_RECTS = {
  close: [238, 826, 320, 858],
  edit: [266, 30, 331, 65],
  save: [241, 830, 313, 859]
};
const SETTINGS_FIELD_RECTS = {
  firstName: [173, 88, 311, 111],
  secondName: [166, 115, 304, 138],
  dateOfBirth: [163, 143, 301, 166],
  identityNumber: [147, 171, 285, 194],
  identityType: [161, 198, 299, 221],
  email: [98, 225, 236, 248],
  phone: [106, 252, 244, 275],
  houseNameOrNumber: [185, 280, 323, 303],
  addressFirstLine: [113, 307, 251, 330],
  addressSecondLine: [119, 335, 257, 358],
  townOrCity: [139, 363, 277, 386],
  county: [112, 390, 251, 413],
  countryOfResidence: [120, 417, 258, 440],
  language: [137, 445, 277, 468],
  currency: [127, 472, 185, 495],
  maximumBet: [166, 501, 225, 524],
  maxDailyStake: [188, 529, 246, 552],
  weeklyMaxStake: [211, 556, 269, 579],
  creditCardNumber: [170, 583, 329, 606],
  expiryDate: [149, 610, 221, 633],
  cvrNumber: [83, 638, 141, 661],
  username: [148, 665, 286, 688],
  password: [138, 693, 276, 716],
  aliasName: [152, 720, 290, 743],
  avatar: [107, 748, 245, 771]
};
const SETTINGS_LANGUAGE_OPTIONS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Danish'];
const SETTINGS_CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP'];

const START_MENU_CLOSE_TARGETS = {
  register1: 'landing',
  register2: 'register1',
  register3: 'register2',
  login: 'landing',
  username: 'landing',
  play: 'authed',
  tableType: 'authed'
};

const MENU_COORDINATE_BASE = {
  width: 820,
  height: 520
};

const startMenuRefs = {
  root: document.getElementById('start-menu-root'),
  image: document.getElementById('start-menu-image'),
  overlay: document.getElementById('start-menu-overlay-layer'),
  rulesModal: document.getElementById('start-menu-rules-modal'),
  rulesClose: document.getElementById('start-menu-rules-close'),
  rulesImage: document.getElementById('start-menu-rules-image'),
  rulesOverlay: document.getElementById('start-menu-rules-overlay'),
  complianceModal: document.getElementById('start-menu-compliance-modal'),
  complianceOverlay: document.getElementById('start-menu-compliance-overlay'),
  complianceImage: document.getElementById('start-menu-compliance-image'),
  complianceClose: document.getElementById('start-menu-compliance-close'),
  settingsModal: document.getElementById('start-menu-settings-modal'),
  settingsOverlay: document.getElementById('start-menu-settings-overlay'),
  settingsImage: document.getElementById('start-menu-settings-image'),
  settingsClose: document.getElementById('start-menu-settings-close'),
  cashierModal: document.getElementById('start-menu-cashier-modal'),
  cashierOverlay: document.getElementById('start-menu-cashier-overlay'),
  cashierImage: document.getElementById('start-menu-cashier-image'),
  cashierClose: document.getElementById('start-menu-cashier-close'),
  taskbar: document.getElementById('start-menu-taskbar'),
  taskbarImage: document.getElementById('start-menu-taskbar-image'),
  taskbarOverlay: document.getElementById('start-menu-taskbar-overlay'),
  closeBtn: document.getElementById('start-menu-close-btn'),
  appShell: document.getElementById('app')
};

const orientationRefs = {
  overlay: document.getElementById('rotate-overlay'),
  title: document.querySelector('#rotate-overlay h2'),
  message: document.querySelector('#rotate-overlay p')
};

const MOBILE_MAX_WIDTH = 1024;

function getDefaultRegisterForm() {
  return {
    firstName: '',
    secondName: '',
    dateOfBirth: '',
    email: '',
    phone: '+',
    country: '',
    houseNameOrNumber: '',
    addressFirstLine: '',
    addressSecondLine: '',
    townOrCity: '',
    county: '',
    countryOfResidence: '',
    maximumBet: '',
    limitPerDay: '',
    maximumLoss: '',
    creditCardNumber: '',
    expiryDate: '',
    cvrNumber: '',
    identityFile: null,
    identityPreviewUrl: '',
    billImageFile: null,
    billImagePreviewUrl: '',
    creditCardImageFile: null,
    creditCardImagePreviewUrl: ''
  };
}

function getDefaultLoginForm() {
  return {
    email: '',
    password: ''
  };
}

function getDefaultSettingsValues(user = null) {
  return {
    firstName: (user && user.firstName) || '',
    secondName: (user && user.secondName) || '',
    dateOfBirth: (user && user.dateOfBirth) || '',
    identityNumber: (user && user.identityNumber) || '',
    identityType: (user && user.identityType) || '',
    email: (user && user.email) || '',
    phone: (user && user.phone) || '+',
    houseNameOrNumber: (user && user.houseNameOrNumber) || '',
    addressFirstLine: (user && user.addressFirstLine) || '',
    addressSecondLine: (user && user.addressSecondLine) || '',
    townOrCity: (user && user.townOrCity) || '',
    county: (user && user.county) || '',
    countryOfResidence: (user && user.countryOfResidence) || '',
    country: (user && user.country) || '',
    language: (user && user.language) || 'English',
    currency: (user && user.currency) || 'USD',
    maximumBet: (user && user.maximumBet) || '',
    limitPerDay: (user && user.limitPerDay) || '',
    maxDailyStake: (user && user.maxDailyStake) || '',
    weeklyMaxStake: (user && user.weeklyMaxStake) || '',
    maximumLoss: (user && user.maximumLoss) || '',
    creditCardNumber: (user && user.creditCardNumber) || '',
    expiryDate: (user && user.expiryDate) || '',
    cvrNumber: (user && user.cvrNumber) || '',
    username: (user && user.username) || '',
    aliasName: (user && user.aliasName) || (user && user.username) || '',
    password: '',
    passwordSet: Boolean(user && user.passwordSet),
    avatar: ''
  };
}

function getDefaultPasswordChallenge() {
  return {
    value: '',
    challengeToken: null
  };
}

const startMenuState = {
  active: true,
  currentScreen: 'landing',
  loading: false,
  isBlockedCountry: false,
  register: getDefaultRegisterForm(),
  registerError: '',
  login: getDefaultLoginForm(),
  password: getDefaultPasswordChallenge(),
  settings: {
    mode: 'view',
    values: getDefaultSettingsValues(),
    loading: false,
    error: ''
  },
  cashier: {
    amount: '',
    mirroredAmount: '',
    priceDisplay: '',
    message: ''
  },
  verificationToken: null,
  username: {
    value: '',
    token: null
  },
  play: {
    code: '',
    tableType: 'balance'
  }
};

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function isLandscapeOrientation() {
  return window.matchMedia('(orientation: landscape)').matches;
}

function getUserCurrency() {
  return state.user?.currency || startMenuState.settings.values.currency || '';
}

function getCurrencyRate(currency) {
  const cur = (currency || '').toUpperCase();
  if (cur === 'EUR') return 0.85;
  if (cur === 'GBP') return 0.75;
  return 1; // default USD
}

function updateOrientationLock() {
  if (!orientationRefs.overlay) return;
  const isMobile = isMobileViewport();
  const landscape = isLandscapeOrientation();
  const inStartMenu = startMenuState.active;
  let shouldShow = false;
  let title = '';
  let message = '';

  if (isMobile) {
    if (inStartMenu) {
      // Start menus: force portrait
      if (landscape) {
        shouldShow = true;
        title = 'Portrait required';
        message = 'Turn your phone to portrait to use the menus.';
      }
    } else {
      // Game/lobby: force landscape
      if (!landscape) {
        shouldShow = true;
        title = 'Landscape required';
        message = 'Turn your phone to landscape to play.';
      }
    }
  }

  if (orientationRefs.title) {
    orientationRefs.title.textContent = title;
  }
  if (orientationRefs.message) {
    orientationRefs.message.textContent = message;
  }

  orientationRefs.overlay.classList.remove('hidden');
  orientationRefs.overlay.classList.toggle('show', shouldShow);
  document.body.classList.toggle('rotate-block', shouldShow);
}

function handleOrientationChange() {
  updateOrientationLock();
}

function initOrientationEnforcement() {
  if (!orientationRefs.overlay) return;
  window.addEventListener('resize', handleOrientationChange);
  window.addEventListener('orientationchange', handleOrientationChange);
  updateOrientationLock();
}

init();

async function init() {
  initStartMenu();
  initOrientationEnforcement();
  wireEvents();
  await loadConfig();
  await loadGeoStatus();
  hydrateUser();
  render();
  await checkUsernameTokenFromQuery();
}

function wireEvents() {
  refs.createBtn?.addEventListener('click', () => {
    if (!ensureAuthed()) return;
    socket.emit('create-game');
  });
  refs.joinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!ensureAuthed()) return;
    const code = refs.joinCode.value.trim().toUpperCase();
    if (!code) {
      toast('Enter a join code');
      return;
    }
    socket.emit('join-game', { code });
  });
  refs.headerLogout?.addEventListener('click', handleSignOut);
  refs.headerSignInBtn?.addEventListener('click', () => {
    setStartMenuScreen('login');
  });
  refs.headerInfoBtn?.addEventListener('click', handleInfoClick);
  refs.infoModalClose?.addEventListener('click', closeInfoModal);
  refs.infoModal?.querySelector('.info-modal-overlay')?.addEventListener('click', closeInfoModal);
  refs.rulesBtn?.addEventListener('click', openRulesModal);
  refs.rulesModalClose?.addEventListener('click', closeRulesModal);
  refs.rulesModal?.querySelector('.rules-modal-overlay')?.addEventListener('click', closeRulesModal);
  startMenuRefs.rulesClose?.addEventListener('click', closeStartMenuRulesModal);
  startMenuRefs.rulesModal?.addEventListener('click', (event) => {
    if (event.target === startMenuRefs.rulesModal) {
      closeStartMenuRulesModal();
    }
  });
  startMenuRefs.rulesImage?.addEventListener('load', renderRulesOverlay);
  startMenuRefs.complianceClose?.addEventListener('click', closeStartMenuComplianceModal);
  startMenuRefs.complianceModal?.addEventListener('click', (event) => {
    if (event.target === startMenuRefs.complianceModal) {
      closeStartMenuComplianceModal();
    }
  });
  startMenuRefs.complianceImage?.addEventListener('load', renderComplianceOverlay);
  startMenuRefs.settingsClose?.addEventListener('click', closeStartMenuSettingsModal);
  startMenuRefs.settingsModal?.addEventListener('click', (event) => {
    if (event.target === startMenuRefs.settingsModal) {
      closeStartMenuSettingsModal();
    }
  });
  startMenuRefs.settingsImage?.addEventListener('load', renderSettingsOverlay);
  startMenuRefs.cashierClose?.addEventListener('click', closeStartMenuCashierModal);
  startMenuRefs.cashierModal?.addEventListener('click', (event) => {
    if (event.target === startMenuRefs.cashierModal) {
      closeStartMenuCashierModal();
    }
  });
  startMenuRefs.cashierImage?.addEventListener('load', renderCashierOverlay);
  startMenuRefs.taskbarImage?.addEventListener('load', () =>
    renderStartMenuTaskbar(startMenuState.currentScreen)
  );
  startMenuRefs.closeBtn?.addEventListener('click', () => {
    const target =
      startMenuRefs.closeBtn?.getAttribute('data-target') ||
      START_MENU_CLOSE_TARGETS[startMenuState.currentScreen] ||
      'landing';
    setStartMenuScreen(target);
  });
}

function hydrateUser() {
  state.user = null;
    try {
    localStorage.removeItem(storageKey);
    } catch (err) {
    // ignore
  }
}

function initStartMenu() {
  if (!startMenuRefs.root) {
    return;
  }
  document.body.classList.add('start-menu-active');
  startMenuRefs.root.classList.remove('hidden');
  setStartMenuScreen('landing', { force: true });
}

async function checkUsernameTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('verifyToken');
  if (!token) return;
  startMenuState.loading = true;
  try {
    const res = await fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`);
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.message || 'Verification failed.');
    }
    startMenuState.username.token = token;
    startMenuState.username.value = '';
    setStartMenuScreen('username', { force: true });
  } catch (err) {
    toast(err.message || 'Verification failed. Please request a new link.');
    setStartMenuScreen('landing', { force: true });
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function setStartMenuScreen(screenName, options = {}) {
  if (!START_MENU_IMAGE_PATHS[screenName]) {
    screenName = 'landing';
  }
  if (screenName === 'authed' && !state.user) {
    screenName = 'landing';
  }
  if (screenName === 'play' && !state.user) {
    screenName = 'login';
  }
  if (!options.force && startMenuState.currentScreen === screenName) {
    renderStartMenuScreen();
    return;
  }
  const previousScreen = startMenuState.currentScreen;
  cleanupStartMenuScreen(previousScreen, screenName);
  startMenuState.currentScreen = screenName;
  if (startMenuRefs.root) {
    startMenuRefs.root.classList.remove('hidden');
  }
  document.body.classList.add('start-menu-active');
  startMenuRefs.appShell?.classList.add('hidden');
  renderStartMenuScreen();
}

function cleanupStartMenuScreen(screenName, nextScreen) {
  const leavingRegisterFlow =
    ['register1', 'register2', 'register3'].includes(screenName) &&
    !['register1', 'register2', 'register3'].includes(nextScreen);
  if (leavingRegisterFlow) {
    ['identityPreviewUrl', 'billImagePreviewUrl', 'creditCardImagePreviewUrl'].forEach((key) => {
      if (startMenuState.register[key]) {
        URL.revokeObjectURL(startMenuState.register[key]);
      }
    });
    startMenuState.register = getDefaultRegisterForm();
    startMenuState.registerError = '';
  } else if (screenName === 'login') {
    startMenuState.login = getDefaultLoginForm();
  } else if (screenName === 'username') {
    startMenuState.username.value = '';
  } else if (screenName === 'play') {
    startMenuState.play.code = '';
    if (startMenuState.isBlockedCountry) {
      startMenuState.play.tableType = 'balance';
    }
  } else if (screenName === 'password') {
    startMenuState.password = getDefaultPasswordChallenge();
  }
}

function getMenuDimensions() {
  if (startMenuRefs.image && startMenuRefs.image.naturalWidth && startMenuRefs.image.naturalHeight) {
    return {
      width: startMenuRefs.image.naturalWidth,
      height: startMenuRefs.image.naturalHeight
    };
  }
  return { ...MENU_COORDINATE_BASE };
}

function renderStartMenuScreen() {
  if (!startMenuRefs.image || !startMenuRefs.overlay) return;
  const screenName = startMenuState.currentScreen;
  const imagePath = START_MENU_IMAGE_PATHS[screenName] || START_MENU_IMAGE_PATHS.landing;
  const apply = () => {
    startMenuRefs.image.onload = null;
    const { width, height } = getMenuDimensions();
    renderStartMenuOverlays(screenName, width, height);
    renderStartMenuTaskbar(screenName);
    const closeTarget = START_MENU_CLOSE_TARGETS[screenName];
    if (closeTarget) {
      startMenuRefs.closeBtn?.classList.remove('hidden');
      startMenuRefs.closeBtn?.setAttribute('data-target', closeTarget);
    } else {
      startMenuRefs.closeBtn?.classList.add('hidden');
      startMenuRefs.closeBtn?.removeAttribute('data-target');
    }
  };
  startMenuRefs.image.onload = apply;
  startMenuRefs.image.src = imagePath;
  if (startMenuRefs.image.complete && startMenuRefs.image.naturalWidth) {
    apply();
  }
}

function renderStartMenuOverlays(screenName, width, height) {
  if (!startMenuRefs.overlay) return;
  // Only clear and rebuild if screen changed, overlay is empty, or loading state changed
  const lastLoadingState = startMenuRefs.overlay.dataset.wasLoading === 'true';
  const currentLoadingState = startMenuState.loading;
  const needsRebuild = !startMenuRefs.overlay.dataset.currentScreen || 
                        startMenuRefs.overlay.dataset.currentScreen !== screenName ||
                        startMenuRefs.overlay.children.length === 0 ||
                        lastLoadingState !== currentLoadingState;
  if (!needsRebuild) return;
  
  startMenuRefs.overlay.innerHTML = '';
  startMenuRefs.overlay.dataset.currentScreen = screenName;
  startMenuRefs.overlay.dataset.wasLoading = String(startMenuState.loading);
  switch (screenName) {
    case 'landing':
      addMenuHotspot([33, 468, 98, 498], openStartMenuRulesModal, { width, height });
      addMenuHotspot([106, 468, 205, 499], () => setStartMenuScreen('register1'), { width, height });
      addMenuHotspot([691, 465, 776, 499], () => setStartMenuScreen('login'), { width, height });
      break;
    case 'register1':
      addMenuInput('register.secondName', [168, 178, 378, 208], { width, height, placeholder: 'Second name' });
      addMenuInput('register.firstName', [168, 221, 378, 251], {
        width,
        height,
        placeholder: 'First name'
      });
      addMenuInput('register.dateOfBirth', [168, 263, 378, 293], {
        width,
        height,
        type: 'date',
        max: new Date().toISOString().split('T')[0]
      });
      addMenuInput('register.email', [168, 304, 379, 334], { width, height, type: 'email', placeholder: 'Email' });
      addMenuInput('register.phone', [168, 346, 379, 376], {
        width,
        height,
        placeholder: '+441234567890',
        phoneField: true
      });
      addMenuInput('register.country', [169, 387, 379, 417], { width, height, placeholder: 'Country' });
      addMenuFileField('identity', [398, 174, 757, 420], { width, height });
      addMenuHotspot([45, 469, 110, 497], () => setStartMenuScreen('landing'), { width, height });
      addMenuHotspot([700, 471, 764, 497], handleRegisterStep1Next, {
        width,
        height,
        disabled: false
      });
      addRegisterErrorMessage(width, height);
      break;
    case 'register2':
      addMenuInput('register.houseNameOrNumber', [168, 178, 378, 208], { width, height, placeholder: 'House name/number' });
      addMenuInput('register.addressFirstLine', [168, 221, 378, 251], { width, height, placeholder: 'Address line 1' });
      addMenuInput('register.addressSecondLine', [168, 263, 378, 293], { width, height, placeholder: 'Address line 2' });
      addMenuInput('register.townOrCity', [168, 304, 379, 334], { width, height, placeholder: 'Town/City' });
      addMenuInput('register.county', [168, 346, 379, 376], { width, height, placeholder: 'County' });
      addMenuInput('register.countryOfResidence', [169, 387, 379, 417], { width, height, placeholder: 'Country of residence' });
      addMenuFileField('billImage', [398, 174, 757, 420], { width, height });
      addMenuHotspot([45, 469, 110, 497], () => setStartMenuScreen('register1'), { width, height });
      addMenuHotspot([700, 471, 764, 497], handleRegisterStep2Next, {
        width,
        height,
        disabled: false
      });
      addRegisterErrorMessage(width, height);
      break;
    case 'register3':
      addMenuInput('register.maximumBet', [168, 178, 378, 208], { width, height, placeholder: 'Maximum bet' });
      addMenuInput('register.limitPerDay', [168, 221, 378, 251], { width, height, placeholder: 'Limit per day' });
      addMenuInput('register.maximumLoss', [168, 263, 378, 293], { width, height, placeholder: 'Maximum loss' });
      addMenuInput('register.creditCardNumber', [168, 304, 379, 334], { width, height, placeholder: 'Credit card number' });
      addMenuInput('register.expiryDate', [168, 346, 379, 376], { width, height, placeholder: 'Expiry date' });
      addMenuInput('register.cvrNumber', [169, 387, 379, 417], { width, height, placeholder: 'CVR number' });
      addMenuFileField('creditCardImage', [398, 174, 757, 420], { width, height });
      addMenuHotspot([45, 469, 110, 497], () => setStartMenuScreen('register2'), { width, height });
      addMenuHotspot([700, 471, 764, 497], handleRegisterSubmit, {
        width,
        height,
        disabled: false
      });
      addRegisterErrorMessage(width, height);
      break;
    case 'checkEmail':
      // Until email delivery is live, proceed directly to username screen on click
      addMenuHotspot(
        [0, 0, width, height],
        () => setStartMenuScreen('landing', { force: true }),
        { width, height }
      );
      break;
    case 'username':
      addMenuInput('username.value', [305, 306, 515, 336], {
        width,
        height,
        placeholder: 'Username',
        maxLength: 18
      });
      addMenuHotspot([374, 376, 443, 400], handleUsernameSubmit, {
        width,
        height,
        // Keep clickable even if invalid; server will validate
        disabled: false
      });
      break;
    case 'login':
      addMenuInput('login.email', [306, 188, 516, 218], { width, height, type: 'email', placeholder: 'Email' });
      addMenuInput('login.password', [306, 256, 516, 286], {
        width,
        height,
        placeholder: 'Phone number (+ code)',
        phoneField: true
      });
      addMenuHotspot([45, 469, 110, 497], () => setStartMenuScreen('landing'), { width, height });
      addMenuHotspot([363, 346, 456, 376], handleLoginSubmit, {
        width,
        height,
        // Keep clickable even if invalid; server will validate
        disabled: false
      });
      break;
    case 'authed':
      addMenuHotspot([30, 461, 98, 497], openStartMenuRulesModal, { width, height });
      addMenuHotspot([108, 467, 163, 499], handlePlayClick, { width, height });
      addMenuHotspot([693, 465, 791, 499], handleMenuLogout, { width, height });
      break;
    case 'tableType':
      addMenuHotspot([86, 88, 359, 340], () => selectTableType('balance'), { width, height });
      if (!startMenuState.isBlockedCountry) {
        addMenuHotspot([443, 90, 715, 342], () => selectTableType('real'), { width, height });
      }
      break;
    case 'play':
      addMenuInput('play.code', [306, 188, 515, 218], {
        width,
        height,
        maxLength: 5,
        transform: 'uppercase',
        placeholder: 'Table code'
      });
      addMenuHotspot([330, 232, 404, 260], handleMenuCreateTable, {
        width,
        height,
        // Keep clickable regardless of loading/state
        disabled: false
      });
      addMenuHotspot([440, 233, 492, 260], handleMenuJoinTable, {
        width,
        height,
        // Keep clickable even if code invalid; server will validate
        disabled: false
      });
      break;
    case 'password':
      addMenuInput('password.value', [305, 240, 515, 270], {
        width,
        height,
        placeholder: 'Password',
        type: 'password'
      });
      addMenuHotspot([351, 307, 474, 335], handlePasswordSubmit, {
        width,
        height,
        disabled: false
      });
      break;
    default:
      break;
  }
}

function renderStartMenuTaskbar(screenName) {
  const taskbar = startMenuRefs.taskbar;
  const taskbarImage = startMenuRefs.taskbarImage;
  const overlay = startMenuRefs.taskbarOverlay;
  if (!taskbar || !taskbarImage || !overlay) return;

  const isAuthedBar = screenName === 'authed';
  const isLandingBar = screenName === 'landing' && !state.user;
  const shouldShow = isAuthedBar || isLandingBar;
  taskbar.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) {
    overlay.innerHTML = '';
    return;
  }

  let imagePath = '/StartMenu/bottomtaskbar.png';
  if (isAuthedBar) {
    imagePath = startMenuState.isBlockedCountry
      ? '/StartMenu/bottomtaskbarblockedcountry.png'
      : '/StartMenu/bottomtaskbar.png';
  } else if (isLandingBar) {
    imagePath = '/StartMenu/bottomtaskbarnotloggedin.png';
  }

  if (taskbarImage.getAttribute('src') !== imagePath) {
    taskbarImage.setAttribute('src', imagePath);
  }

  overlay.innerHTML = '';

  const baseWidth = taskbarImage.naturalWidth || TASKBAR_DEFAULT_BASE.width;
  const baseHeight = taskbarImage.naturalHeight || TASKBAR_DEFAULT_BASE.height;
  let rects = TASKBAR_RECTS;
  if (isAuthedBar) {
    rects = startMenuState.isBlockedCountry ? TASKBAR_RECTS_BLOCKED : TASKBAR_RECTS;
  } else if (isLandingBar) {
    rects = TASKBAR_RECTS_NOT_LOGGED;
  }

  rects.forEach(({ rect, handler }) => {
    addTaskbarHotspot(rect, handler, baseWidth, baseHeight);
  });
}

function addMenuHotspot(rect, handler, options = {}) {
  if (!startMenuRefs.overlay) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'start-menu-hotspot';
  applyMenuRect(btn, rect, options.width, options.height);
  btn.disabled = Boolean(options.disabled);
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
  btn.style.pointerEvents = 'auto';
  btn.style.zIndex = '10';
  startMenuRefs.overlay.appendChild(btn);
}

function addTaskbarHotspot(rect, handler, baseWidth, baseHeight) {
  if (!startMenuRefs.taskbarOverlay) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'taskbar-button';
  applyMenuRect(btn, rect, baseWidth, baseHeight);
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
  startMenuRefs.taskbarOverlay.appendChild(btn);
}

function addMenuInput(path, rect, options = {}) {
  if (!startMenuRefs.overlay) return;
  const input = document.createElement('input');
  input.type = options.type || 'text';
  input.placeholder = options.placeholder || '';
  if (options.maxLength && options.maxLength > 0) {
    input.maxLength = options.maxLength;
  }
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.readOnly = false;
  input.disabled = false;
  input.tabIndex = 0;
  if (options.type === 'date' && options.max) {
    input.max = options.max;
  }
  input.value = getMenuFieldValue(path) || (options.phoneField ? '+' : '');
  if (options.transform === 'uppercase') {
    input.style.textTransform = 'uppercase';
  }
  applyMenuRect(input, rect, options.width, options.height);
  input.className = 'start-menu-input';
  
  // Force interactive styles inline to override any CSS issues
  input.style.pointerEvents = 'auto';
  input.style.userSelect = 'text';
  input.style.webkitUserSelect = 'text';
  input.style.zIndex = '10';
  
  // Multiple event listeners to ensure input works
  input.addEventListener('input', (event) => {
    let value = event.target.value;
    
    if (options.phoneField) {
      // Ensure phone always starts with +
      if (!value.startsWith('+')) {
        value = '+' + value.replace(/^\+*/, '');
      }
      // Only allow +, digits, spaces, and dashes
      value = value.replace(/[^\d\s+\-]/g, '');
      event.target.value = value;
    }
    
    const digitsOnlyFields = new Set([
      'register.maximumBet',
      'register.limitPerDay',
      'register.maximumLoss',
      'register.creditCardNumber',
      'register.cvrNumber'
    ]);
    const isExpiryField = path === 'register.expiryDate';

    if (digitsOnlyFields.has(path)) {
      value = value.replace(/\D/g, '');
      if (path === 'register.cvrNumber') {
        value = value.slice(0, 3);
      }
      event.target.value = value;
    }

    if (isExpiryField) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      if (digits.length === 0) {
        value = '';
      } else if (digits.length <= 2) {
        // Add slash immediately after two digits
        value = digits.length === 2 ? `${digits}/` : digits;
      } else {
        value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      }
      event.target.value = value;
    }

    if (options.transform === 'uppercase') {
      value = value.toUpperCase();
      event.target.value = value;
    }
    setMenuFieldValue(path, value);
    clearRegisterError();
  });
  
  input.addEventListener('change', (event) => {
    let value = event.target.value;
    
    if (options.phoneField) {
      if (!value.startsWith('+')) {
        value = '+' + value.replace(/^\+*/, '');
      }
      value = value.replace(/[^\d\s+\-]/g, '');
      event.target.value = value;
    }
    
    const digitsOnlyFields = new Set([
      'register.maximumBet',
      'register.limitPerDay',
      'register.maximumLoss',
      'register.creditCardNumber',
      'register.cvrNumber'
    ]);
    const isExpiryField = path === 'register.expiryDate';

    if (digitsOnlyFields.has(path)) {
      value = value.replace(/\D/g, '');
      if (path === 'register.cvrNumber') {
        value = value.slice(0, 3);
      }
      event.target.value = value;
    }

    if (isExpiryField) {
      const digits = value.replace(/\D/g, '').slice(0, 4);
      if (digits.length === 0) {
        value = '';
      } else if (digits.length <= 2) {
        value = digits.length === 2 ? `${digits}/` : digits;
      } else {
        value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      }
      event.target.value = value;
    }

    if (options.transform === 'uppercase') {
      value = value.toUpperCase();
      event.target.value = value;
    }
    setMenuFieldValue(path, value);
    clearRegisterError();
  });
  
  input.addEventListener('click', (event) => {
    event.stopPropagation();
    input.focus();
    
    // Position cursor after + for phone fields if empty
    if (options.phoneField && event.target.value === '+') {
      setTimeout(() => {
        event.target.setSelectionRange(1, 1);
      }, 0);
    }
  });
  
  startMenuRefs.overlay.appendChild(input);
}

function addMenuFileField(key, rect, options = {}) {
  if (!startMenuRefs.overlay) return;
  const wrapper = document.createElement('label');
  wrapper.className = 'start-menu-file-field';
  wrapper.htmlFor = `register-${key}-file`;
  applyMenuRect(wrapper, rect, options.width, options.height);
  wrapper.style.pointerEvents = 'auto';
  wrapper.style.zIndex = '10';
  wrapper.style.cursor = 'pointer';
  
  const input = document.createElement('input');
  input.id = `register-${key}-file`;
  input.type = 'file';
  input.accept = 'image/*';
  input.style.pointerEvents = 'auto';
  
  input.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    setRegisterFile(key, file);
  });
  
  input.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  
  wrapper.addEventListener('click', (event) => {
    event.stopPropagation();
    input.click();
  });
  
  wrapper.appendChild(input);
  
  const previewKey = `${key}PreviewUrl`;
  if (startMenuState.register[previewKey]) {
    wrapper.style.setProperty('--preview-image', `url(${startMenuState.register[previewKey]})`);
    wrapper.classList.add('has-preview');
    wrapper.textContent = '';
  } else {
    wrapper.style.removeProperty('--preview-image');
    wrapper.classList.remove('has-preview');
    wrapper.textContent = '';
  }
  startMenuRefs.overlay.appendChild(wrapper);
}

function applyMenuRect(element, rect, baseWidth = MENU_COORDINATE_BASE.width, baseHeight = MENU_COORDINATE_BASE.height) {
  if (!rect || rect.length !== 4) return;
  const [x1, y1, x2, y2] = rect;
  const width = ((x2 - x1) / baseWidth) * 100;
  const height = ((y2 - y1) / baseHeight) * 100;
  const left = (x1 / baseWidth) * 100;
  const top = (y1 / baseHeight) * 100;
  element.style.left = `${left}%`;
  element.style.top = `${top}%`;
  element.style.width = `${width}%`;
  element.style.height = `${height}%`;
  element.style.position = 'absolute';
}

function getMenuFieldValue(path) {
  const [group, key] = path.split('.');
  if (!group || !key || !startMenuState[group]) return '';
  return startMenuState[group][key] || '';
}

function setMenuFieldValue(path, value) {
  const [group, key] = path.split('.');
  if (!group || !key || !startMenuState[group]) return;
  if (group === 'register' && key === 'phone' && value && !value.startsWith('+')) {
    value = `+${value.replace(/^\+/, '')}`;
  }
  if (group === 'play' && key === 'code' && value) {
    value = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  startMenuState[group][key] = value;
}

function setRegisterFile(key, file) {
  const previewKey = `${key}PreviewUrl`;
  const fileKey = `${key}File`;
  if (startMenuState.register[previewKey]) {
    URL.revokeObjectURL(startMenuState.register[previewKey]);
    startMenuState.register[previewKey] = '';
  }
  startMenuState.register[fileKey] = file || null;
  if (file) {
    startMenuState.register[previewKey] = URL.createObjectURL(file);
  }
  // Force rebuild to update file preview
  if (startMenuRefs.overlay) {
    delete startMenuRefs.overlay.dataset.currentScreen;
  }
  renderStartMenuScreen();
}

function clearRegisterError() {
  if (!startMenuState.registerError) return;
  startMenuState.registerError = '';
  if (startMenuRefs.overlay) {
    delete startMenuRefs.overlay.dataset.currentScreen;
  }
  renderStartMenuScreen();
}

function isRegisterFormComplete() {
  return !validateRegisterAll();
}

function setRegisterError(message) {
  startMenuState.registerError = message || '';
  if (startMenuRefs.overlay) {
    delete startMenuRefs.overlay.dataset.currentScreen;
  }
  renderStartMenuScreen();
}

function validateRegisterScreen(screen) {
  const form = startMenuState.register;
  const nameRegex = /^[A-Za-z-]+$/;
  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const digitsRegex = /^\d+$/;

  if (screen === 'register1') {
    if (!form.secondName.trim()) return 'Second name is required.';
    if (!nameRegex.test(form.secondName.trim())) return 'Second name can only contain letters and "-".';
    if (!form.firstName.trim()) return 'First name is required.';
    if (!nameRegex.test(form.firstName.trim())) return 'First name can only contain letters and "-".';
    if (!form.dateOfBirth) return 'Date of birth is required.';
    const age = getAgeFromDobString(form.dateOfBirth);
    if (age === null) return 'Enter a valid date of birth.';
    if (age < 18) return 'You must be 18 or older to register.';
    if (!form.email.trim()) return 'Email is required.';
    if (!emailRegex.test(form.email.trim())) return 'Enter a valid email address.';
    if (!form.phone || form.phone.trim().length < 2) return 'Phone number is required.';
    if (!form.country.trim()) return 'Country is required.';
  }

  if (screen === 'register2') {
    if (!form.houseNameOrNumber.trim()) return 'House name/number is required.';
    if (!form.addressFirstLine.trim()) return 'Address line 1 is required.';
    if (!form.addressSecondLine.trim()) return 'Address line 2 is required.';
    if (!form.townOrCity.trim()) return 'Town/City is required.';
    if (!form.county.trim()) return 'County is required.';
    if (!form.countryOfResidence.trim()) return 'Country of residence is required.';
  }

  if (screen === 'register3') {
    if (!form.maximumBet.trim()) return 'Maximum bet is required.';
    if (!digitsRegex.test(form.maximumBet.trim())) return 'Maximum bet must be digits only.';
    if (!form.limitPerDay.trim()) return 'Limit per day is required.';
    if (!digitsRegex.test(form.limitPerDay.trim())) return 'Limit per day must be digits only.';
    if (!form.maximumLoss.trim()) return 'Maximum loss is required.';
    if (!digitsRegex.test(form.maximumLoss.trim())) return 'Maximum loss must be digits only.';
    if (!form.creditCardNumber.trim()) return 'Credit card number is required.';
    if (!digitsRegex.test(form.creditCardNumber.trim())) return 'Credit card number must be digits only.';
    if (!form.expiryDate.trim()) return 'Expiry date is required.';
    const expiryMatch = /^(\d{2})\/(\d{2})$/.exec(form.expiryDate.trim());
    if (!expiryMatch) return 'Expiry date must be in MM/YY format.';
    const month = Number(expiryMatch[1]);
    const year = Number(expiryMatch[2]);
    if (month < 1 || month > 12) return 'Expiry month must be between 01 and 12.';
    if (year < 26) return 'Expiry year must be 26 or later.';
    if (!form.cvrNumber.trim()) return 'CVR number is required.';
    if (!/^\d{3}$/.test(form.cvrNumber.trim())) {
      return 'CVR number must be exactly 3 digits.';
    }
  }

  return null;
}

function validateRegisterAll() {
  return (
    validateRegisterScreen('register1') ||
    validateRegisterScreen('register2') ||
    validateRegisterScreen('register3')
  );
}

function getAgeFromDobString(dobString) {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function isLoginFormComplete() {
  return Boolean(startMenuState.login.email && startMenuState.login.password);
}

function isJoinCodeValid() {
  return Boolean((startMenuState.play.code || '').trim().length === 5);
}

function openStartMenuRulesModal() {
  renderRulesOverlay();
  startMenuRefs.root?.classList.add('start-menu-rules-open');
  startMenuRefs.rulesModal?.classList.remove('hidden');
}

function closeStartMenuRulesModal() {
  startMenuRefs.root?.classList.remove('start-menu-rules-open');
  startMenuRefs.rulesModal?.classList.add('hidden');
}

function openStartMenuComplianceModal() {
  renderComplianceOverlay();
  startMenuRefs.root?.classList.add('start-menu-compliance-open');
  startMenuRefs.complianceModal?.classList.remove('hidden');
}

function closeStartMenuComplianceModal() {
  startMenuRefs.root?.classList.remove('start-menu-compliance-open');
  startMenuRefs.complianceModal?.classList.add('hidden');
}

function resetCashierState() {
  startMenuState.cashier.amount = '';
  startMenuState.cashier.mirroredAmount = '';
  startMenuState.cashier.priceDisplay = '';
  startMenuState.cashier.message = '';
}

function openStartMenuCashierModal() {
  resetCashierState();
  renderCashierOverlay();
  startMenuRefs.root?.classList.add('start-menu-cashier-open');
  startMenuRefs.cashierModal?.classList.remove('hidden');
}

function closeStartMenuCashierModal() {
  resetCashierState();
  startMenuRefs.root?.classList.remove('start-menu-cashier-open');
  startMenuRefs.cashierModal?.classList.add('hidden');
}

async function openStartMenuSettingsModal() {
  startMenuState.settings.loading = true;
  syncSettingsFromUser();
  startMenuState.settings.mode = 'view';
  startMenuState.settings.error = '';
  if (startMenuRefs.settingsImage) {
    startMenuRefs.settingsImage.src = '/StartMenu/SettingsMenu.png';
  }
  renderSettingsOverlay();
  startMenuRefs.root?.classList.add('start-menu-settings-open');
  startMenuRefs.settingsModal?.classList.remove('hidden');
  try {
    await refreshUserProfile();
    syncSettingsFromUser();
    renderSettingsOverlay();
  } finally {
    startMenuState.settings.loading = false;
    renderSettingsOverlay();
  }
}

function closeStartMenuSettingsModal() {
  startMenuState.settings.mode = 'view';
  startMenuState.settings.error = '';
  startMenuState.settings.values.password = '';
  startMenuState.settings.values.passwordSet = Boolean(state.user && state.user.passwordSet);
  if (startMenuRefs.settingsImage) {
    startMenuRefs.settingsImage.src = '/StartMenu/SettingsMenu.png';
  }
  startMenuRefs.root?.classList.remove('start-menu-settings-open');
  startMenuRefs.settingsModal?.classList.add('hidden');
}

function renderRulesOverlay() {
  const overlay = startMenuRefs.rulesOverlay;
  const img = startMenuRefs.rulesImage;
  if (!overlay || !img) return;
  const baseWidth = img.naturalWidth || MENU_COORDINATE_BASE.width;
  const baseHeight = img.naturalHeight || MENU_COORDINATE_BASE.height;
  overlay.innerHTML = '';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'start-menu-hotspot';
  closeBtn.setAttribute('aria-label', 'Close rules');
  applyMenuRect(closeBtn, RULES_CLOSE_RECT, baseWidth, baseHeight);
  closeBtn.addEventListener('click', closeStartMenuRulesModal);
  overlay.appendChild(closeBtn);
}

function renderComplianceOverlay() {
  const overlay = startMenuRefs.complianceOverlay;
  const img = startMenuRefs.complianceImage;
  if (!overlay || !img) return;

  const baseWidth = img.naturalWidth || MENU_COORDINATE_BASE.width;
  const baseHeight = img.naturalHeight || MENU_COORDINATE_BASE.height;

  overlay.innerHTML = '';

  COMPLIANCE_DOWNLOADS.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'start-menu-hotspot';
    link.href = `/compliancepdfs/${encodeURIComponent(item.file)}`;
    // Open in a new tab to let the user view or download from the PDF viewer
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Download ${item.file}`);
    applyMenuRect(link, item.rect, baseWidth, baseHeight);
    overlay.appendChild(link);
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'start-menu-hotspot';
  closeBtn.setAttribute('aria-label', 'Close compliance menu');
  applyMenuRect(closeBtn, COMPLIANCE_CLOSE_RECT, baseWidth, baseHeight);
  closeBtn.addEventListener('click', closeStartMenuComplianceModal);
  overlay.appendChild(closeBtn);
}

function renderSettingsOverlay() {
  const overlay = startMenuRefs.settingsOverlay;
  const img = startMenuRefs.settingsImage;
  if (!overlay || !img) return;

  const baseWidth = img.naturalWidth || MENU_COORDINATE_BASE.width;
  const baseHeight = img.naturalHeight || MENU_COORDINATE_BASE.height;
  overlay.innerHTML = '';

  const isEdit = startMenuState.settings.mode === 'edit';
  const values = startMenuState.settings.values;

  const addDisplay = (key, options = {}) => {
    const rect = SETTINGS_FIELD_RECTS[key];
    if (!rect) return;
    const el = document.createElement('div');
    const raw = values[key];
    let text = raw;
    if (key === 'password') {
      text = values.passwordSet ? '••••' : '?';
    } else if (!text || (typeof text === 'string' && !text.trim())) {
      text = '?';
    }
    el.textContent = text;
    el.className = 'start-menu-settings-display';
    applyMenuRect(el, rect, baseWidth, baseHeight);
    overlay.appendChild(el);
  };

  const addInput = (key, options = {}) => {
    const rect = SETTINGS_FIELD_RECTS[key];
    if (!rect) return;
    let control;
    if (options.type === 'select') {
      control = document.createElement('select');
      (options.options || []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        control.appendChild(o);
      });
      control.value = values[key] || options.options?.[0] || '';
    } else {
      control = document.createElement('input');
      control.type = options.type || 'text';
      if (key === 'password') {
        // Show as plain text while editing; no masking because we don't store the original
        control.type = 'text';
        control.value = values[key] || '';
      } else {
        control.value = values[key] || (options.phoneField ? '+' : '');
      }
      control.placeholder = options.placeholder || '';
      if (options.maxLength && options.maxLength > 0) {
        control.maxLength = options.maxLength;
      }
    }
    control.className = 'start-menu-input';
    applyMenuRect(control, rect, baseWidth, baseHeight);
    control.style.pointerEvents = 'auto';
    control.style.zIndex = '12';
    control.addEventListener('input', (event) => {
      let val = event.target.value;
      if (options.phoneField) {
        if (!val.startsWith('+')) {
          val = '+' + val.replace(/^\+*/, '');
        }
        val = val.replace(/[^\d\s+\-]/g, '');
      }
      if (options.digitsOnly) {
        val = val.replace(/\D/g, '');
        if (key === 'cvrNumber') {
          val = val.slice(0, 3);
        }
      }
      if (options.expiryField) {
        const digits = val.replace(/\D/g, '').slice(0, 4);
        if (digits.length === 0) {
          val = '';
        } else if (digits.length <= 2) {
          val = digits.length === 2 ? `${digits}/` : digits;
        } else {
          val = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        }
      }
      event.target.value = val;
      if (key === 'username' || key === 'aliasName') {
        startMenuState.settings.values.username = val;
        startMenuState.settings.values.aliasName = val;
      } else {
        startMenuState.settings.values[key] = val;
      }
    });
    overlay.appendChild(control);
  };

  Object.keys(SETTINGS_FIELD_RECTS).forEach((key) => {
    if (key === 'avatar') {
      if (isEdit) {
        addDisplay(key);
      } else {
        addDisplay(key);
      }
    return;
  }
    if (isEdit) {
      if (key === 'language') {
        addInput(key, { type: 'select', options: SETTINGS_LANGUAGE_OPTIONS });
      } else if (key === 'currency') {
        addInput(key, { type: 'select', options: SETTINGS_CURRENCY_OPTIONS });
      } else if (key === 'phone') {
        addInput(key, { phoneField: true });
      } else if (key === 'expiryDate') {
        addInput(key, { expiryField: true });
      } else if (['maximumBet', 'maxDailyStake', 'weeklyMaxStake', 'maximumLoss', 'creditCardNumber', 'cvrNumber'].includes(key)) {
        addInput(key, { digitsOnly: true });
      } else if (key === 'password') {
        addInput(key, { type: 'password', maxLength: 32 });
      } else {
        addInput(key, {});
      }
    } else {
      addDisplay(key);
    }
  });

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'start-menu-hotspot';
  applyMenuRect(closeBtn, SETTINGS_BUTTON_RECTS.close, baseWidth, baseHeight);
  closeBtn.addEventListener('click', closeStartMenuSettingsModal);
  overlay.appendChild(closeBtn);

  if (isEdit) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'start-menu-hotspot';
    applyMenuRect(saveBtn, SETTINGS_BUTTON_RECTS.save, baseWidth, baseHeight);
    saveBtn.addEventListener('click', handleSettingsSave);
    overlay.appendChild(saveBtn);
  } else {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'start-menu-hotspot';
    applyMenuRect(editBtn, SETTINGS_BUTTON_RECTS.edit, baseWidth, baseHeight);
    editBtn.addEventListener('click', handleSettingsEdit);
    overlay.appendChild(editBtn);
  }

  if (startMenuState.settings.error) {
    const errorBox = document.createElement('div');
    errorBox.className = 'start-menu-register-error';
    errorBox.textContent = startMenuState.settings.error;
    applyMenuRect(errorBox, [60, 470, 480, 500], width, height);
    errorBox.style.color = '#d00';
    errorBox.style.fontFamily = 'Arial Narrow, Arial, sans-serif';
    errorBox.style.fontSize = '16px';
    errorBox.style.fontWeight = '700';
    errorBox.style.textAlign = 'center';
    errorBox.style.display = 'flex';
    errorBox.style.alignItems = 'center';
    errorBox.style.justifyContent = 'center';
    errorBox.style.pointerEvents = 'none';
    errorBox.style.zIndex = '14';
    overlay.appendChild(errorBox);
  }
}

function handleCashierAmountInput(event) {
  const raw = event.target.value || '';
  const digits = raw.replace(/\D/g, '');
  startMenuState.cashier.amount = digits;
  updateCashierComputed();
}

function handleCashierClosedClick() {
  startMenuState.cashier.message = 'Closed due to refurbishment';
  updateCashierComputed();
}

function updateCashierComputed() {
  const overlay = startMenuRefs.cashierOverlay;
  if (!overlay) return;
  const userCurrency = getUserCurrency();
  const effectiveCurrency = userCurrency || 'USD';
  const rate = getCurrencyRate(effectiveCurrency);
  const amountValue = Number.parseInt(startMenuState.cashier.amount || '0', 10) || 0;
  const mirrorVal = amountValue ? String(amountValue) : '';
  const priceVal = (amountValue * rate).toFixed(2);
  const priceDisplay = `${priceVal} ${effectiveCurrency}`;
  startMenuState.cashier.mirroredAmount = mirrorVal;
  startMenuState.cashier.priceDisplay = priceDisplay;

  const balanceEl = overlay.querySelector('[data-cashier="balance"]');
  if (balanceEl) {
    const bal =
      state.user?.realBalanceDisplay ||
      (state.user?.realBalance !== undefined ? pennies(state.user.realBalance) : '?');
    balanceEl.textContent = bal || '?';
  }

  const amountInput = overlay.querySelector('[data-cashier="amount"]');
  if (amountInput) {
    amountInput.value = startMenuState.cashier.amount;
  }

  const mirrorInput = overlay.querySelector('[data-cashier="mirror"]');
  if (mirrorInput) {
    mirrorInput.value = mirrorVal;
  }

  const priceInput = overlay.querySelector('[data-cashier="price"]');
  if (priceInput) {
    priceInput.value = priceDisplay;
  }

  const cardEl = overlay.querySelector('[data-cashier="card"]');
  if (cardEl) {
    const cardNumber =
      state.user?.creditCardNumber ||
      state.user?.credit_card_number ||
      startMenuState.settings.values.creditCardNumber ||
      '';
    const cardText = cardNumber || '?';
    cardEl.textContent = cardText;
  }

  const messageEl = overlay.querySelector('[data-cashier="message"]');
  if (messageEl) {
    messageEl.textContent = startMenuState.cashier.message || '';
    messageEl.style.setProperty('color', '#d00', 'important');
    messageEl.style.fontWeight = '700';
    messageEl.style.textAlign = 'center';
    messageEl.style.whiteSpace = 'nowrap';
  }
}

function renderCashierOverlay() {
  const overlay = startMenuRefs.cashierOverlay;
  const img = startMenuRefs.cashierImage;
  if (!overlay || !img) return;

  const baseWidth = img.naturalWidth || MENU_COORDINATE_BASE.width;
  const baseHeight = img.naturalHeight || MENU_COORDINATE_BASE.height;
  overlay.innerHTML = '';

  const makeDisplay = (rect, datasetKey) => {
    const el = document.createElement('div');
    el.className = 'start-menu-settings-display';
    if (datasetKey) el.dataset.cashier = datasetKey;
    applyMenuRect(el, rect, baseWidth, baseHeight);
    overlay.appendChild(el);
    return el;
  };

  // Balance display
  makeDisplay([107, 91, 243, 126], 'balance');

  // Amount input (digits only)
  const amountInput = document.createElement('input');
  amountInput.type = 'tel';
  amountInput.inputMode = 'numeric';
  amountInput.className = 'start-menu-input';
  amountInput.dataset.cashier = 'amount';
  applyMenuRect(amountInput, [107, 292, 243, 324], baseWidth, baseHeight);
  amountInput.addEventListener('input', handleCashierAmountInput);
  overlay.appendChild(amountInput);

  // Credit card or currency message
  makeDisplay([24, 446, 330, 482], 'card');

  // Mirrored amount (readonly)
  const mirrorInput = document.createElement('input');
  mirrorInput.type = 'text';
  mirrorInput.readOnly = true;
  mirrorInput.className = 'start-menu-input';
  mirrorInput.dataset.cashier = 'mirror';
  applyMenuRect(mirrorInput, [24, 540, 160, 576], baseWidth, baseHeight);
  overlay.appendChild(mirrorInput);

  // Price display
  const priceInput = document.createElement('input');
  priceInput.type = 'text';
  priceInput.readOnly = true;
  priceInput.className = 'start-menu-input';
  priceInput.dataset.cashier = 'price';
  applyMenuRect(priceInput, [192, 540, 329, 576], baseWidth, baseHeight);
  overlay.appendChild(priceInput);

  // Message above buttons (single line, wider, slightly higher)
  makeDisplay([50, 795, 300, 830], 'message');

  // Buy hotspot
  const buyBtn = document.createElement('button');
  buyBtn.type = 'button';
  buyBtn.className = 'start-menu-hotspot';
  applyMenuRect(buyBtn, [91, 832, 157, 863], baseWidth, baseHeight);
  buyBtn.style.background = 'transparent';
  buyBtn.style.opacity = '1';
  buyBtn.addEventListener('click', handleCashierClosedClick);
  overlay.appendChild(buyBtn);

  // Sell hotspot
  const sellBtn = document.createElement('button');
  sellBtn.type = 'button';
  sellBtn.className = 'start-menu-hotspot';
  applyMenuRect(sellBtn, [190, 832, 256, 863], baseWidth, baseHeight);
  sellBtn.style.background = 'transparent';
  sellBtn.style.opacity = '1';
  sellBtn.addEventListener('click', handleCashierClosedClick);
  overlay.appendChild(sellBtn);

  // Close hotspot
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'start-menu-hotspot';
  applyMenuRect(closeBtn, [9, 864, 62, 885], baseWidth, baseHeight);
  closeBtn.addEventListener('click', closeStartMenuCashierModal);
  overlay.appendChild(closeBtn);

  updateCashierComputed();
}

function addRegisterErrorMessage(width, height) {
  if (!startMenuRefs.overlay) return;
  if (!startMenuState.registerError) return;
  const errorBox = document.createElement('div');
  errorBox.className = 'start-menu-register-error';
  errorBox.textContent = startMenuState.registerError;
  applyMenuRect(errorBox, [200, 470, 620, 500], width, height);
  errorBox.style.color = '#d00';
  errorBox.style.fontFamily = 'Arial Narrow, Arial, sans-serif';
  errorBox.style.fontSize = '16px';
  errorBox.style.fontWeight = '700';
  errorBox.style.textAlign = 'center';
  errorBox.style.display = 'flex';
  errorBox.style.alignItems = 'center';
  errorBox.style.justifyContent = 'center';
  errorBox.style.pointerEvents = 'none';
  errorBox.style.zIndex = '12';
  startMenuRefs.overlay.appendChild(errorBox);
}

function handleRegisterStep1Next() {
  const error = validateRegisterScreen('register1');
  if (error) {
    setRegisterError(error);
    return;
  }
  setRegisterError('');
  setStartMenuScreen('register2');
}

function handleRegisterStep2Next() {
  const error = validateRegisterScreen('register2');
  if (error) {
    setRegisterError(error);
    return;
  }
  setRegisterError('');
  setStartMenuScreen('register3');
}

async function handleRegisterSubmit() {
  if (startMenuState.loading) {
    return;
  }
  const validationError = validateRegisterAll();
  if (validationError) {
    setRegisterError(validationError);
    return;
  }
  setRegisterError('');
  startMenuState.loading = true;
  renderStartMenuScreen();
  try {
    const form = startMenuState.register;
    const formData = new FormData();
    formData.append('firstName', form.firstName.trim());
    formData.append('secondName', form.secondName.trim());
    formData.append('dateOfBirth', form.dateOfBirth);
    formData.append('email', form.email.trim());
    formData.append('phone', form.phone.trim());
    formData.append('country', form.country.trim());
    formData.append('houseNameOrNumber', form.houseNameOrNumber.trim());
    formData.append('addressFirstLine', form.addressFirstLine.trim());
    formData.append('addressSecondLine', form.addressSecondLine.trim());
    formData.append('townOrCity', form.townOrCity.trim());
    formData.append('county', form.county.trim());
    formData.append('countryOfResidence', form.countryOfResidence.trim());
    formData.append('maximumBet', form.maximumBet.trim());
    formData.append('limitPerDay', form.limitPerDay.trim());
    formData.append('maximumLoss', form.maximumLoss.trim());
    formData.append('creditCardNumber', form.creditCardNumber.trim());
    formData.append('expiryDate', form.expiryDate.trim());
    formData.append('cvrNumber', form.cvrNumber.trim());
    if (form.identityFile) {
      formData.append('identityImage', form.identityFile);
    }
    if (form.billImageFile) {
      formData.append('billImage', form.billImageFile);
    }
    if (form.creditCardImageFile) {
      formData.append('creditCardImage', form.creditCardImageFile);
    }

    console.log('Submitting registration (3-step)', {
      firstName: form.firstName,
      secondName: form.secondName,
      dateOfBirth: form.dateOfBirth,
      email: form.email,
      phone: form.phone,
      country: form.country,
      hasIdentityFile: !!form.identityFile,
      hasBillImage: !!form.billImageFile,
      hasCreditCardImage: !!form.creditCardImageFile
    });

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      body: formData
    });
    const payload = await res.json();
    console.log('Server response:', payload);
    if (!res.ok) {
      throw new Error(payload.message || 'Unable to register.');
    }
    // Store verification token so we can proceed to username without email
    if (payload.verificationToken) {
      startMenuState.username.token = payload.verificationToken;
      startMenuState.verificationToken = payload.verificationToken;
    }
    toast('Registration saved. Please check your email.');
    startMenuState.register = getDefaultRegisterForm();
    setStartMenuScreen('checkEmail', { force: true });
  } catch (err) {
    console.error('Registration error:', err);
    toast(err.message || 'Registration failed.');
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
  }
}

async function handleUsernameSubmit() {
  // Allow click regardless; use any stored token
  const token =
    startMenuState.username.token ||
    startMenuState.verificationToken;

  if (!startMenuState.username.value || startMenuState.loading) {
    return;
  }
  startMenuState.loading = true;
  renderStartMenuScreen();
  try {
    const res = await fetch('/api/auth/username', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        username: startMenuState.username.value.trim()
      })
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.message || 'Unable to save username.');
    }
    toast('Username saved. You can now log in.');
    startMenuState.username.token = null;
    startMenuState.username.value = '';
    setStartMenuScreen('landing', { force: true });
  } catch (err) {
    toast(err.message || 'Unable to save username.');
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
  }
}

async function handleLoginSubmit() {
  if (!isLoginFormComplete() || startMenuState.loading) {
    return;
  }
  startMenuState.loading = true;
  renderStartMenuScreen();
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: startMenuState.login.email.trim(),
        password: startMenuState.login.password
      })
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.message || 'Login failed.');
    }
    if (payload.requiresPassword) {
      startMenuState.password.challengeToken = payload.challengeToken || null;
      startMenuState.password.value = '';
      toast('Enter your password to continue.');
      setStartMenuScreen('password', { force: true });
    } else {
      setLoggedInUser(payload.user);
      startMenuState.password = getDefaultPasswordChallenge();
      toast('Logged in.');
      setStartMenuScreen('authed', { force: true });
    }
  } catch (err) {
    toast(err.message || 'Unable to log in.');
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
  }
}

async function handlePasswordSubmit() {
  if (!startMenuState.password.challengeToken || startMenuState.loading) {
    return;
  }
  const value = (startMenuState.password.value || '').trim();
  if (!value) {
    toast('Enter your password.');
    return;
  }
  startMenuState.loading = true;
  renderStartMenuScreen();
  try {
    const res = await fetch('/api/auth/login/password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        challengeToken: startMenuState.password.challengeToken,
        password: value
      })
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.message || 'Password check failed.');
    }
    setLoggedInUser(payload.user);
    startMenuState.password = getDefaultPasswordChallenge();
    toast('Logged in.');
    setStartMenuScreen('authed', { force: true });
  } catch (err) {
    toast(err.message || 'Unable to verify password.');
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
  }
}

function handleSettingsEdit() {
  startMenuState.settings.mode = 'edit';
  startMenuState.settings.error = '';
  startMenuState.settings.values.password = '';
  if (startMenuRefs.settingsImage) {
    startMenuRefs.settingsImage.src = '/StartMenu/EditSettingsMenu.png';
  }
  renderSettingsOverlay();
}

async function handleSettingsSave() {
  if (!state.user || !state.user.userId) {
    toast('Please log in first.');
    return;
  }
  if (startMenuState.settings.loading) return;

  const v = startMenuState.settings.values;
  // Keep username and alias in sync
  if (v.username !== v.aliasName) {
    v.aliasName = v.username;
  }
  const updates = {
    firstName: (v.firstName || '').trim(),
    secondName: (v.secondName || '').trim(),
    dateOfBirth: v.dateOfBirth || '',
    identityNumber: (v.identityNumber || '').trim(),
    identityType: (v.identityType || '').trim(),
    email: (v.email || '').trim(),
    phone: (v.phone || '').trim(),
    houseNameOrNumber: (v.houseNameOrNumber || '').trim(),
    addressFirstLine: (v.addressFirstLine || '').trim(),
    addressSecondLine: (v.addressSecondLine || '').trim(),
    townOrCity: (v.townOrCity || '').trim(),
    county: (v.county || '').trim(),
    countryOfResidence: (v.countryOfResidence || '').trim(),
    country: (v.country || '').trim(),
    language: v.language || 'English',
    currency: v.currency || 'USD',
    maximumBet: (v.maximumBet || '').trim(),
    limitPerDay: (v.limitPerDay || v.maxDailyStake || '').trim(),
    maxDailyStake: (v.maxDailyStake || v.limitPerDay || '').trim(),
    weeklyMaxStake: (v.weeklyMaxStake || '').trim(),
    maximumLoss: (v.maximumLoss || '').trim(),
    creditCardNumber: (v.creditCardNumber || '').trim(),
    expiryDate: (v.expiryDate || '').trim(),
    cvrNumber: (v.cvrNumber || '').trim(),
    username: (v.username || '').trim(),
    aliasName: (v.aliasName || '').trim()
  };
  if (v.password && v.password.trim()) {
    updates.password = v.password.trim();
  }
  if (updates.phone && !updates.phone.startsWith('+')) {
    updates.phone = `+${updates.phone.replace(/^\+/, '')}`;
  }

  startMenuState.settings.loading = true;
  startMenuState.settings.error = '';
  renderSettingsOverlay();
  try {
    const res = await fetch('/api/auth/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: state.user.userId,
        updates
      })
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.message || 'Unable to save settings.');
    }
    // Persist user and keep settings open with fresh values
    setLoggedInUser(payload.user);
    startMenuState.settings.values = getDefaultSettingsValues(payload.user);
    startMenuState.settings.mode = 'view';
    startMenuState.settings.error = '';
    if (startMenuRefs.settingsImage) {
      startMenuRefs.settingsImage.src = '/StartMenu/SettingsMenu.png';
    }
    renderSettingsOverlay();
    toast('Settings saved.');
  } catch (err) {
    startMenuState.settings.error = err.message || 'Unable to save settings.';
    renderSettingsOverlay();
  } finally {
    startMenuState.settings.loading = false;
    renderSettingsOverlay();
  }
}

function setLoggedInUser(user) {
  if (!user) return;
    state.user = {
    userId: user.userId,
    username: user.username,
    aliasName: user.aliasName || user.username,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    secondName: user.secondName,
    dateOfBirth: user.dateOfBirth,
    identityNumber: user.identityNumber,
    identityType: user.identityType,
    country: user.country,
    houseNameOrNumber: user.houseNameOrNumber,
    addressFirstLine: user.addressFirstLine,
    addressSecondLine: user.addressSecondLine,
    townOrCity: user.townOrCity,
    county: user.county,
    countryOfResidence: user.countryOfResidence,
    language: user.language || 'English',
    currency: user.currency || 'USD',
    maximumBet: user.maximumBet,
    limitPerDay: user.limitPerDay,
    maxDailyStake: user.maxDailyStake,
    weeklyMaxStake: user.weeklyMaxStake,
    maximumLoss: user.maximumLoss,
    creditCardNumber: user.creditCardNumber,
    expiryDate: user.expiryDate,
    cvrNumber: user.cvrNumber,
    balance: user.balance,
    balanceDisplay: user.balanceDisplay,
    realBalance: user.realBalance || 0,
    realBalanceDisplay: user.realBalanceDisplay || '0.00',
    passwordSet: Boolean(user.passwordSet)
    };
    syncSettingsFromUser();
    registerWithSocket();
    render();
}

function syncSettingsFromUser() {
  startMenuState.settings.values = getDefaultSettingsValues(state.user);
  startMenuState.settings.error = '';
  startMenuState.settings.mode = 'view';
}

async function refreshUserProfile() {
  if (!state.user || !state.user.userId) return;
  try {
    const res = await fetch(`/api/auth/profile?userId=${encodeURIComponent(state.user.userId)}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.message || 'Failed to load profile');
    if (payload && payload.user) {
      setLoggedInUser(payload.user);
    }
  } catch (err) {
    console.warn('Profile refresh failed', err);
  }
}

function handleMenuLogout() {
  handleSignOut();
}

function handleMenuCreateTable() {
  if (!ensureAuthed()) return;
  const tableType = startMenuState.play.tableType === 'real' && !startMenuState.isBlockedCountry ? 'real' : 'balance';
  socket.emit('create-game', { tableType });
  closeStartMenuShell();
}

function handleMenuJoinTable() {
  if (!ensureAuthed()) return;
  if (!isJoinCodeValid()) {
    toast('Enter a 5-letter table code.');
    return;
  }
  const tableType = startMenuState.play.tableType === 'real' && !startMenuState.isBlockedCountry ? 'real' : 'balance';
  socket.emit('join-game', { code: startMenuState.play.code.trim().toUpperCase(), tableType });
  closeStartMenuShell();
}

function closeStartMenuShell() {
  startMenuState.active = false;
  startMenuRefs.root?.classList.add('hidden');
  document.body.classList.remove('start-menu-active');
  startMenuRefs.appShell?.classList.remove('hidden');
  updateOrientationLock();
}

function showStartMenuShell(screen = 'landing') {
  startMenuState.active = true;
  startMenuRefs.root?.classList.remove('hidden');
  document.body.classList.add('start-menu-active');
  startMenuRefs.appShell?.classList.add('hidden');
  setStartMenuScreen(screen, { force: true });
  updateOrientationLock();
}
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    state.config = await res.json();
  } catch (err) {
    console.error('Config load failed', err);
  }
}

async function loadGeoStatus() {
  try {
    const res = await fetch('/api/geo');
    const data = await res.json();
    startMenuState.isBlockedCountry = Boolean(data.blocked);
  } catch (err) {
    startMenuState.isBlockedCountry = false;
  } finally {
    renderStartMenuTaskbar(startMenuState.currentScreen);
  }
}

function handlePlayClick() {
  if (startMenuState.isBlockedCountry) {
    startMenuState.play.tableType = 'balance';
    setStartMenuScreen('play');
    return;
  }
  setStartMenuScreen('tableType');
}

function selectTableType(type) {
  const chosen = type === 'real' ? 'real' : 'balance';
  if (chosen === 'real' && startMenuState.isBlockedCountry) {
    startMenuState.play.tableType = 'balance';
    setStartMenuScreen('play', { force: true });
    return;
  }
  startMenuState.play.tableType = chosen;
  setStartMenuScreen('play', { force: true });
}

function ensureAuthed() {
  if (!state.user) {
    setStartMenuScreen('login');
    return false;
  }
  return true;
}


function registerWithSocket() {
  if (!state.user) return;
  socket.emit('register-user', { userId: state.user.userId });
}

function render() {
  renderAuth();
  renderLobby();
  renderTable();
  renderReadyOverlay();
  renderBetSlider();
  renderTickerTapes();
  renderActions();
  renderLog();
  renderBadges();
}

function renderAuth() {
  if (state.user) {
    refs.headerUser?.classList.remove('hidden');
    refs.headerSignin?.classList.add('hidden');
    if (refs.headerUsername) {
      const usingReal = state.game?.walletType === 'real';
      const balance = usingReal
        ? state.user.realBalanceDisplay || ''
        : state.user.balanceDisplay || '';
      refs.headerUsername.textContent = balance
        ? `${state.user.username} · ${balance}`
        : state.user.username;
    }
    // Show Info button only when signed in
    if (refs.headerInfoBtn) {
      refs.headerInfoBtn.style.display = 'block';
      // Disable if in a game
      const isInGame = state.game && state.game.state !== 'lobby';
      refs.headerInfoBtn.disabled = isInGame;
    }
  } else {
    refs.headerUser?.classList.add('hidden');
    refs.headerSignin?.classList.remove('hidden');
    // Hide Info button when not signed in
    if (refs.headerInfoBtn) {
      refs.headerInfoBtn.style.display = 'none';
    }
  }
}

function renderLobby() {
  if (!refs.lobbyStatus) return;
  const lobbyVisible = !state.game;
  refs.lobbyPanel?.classList.toggle('hidden', !lobbyVisible);
  if (!state.game) {
    refs.lobbyStatus.textContent = 'Create a table or enter a code. 2-6 players per table.';
    refs.readyHint.textContent = '';
    clearPendingGameState();
    return;
  }
  refs.lobbyStatus.textContent = '';
  refs.readyHint.textContent = '';
}

function renderTable() {
  if (!refs.tableCircle || !refs.tableContainer) return;
  const playerCount = state.game?.players?.length || 0;
  const angledView = shouldUseAngledView();
  state.viewMode = angledView ? 'angled' : 'topdown';
  refs.tableContainer.classList.toggle('table-angled', angledView);
  refs.tableCircle.classList.toggle('angled-table', angledView);
  document.body?.classList.toggle('angled-view', angledView);
  document.body?.classList.toggle('table-crowded', !angledView && playerCount >= 5);
  document.body?.classList.toggle(
    'table-compact',
    !angledView && playerCount >= 3 && playerCount <= 4
  );
  refs.tableCircle.innerHTML = '';
  const defaultBack = '/cards/Card_Face_Down.png';
  if (!state.game) {
    document.body?.classList.remove('table-crowded');
    document.body?.classList.remove('table-compact');
    refs.tableContainer.classList.remove('table-angled');
    refs.tableCircle.classList.remove('angled-table');
    document.body?.classList.remove('angled-view');
    state.renderedCardIds.clear();
    state.lastCardGenerationKey = null;
    state.renderedSelectionIds.clear();
    state.lastSelectionKey = null;
    state.tableAnnouncement = null;
    if (state.announcementTimeout) {
      clearTimeout(state.announcementTimeout);
      state.announcementTimeout = null;
    }
    state.cardRotations.clear();
    state.lastDealerCardKey = null;
    refs.potDisplay.classList.add('hidden');
    refs.potDisplay.textContent = 'Pot £0.00';
    if (refs.dealerCard) refs.dealerCard.innerHTML = '';
    refs.gameCode.textContent = '';
    if (refs.deck) refs.deck.innerHTML = '';
    refs.tableAnnouncement?.classList.add('hidden');
    const existingSeatsLayer = refs.tableContainer.querySelector('.seats-layer');
    if (existingSeatsLayer) existingSeatsLayer.remove();
    return;
  }
  const self = getSelf();
  const totalSeats = playerCount || 4;
  const dealerDrawMap = new Map((state.game.dealerDraws || []).map((draw) => [draw.playerId, draw]));
  const dealKey = `${state.game.code}-${state.game.dealId ?? 0}`;
  if (state.game.state !== 'dealer-selection' && state.lastCardGenerationKey !== dealKey) {
    state.renderedCardIds.clear();
    state.lastCardGenerationKey = dealKey;
    state.cardRotations.clear();
  }
  if (state.game.state === 'dealer-selection') {
    const selectionKey = `${state.game.code}-${state.game.dealId ?? 0}-selection`;
    if (state.lastSelectionKey !== selectionKey) {
      state.renderedSelectionIds.clear();
      state.lastSelectionKey = selectionKey;
    }
  } else if (state.lastSelectionKey) {
    state.renderedSelectionIds.clear();
    state.lastSelectionKey = null;
  }
  const cardBack = state.game.assets?.faceDownCard || defaultBack;
  const cardsLayer = document.createElement('div');
  cardsLayer.className = 'cards-layer';
  refs.tableCircle.appendChild(cardsLayer);
  const existingSeatsLayer = refs.tableContainer.querySelector('.seats-layer');
  if (existingSeatsLayer) existingSeatsLayer.remove();
  const seatsLayer = document.createElement('div');
  seatsLayer.className = 'seats-layer';
  refs.tableContainer.appendChild(seatsLayer);

  state.game.players.forEach((player) => {
    const seat = document.createElement('div');
    seat.className = 'seat';
    if (player.userId === state.game.players[state.game.currentPlayerIndex]?.userId) {
      seat.classList.add('current');
    }
    // Position seat based on viewSeat (0-5 position), not actual player seat
    const viewSeat = getViewSeatIndex(player.seat, totalSeats);
    const seatCoords = getViewSeatCoords(viewSeat, totalSeats, 72);
    seat.style.left = `${seatCoords.x}%`;
    seat.style.top = `${seatCoords.y}%`;
    seat.style.transform = 'translate(-50%, -50%)';
    const seatCard = document.createElement('div');
    seatCard.className = 'seat-card';
    seatCard.innerHTML = `
      <div class="name">${player.username}${self && player.userId === self.userId ? ' (You)' : ''}</div>
      <div class="balance">${player.balanceDisplay}</div>
    `;
    if (player.isDealer) {
      seatCard.classList.add('dealer');
    }
    seat.appendChild(seatCard);
    seatsLayer.appendChild(seat);

    if (state.game.state === 'dealer-selection') {
      const draw = dealerDrawMap.get(player.userId);
      if (draw && draw.cardImage) {
        renderSelectionCard(cardsLayer, player, draw, cardBack, totalSeats);
    }
    } else {
      renderPlayerCardsOnTable(cardsLayer, player, totalSeats, cardBack);
    }
  });

  if (state.game.dealerCard) {
    refs.potDisplay.classList.remove('hidden');
    refs.potDisplay.textContent = `Pot ${state.game.potDisplay}`;
    if (refs.roundIndicator) {
      const roundNumber = state.game.currentRound || 1;
      refs.roundIndicator.textContent = `Round ${roundNumber}`;
      refs.roundIndicator.classList.remove('hidden');
    }
  } else {
    refs.potDisplay.classList.add('hidden');
    if (refs.roundIndicator) {
      refs.roundIndicator.classList.add('hidden');
    }
    state.lastDealerCardKey = null;
  }
  if (refs.dealerCard) {
    refs.dealerCard.innerHTML = '';
  }
  refs.gameCode.textContent = state.game ? `CODE ${state.game.code}` : '';
  if (refs.deck) {
    refs.deck.innerHTML = '';
    if (!angledView) {
      const deckImg = document.createElement('img');
      deckImg.src = cardBack;
      deckImg.alt = 'Deck';
      refs.deck.appendChild(deckImg);
      refs.deck.classList.remove('hidden');
    } else {
      refs.deck.classList.add('hidden');
    }
  }

  renderDealerCardOnTable(cardsLayer, cardBack, totalSeats);

  if (refs.tableAnnouncement) {
    if (state.tableAnnouncement) {
      const { title, subtitle } = state.tableAnnouncement;
      refs.tableAnnouncement.innerHTML = '';
      const titleEl = document.createElement('div');
      titleEl.className = 'table-announcement-title';
      titleEl.textContent = title || '';
      refs.tableAnnouncement.appendChild(titleEl);
      if (subtitle) {
        const subEl = document.createElement('div');
        subEl.className = 'table-announcement-subtext';
        subEl.textContent = subtitle;
        refs.tableAnnouncement.appendChild(subEl);
      }
      refs.tableAnnouncement.classList.remove('hidden');
    } else {
      refs.tableAnnouncement.classList.add('hidden');
      refs.tableAnnouncement.innerHTML = '';
    }
  }
}

function renderActions() {
  if (!refs.actions || !refs.hand) return;
  refs.actions.innerHTML = '';
  refs.hand.innerHTML = '';
}

function renderLog() {
  if (!refs.messageLog) return;
  refs.messageLog.innerHTML = '';
  if (!state.game || !state.game.messageLog?.length) {
    refs.messageLog.textContent = 'Game updates will appear here.';
    return;
  }
  state.game.messageLog
    .slice()
    .reverse()
    .forEach((entry) => {
      const block = document.createElement('div');
      block.className = 'log-entry';
      const time = new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      block.innerHTML = `<small>${time}</small>${entry.text}`;
      refs.messageLog.appendChild(block);
    });
}

function renderBadges() {
  if (!refs.statusBadges) return;
  refs.statusBadges.innerHTML = '';
  const badges = state.shootStage ? [state.shootStage.message] : [];
  if (!badges.length) {
    refs.statusBadges.classList.add('hidden');
    return;
  }
  refs.statusBadges.classList.remove('hidden');
  badges.forEach((text) => {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = text;
    refs.statusBadges.appendChild(badge);
  });
}

function renderPlayerCardsOnTable(layer, player, totalSeats, cardBack) {
  if (!player.cards || !player.cards.length) return;
  const cardGroup = document.createElement('div');
  cardGroup.className = 'player-cards pile-mode';
  cardGroup.dataset.seat = player.seat; // Keep actual seat for game logic queries
  // Calculate viewSeat first - this is the position (0-5) this player appears in from current viewer's perspective
  const viewSeat = getViewSeatIndex(player.seat, totalSeats);
  cardGroup.dataset.viewSeat = String(viewSeat); // Use viewSeat for CSS positioning (ensure string for attribute selector)
  const useAngled = isAngledLayout();
  const seatCardBack = cardBack;
  
  // Position cards based on viewSeat (0-5 position), not actual player seat
  const seatCoords = getViewSeatCoords(viewSeat, totalSeats, 72);
  const baseCoords = getViewCardCoords(viewSeat, totalSeats, 34);
  
  let cardX = Number.isFinite(baseCoords.x) ? baseCoords.x : seatCoords.x;
  let cardY = Number.isFinite(baseCoords.y) ? baseCoords.y : seatCoords.y;

  if (useAngled) {
    cardX = baseCoords.x;
    cardY = baseCoords.y;
  } else if (totalSeats >= 5 && !player.isDealer) {
    const bringCardsCloser = (factor) => {
      cardX = seatCoords.x + (baseCoords.x - seatCoords.x) * factor;
      cardY = seatCoords.y + (baseCoords.y - seatCoords.y) * factor;
    };
    if (viewSeat === 0 || viewSeat === 1) {
      bringCardsCloser(0.55);
    } else if ([2, 3, 4, 5].includes(viewSeat)) {
      bringCardsCloser(0.7);
    }
  }

  // Set coordinates directly
  cardGroup.style.left = `${cardX}%`;
  cardGroup.style.top = `${cardY}%`;
  
  const baseMultiplier = getPileSizeMultiplier(viewSeat, totalSeats, useAngled);
  cardGroup.style.setProperty('--pile-card-width', `calc(var(--card-width) * ${baseMultiplier})`);
  cardGroup.style.setProperty(
    '--pile-card-height',
    `calc(var(--card-width) * ${baseMultiplier * CARD_HEIGHT_RATIO})`
  );
  cardGroup.style.transform = 'translate(-50%, -50%)';
  let lastRotation = null;
  player.cards.forEach((card, index) => {
    const img = document.createElement('img');
    img.classList.add('player-card');
    img.dataset.cardIndex = index;
    const faceImage = card.revealed && card.image ? card.image : null;
    img.src = faceImage || seatCardBack;
    img.style.zIndex = String(index + 1);
    const rotationKey = getCardPileRotationKey(player, card, index);
    let pileRotation = state.cardRotations.get(rotationKey);
    if (typeof pileRotation !== 'number') {
      pileRotation = getMessyPileRotation(lastRotation);
      state.cardRotations.set(rotationKey, pileRotation);
    }
    lastRotation = pileRotation;
    img.alt = card.revealed ? card.label : 'Hidden card';
    const cardKey = card.id ?? `${player.userId}-${index}`;
    const shouldAnimate = cardKey && !state.renderedCardIds.has(cardKey);
    if (shouldAnimate) {
      state.renderedCardIds.add(cardKey);
      img.style.opacity = '0';
      const delay = getDealAnimationDelay(player.seat, index, totalSeats);
      requestAnimationFrame(() =>
        animateCardFromDeck(img, delay, pileRotation, totalSeats, { centered: true })
      );
    } else {
      applyCenteredRotation(img, pileRotation);
    }
    cardGroup.appendChild(img);
  });

  layer.appendChild(cardGroup);
}

function renderDealerCardOnTable(layer, cardBack, totalSeatsArg) {
  if (!state.game || !state.game.dealerCard) {
    state.lastDealerCardKey = null;
    return;
  }
  if (typeof state.game.dealerIndex !== 'number') return;
  const dealerPlayer = state.game.players[state.game.dealerIndex];
  if (!dealerPlayer) return;
  const totalSeats = totalSeatsArg || state.game.players.length || 4;
  // Position dealer card based on viewSeat (0-5 position), not actual player seat
  const viewSeat = getViewSeatIndex(dealerPlayer.seat, totalSeats);
  const seatCoords = getViewSeatCoords(viewSeat, totalSeats, 72);
  const useAngled = isAngledLayout();
  
  // Use the same card position logic as player cards
  let cardCoords = getViewCardCoords(viewSeat, totalSeats, 34);
  
  // Calculate rotation: point card top toward center with back pointing to seat
  let rotation;
  if (useAngled) {
    const center = { x: 50, y: 40 };
    if (totalSeats < 5) {
      rotation = getViewCardRotation(viewSeat, totalSeats);
    } else {
      rotation = getDealerCardRotationTowardCenter(cardCoords, center, seatCoords);
    }
  } else {
    // In top-down view, use standard rotation logic (already points toward center)
    rotation = getViewCardRotation(viewSeat, totalSeats);
  }
  if (viewSeat === 0 || viewSeat === 2 || viewSeat === 5) {
    rotation += 180;
  }

  const holder = document.createElement('div');
  holder.className = 'dealer-card-on-table';
  holder.style.left = `${cardCoords.x}%`;
  holder.style.top = `${cardCoords.y}%`;
  if (useAngled) {
    const dealerSizeMultiplier = getPileSizeMultiplier(viewSeat, totalSeats, true);
    holder.style.setProperty('--pile-card-width', `calc(var(--card-width) * ${dealerSizeMultiplier})`);
  } else {
    holder.style.removeProperty('--pile-card-width');
  }
  
  const img = document.createElement('img');
  const seatCardBack = cardBack;
  const dealerImage = state.game.dealerCard.image || seatCardBack;
  img.src = dealerImage || seatCardBack;
    
  img.style.transform = `rotate(${rotation}deg)`;
  img.alt = state.game.dealerCard.label || 'Dealer card';
  const dealerKey = state.game.dealerCard.label || null;
  const shouldAnimate = dealerKey && state.lastDealerCardKey !== dealerKey;
  state.lastDealerCardKey = dealerKey;
  if (shouldAnimate) {
    img.style.opacity = '0';
    requestAnimationFrame(() => animateCardFromDeck(img, 0, rotation, totalSeats));
  }
  holder.appendChild(img);
  layer.appendChild(holder);
}

function renderSelectionCard(layer, player, draw, cardBack, totalSeats) {
  const selectionId = `${draw.playerId}-${draw.card}`;
  const shouldAnimate = !state.renderedSelectionIds.has(selectionId);
  state.renderedSelectionIds.add(selectionId);
  const finalTotalSeats = totalSeats || state.game.players.length || 4;
  // Position selection card based on viewSeat (0-5 position), not actual player seat
  const viewSeat = getViewSeatIndex(player.seat, finalTotalSeats);
  const seatCoords = getViewSeatCoords(viewSeat, finalTotalSeats, 72);
  let cardCoords = getViewCardCoords(viewSeat, finalTotalSeats, 32);
  const useAngled = isAngledLayout();
  if (useAngled) {
    const center = { x: 50, y: 50 };
    const factor = finalTotalSeats >= 5 ? 0.45 : 0.5;
    cardCoords = {
      x: seatCoords.x + (center.x - seatCoords.x) * factor,
      y: seatCoords.y + (center.y - seatCoords.y) * factor
    };
  }
  const holder = document.createElement('div');
  holder.className = 'selection-card';
  holder.style.left = `${cardCoords.x}%`;
  holder.style.top = `${cardCoords.y}%`;
  const img = document.createElement('img');
  const seatCardBack = cardBack;
  const selectionImage = draw.cardImage || seatCardBack;
  img.src = selectionImage || seatCardBack;
  let selectionRotation = 0;
  if (useAngled) {
    selectionRotation = getAngledCardRotationFromCoords(seatCoords, cardCoords);
    img.style.transform = `rotate(${selectionRotation}deg)`;
  }
  img.alt = draw.card;
  const label = document.createElement('small');
  label.textContent = draw.card;
  holder.appendChild(img);
  holder.appendChild(label);
  layer.appendChild(holder);
  if (shouldAnimate) {
    img.style.opacity = '0';
    const delay = (draw.order ?? player.seat ?? 0) * 180;
    const finalTotalSeats = totalSeats || state.game.players.length || 4;
    requestAnimationFrame(() => animateCardFromDeck(img, delay, selectionRotation, finalTotalSeats));
  } else {
    img.style.opacity = '1';
  }
}

function renderReadyOverlay() {
  if (!refs.tableReady) return;
  refs.tableReady.innerHTML = '';
  if (!state.game || state.game.state !== 'lobby') {
    refs.tableReady.classList.add('hidden');
    return;
  }
  refs.tableReady.classList.remove('hidden');
  const self = getSelf();
  state.game.players.forEach((player) => {
    const btn = document.createElement('button');
    btn.textContent = `${player.username} ${player.ready ? 'Ready!' : 'Ready?'}`;
    if (player.ready) btn.classList.add('ready');
    if (player.isDealer) btn.classList.add('dealer');
    btn.disabled = !self || self.userId !== player.userId;
    btn.addEventListener('click', () => toggleReady(!player.ready));
    refs.tableReady.appendChild(btn);
  });
}

function renderBetSlider() {
  if (!refs.betSliderContainer) return;
  refs.betSliderContainer.innerHTML = '';
  
  if (!state.game) {
    refs.betSliderContainer.classList.add('hidden');
    return;
  }
  
  const self = getSelf();
  const phase = state.game.state;
  
  if (!self || (phase !== 'active' && phase !== 'awaiting-stake')) {
    refs.betSliderContainer.classList.add('hidden');
    return;
  }
  
  refs.betSliderContainer.classList.remove('hidden');
  const minimumStake = state.game.minimumStake || 20;
  const potAmount = state.game.pot || minimumStake;
  const shootCost = Math.max(potAmount, minimumStake);
  
  // Helper function to add dealer card info in angled view
  const addDealerCardInfo = () => {
    if (isAngledLayout() && state.game.dealerCard) {
      const dealerCardInfo = document.createElement('p');
      dealerCardInfo.className = 'bet-slider-dealer-card';
      const label = state.game.dealerCard.revealed
        ? `Dealers Card: ${state.game.dealerCard.label}`
        : 'Dealer card is face down';
      dealerCardInfo.textContent = label;
      refs.betSliderContainer.appendChild(dealerCardInfo);
    }
  };

  // Dealer view
  if (phase === 'awaiting-stake' && self.isDealer) {
    const message = document.createElement('p');
    message.className = 'bet-slider-message';
    message.textContent = 'Choose how to start the round.';
    refs.betSliderContainer.appendChild(message);
    
    addDealerCardInfo();
    
    // const info = document.createElement('p');
    // info.className = 'bet-slider-subtext';
    // info.textContent = 'Reveal now for minimum stake, or choose stake with face down card';
    // refs.betSliderContainer.appendChild(info);
    
    const inlineContainer = document.createElement('div');
    inlineContainer.className = 'dealer-stake-inline';

    const revealBtn = document.createElement('button');
    revealBtn.className = 'accent ghost';
    revealBtn.textContent = `Reveal card & stake ${pennies(minimumStake)}`;
    revealBtn.addEventListener('click', () => socket.emit('dealer-reveal-minimum'));
    inlineContainer.appendChild(revealBtn);

    const divider = document.createElement('span');
    divider.className = 'dealer-stake-divider';
    divider.textContent = 'or';
    inlineContainer.appendChild(divider);

    const select = document.createElement('select');
    state.game.stakeOptions.forEach((value) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = `${pennies(value)}`;
      if (state.game.currentStake === value) opt.selected = true;
      select.appendChild(opt);
    });
    inlineContainer.appendChild(select);
    
    const button = document.createElement('button');
    button.className = 'accent';
    button.textContent = 'Keep Face Down!';
    button.addEventListener('click', () =>
      socket.emit('dealer-set-stake', { amount: Number(select.value) })
    );
    inlineContainer.appendChild(button);
    
    refs.betSliderContainer.appendChild(inlineContainer);
    return;
  }
  
  // Non-dealer during awaiting-stake
  if (phase === 'awaiting-stake' && !self.isDealer) {
    const message = document.createElement('p');
    message.className = 'bet-slider-message';
    message.textContent = 'Waiting for dealer to set stake...';
    refs.betSliderContainer.appendChild(message);
    addDealerCardInfo();
    return;
  }
  
  // Active game - check if dealer
  if (self.isDealer) {
    const message = document.createElement('p');
    message.className = 'bet-slider-message';
    message.textContent = 'You are the dealer';
    refs.betSliderContainer.appendChild(message);
    addDealerCardInfo();
    return;
  }
  
  // Active game - check if it's player's turn
    const isMyTurn = self.userId === state.game.players[state.game.currentPlayerIndex]?.userId;
  const username = self.username || 'Player';
  
  // Check if game is in a transition state where buttons should be disabled
  const transitionStates = ['resolving-stake', 'resolving-bet', 'resolving-shoot', 'resolving-allin', 'dealer-selection', 'post-game', 'awaiting-stake'];
  const isTransitioning = transitionStates.includes(phase);
  
  // Additional checks: ensure dealer card exists and it's actually the player's turn with cards ready
  const dealerCardExists = !!state.game.dealerCard;
  const hasCards = self?.cards && Array.isArray(self.cards) && self.cards.length > 0;
  const isReadyForActions = dealerCardExists && hasCards && phase === 'active';
  
  const canInteract = isMyTurn && !isTransitioning && isReadyForActions && phase === 'active';
  
  const message = document.createElement('p');
  message.className = 'bet-slider-message';
  if (isTransitioning) {
    message.textContent = `Please wait ${username}...`;
  } else if (!isMyTurn) {
    message.textContent = `Sorry ${username}, you'll have to wait`;
  } else {
    message.textContent = `Place your bet ${username}`;
  }
  refs.betSliderContainer.appendChild(message);
  addDealerCardInfo();
  
  if (!isMyTurn) {
    // Not player's turn - show message only, no slider
    return;
  }
  
  if (isTransitioning) {
    // During transitions - show disabled slider
    const sliderWrapper = document.createElement('div');
    sliderWrapper.className = 'bet-slider-wrapper';
    sliderWrapper.style.opacity = '0.5';
    sliderWrapper.style.pointerEvents = 'none';
    refs.betSliderContainer.appendChild(sliderWrapper);
    return;
  }
  
  // Calculate slider range
  const canAffordShoot = self.balance >= shootCost;
  const sliderMax = canAffordShoot ? shootCost : self.balance;
  const sliderMin = minimumStake;
  
  // Snap value to nearest 10p
  function snapToTen(value) {
    return Math.round(value / 10) * 10;
  }
  
  const sliderWrapper = document.createElement('div');
  sliderWrapper.className = 'bet-slider-wrapper';
  
  // Shoot/All-in button (left)
      const shootBtn = document.createElement('button');
  shootBtn.className = 'bet-action-btn shoot-btn';
  if (canAffordShoot) {
      shootBtn.textContent = 'Shoot!';
    shootBtn.disabled = !canInteract || self.balance < shootCost;
      shootBtn.addEventListener('click', () => {
      // Double check state hasn't changed and all conditions are met
      const currentPhase = state.game?.state;
      const currentSelf = getSelf();
      const currentIsMyTurn = currentSelf?.userId === state.game?.players[state.game?.currentPlayerIndex]?.userId;
      const currentTransitionStates = ['resolving-stake', 'resolving-bet', 'resolving-shoot', 'resolving-allin', 'dealer-selection', 'post-game', 'awaiting-stake'];
      const currentDealerCardExists = !!state.game?.dealerCard;
      const currentHasCards = currentSelf?.cards && Array.isArray(currentSelf.cards) && currentSelf.cards.length > 0;
      if (currentTransitionStates.includes(currentPhase) || 
          currentPhase !== 'active' || 
          !currentIsMyTurn || 
          !currentDealerCardExists || 
          !currentHasCards) {
        return;
      }
      // Immediately disable button to prevent double-clicking
      shootBtn.disabled = true;
      betBtn.disabled = true;
      slider.disabled = true;
      socket.emit('player-shoot');
    });
    } else {
    shootBtn.textContent = 'All-in';
    shootBtn.disabled = !canInteract || self.balance <= 0;
    shootBtn.addEventListener('click', () => {
      // Double check state hasn't changed and all conditions are met
      const currentPhase = state.game?.state;
      const currentSelf = getSelf();
      const currentIsMyTurn = currentSelf?.userId === state.game?.players[state.game?.currentPlayerIndex]?.userId;
      const currentTransitionStates = ['resolving-stake', 'resolving-bet', 'resolving-shoot', 'resolving-allin', 'dealer-selection', 'post-game', 'awaiting-stake'];
      const currentDealerCardExists = !!state.game?.dealerCard;
      const currentHasCards = currentSelf?.cards && Array.isArray(currentSelf.cards) && currentSelf.cards.length > 0;
      if (currentTransitionStates.includes(currentPhase) || 
          currentPhase !== 'active' || 
          !currentIsMyTurn || 
          !currentDealerCardExists || 
          !currentHasCards) {
        return;
      }
      // Immediately disable button to prevent double-clicking
      shootBtn.disabled = true;
      betBtn.disabled = true;
      slider.disabled = true;
      if (self.balance > 0) {
        socket.emit('player-all-in');
      }
    });
  }
  sliderWrapper.appendChild(shootBtn);
  
  // Slider group (middle)
  const sliderGroup = document.createElement('div');
  sliderGroup.className = 'bet-slider-group';
  
  // Labels above slider
  const labelsDiv = document.createElement('div');
  labelsDiv.className = 'bet-slider-labels';
  const minLabel = document.createElement('span');
  minLabel.style.left = '0';
  minLabel.textContent = pennies(sliderMin);
  const maxLabel = document.createElement('span');
  maxLabel.style.right = '0';
  maxLabel.textContent = pennies(sliderMax);
  labelsDiv.appendChild(minLabel);
  labelsDiv.appendChild(maxLabel);
  sliderGroup.appendChild(labelsDiv);
  
  // Slider
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'bet-slider';
  slider.min = sliderMin;
  slider.max = sliderMax;
  slider.step = 10;
  slider.value = sliderMin;
  const sliderDisabled = !canInteract || sliderMax < sliderMin || !dealerCardExists || !hasCards;
  slider.disabled = sliderDisabled;
  
  const currentValueSpan = document.createElement('span');
  currentValueSpan.className = 'bet-slider-value';
  currentValueSpan.textContent = pennies(sliderMin);
  currentValueSpan.style.position = 'absolute';
  currentValueSpan.style.left = '50%';
  currentValueSpan.style.transform = 'translateX(-50%)';
  currentValueSpan.style.top = '-5px';
  labelsDiv.appendChild(currentValueSpan);
  
  // Bet button (right)
  const betBtn = document.createElement('button');
  betBtn.className = 'bet-action-btn bet-btn';
  betBtn.textContent = 'Place Bet';
  const betDisabled = !canInteract || sliderMax < sliderMin || !dealerCardExists || !hasCards;
  betBtn.disabled = betDisabled;
  
  // Update button text and behavior based on slider value
  function updateBetButton(value) {
    const snappedValue = snapToTen(value);
    if (snappedValue >= sliderMax) {
      // At max, show "Bet Max" but act as shoot/all-in
      betBtn.textContent = 'Bet Max';
      betBtn.classList.remove('shoot-btn');
      betBtn.classList.add('bet-btn');
  } else {
      // Below max, always show "Place Bet"
      betBtn.textContent = 'Place Bet';
      betBtn.classList.remove('shoot-btn');
      betBtn.classList.add('bet-btn');
    }
    betBtn.disabled = !canInteract || snappedValue > self.balance || snappedValue < sliderMin || !dealerCardExists || !hasCards;
  }

  if (canInteract && !sliderDisabled) {
    slider.addEventListener('input', () => {
      const value = snapToTen(Number(slider.value));
      slider.value = value;
      currentValueSpan.textContent = pennies(value);
      updateBetButton(value);
    });
  }
  
  sliderGroup.appendChild(slider);
  sliderWrapper.appendChild(sliderGroup);
  
  betBtn.addEventListener('click', () => {
    // Double check state hasn't changed and all conditions are met
    const currentPhase = state.game?.state;
    const currentSelf = getSelf();
    const currentIsMyTurn = currentSelf?.userId === state.game?.players[state.game?.currentPlayerIndex]?.userId;
    const currentTransitionStates = ['resolving-stake', 'resolving-bet', 'resolving-shoot', 'resolving-allin', 'dealer-selection', 'post-game', 'awaiting-stake'];
    const currentDealerCardExists = !!state.game?.dealerCard;
    const currentHasCards = currentSelf?.cards && Array.isArray(currentSelf.cards) && currentSelf.cards.length > 0;
    if (currentTransitionStates.includes(currentPhase) || 
        currentPhase !== 'active' || 
        !currentIsMyTurn || 
        !currentDealerCardExists || 
        !currentHasCards) {
    return;
  }
    const betAmount = snapToTen(Number(slider.value));
    if (betAmount > self.balance || betAmount < sliderMin || betAmount % 10 !== 0) {
      return;
    }
    
    // Immediately disable buttons to prevent double-clicking
    betBtn.disabled = true;
    shootBtn.disabled = true;
    slider.disabled = true;
    
    // If at max, trigger shoot/all-in
    if (betAmount >= sliderMax) {
      if (canAffordShoot) {
        socket.emit('player-shoot');
      } else if (self.balance > 0) {
        socket.emit('player-all-in');
      }
    } else if (betAmount === minimumStake) {
      // Check if it's minimum stake
      socket.emit('player-stake');
    } else {
      // Regular bet
      socket.emit('player-bet', { amount: betAmount });
    }
  });
  sliderWrapper.appendChild(betBtn);
  
  refs.betSliderContainer.appendChild(sliderWrapper);
}

function renderTickerTapes() {
  if (!refs.tickerSituation || !refs.tickerInstructions) return;
  
  const situationContent = refs.tickerSituation.querySelector('.ticker-content');
  const instructionsContent = refs.tickerInstructions.querySelector('.ticker-content');
  
  // Build situation ticker tape content
  let situationText = ' • Waiting for game to start • ';
  if (state.game) {
    const situationParts = [];
    if (state.game.potDisplay && state.game.dealerCard) {
      situationParts.push(`Pot: ${state.game.potDisplay}`);
    }
    if (state.game.currentRound) {
      situationParts.push(`Round ${state.game.currentRound}/3`);
    }
    const currentPlayer = state.game.players[state.game.currentPlayerIndex];
    if (currentPlayer) {
      situationParts.push(`Current Turn: ${currentPlayer.username}`);
    }
    if (state.game.messageLog && state.game.messageLog.length > 0) {
      const lastMessage = state.game.messageLog[state.game.messageLog.length - 1];
      const shortMessage = lastMessage.text.length > 50 
        ? lastMessage.text.substring(0, 47) + '...' 
        : lastMessage.text;
      situationParts.push(`Latest: ${shortMessage}`);
  }
    
    if (situationParts.length > 0) {
      situationText = ` • ${situationParts.join(' • ')} • `;
    }
  }
  
  // Build instructions ticker tape content - always show this
  const instructionsText = ' • HOW TO PLAY: Place minimum stake, bet a custom amount, or shoot to win the pot! If your card matches the dealer\'s suit and is higher, you win! Shoot costs the current pot amount. Game continues for 3 rounds or until someone shoots and wins. • ';
  
  // Duplicate content many times for seamless looping - enough to repeat multiple times
  const situationDuplicated = situationText.repeat(300);
  const instructionsDuplicated = instructionsText.repeat(100);
  
  situationContent.textContent = situationDuplicated;
  situationContent.setAttribute('data-text', situationText);
  
  instructionsContent.textContent = instructionsDuplicated;
  instructionsContent.setAttribute('data-text', instructionsText);
}

function toggleReady(next) {
  socket.emit('toggle-ready', { ready: next });
}

function computeSeatPosition(seat, total, radius = 38) {
  const angles = [270, 90, 0, 180];
  const safeTotal = total > 0 ? total : 4;
  const angle = angles[seat] ?? (seat * (360 / safeTotal));
  return {
    x: 50 + radius * Math.cos((Math.PI / 180) * angle),
    y: 50 + radius * Math.sin((Math.PI / 180) * angle)
  };
}

function getLayoutForSeats(total) {
  const useAngled = isAngledLayout();
  if (useAngled) {
    return total >= 5 ? ANGLED_EXTENDED_PLAYER_LAYOUT : ANGLED_PLAYER_LAYOUT;
  }
  return total >= 5 ? EXTENDED_PLAYER_LAYOUT : BASE_PLAYER_LAYOUT;
}

// Clockwise order for each player count (matching server logic)
const CLOCKWISE_ORDERS = {
  2: [0, 1],
  3: [0, 2, 1],
  4: [0, 2, 1, 3],
  5: [0, 2, 4, 1, 3],
  6: [0, 2, 4, 1, 3, 5]
};

// View positions in BASE_PLAYER_LAYOUT going clockwise from bottom
// Bottom (1) -> Left (3) -> Top (0) -> Right (2)
const VIEW_POSITIONS_CLOCKWISE = [1, 3, 0, 2]; // bottom, left, top, right

function getClockwiseOrder(totalSeats) {
  return CLOCKWISE_ORDERS[totalSeats] || CLOCKWISE_ORDERS[4];
}

function getViewSeatIndex(seat, totalSeats) {
  const total = Math.max(totalSeats, 1);
  if (typeof seat !== 'number') return seat;
  
  const self = getSelf();
  if (!self || typeof self.seat !== 'number') return seat;
  
  const clockwiseOrder = getClockwiseOrder(total);
  if (!clockwiseOrder || clockwiseOrder.length === 0) return seat;
  
  // Find viewing player's position in clockwise order
  const normalizedSelfSeat = ((self.seat % total) + total) % total;
  const selfIndex = clockwiseOrder.indexOf(normalizedSelfSeat);
  if (selfIndex === -1) return seat;
  
  // Find target seat's position in clockwise order
  const normalizedSeat = ((seat % total) + total) % total;
  const seatIndex = clockwiseOrder.indexOf(normalizedSeat);
  if (seatIndex === -1) return seat;
  
  // Calculate relative position (how many steps clockwise from viewing player)
  const relativePosition = ((seatIndex - selfIndex) % clockwiseOrder.length + clockwiseOrder.length) % clockwiseOrder.length;
  
  // Map relative position to view seat
  // Viewing player (relativePosition 0) goes to bottom (1)
  // Next clockwise positions map to right (2), top (0), left (3) etc.
  if (total === 4) {
    return VIEW_POSITIONS_CLOCKWISE[relativePosition];
  }
  
  // For 2 players: self at bottom (1), other at top (0)
  if (total === 2) {
    return relativePosition === 0 ? 1 : 0;
  }
  
  // For 3, 5, 6 players: use extended layout positions
  // Extended layout clockwise from bottom: 1 -> 3 -> 5 -> 0 -> 2 -> 4
  if (total === 3) {
    // For 3 players: bottom (1), top (0), top-right (2) - clockwise from bottom
    const order = [1, 0, 2]; // bottom, top, right
    return order[relativePosition] ?? seat;
  }
  
  if (total === 5) {
    // For 5 players: clockwise from bottom
    const order = [1, 3, 0, 2, 4]; // bottom, bottom-left, top, top-right, bottom-right
    return order[relativePosition] ?? seat;
  }
  
  if (total === 6) {
    // For 6 players: clockwise from bottom
    const order = [1, 3, 5, 0, 2, 4]; // bottom, bottom-left, top-left, top, top-right, bottom-right
    return order[relativePosition] ?? seat;
  }
  
  return seat;
}

// Functions that work with actual seat (for backward compatibility)
function getSeatCoords(seat, total, radius) {
  const layout = getLayoutForSeats(total);
  const viewSeat = getViewSeatIndex(seat, total);
  return getViewSeatCoords(viewSeat, total, radius);
}

function getCardCoords(seat, total, radius) {
  const layout = getLayoutForSeats(total);
  const viewSeat = getViewSeatIndex(seat, total);
  return getViewCardCoords(viewSeat, total, radius);
}

// Functions that work directly with viewSeat (0-5 position)
function getViewSeatCoords(viewSeat, total, radius) {
  const layout = getLayoutForSeats(total);
  if (layout[viewSeat]?.seat) {
    return layout[viewSeat].seat;
  }
  // Fallback: compute position if not in layout
  return computeSeatPosition(viewSeat, total, radius);
}

function getViewCardCoords(viewSeat, total, radius) {
  const layout = getLayoutForSeats(total);
  if (layout[viewSeat]?.cards) {
    return layout[viewSeat].cards;
  }
  return computeSeatPosition(viewSeat, total, radius);
}

function getViewCardRotation(viewSeat, total) {
  // Use the same rotation logic for both top-down and angled views
  const coords = getViewSeatCoords(viewSeat, total, 38);
  let center;
  if (isAngledLayout()) {center = { x: 50, y: 40 };}else {
    center = { x: 50, y: 50 };
  }
  const dx = coords.x - center.x;
  const dy = coords.y - center.y;


  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return 0;
  }
  const angle = Math.atan2(dx, dy) * (180 / Math.PI);
  return -angle;
}

function getPileSizeMultiplier(viewSeat, totalSeats, useAngled) {
  if (!useAngled) return 1;
  const scale = ANGLED_SIZE_SCALE;
  if (totalSeats >= 5) {
    if (viewSeat === 0) return 0.75 * scale; // top smallest
    if (viewSeat === 1) return 1.4 * scale; // bottom baseline
    if (viewSeat === 2 || viewSeat === 5) return 0.90 * scale; // top-right/top-left slightly bigger
    if (viewSeat === 3 || viewSeat === 4) return 1.1 * scale; // bottom-left/right slightly smaller than bottom
    return 1 * scale;
  }
  else {
  if (viewSeat === 0) return 0.75 * scale; // top smallest
    if (viewSeat === 1) return 1.4 * scale; // bottom current size
    if (viewSeat === 2 || viewSeat === 3) return 1.1 * scale; // sides medium
    return 1 * scale;
  }
}

function getMessyPileRotation(lastRotation = null) {
  const rangeHalf = PILE_ROTATION_RANGE / 2;
  const maxAttempts = 12;
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = Math.random() * PILE_ROTATION_RANGE - rangeHalf;
    if (lastRotation === null || Math.abs(candidate - lastRotation) >= PILE_MIN_ROTATION_DIFF) {
      return candidate;
    }
  }
  if (lastRotation === null) return 0;
  const direction = lastRotation >= 0 ? -1 : 1;
  return lastRotation + direction * PILE_MIN_ROTATION_DIFF;
}

function applyCenteredRotation(element, rotation) {
  if (!element) return;
  element.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
}

function getCardPileRotationKey(player, card, index) {
  if (card && (typeof card.id === 'number' || typeof card.id === 'string')) {
    return `card-${card.id}`;
  }
  if (player && player.userId) {
    return `player-${player.userId}-idx-${index}`;
  }
  const seatKey = typeof player?.seat === 'number' ? player.seat : 'unknown';
  return `seat-${seatKey}-idx-${index}`;
}

function getCardRotation(seat, total) {
  const viewSeat = getViewSeatIndex(seat, total);
  return getViewCardRotation(viewSeat, total);
}

function getAngledCardRotationFromCoords(seatCoords, cardCoords) {
  const dx = seatCoords.x - cardCoords.x;
  const dy = seatCoords.y - cardCoords.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return 0;
  }
  // Point card bottom toward seat (vector seat -> card)
  const angleToSeat = Math.atan2(cardCoords.y - seatCoords.y, cardCoords.x - seatCoords.x);
  return (angleToSeat * (180 / Math.PI)) + 90;
}

function getDealerCardRotationTowardCenter(cardCoords, centerCoords, seatCoords) {
  // Calculate rotation to point card top toward center with back (bottom) pointing to seat
  // Vector from card to center (where top should point)
  const dx = centerCoords.x - cardCoords.x;
  const dy = centerCoords.y - cardCoords.y;
  
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    // Card is at center, point back toward seat
    const seatDx = seatCoords.x - cardCoords.x;
    const seatDy = seatCoords.y - cardCoords.y;
    if (Math.abs(seatDx) < 0.001 && Math.abs(seatDy) < 0.001) {
      return 0;
    }
    // Point bottom toward seat
    const angleToSeat = Math.atan2(seatDy, seatDx) * (180 / Math.PI);
    return angleToSeat + 180;
  }
  
  // Calculate angle to point card top toward center
  // CSS rotation: 0deg = up, 90deg = right, 180deg = down, 270deg = left
  // Vector from card to center: (dx, dy) where y increases downward
  // To point card top toward center, use atan2(dx, -dy) to account for inverted y-axis
  // This gives: card below center → 0deg (up), card right of center → 270deg (left), etc.
  const angleRad = Math.atan2(dx, -dy);
  const angleDeg = angleRad * (180 / Math.PI);
  
  // Normalize to 0-360 range
  return ((angleDeg % 360) + 360) % 360;
}

function getDealAnimationDelay(seat, cardIndex, totalSeats) {
  const total = Math.max(totalSeats, 1);
  const seatIndex = typeof seat === 'number' ? seat : 0;
  if (total >= 5) {
    // Faster, more compact timing for extended layout
    return (cardIndex * total + seatIndex) * 80;
  }
  return (cardIndex * total + seatIndex) * 120;
}

function getDeckCenter() {
  if (!refs.deck) return null;
  const rect = refs.deck.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function animateCardFromDeck(img, delay, finalRotation, totalSeats, options = {}) {
  const { centered = false } = options;
  const rotation =
    typeof finalRotation === 'number' && Number.isFinite(finalRotation) ? finalRotation : 0;
  const deckCenter = getDeckCenter();
  if (!deckCenter || typeof img.getBoundingClientRect !== 'function') {
    img.style.opacity = '1';
    if (centered) {
      applyCenteredRotation(img, rotation);
    } else {
      img.style.transform = `rotate(${rotation}deg)`;
    }
    return;
  }
  const targetRect = img.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const deltaX = deckCenter.x - targetX;
  const deltaY = deckCenter.y - targetY;
  const centerPrefix = centered ? 'translate(-50%, -50%) ' : '';
  const finalTransform = `${centerPrefix}rotate(${rotation}deg)`;
  
  if (totalSeats >= 5) {
    // Extended layout: faster, smoother animation with slight arc
    const midX = deltaX * 0.5;
    const midY = deltaY * 0.5 - 20; // Slight upward arc
    const frames = [
      {
        opacity: 0,
        transform: `translate(${deltaX}px, ${deltaY}px) ${finalTransform} scale(0.7)`
      },
      {
        opacity: 0.6,
        transform: `translate(${midX}px, ${midY}px) ${finalTransform} scale(0.9)`
      },
      { opacity: 1, transform: `${finalTransform} scale(1)` }
    ];
    try {
      const animation = img.animate(frames, {
        duration: 380,
        delay,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'both'
      });
      animation.onfinish = () => {
        img.style.opacity = '1';
        if (centered) {
          applyCenteredRotation(img, rotation);
        } else {
          img.style.transform = `rotate(${rotation}deg)`;
        }
      };
    } catch (err) {
      img.style.opacity = '1';
      if (centered) {
        applyCenteredRotation(img, rotation);
      } else {
        img.style.transform = `rotate(${rotation}deg)`;
      }
    }
  } else {
    // Standard layout: original animation
    const frames = [
      {
        opacity: 0,
        transform: `translate(${deltaX}px, ${deltaY}px) ${finalTransform} scale(0.8)`
      },
      { opacity: 1, transform: `${finalTransform} scale(1)` }
    ];
    try {
      const animation = img.animate(frames, {
        duration: 450,
        delay,
        easing: 'ease-out',
        fill: 'both'
      });
      animation.onfinish = () => {
        img.style.opacity = '1';
        if (centered) {
          applyCenteredRotation(img, rotation);
        } else {
          img.style.transform = `rotate(${rotation}deg)`;
        }
      };
    } catch (err) {
      img.style.opacity = '1';
      if (centered) {
        applyCenteredRotation(img, rotation);
      } else {
        img.style.transform = `rotate(${rotation}deg)`;
      }
    }
  }
}

function pennies(value) {
  return `£${(value / 100).toFixed(2)}`;
}

function getSelf() {
  if (!state.user || !state.game) return null;
  return state.game.players.find((p) => p.userId === state.user.userId) || null;
}

function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.textContent = message;
  document.body.appendChild(toastEl);
  setTimeout(() => toastEl.remove(), 3500);
}

function shouldUseAngledView() {
  if (!state.game) return true;
  const self = getSelf();
  if (!self) return true;
  if (self.isDealer) return false;

  const phase = state.game.state;
  if (phase === 'dealer-selection') return false;
  if (phase === 'awaiting-stake' && self.isDealer) return false;

  const currentPlayer = state.game.players?.[state.game.currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.userId === self.userId;
  const actionsVisible =
    !!refs.tableActionsOverlay && !refs.tableActionsOverlay.classList.contains('hidden');

  if (phase === 'lobby') return true;
  if (phase === 'dealer-selection') return false;
  if (phase === 'awaiting-stake' && isMyTurn) return false;
  if (isMyTurn && actionsVisible) return false;

  return !isMyTurn;
}

function isAngledLayout() {
  return state.viewMode === 'angled';
}

function getAngledCardFolder(viewSeat, totalSeats) {
  if (!isAngledLayout()) return null;
  const map = totalSeats <= 4 ? ANGLED_CARD_FOLDERS.compact : ANGLED_CARD_FOLDERS.default;
  return map[viewSeat];
}

function mapToAngledCardImage(originalPath, viewSeat, totalSeats, options = {}) {
  if (!originalPath) return originalPath;
  const forcedFolder = options?.forcedFolder;
  if (!forcedFolder && originalPath.includes('/angledcards/')) return originalPath;
  const folder = forcedFolder || getAngledCardFolder(viewSeat, totalSeats);
  if (!folder) return originalPath;
  const cleanPath = originalPath.split('?')[0];
  const filenameStart = cleanPath.lastIndexOf('/');
  const filename = filenameStart >= 0 ? cleanPath.substring(filenameStart + 1) : cleanPath;
  if (!filename) return originalPath;
  const query = originalPath.includes('?') ? originalPath.substring(originalPath.indexOf('?')) : '';
  return `/angledcards/${folder}/${filename}${query}`;
}

socket.on('action-error', ({ message }) => {
  toast(message);
});

function handleSignOut() {
  socket.emit('sign-out');
  state.user = null;
  state.game = null;
  state.renderedCardIds.clear();
  state.renderedSelectionIds.clear();
  state.lastCardGenerationKey = null;
  state.lastSelectionKey = null;
  clearTableAnnouncement({ skipRender: true });
  state.lastDealerCardKey = null;
  clearPendingGameState();
  state.cardRotations.clear();
  startMenuState.login = getDefaultLoginForm();
  startMenuState.register = getDefaultRegisterForm();
  startMenuState.username.value = '';
  startMenuState.username.token = null;
  startMenuState.play.code = '';
  startMenuState.password = getDefaultPasswordChallenge();
  startMenuState.settings = {
    mode: 'view',
    values: getDefaultSettingsValues(),
    loading: false,
    error: ''
  };
  showStartMenuShell('landing');
  toast('Signed out.');
  render();
}

function handleInfoClick() {
  // Check if in a game
  if (state.game && state.game.state !== 'lobby') {
    if (!confirm('You are currently in a game. Please finish your game before leaving. Do you want to continue?')) {
      return;
    }
  }
  
  // Show the info modal
  if (refs.infoModal && state.user) {
    if (refs.infoUsername) {
      refs.infoUsername.textContent = state.user.username || '-';
    }
    if (refs.infoBalance) {
      refs.infoBalance.textContent = state.user.balanceDisplay || '£0.00';
    }
    refs.infoModal.classList.remove('hidden');
  }
}

function closeInfoModal() {
  if (refs.infoModal) {
    refs.infoModal.classList.add('hidden');
  }
}

function openRulesModal() {
  if (refs.rulesModal) {
    refs.rulesModal.classList.remove('hidden');
  }
}

function closeRulesModal() {
  if (refs.rulesModal) {
    refs.rulesModal.classList.add('hidden');
  }
}

socket.on('user-registered', (user) => {
  state.user = {
    userId: user.userId,
    username: user.username,
    balance: user.balance,
    balanceDisplay: user.balanceDisplay,
    realBalance: user.realBalance || 0,
    realBalanceDisplay: user.realBalanceDisplay || '0.00'
  };
  render();
});

socket.on('game-created', ({ code }) => {
  toast(`Table created. Code ${code}`);
});

socket.on('game-joined', ({ code }) => {
  toast(`Joined table ${code}`);
});

socket.on('game-state', (gameState) => {
  if (shouldHoldGameState()) {
    queuePendingGameState(gameState);
    return;
  }
  applyGameState(gameState);
});

socket.on('shoot-announcement', (payload) => {
  const verb = payload.mode === 'all-in' ? 'goes ALL IN' : 'is shooting';
  const amount = payload.amountDisplay ? ` (${payload.amountDisplay})` : '';
  state.shootStage = { message: `${payload.username} ${verb}!${amount}` };
  renderBadges();
});

socket.on('stake-announcement', (payload) => {
  state.shootStage = { message: `${payload.username} places stake of ${pennies(payload.amount)}` };
  renderBadges();
});

socket.on('bet-announcement', (payload) => {
  state.shootStage = { message: `${payload.username} bets ${pennies(payload.amount)}` };
  renderBadges();
});

socket.on('table-announcement', (payload = {}) => {
  const duration = Number(payload.duration) || TABLE_ANNOUNCEMENT_DURATION;
  showTableAnnouncement(
    {
      title: payload.title || payload.message || '',
      subtitle: payload.subtitle || payload.subtext || ''
    },
    duration
  );
});

function applyGameState(gameState) {
  state.game = gameState;
  const self = getSelf();
  if (state.user && self) {
    if (gameState.walletType === 'real') {
      state.user.realBalance = self.balance;
      state.user.realBalanceDisplay = self.balanceDisplay;
    } else {
      state.user.balance = self.balance;
      state.user.balanceDisplay = self.balanceDisplay;
    }
  }
  if (gameState.state === 'lobby' && state.tableAnnouncement) {
    clearTableAnnouncement({ skipRender: true });
  }
  render();
}

function shouldHoldGameState() {
  return Boolean(state.revealHoldUntil && Date.now() < state.revealHoldUntil);
}

function queuePendingGameState(gameState) {
  state.pendingGameState = gameState;
  const delay = Math.max(0, (state.revealHoldUntil || 0) - Date.now());
  if (delay <= 0) {
    state.pendingGameState = null;
    state.revealHoldUntil = null;
    applyGameState(gameState);
    return;
  }
  if (state.pendingGameTimeout) {
    clearTimeout(state.pendingGameTimeout);
  }
  state.pendingGameTimeout = setTimeout(() => {
    state.pendingGameTimeout = null;
    const pending = state.pendingGameState;
    state.pendingGameState = null;
    state.revealHoldUntil = null;
    if (pending) {
      applyGameState(pending);
    }
  }, delay);
}

function setRevealHold(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const holdUntil = Date.now() + durationMs;
  state.revealHoldUntil = Math.max(state.revealHoldUntil || 0, holdUntil);
  if (state.pendingGameState) {
    queuePendingGameState(state.pendingGameState);
  }
}

function clearPendingGameState() {
  state.pendingGameState = null;
  if (state.pendingGameTimeout) {
    clearTimeout(state.pendingGameTimeout);
    state.pendingGameTimeout = null;
  }
  state.revealHoldUntil = null;
}

function normalizeAnnouncementPayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') {
    return { title: payload, subtitle: '' };
  }
  if (typeof payload === 'object') {
    const title = payload.title || payload.message || '';
    const subtitle = payload.subtitle || payload.subtext || '';
    if (!title) return null;
    return { title, subtitle };
  }
  return null;
}

function showTableAnnouncement(payload, duration = TABLE_ANNOUNCEMENT_DURATION) {
  const normalized = normalizeAnnouncementPayload(payload);
  if (!normalized) {
    clearTableAnnouncement();
    return;
  }
  state.tableAnnouncement = normalized;
  if (state.announcementTimeout) {
    clearTimeout(state.announcementTimeout);
    state.announcementTimeout = null;
  }
  render();
  if (duration > 0) {
    state.announcementTimeout = setTimeout(() => {
      state.announcementTimeout = null;
      state.tableAnnouncement = null;
      render();
    }, duration);
  }
}

function clearTableAnnouncement(options = {}) {
  const { skipRender = false } = options;
  let changed = false;
  if (state.tableAnnouncement) {
    state.tableAnnouncement = null;
    changed = true;
  }
  if (state.announcementTimeout) {
    clearTimeout(state.announcementTimeout);
    state.announcementTimeout = null;
    changed = true;
  }
  if (changed && !skipRender) {
    render();
  }
}

function revealCardsForPlayer(payload) {
  const game = state.game;
  if (!game || !payload?.cards?.length) return;
  const playerSeat = game.players.find((p) => p.userId === payload.playerId)?.seat;
  if (playerSeat === undefined) return;
  const cards = document.querySelectorAll(`.player-cards[data-seat="${playerSeat}"] .player-card`);
  if (!cards.length) return;
  const totalSeats = game.players.length || 0;
  const viewSeat =
    typeof playerSeat === 'number' && totalSeats
      ? getViewSeatIndex(playerSeat, totalSeats)
      : playerSeat;
  const useAngled = isAngledLayout() && typeof viewSeat === 'number' && totalSeats > 0;
  const cardGroupEl = cards[0]?.closest('.player-cards');
  const cardsToReveal = payload.cards.length || 1;
  const sequenceDuration =
    CENTER_MOVE_DURATION +
    CENTER_FLIP_START_DELAY +
    Math.max(0, cardsToReveal - 1) * CENTER_FLIP_PER_CARD_DELAY +
    CENTER_FLIP_FINAL_HOLD;
  setRevealHold(sequenceDuration);

  const startFlipSequence = () => {
    payload.cards.forEach((cardData, idx) => {
      const targetCard = cards[cardData.cardIndex];
      if (!targetCard) return;
      targetCard.classList.add('revealing');
      const flipDelay = CENTER_FLIP_START_DELAY + idx * CENTER_FLIP_PER_CARD_DELAY;
      setTimeout(() => {
        if (cardData.cardImage) {
          let nextSrc = cardData.cardImage;
          if (useAngled && totalSeats > 0) {
            nextSrc = mapToAngledCardImage(cardData.cardImage, viewSeat, totalSeats, {
              forcedFolder: 'bottom'
            });
          }
          targetCard.src = nextSrc;
        }
        targetCard.classList.remove('revealing');
      }, flipDelay);
    });
  };

  if (cardGroupEl) {
    moveCardGroupToCenter(cardGroupEl, useAngled, startFlipSequence);
  } else {
    startFlipSequence();
  }
}

function moveCardGroupToCenter(cardGroup, useAngled, onArrive) {
  if (!cardGroup) {
    if (typeof onArrive === 'function') onArrive();
    return;
  }
  const center = useAngled ? { x: 50, y: 40 } : { x: 50, y: 50 };
  if (cardGroup.dataset.centered === 'complete') {
    if (typeof onArrive === 'function') onArrive();
    return;
  }
  if (cardGroup.dataset.centered === 'in-progress') {
    if (typeof onArrive === 'function') {
      if (!cardGroup._revealArrivals) cardGroup._revealArrivals = [];
      cardGroup._revealArrivals.push(onArrive);
    }
    return;
  }
  cardGroup.dataset.centered = 'in-progress';
  cardGroup.style.zIndex = '20';
  cardGroup.classList.add('reveal-moving');
  cardGroup.style.setProperty('--reveal-move-duration', `${CENTER_MOVE_DURATION}ms`);
  cardGroup._revealArrivals = typeof onArrive === 'function' ? [onArrive] : [];

  const finalizeArrival = () => {
    if (cardGroup.dataset.centered === 'complete') return;
    cardGroup.dataset.centered = 'complete';
    cardGroup.classList.remove('reveal-moving');
    cardGroup.style.removeProperty('--reveal-move-duration');
    prepareGroupForCenterReveal(cardGroup);
    const arrivals = Array.isArray(cardGroup._revealArrivals) ? cardGroup._revealArrivals : [];
    cardGroup._revealArrivals = [];
    arrivals.forEach((cb) => {
      if (typeof cb === 'function') {
        try {
          cb();
        } catch (err) {
          console.error('Reveal callback failed', err);
        }
      }
    });
  };

  const handleTransitionEnd = (event) => {
    if (event.target !== cardGroup) return;
    if (event.propertyName !== 'left' && event.propertyName !== 'top') return;
    cardGroup.removeEventListener('transitionend', handleTransitionEnd);
    finalizeArrival();
  };

  cardGroup.addEventListener('transitionend', handleTransitionEnd);
  requestAnimationFrame(() => {
    cardGroup.style.left = `${center.x}%`;
    cardGroup.style.top = `${center.y}%`;
  });
  setTimeout(() => {
    cardGroup.removeEventListener('transitionend', handleTransitionEnd);
    finalizeArrival();
  }, CENTER_MOVE_DURATION + 100);
}

function prepareGroupForCenterReveal(cardGroup) {
  if (!cardGroup) return;
  cardGroup.classList.remove('pile-mode');
  cardGroup.classList.add('center-reveal');
  cardGroup.style.width = '';
  cardGroup.style.height = '';
  cardGroup.style.removeProperty('--pile-card-width');
  cardGroup.style.removeProperty('--pile-card-height');
  const cards = cardGroup.querySelectorAll('.player-card');
  cards.forEach((img, idx) => {
    img.style.position = '';
    img.style.left = '';
    img.style.top = '';
    img.style.margin = '';
    if (idx > 0) {
      img.style.marginLeft = '';
    }
    img.style.transform = 'rotate(0deg)';
  });
}

socket.on('shoot-flip', (payload) => {
  const prefix = payload.mode === 'all-in' ? 'All-in' : 'Shoot';
  const cardLabels = payload.cards?.map((c) => c.card).join(', ') || payload.card || '';
  state.shootStage = { message: `${prefix}: ${payload.username} flips all cards` };
  renderBadges();
  revealCardsForPlayer(payload);
});

socket.on('stake-flip', (payload) => {
  state.shootStage = { message: `Stake: ${payload.username} flips all cards` };
  renderBadges();
  revealCardsForPlayer(payload);
});

socket.on('bet-flip', (payload) => {
  state.shootStage = { message: `Bet: ${payload.username} flips all cards` };
  renderBadges();
  revealCardsForPlayer(payload);
});

socket.on('shoot-resolution', (payload) => {
  let message;
  if (payload.winner) {
    message =
      payload.mode === 'all-in'
        ? `${payload.winner} wins ${payload.winnings} but play continues`
        : `${payload.winner} wins ${payload.winnings}`;
  } else {
    message = payload.mode === 'all-in' ? 'All-in misses. Next player!' : 'No win. Next player!';
  }
  state.shootStage = { message };
  renderBadges();
  setTimeout(() => {
    state.shootStage = null;
    renderBadges();
  }, 2800);
});

socket.on('stake-resolution', (payload) => {
  let message;
  if (payload.winner) {
    message = `${payload.winner} wins ${payload.winnings} but play continues`;
  } else {
    message = 'Stake misses. Next player!';
  }
  state.shootStage = { message };
  renderBadges();
  setTimeout(() => {
    state.shootStage = null;
    renderBadges();
  }, 2800);
});

socket.on('bet-resolution', (payload) => {
  let message;
  if (payload.winner) {
    message = `${payload.winner} wins ${payload.winnings} but play continues`;
  } else {
    message = 'Bet misses. Next player!';
  }
  state.shootStage = { message };
  renderBadges();
  setTimeout(() => {
    state.shootStage = null;
    renderBadges();
  }, 2800);
});

socket.on('dealer-selected', ({ username }) => {
  const message = `${username} is now the dealer`;
  showTableAnnouncement(message, TABLE_ANNOUNCEMENT_DURATION);
});

socket.on('game-ended', ({ winner, gamesCompleted, matchLength }) => {
  const message = winner ? `${winner} wins the pot!` : 'Dealer takes the pot!';
  toast(`${message} Game ${gamesCompleted}/${matchLength} complete.`);
  showTableAnnouncement(message, GAME_WIN_ANNOUNCEMENT_DURATION);
});

socket.on('clear-announcement', () => {
  clearTableAnnouncement();
});

socket.on('signed-out', () => {
  state.user = null;
  state.game = null;
  state.renderedCardIds.clear();
  state.lastCardGenerationKey = null;
  state.renderedSelectionIds.clear();
  state.lastSelectionKey = null;
  clearTableAnnouncement({ skipRender: true });
  state.lastDealerCardKey = null;
  clearPendingGameState();
  state.cardRotations.clear();
  startMenuState.login = getDefaultLoginForm();
  startMenuState.register = getDefaultRegisterForm();
  startMenuState.username.value = '';
  startMenuState.username.token = null;
  startMenuState.play.code = '';
  showStartMenuShell('landing');
  render();
});
