const storageKey = 'shootUser';
const state = {
  user: null
};

const refs = {
  loginForm: document.getElementById('login-form'),
  usernameInput: document.getElementById('username-input'),
  userSummary: document.getElementById('user-summary'),
  userName: document.getElementById('user-name'),
  userBalance: document.getElementById('user-balance'),
  authPanel: document.getElementById('auth-panel')
};

init();

function init() {
  wireEvents();
  hydrateUser();
  render();
}

function wireEvents() {
  if (refs.loginForm) {
    refs.loginForm.addEventListener('submit', handleLoginSubmit);
  }
}

function hydrateUser() {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      state.user = JSON.parse(stored);
      // If user is already signed in, redirect to main page
      window.location.href = '/';
    } catch (err) {
      console.warn('Failed to parse stored user');
    }
  }
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

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = refs.usernameInput.value.trim();
  if (!username) {
    toast('Please enter a username.');
    return;
  }
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (!res.ok) {
      const msg = await res.json();
      throw new Error(msg.message || 'Could not save username');
    }
    const data = await res.json();
    state.user = {
      userId: data.userId,
      username: data.username,
      balance: data.balance,
      balanceDisplay: data.balanceDisplay
    };
    localStorage.setItem(storageKey, JSON.stringify(state.user));
    // Redirect to main page after successful sign in
    window.location.href = '/';
  } catch (err) {
    toast(err.message || 'Unable to save username');
  }
}

function render() {
  if (state.user) {
    refs.loginForm?.classList.add('hidden');
    refs.userSummary.classList.remove('hidden');
    if (refs.userName) {
      refs.userName.textContent = state.user.username;
    }
    if (refs.userBalance) {
      refs.userBalance.textContent = state.user.balanceDisplay || '£0.00';
    }
  } else {
    refs.loginForm?.classList.remove('hidden');
    refs.userSummary.classList.add('hidden');
  }
}

