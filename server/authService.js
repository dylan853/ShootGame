const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  createPendingUser,
  getUserByEmail,
  getUserByVerificationToken,
  getUserByUsername,
  setUserUsername,
  getUserById,
  penniesToDisplay,
  updateUserSettings
} = require('./db');
const { sendSystemEmail } = require('./emailService');

const identityDir = path.join(__dirname, 'uploads', 'identities');
const billDir = path.join(__dirname, 'uploads', 'bills');
const creditCardDir = path.join(__dirname, 'uploads', 'cards');
fs.mkdirSync(identityDir, { recursive: true });
fs.mkdirSync(billDir, { recursive: true });
fs.mkdirSync(creditCardDir, { recursive: true });

const APP_URL = process.env.APP_URL || process.env.CLIENT_ORIGIN || 'https://shoot.poker';
const PUBLIC_BASE_URL = APP_URL || '';
const LOGIN_CHALLENGES = new Map();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function sanitizeUser(user) {
  if (!user) return null;
  return {
    userId: user.id,
    username: user.username,
    aliasName: user.alias_name || user.username || null,
    email: user.email,
    phone: user.phone,
    firstName: user.first_name,
    secondName: user.second_name,
    dateOfBirth: user.date_of_birth,
    identityNumber: user.identity_number,
    identityType: user.identity_type,
    country: user.country,
    houseNameOrNumber: user.house_name_or_number,
    addressFirstLine: user.address_first_line,
    addressSecondLine: user.address_second_line,
    townOrCity: user.town_or_city,
    county: user.county,
    countryOfResidence: user.country_of_residence,
    language: user.language || 'English',
    currency: user.currency || 'USD',
    maximumBet: user.maximum_bet,
    limitPerDay: user.limit_per_day || user.max_daily_stake,
    maxDailyStake: user.max_daily_stake || user.limit_per_day,
    weeklyMaxStake: user.weekly_max_stake,
    maximumLoss: user.maximum_loss,
    creditCardNumber: user.credit_card_number,
    expiryDate: user.expiry_date,
    cvrNumber: user.cvr_number,
    balance: user.balance,
    balanceDisplay: penniesToDisplay(user.balance),
    realBalance: user.real_balance || 0,
    realBalanceDisplay: penniesToDisplay(user.real_balance || 0),
    passwordSet: Boolean(user.login_password_hash)
  };
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function validateRegistrationPayload(payload) {
  const requiredFields = [
    'firstName',
    'secondName',
    'dateOfBirth',
    'email',
    'phone',
    'country',
    'houseNameOrNumber',
    'addressFirstLine',
    'addressSecondLine',
    'townOrCity',
    'county',
    'countryOfResidence',
    'maximumBet',
    'limitPerDay',
    'maximumLoss',
    'creditCardNumber',
    'expiryDate',
    'cvrNumber'
  ];
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      throw validationError(`Missing field: ${field}`);
    }
  });
  const dobString = payload.dateOfBirth;
  const dob = dobString ? new Date(dobString) : null;
  if (!dob || Number.isNaN(dob.getTime())) {
    throw validationError('Date of birth is invalid.');
  }
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (age < 18) {
    throw validationError('You must be 18 or older to register.');
  }
  const fullName = `${payload.firstName} ${payload.secondName}`.trim();
  if (!/^[\p{L}\p{M}'\s.-]{2,}$/u.test(fullName)) {
    throw validationError('Name looks invalid.');
  }
  if (!/^\+[\d\s-]{7,20}$/.test(payload.phone.trim())) {
    throw validationError('Phone number must include country code (starting with +).');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email.trim())) {
    throw validationError('Email address is invalid.');
  }
  if (!/^\d{3}$/.test(String(payload.cvrNumber || '').trim())) {
    throw validationError('CVR number must be exactly 3 digits.');
  }
  return fullName;
}

