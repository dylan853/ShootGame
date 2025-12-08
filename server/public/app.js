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
  register: '/StartMenu/StartMenuRegisterMenu.jpg',
  checkEmail: '/StartMenu/StartMenuCheckEmail.jpg',
  username: '/StartMenu/StartMenuChooseUsername.jpg',
  login: '/StartMenu/StartMenuLogin.jpg',
  authed: '/StartMenu/StartMenuRulesPlayLogout.jpg',
  play: '/StartMenu/StartMenuCreateOrJoinTable.jpg'
};

const START_MENU_CLOSE_TARGETS = {
  register: 'landing',
  login: 'landing',
  username: 'landing',
  play: 'authed'
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
  closeBtn: document.getElementById('start-menu-close-btn'),
  appShell: document.getElementById('app')
};

function getDefaultRegisterForm() {
  return {
    fullName: '',
    dateOfBirth: '',
    email: '',
    phone: '+',
    country: '',
    password: '',
    identityFile: null,
    identityPreviewUrl: ''
  };
}

function getDefaultLoginForm() {
  return {
    email: '',
    password: ''
  };
}

const startMenuState = {
  active: true,
  currentScreen: 'landing',
  loading: false,
  register: getDefaultRegisterForm(),
  login: getDefaultLoginForm(),
  username: {
    value: '',
    token: null
  },
  play: {
    code: ''
  }
};

init();

async function init() {
  initStartMenu();
  wireEvents();
  await loadConfig();
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
  cleanupStartMenuScreen(startMenuState.currentScreen);
  startMenuState.currentScreen = screenName;
  if (startMenuRefs.root) {
    startMenuRefs.root.classList.remove('hidden');
  }
  document.body.classList.add('start-menu-active');
  startMenuRefs.appShell?.classList.add('hidden');
  renderStartMenuScreen();
}

function cleanupStartMenuScreen(screenName) {
  if (screenName === 'register') {
    if (startMenuState.register.identityPreviewUrl) {
      URL.revokeObjectURL(startMenuState.register.identityPreviewUrl);
    }
    startMenuState.register = getDefaultRegisterForm();
  } else if (screenName === 'login') {
    startMenuState.login = getDefaultLoginForm();
  } else if (screenName === 'username') {
    startMenuState.username.value = '';
  } else if (screenName === 'play') {
    startMenuState.play.code = '';
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
  startMenuRefs.overlay.innerHTML = '';
  switch (screenName) {
    case 'landing':
      addMenuHotspot([33, 468, 98, 498], openStartMenuRulesModal, { width, height });
      addMenuHotspot([106, 468, 205, 499], () => setStartMenuScreen('register'), { width, height });
      addMenuHotspot([691, 465, 776, 499], () => setStartMenuScreen('login'), { width, height });
      break;
    case 'register':
      addMenuInput('register.fullName', [168, 178, 378, 208], { width, height, placeholder: 'Full name' });
      addMenuInput('register.dateOfBirth', [168, 221, 378, 251], {
        width,
        height,
        type: 'date',
        max: new Date().toISOString().split('T')[0]
      });
      addMenuInput('register.email', [168, 263, 378, 293], { width, height, type: 'email', placeholder: 'Email' });
      addMenuInput('register.phone', [168, 304, 379, 334], {
        width,
        height,
        placeholder: '+441234567890'
      });
      addMenuInput('register.country', [168, 346, 379, 376], { width, height, placeholder: 'Country' });
      addMenuInput('register.password', [169, 387, 379, 417], {
        width,
        height,
        type: 'password',
        placeholder: 'Password'
      });
      addMenuFileField([398, 174, 757, 420], { width, height });
      addMenuHotspot([700, 471, 764, 497], handleRegisterSubmit, {
        width,
        height,
        disabled: !isRegisterFormComplete() || startMenuState.loading
      });
      break;
    case 'checkEmail':
      addMenuHotspot([0, 0, width, height], () => setStartMenuScreen('landing'), { width, height });
      break;
    case 'username':
      addMenuInput('username.value', [306, 188, 517, 218], {
        width,
        height,
        placeholder: 'Username',
        maxLength: 18
      });
      addMenuHotspot([364, 261, 453, 286], handleUsernameSubmit, {
        width,
        height,
        disabled: !startMenuState.username.value || startMenuState.loading
      });
      break;
    case 'login':
      addMenuInput('login.email', [306, 188, 516, 218], { width, height, type: 'email', placeholder: 'Email' });
      addMenuInput('login.password', [306, 256, 516, 286], {
        width,
        height,
        type: 'password',
        placeholder: 'Password'
      });
      addMenuHotspot([363, 346, 456, 376], handleLoginSubmit, {
        width,
        height,
        disabled: !isLoginFormComplete() || startMenuState.loading
      });
      break;
    case 'authed':
      addMenuHotspot([30, 461, 98, 497], openStartMenuRulesModal, { width, height });
      addMenuHotspot([108, 467, 163, 499], () => setStartMenuScreen('play'), { width, height });
      addMenuHotspot([693, 465, 791, 499], handleMenuLogout, { width, height });
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
        disabled: startMenuState.loading
      });
      addMenuHotspot([440, 233, 492, 260], handleMenuJoinTable, {
        width,
        height,
        disabled: !isJoinCodeValid() || startMenuState.loading
      });
      break;
    default:
      break;
  }
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
  startMenuRefs.overlay.appendChild(btn);
}

