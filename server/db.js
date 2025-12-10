const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'data', 'shootgame.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

const STARTING_BALANCE = 5000; // pennies => £50.00

function penniesToDisplay(pence) {
  return `${(pence / 100).toFixed(2)}`;
}

function createModernUsersTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE COLLATE NOCASE,
      full_name TEXT,
      first_name TEXT,
      second_name TEXT,
      date_of_birth TEXT,
      email TEXT UNIQUE COLLATE NOCASE,
      phone TEXT,
      country TEXT,
      password_hash TEXT,
      identity_image_path TEXT,
      house_name_or_number TEXT,
      address_first_line TEXT,
      address_second_line TEXT,
      town_or_city TEXT,
      county TEXT,
      country_of_residence TEXT,
      maximum_bet TEXT,
      limit_per_day TEXT,
      maximum_loss TEXT,
      credit_card_number TEXT,
      expiry_date TEXT,
      cvr_number TEXT,
      bill_image_path TEXT,
      credit_card_image_path TEXT,
      extra_data TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      balance INTEGER NOT NULL DEFAULT ${STARTING_BALANCE},
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);`);
}

function migrateLegacyUsersTable() {
  db.exec('ALTER TABLE users RENAME TO users_legacy');
  createModernUsersTable();
  db.exec(`
    INSERT INTO users (id, username, balance, status, email_verified, created_at, updated_at)
    SELECT id, username, balance, CASE WHEN username IS NOT NULL THEN 'active' ELSE 'pending' END,
           CASE WHEN username IS NOT NULL THEN 1 ELSE 0 END, created_at, created_at
    FROM users_legacy;
  `);
  db.exec('DROP TABLE users_legacy');
}

function ensureUserTable() {
  const existingColumns = db.prepare("PRAGMA table_info('users')").all();
  if (!existingColumns.length) {
    createModernUsersTable();
    return;
  }
  const hasEmail = existingColumns.some((col) => col.name === 'email');
  if (!hasEmail) {
    migrateLegacyUsersTable();
    return;
  }
  const ensureColumn = (name, definition) => {
    const exists = existingColumns.some((col) => col.name === name);
    if (!exists) {
      db.exec(`ALTER TABLE users ADD COLUMN ${definition}`);
    }
  };
  ensureColumn('full_name', 'full_name TEXT');
  ensureColumn('first_name', 'first_name TEXT');
  ensureColumn('second_name', 'second_name TEXT');
  ensureColumn('date_of_birth', 'date_of_birth TEXT');
  ensureColumn('phone', 'phone TEXT');
  ensureColumn('country', 'country TEXT');
  ensureColumn('password_hash', 'password_hash TEXT');
  ensureColumn('identity_image_path', 'identity_image_path TEXT');
  ensureColumn('house_name_or_number', 'house_name_or_number TEXT');
  ensureColumn('address_first_line', 'address_first_line TEXT');
  ensureColumn('address_second_line', 'address_second_line TEXT');
  ensureColumn('town_or_city', 'town_or_city TEXT');
  ensureColumn('county', 'county TEXT');
  ensureColumn('country_of_residence', 'country_of_residence TEXT');
  ensureColumn('maximum_bet', 'maximum_bet TEXT');
  ensureColumn('limit_per_day', 'limit_per_day TEXT');
  ensureColumn('maximum_loss', 'maximum_loss TEXT');
  ensureColumn('credit_card_number', 'credit_card_number TEXT');
  ensureColumn('expiry_date', 'expiry_date TEXT');
  ensureColumn('cvr_number', 'cvr_number TEXT');
  ensureColumn('bill_image_path', 'bill_image_path TEXT');
  ensureColumn('credit_card_image_path', 'credit_card_image_path TEXT');
  ensureColumn('extra_data', 'extra_data TEXT');
  ensureColumn('email_verified', 'email_verified INTEGER NOT NULL DEFAULT 0');
  ensureColumn('verification_token', 'verification_token TEXT');
  ensureColumn('status', "status TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('updated_at', 'updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP');
  }

ensureUserTable();

const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
const getUserByUsernameStmt = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
const getUserByVerificationTokenStmt = db.prepare('SELECT * FROM users WHERE verification_token = ?');
const insertUserStmt = db.prepare(`
  INSERT INTO users (
    id,
    username,
    full_name,
    first_name,
    second_name,
    date_of_birth,
    email,
    phone,
    country,
    password_hash,
    identity_image_path,
    house_name_or_number,
    address_first_line,
    address_second_line,
    town_or_city,
    county,
    country_of_residence,
    maximum_bet,
    limit_per_day,
    maximum_loss,
    credit_card_number,
    expiry_date,
    cvr_number,
    bill_image_path,
    credit_card_image_path,
    extra_data,
    email_verified,
    verification_token,
    status,
    balance
  ) VALUES (
    @id,
    @username,
    @fullName,
    @firstName,
    @secondName,
    @dateOfBirth,
    @email,
    @phone,
    @country,
    @passwordHash,
    @identityImagePath,
    @houseNameOrNumber,
    @addressFirstLine,
    @addressSecondLine,
    @townOrCity,
    @county,
    @countryOfResidence,
    @maximumBet,
    @limitPerDay,
    @maximumLoss,
    @creditCardNumber,
    @expiryDate,
    @cvrNumber,
    @billImagePath,
    @creditCardImagePath,
    @extraData,
    @emailVerified,
    @verificationToken,
    @status,
    @balance
  )