function buildVerificationLink(token) {
  if (!token) return '';
  if (!PUBLIC_BASE_URL) {
    return `/?verifyToken=${encodeURIComponent(token)}#choose-username`;
  }
  const url = new URL(PUBLIC_BASE_URL);
  url.searchParams.set('verifyToken', token);
  url.hash = 'choose-username';
  return url.toString();
}

async function registerUser(payload = {}, files = {}) {
  const {
    firstName,
    secondName,
    dateOfBirth,
    email,
    phone,
    country,
    houseNameOrNumber,
    addressFirstLine,
    addressSecondLine,
    townOrCity,
    county,
    countryOfResidence,
    maximumBet,
    limitPerDay,
    maximumLoss,
    creditCardNumber,
    expiryDate,
    cvrNumber
  } = payload;

  const fullName = validateRegistrationPayload({
    firstName,
    secondName,
    dateOfBirth,
    email,
    phone,
    country,
    houseNameOrNumber,
    addressFirstLine,
    addressSecondLine,
    townOrCity,
    county,
    countryOfResidence,
    maximumBet,
    limitPerDay,
    maximumLoss,
    creditCardNumber,
    expiryDate,
    cvrNumber
  });

  const normalizedEmail = (email || '').trim().toLowerCase();
  const existing = getUserByEmail(normalizedEmail);
  if (existing) {
    throw validationError('Email already registered. Please log in instead.');
  }
  const identityFile = Array.isArray(files.identityImage) ? files.identityImage[0] : null;
  const billImage = Array.isArray(files.billImage) ? files.billImage[0] : null;
  const creditCardImage = Array.isArray(files.creditCardImage) ? files.creditCardImage[0] : null;

  const hashedPassword = await bcrypt.hash((phone || '').trim(), 10);
  const verificationToken = uuidv4();
  let storedPath = null;
  let billPath = null;
  let ccPath = null;

  if (identityFile) {
    const storedFilename = `${verificationToken}${path.extname(identityFile.originalname || identityFile.filename || '.jpg')}`;
    storedPath = path.join(identityDir, storedFilename);
    fs.renameSync(identityFile.path, storedPath);
  }

  if (billImage) {
    const billFilename = `${verificationToken}-bill${path.extname(billImage.originalname || billImage.filename || '.jpg')}`;
    billPath = path.join(billDir, billFilename);
    fs.renameSync(billImage.path, billPath);
  }

  if (creditCardImage) {
    const ccFilename = `${verificationToken}-cc${path.extname(creditCardImage.originalname || creditCardImage.filename || '.jpg')}`;
    ccPath = path.join(creditCardDir, ccFilename);
    fs.renameSync(creditCardImage.path, ccPath);
  }

  const user = createPendingUser({
    fullName: fullName.trim(),
    firstName: (firstName || '').trim(),
    secondName: (secondName || '').trim(),
    dateOfBirth,
    email: normalizedEmail,
    phone: phone.trim(),
    country: country.trim(),
    passwordHash: hashedPassword,
    identityImagePath: storedPath,
    houseNameOrNumber,
    addressFirstLine,
    addressSecondLine,
    townOrCity,
    county,
    countryOfResidence,
    maximumBet,
    limitPerDay,
    maximumLoss,
    creditCardNumber,
    expiryDate,
    cvrNumber,
    billImagePath: billPath,
    creditCardImagePath: ccPath,
    extraData: null,
    verificationToken
  });

  const verifyLink = buildVerificationLink(verificationToken);
  await sendSystemEmail({
    to: normalizedEmail,
    subject: 'Verify your Shoot Poker account',
    text: `Welcome to Shoot Poker!\n\nClick the link below to choose your username:\n${verifyLink}`,
    html: `
      <p>Welcome to Shoot Poker!</p>
      <p>Please choose your username to finish registration:</p>
      <p>
        <a href="${verifyLink}" style="
          display:inline-block;
          padding:12px 18px;
          background:#007bff;
          color:#fff;
          text-decoration:none;
          border-radius:6px;
          font-weight:bold;
          font-family:Arial, sans-serif;
        ">Choose username</a>
      </p>
      <p>If the button does not work, copy and paste this link:</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
    `
  });
  return {
    user: sanitizeUser(user),
    verificationToken
  };
}