function addMenuInput(path, rect, options = {}) {
  if (!startMenuRefs.overlay) return;
  const input = document.createElement('input');
  input.type = options.type || 'text';
  input.placeholder = options.placeholder || '';
  input.maxLength = options.maxLength || undefined;
  if (options.type === 'date' && options.max) {
    input.max = options.max;
  }
  input.value = getMenuFieldValue(path);
  if (options.transform === 'uppercase') {
    input.style.textTransform = 'uppercase';
  }
  applyMenuRect(input, rect, options.width, options.height);
  input.className = 'start-menu-input';
  input.addEventListener('input', (event) => {
    let value = event.target.value;
    if (options.transform === 'uppercase') {
      value = value.toUpperCase();
      event.target.value = value;
    }
    setMenuFieldValue(path, value);
  });
  startMenuRefs.overlay.appendChild(input);
}

function addMenuFileField(rect, options = {}) {
  if (!startMenuRefs.overlay) return;
  const wrapper = document.createElement('label');
  wrapper.className = 'start-menu-file-field';
  applyMenuRect(wrapper, rect, options.width, options.height);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    setRegisterIdentityFile(file);
  });
  wrapper.appendChild(input);
  if (startMenuState.register.identityPreviewUrl) {
    wrapper.style.setProperty('--preview-image', `url(${startMenuState.register.identityPreviewUrl})`);
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

function setRegisterIdentityFile(file) {
  if (startMenuState.register.identityPreviewUrl) {
    URL.revokeObjectURL(startMenuState.register.identityPreviewUrl);
    startMenuState.register.identityPreviewUrl = '';
  }
  startMenuState.register.identityFile = file || null;
  if (file) {
    startMenuState.register.identityPreviewUrl = URL.createObjectURL(file);
  }
  renderStartMenuScreen();
}

function isRegisterFormComplete() {
  const form = startMenuState.register;
  return Boolean(
    form.fullName &&
      form.dateOfBirth &&
      form.email &&
      form.phone &&
      form.country &&
      form.password &&
      form.identityFile
  );
}

function isLoginFormComplete() {
  return Boolean(startMenuState.login.email && startMenuState.login.password);
}

function isJoinCodeValid() {
  return Boolean((startMenuState.play.code || '').trim().length === 5);
}

function openStartMenuRulesModal() {
  startMenuRefs.rulesModal?.classList.remove('hidden');
}

function closeStartMenuRulesModal() {
  startMenuRefs.rulesModal?.classList.add('hidden');
}

async function handleRegisterSubmit() {
  if (!isRegisterFormComplete() || startMenuState.loading) {
    return;
  }
  startMenuState.loading = true;
  renderStartMenuScreen();
  try {
    const formData = new FormData();
    formData.append('fullName', startMenuState.register.fullName.trim());
    formData.append('dateOfBirth', startMenuState.register.dateOfBirth);
    formData.append('email', startMenuState.register.email.trim());
    formData.append('phone', startMenuState.register.phone.trim());
    formData.append('country', startMenuState.register.country.trim());
    formData.append('password', startMenuState.register.password);
    formData.append('identityImage', startMenuState.register.identityFile);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      body: formData
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.message || 'Unable to register.');
    }
    toast('Registration saved. Please check your email.');
    cleanupStartMenuScreen('register');
    startMenuState.register = getDefaultRegisterForm();
    setStartMenuScreen('checkEmail', { force: true });
  } catch (err) {
    toast(err.message || 'Registration failed.');
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
  }
}

