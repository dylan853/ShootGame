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
  penniesToDisplay
} = require('./db');
const { sendSystemEmail } = require('./emailService');

const identityDir = path.join(__dirname, 'uploads', 'identities');
fs.mkdirSync(identityDir, { recursive: true });

const APP_URL = process.env.APP_URL || process.env.CLIENT_ORIGIN || '';
const PUBLIC_BASE_URL = APP_URL || '';

function sanitizeUser(user) {
  if (!user) return null;
  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    balance: user.balance,
    balanceDisplay: penniesToDisplay(user.balance)
  };
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function validateRegistrationPayload(payload) {
  const requiredFields = [
    'fullName',
    'dateOfBirth',
    'email',
    'phone',
    'country',
    'password'
  ];
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      throw validationError(`Missing field: ${field}`);
    }
  });
  if (!/^[\p{L}\p{M}'\s.-]{2,}$/u.test(payload.fullName.trim())) {
    throw validationError('Full name looks invalid.');
  }
  if (!/^\+[\d\s-]{7,20}$/.test(payload.phone.trim())) {
    throw validationError('Phone number must include country code (starting with +).');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email.trim())) {
    throw validationError('Email address is invalid.');
  }
  if (payload.password.length < 8) {
    throw validationError('Password must be at least 8 characters.');
  }
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

async function registerUser({
  fullName,
  dateOfBirth,
  email,
  phone,
  country,
  password
}, identityFile) {
  validateRegistrationPayload({
    fullName,
    dateOfBirth,
    email,
    phone,
    country,
    password
  });
  const normalizedEmail = email.trim().toLowerCase();
  const existing = getUserByEmail(normalizedEmail);
  if (existing) {
    throw validationError('Email already registered. Please log in instead.');
  }
  if (!identityFile) {
    throw validationError('Identity image is required.');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const verificationToken = uuidv4();
  const storedFilename = `${verificationToken}${path.extname(identityFile.originalname || identityFile.filename || '.jpg')}`;
  const storedPath = path.join(identityDir, storedFilename);
  fs.renameSync(identityFile.path, storedPath);

  const user = createPendingUser({
    fullName: fullName.trim(),
    dateOfBirth,
    email: normalizedEmail,
    phone: phone.trim(),
    country: country.trim(),
    passwordHash: hashedPassword,
    identityImagePath: storedPath,
    verificationToken
  });

  const verifyLink = buildVerificationLink(verificationToken);
  await sendSystemEmail({
    to: normalizedEmail,
    subject: 'Verify your Shoot Poker account',
    text: `Welcome to Shoot Poker!\n\nClick the link to choose your username: ${verifyLink}`,
    html: `
      <p>Welcome to Shoot Poker!</p>
      <p>Please choose your username to finish registration:</p>
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
    throw validationError('Email and password are required.');
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
    throw validationError('Incorrect email or password.');
  }
  return sanitizeUser(user);
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
  getUserProfile,
  sanitizeUser
};