`);
const updateBalanceStmt = db.prepare('UPDATE users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const setBalanceStmt = db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const updateUsernameStmt = db.prepare('UPDATE users SET username = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const markVerifiedStmt = db.prepare('UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const clearVerificationTokenStmt = db.prepare('UPDATE users SET verification_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const updateVerificationTokenStmt = db.prepare('UPDATE users SET verification_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
const updateStatusStmt = db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

function mapUser(row) {
  if (!row) return null;
    return {
    ...row,
    balanceDisplay: penniesToDisplay(row.balance)
    };
  }

function createPendingUser({
  fullName,
  firstName,
  secondName,
  dateOfBirth,
  email,
  phone,
  country,
  passwordHash,
  identityImagePath,
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
  billImagePath,
  creditCardImagePath,
  extraData,
  verificationToken
}) {
  const user = {
    id: uuidv4(),
    username: null,
    fullName,
    firstName,
    secondName,
    dateOfBirth,
    email,
    phone,
    country,
    passwordHash,
    identityImagePath,
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
    billImagePath,
    creditCardImagePath,
    extraData,
    emailVerified: 0,
    verificationToken,
    status: 'pending',
    balance: STARTING_BALANCE
  };
  insertUserStmt.run(user);
  return mapUser(user);
}

function getUserById(id) {
  return mapUser(getUserByIdStmt.get(id));
}

function getUserByEmail(email) {
  if (!email) return null;
  return mapUser(getUserByEmailStmt.get(email));
}

function getUserByUsername(username) {
  if (!username) return null;
  return mapUser(getUserByUsernameStmt.get(username));
}

function getUserByVerificationToken(token) {
  if (!token) return null;
  return mapUser(getUserByVerificationTokenStmt.get(token));
}

function setUserUsername(userId, username, status = 'active') {
  updateUsernameStmt.run(username, status, userId);
  clearVerificationTokenStmt.run(userId);
  markVerifiedStmt.run(userId);
  return getUserById(userId);
}

function markUserVerified(userId) {
  markVerifiedStmt.run(userId);
  return getUserById(userId);
}

function setUserVerificationToken(userId, token) {
  updateVerificationTokenStmt.run(token, userId);
  return getUserById(userId);
}

function updateUserStatus(userId, status) {
  updateStatusStmt.run(status, userId);
  return getUserById(userId);
}

function applyBalanceDelta(userId, deltaPennies) {
  const info = updateBalanceStmt.run(deltaPennies, userId);
  if (info.changes === 0) {
    throw new Error('User not found when updating balance');
  }
  return getUserById(userId);
}

function setBalance(userId, pennies) {
  setBalanceStmt.run(pennies, userId);
  return getUserById(userId);
}

module.exports = {
  db,
  createPendingUser,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  getUserByVerificationToken,
  setUserUsername,
  setUserVerificationToken,
  markUserVerified,
  updateUserStatus,
  applyBalanceDelta,
  setBalance,
  penniesToDisplay,
  STARTING_BALANCE
};