async function handleUsernameSubmit() {
  if (!startMenuState.username.token || !startMenuState.username.value || startMenuState.loading) {
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
        token: startMenuState.username.token,
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
    setLoggedInUser(payload.user);
    toast('Logged in.');
    setStartMenuScreen('authed', { force: true });
  } catch (err) {
    toast(err.message || 'Unable to log in.');
  } finally {
    startMenuState.loading = false;
    renderStartMenuScreen();
  }
}

function setLoggedInUser(user) {
  if (!user) return;
  state.user = {
    userId: user.userId,
    username: user.username,
    balance: user.balance,
    balanceDisplay: user.balanceDisplay
  };
  registerWithSocket();
  render();
}

function handleMenuLogout() {
  handleSignOut();
}

function handleMenuCreateTable() {
  if (!ensureAuthed()) return;
  socket.emit('create-game');
  closeStartMenuShell();
}

function handleMenuJoinTable() {
  if (!ensureAuthed()) return;
  if (!isJoinCodeValid()) {
    toast('Enter a 5-letter table code.');
    return;
  }
  socket.emit('join-game', { code: startMenuState.play.code.trim().toUpperCase() });
  closeStartMenuShell();
}

function closeStartMenuShell() {
  startMenuState.active = false;
  startMenuRefs.root?.classList.add('hidden');
  document.body.classList.remove('start-menu-active');
  startMenuRefs.appShell?.classList.remove('hidden');
}

function showStartMenuShell(screen = 'landing') {
  startMenuState.active = true;
  startMenuRefs.root?.classList.remove('hidden');
  document.body.classList.add('start-menu-active');
  startMenuRefs.appShell?.classList.add('hidden');
  setStartMenuScreen(screen, { force: true });
}
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    state.config = await res.json();
  } catch (err) {
    console.error('Config load failed', err);
  }
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
      const balance = state.user.balanceDisplay || '';
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
  img.alt = state.game.dealerCard.label;
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
    if (isAngledLayout() && state.game.dealerCard && state.game.dealerCard.label) {
      const dealerCardInfo = document.createElement('p');
      dealerCardInfo.className = 'bet-slider-dealer-card';
      dealerCardInfo.textContent = `Dealers Card: ${state.game.dealerCard.label}`;
      refs.betSliderContainer.appendChild(dealerCardInfo);
    }
  };

  // Dealer view
  if (phase === 'awaiting-stake' && self.isDealer) {
    const message = document.createElement('p');
    message.className = 'bet-slider-message';
    message.textContent = 'Choose a stake to start the round.';
    refs.betSliderContainer.appendChild(message);
    
    addDealerCardInfo();
    
    const inlineContainer = document.createElement('div');
    inlineContainer.className = 'dealer-stake-inline';
    
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
    button.textContent = 'Lock stake & start';
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
    balanceDisplay: user.balanceDisplay
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
    state.user.balance = self.balance;
    state.user.balanceDisplay = self.balanceDisplay;
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