function requireTokenUser(token) {
  if (!token) {
    throw validationError('Verification token missing.');
  }
  const user = getUserByVerificationToken(token);
  if (!user) {
    throw validationError('Verification link is invalid or expired.');
  }
  return user;
}

function verifyToken(token) {
  const user = requireTokenUser(token);
  return {
    userId: user.id,
    email: user.email,
    hasUsername: Boolean(user.username)
  };
}

function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    throw validationError('Username is required.');
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 18) {
    throw validationError('Username must be between 3 and 18 characters.');
  }
  if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
    throw validationError('Username can contain letters, numbers, and underscores only.');
  }
  const existing = getUserByUsername(trimmed);
  if (existing) {
    throw validationError('Username already taken.');
  }
  return trimmed;
}

function chooseUsername(token, username) {
  const user = requireTokenUser(token);
  if (user.username) {
    return sanitizeUser(user);
  }
  const normalizedUsername = validateUsername(username);
  const updated = setUserUsername(user.id, normalizedUsername, 'active');
  return sanitizeUser(updated);
}

async function loginUser({ email, password }) {
  if (!email || !password) {
    throw validationError('Email and phone are required.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUserByEmail(normalizedEmail);
  if (!user) {
    throw validationError('Account not found.');
  }
  if (!user.username) {
    throw validationError('Please complete registration before logging in.');
  }
  if (!user.password_hash) {
    throw validationError('Account password not set. Please register again.');
  }
  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw validationError('Incorrect email or phone.');
  }
  const requiresPassword = Boolean(user.login_password_hash);
  if (!requiresPassword) {
    return { user: sanitizeUser(user), requiresPassword: false };
  }
  const challengeToken = uuidv4();
  LOGIN_CHALLENGES.set(challengeToken, {
    userId: user.id,
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  });
  return { requiresPassword: true, challengeToken, userId: user.id };
}

async function verifyLoginPassword(challengeToken, password) {
  if (!challengeToken || !password) {
    throw validationError('Password challenge missing.');
  }
  const challenge = LOGIN_CHALLENGES.get(challengeToken);
  if (!challenge) {
    throw validationError('Login challenge expired. Please log in again.');
  }
  if (challenge.expiresAt < Date.now()) {
    LOGIN_CHALLENGES.delete(challengeToken);
    throw validationError('Login challenge expired. Please log in again.');
  }
  const user = getUserById(challenge.userId);
  if (!user || !user.login_password_hash) {
    LOGIN_CHALLENGES.delete(challengeToken);
    throw validationError('Login challenge invalid. Please log in again.');
  }
  const matches = await bcrypt.compare(password, user.login_password_hash);
  if (!matches) {
    throw validationError('Incorrect password.');
  }
  LOGIN_CHALLENGES.delete(challengeToken);
  return sanitizeUser(user);
}

async function updateSettings(userId, updates = {}) {
  const user = getUserById(userId);
  if (!user) {
    throw validationError('User not found.');
  }
  const next = {};
  const nameRegex = /^[A-Za-z-]+$/;
  const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const phoneRegex = /^\+[\d\s-]{7,20}$/;
  const expiryRegex = /^(\d{2})\/(\d{2})$/;
  const digitsRegex = /^\d+$/;

  const ensureAge = (dobString) => {
    const dob = dobString ? new Date(dobString) : null;
    if (!dob || Number.isNaN(dob.getTime())) {
      throw validationError('Date of birth is invalid.');
    }
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age -= 1;
    }
    if (age < 18) {
      throw validationError('You must be 18 or older.');
    }
  };

  const maybeAssign = (key, value) => {
    if (value === undefined) return;
    next[key] = value === '' ? null : value;
  };

  if (updates.firstName !== undefined) {
    const v = (updates.firstName || '').trim();
    if (v && !nameRegex.test(v)) {
      throw validationError('First name can only contain letters and "-".');
    }
    maybeAssign('firstName', v);
  }
  if (updates.secondName !== undefined) {
    const v = (updates.secondName || '').trim();
    if (v && !nameRegex.test(v)) {
      throw validationError('Second name can only contain letters and "-".');
    }
    maybeAssign('secondName', v);
  }
  if (updates.dateOfBirth !== undefined) {
    const dob = updates.dateOfBirth;
    if (dob) ensureAge(dob);
    maybeAssign('dateOfBirth', dob || null);
  }
  if (updates.email !== undefined) {
    const v = (updates.email || '').trim().toLowerCase();
    if (v && !emailRegex.test(v)) {
      throw validationError('Email address is invalid.');
    }
    if (v && v !== user.email) {
      const existing = getUserByEmail(v);
      if (existing && existing.id !== user.id) {
        throw validationError('Email already registered.');
      }
    }
    maybeAssign('email', v);
  }
  if (updates.phone !== undefined) {
    const v = (updates.phone || '').trim();
    if (v && !phoneRegex.test(v)) {
      throw validationError('Phone number must include country code (starting with +).');
    }
    maybeAssign('phone', v);
  }
  if (updates.identityNumber !== undefined) {
    maybeAssign('identityNumber', (updates.identityNumber || '').trim());
  }
  if (updates.identityType !== undefined) {
    maybeAssign('identityType', (updates.identityType || '').trim());
  }
  if (updates.country !== undefined) {
    maybeAssign('country', (updates.country || '').trim());
  }
  if (updates.houseNameOrNumber !== undefined) {
    maybeAssign('houseNameOrNumber', (updates.houseNameOrNumber || '').trim());
  }
  if (updates.addressFirstLine !== undefined) {
    maybeAssign('addressFirstLine', (updates.addressFirstLine || '').trim());
  }
  if (updates.addressSecondLine !== undefined) {
    maybeAssign('addressSecondLine', (updates.addressSecondLine || '').trim());
  }
  if (updates.townOrCity !== undefined) {
    maybeAssign('townOrCity', (updates.townOrCity || '').trim());
  }
  if (updates.county !== undefined) {
    maybeAssign('county', (updates.county || '').trim());
  }
  if (updates.countryOfResidence !== undefined) {
    maybeAssign('countryOfResidence', (updates.countryOfResidence || '').trim());
  }
  if (updates.maximumBet !== undefined) {
    const v = (updates.maximumBet || '').trim();
    if (v && !digitsRegex.test(v)) {
      throw validationError('Maximum bet must be digits only.');
    }
    maybeAssign('maximumBet', v);
  }
  if (updates.limitPerDay !== undefined) {
    const v = (updates.limitPerDay || '').trim();
    if (v && !digitsRegex.test(v)) {
      throw validationError('Limit per day must be digits only.');
    }
    maybeAssign('limitPerDay', v);
    maybeAssign('maxDailyStake', v);
  }
  if (updates.maxDailyStake !== undefined) {
    const v = (updates.maxDailyStake || '').trim();
    if (v && !digitsRegex.test(v)) {
      throw validationError('Max daily stake must be digits only.');
    }
    maybeAssign('maxDailyStake', v);
  }
  if (updates.weeklyMaxStake !== undefined) {
    const v = (updates.weeklyMaxStake || '').trim();
    if (v && !digitsRegex.test(v)) {
      throw validationError('Weekly max stake must be digits only.');
    }
    maybeAssign('weeklyMaxStake', v);
  }
  if (updates.maximumLoss !== undefined) {
    const v = (updates.maximumLoss || '').trim();
    if (v && !digitsRegex.test(v)) {
      throw validationError('Maximum loss must be digits only.');
    }
    maybeAssign('maximumLoss', v);
  }
  if (updates.creditCardNumber !== undefined) {
    const v = (updates.creditCardNumber || '').trim();
    if (v && !digitsRegex.test(v)) {
      throw validationError('Credit card number must be digits only.');
    }
    maybeAssign('creditCardNumber', v);
  }
  if (updates.expiryDate !== undefined) {
    const v = (updates.expiryDate || '').trim();
    if (v) {
      const m = v.match(expiryRegex);
      if (!m) {
        throw validationError('Expiry date must be MM/YY.');
      }
      const mm = Number(m[1]);
      const yy = Number(m[2]);
      if (mm < 1 || mm > 12) {
        throw validationError('Expiry month must be 01-12.');
      }
      if (yy < 26) {
        throw validationError('Expiry year must be 26 or later.');
      }
    }
    maybeAssign('expiryDate', v);
  }
  if (updates.cvrNumber !== undefined) {
    const v = (updates.cvrNumber || '').trim();
    if (v && !/^\d{3}$/.test(v)) {
      throw validationError('CVR number must be exactly 3 digits.');
    }
    maybeAssign('cvrNumber', v);
  }
  if (updates.language !== undefined) {
    const allowedLanguages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Danish'];
    const v = (updates.language || '').trim() || 'English';
    if (!allowedLanguages.includes(v)) {
      throw validationError('Language is not supported.');
    }
    maybeAssign('language', v);
  }
  if (updates.currency !== undefined) {
    const allowedCurrencies = ['USD', 'EUR', 'GBP'];
    const v = (updates.currency || '').trim().toUpperCase() || 'USD';
    if (!allowedCurrencies.includes(v)) {
      throw validationError('Currency is not supported.');
    }
    maybeAssign('currency', v);
  }

  let desiredUsername = updates.username;
  let desiredAlias = updates.aliasName;
  if (desiredAlias && !desiredUsername) {
    desiredUsername = desiredAlias;
  }
  if (desiredUsername && !desiredAlias) {
    desiredAlias = desiredUsername;
  }
  if (desiredUsername !== undefined) {
    const trimmed = desiredUsername ? desiredUsername.trim() : '';
    if (!trimmed) {
      throw validationError('Username cannot be empty.');
    }
    if (trimmed.length < 3 || trimmed.length > 18 || !/^[A-Za-z0-9_]+$/.test(trimmed)) {
      throw validationError('Username can contain letters, numbers, underscores (3-18 chars).');
    }
    const existing = getUserByUsername(trimmed);
    if (existing && existing.id !== user.id) {
      throw validationError('Username already taken.');
    }
    maybeAssign('username', trimmed);
    maybeAssign('aliasName', desiredAlias || trimmed);
  } else if (desiredAlias !== undefined) {
    const trimmed = desiredAlias ? desiredAlias.trim() : '';
    if (trimmed) {
      const existing = getUserByUsername(trimmed);
      if (existing && existing.id !== user.id) {
        throw validationError('Alias/username already taken.');
      }
      maybeAssign('username', trimmed);
      maybeAssign('aliasName', trimmed);
    }
  }

  if (updates.password !== undefined) {
    const pass = updates.password || '';
    if (pass.trim()) {
      if (pass.length < 6) {
        throw validationError('Password must be at least 6 characters.');
      }
      next.loginPasswordHash = await bcrypt.hash(pass, 10);
    }
  }

  const updated = updateUserSettings(userId, next);
  return sanitizeUser(updated);
}

function getUserProfile(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  return sanitizeUser(user);
}

module.exports = {
  registerUser,
  verifyToken,
  chooseUsername,
  loginUser,
  verifyLoginPassword,
  getUserProfile,
  updateSettings,
  sanitizeUser
};

