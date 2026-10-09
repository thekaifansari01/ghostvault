/* ═══════════════════════════════════════════════════════════
   GhostVault · App Logic
   Robust, defensive, edge-case aware.
   ═══════════════════════════════════════════════════════════ */

'use strict';

const API = '/api';
const MAX_FILE_SIZE = 4 * 1024 * 1024;   // 4 MB per file
const MAX_CONCURRENT_UPLOADS = 2;
const MAX_TOTAL_FILES = 50;

/* ── DOM refs ───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const loginView     = $('login-view');
const appView       = $('app-view');
const loginForm     = $('login-form');
const loginError    = $('login-error');
const loginBtn      = $('login-btn');
const logoutBtn     = $('logout-btn');
const pwToggle      = $('pw-toggle');
const passwordInput = $('password');

const uploadZone    = $('upload-zone');
const fileInput     = $('file-input');
const uploadQueueEl = $('upload-queue');
const fabUpload     = $('fab-upload');

const filesList     = $('files-list');
const searchInput   = $('search-input');
const searchClear   = $('search-clear');
const statCount     = $('stat-count');
const statSize      = $('stat-size');
const countChip     = $('files-count-chip');

const previewModal  = $('preview-modal');
const previewBody   = $('preview-body');
const previewTitle  = $('preview-title');
const previewClose  = $('preview-close');
const previewCopy   = $('preview-copy');
const previewDownload = $('preview-download');

const confirmModal  = $('confirm-modal');
const confirmTitle  = $('confirm-title');
const confirmMessage= $('confirm-message');
const confirmIcon   = $('confirm-icon');
const confirmOk     = $('confirm-ok');
const confirmCancel = $('confirm-cancel');

const renameModal   = $('rename-modal');
const renameInput   = $('rename-input');
const renameSubtitle= $('rename-subtitle');
const renameOk      = $('rename-ok');
const renameCancel  = $('rename-cancel');

const toastContainer = $('toast-container');
const netBanner     = $('net-banner');
const netText       = $('net-text');

/* ── State ──────────────────────────────────────────────── */
const state = {
  token: null,
  expiresAt: 0,
  tokenTimer: null,
  files: [],
  query: '',
  listLoaded: false,
  lastFocused: null,
  activeUploads: 0,
  uploadQueue: [],
  currentPreviewKey: null,
  currentPreviewText: null,
  searchTimer: null,
  loadingFiles: false,
};

/* ── Icon constants ─────────────────────────────────────── */
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>';

/* ═══════════ Helpers ═══════════ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function relativeTime(ts) {
  const now = Date.now();
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.floor((now - then) / 1000);

  if (diff < 10) return 'just now';
  if (diff < 60) return diff + 's ago';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function displayName(key) {
  if (!key) return '';
  const idx = key.indexOf('_');
  return idx > 0 ? key.slice(idx + 1) : key;
}

function getFileExtension(key) {
  const name = displayName(key);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function uid() {
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ═══════════ Toasts ═══════════ */
const TOAST_ICONS = { success: '✅', error: '⚠️', info: 'ℹ️', warning: '⚡' };
const TOAST_DURATION = 3400;

function showToast(message, type = 'info', duration = TOAST_DURATION) {
  if (!message) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.setProperty('--dur', duration + 'ms');
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ️'}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">${ICON_X}</button>
  `;

  const dismiss = () => {
    if (toast.classList.contains('out')) return;
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  toastContainer.appendChild(toast);
  setTimeout(dismiss, duration);

  // Cap toasts at 4
  const all = toastContainer.querySelectorAll('.toast:not(.out)');
  if (all.length > 4) all[0].classList.add('out');
}

/* ═══════════ Focus trap ═══════════ */
function trapFocus(container) {
  const selector = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const focusables = Array.from(container.querySelectorAll(selector)).filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

/* ═══════════ Confirm dialog ═══════════ */
let confirmResolve = null;
let confirmCleanup = null;

function showConfirm({ title, message, okText = 'delete', icon = '🗑️', danger = true }) {
  return new Promise((resolve) => {
    state.lastFocused = document.activeElement;
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOk.textContent = okText;
    confirmIcon.textContent = icon;
    confirmOk.className = danger ? 'btn-danger' : 'btn-accent';
    confirmModal.classList.remove('hidden');
    confirmResolve = resolve;

    confirmCleanup = trapFocus(confirmModal);
    setTimeout(() => confirmOk.focus(), 60);
  });
}

function closeConfirm(result) {
  if (!confirmResolve) return;
  confirmModal.classList.add('hidden');
  if (confirmCleanup) confirmCleanup();
  confirmCleanup = null;
  const r = confirmResolve;
  confirmResolve = null;
  r(result);
  if (state.lastFocused && document.contains(state.lastFocused)) {
    try { state.lastFocused.focus(); } catch (_) {}
  }
}

confirmOk.addEventListener('click', () => closeConfirm(true));
confirmCancel.addEventListener('click', () => closeConfirm(false));
confirmModal.querySelector('[data-close-confirm]').addEventListener('click', () => closeConfirm(false));

/* ═══════════ Rename dialog ═══════════ */
let renameResolve = null;
let renameCleanup = null;

function showRename(currentName) {
  return new Promise((resolve) => {
    state.lastFocused = document.activeElement;
    renameSubtitle.textContent = `currently: ${currentName}`;
    renameInput.value = currentName;
    renameModal.classList.remove('hidden');
    renameResolve = resolve;

    renameCleanup = trapFocus(renameModal);

    setTimeout(() => {
      renameInput.focus();
      const dotIdx = currentName.lastIndexOf('.');
      if (dotIdx > 0) renameInput.setSelectionRange(0, dotIdx);
      else renameInput.select();
    }, 60);
  });
}

function closeRename(result) {
  if (!renameResolve) return;
  renameModal.classList.add('hidden');
  if (renameCleanup) renameCleanup();
  renameCleanup = null;
  const r = renameResolve;
  renameResolve = null;
  r(result);
  if (state.lastFocused && document.contains(state.lastFocused)) {
    try { state.lastFocused.focus(); } catch (_) {}
  }
}

renameOk.addEventListener('click', () => {
  const val = renameInput.value.trim();
  if (!val) {
    renameInput.focus();
    renameInput.classList.add('shake');
    setTimeout(() => renameInput.classList.remove('shake'), 400);
    return;
  }
  closeRename(val);
});

renameCancel.addEventListener('click', () => closeRename(null));
renameModal.querySelector('[data-close-rename]').addEventListener('click', () => closeRename(null));

renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = renameInput.value.trim();
    if (val) closeRename(val);
  }
});

/* ═══════════ Password toggle ═══════════ */
pwToggle.addEventListener('click', () => {
  const isText = passwordInput.type === 'text';
  passwordInput.type = isText ? 'password' : 'text';
  pwToggle.setAttribute('aria-pressed', String(!isText));
  pwToggle.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
  passwordInput.focus();
});

/* ═══════════ Network status ═══════════ */
function updateNetworkStatus() {
  if (navigator.onLine) {
    netBanner.classList.add('hidden');
  } else {
    netText.textContent = "you're offline — some things won't work";
    netBanner.classList.remove('hidden');
  }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

/* ═══════════ Login ═══════════ */
function setLoginLoading(loading) {
  const btnText = loginBtn.querySelector('.btn-text');
  const btnArrow = loginBtn.querySelector('.btn-arrow');
  const btnSpinner = loginBtn.querySelector('.btn-spinner');

  if (loading) {
    btnText.textContent = 'entering…';
    btnArrow.classList.add('hidden');
    btnSpinner.classList.remove('hidden');
    loginBtn.disabled = true;
  } else {
    btnText.textContent = 'enter vault';
    btnArrow.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
    loginBtn.disabled = false;
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (loginBtn.disabled) return;

  loginError.textContent = '';
  const username = $('username').value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    loginError.textContent = 'both fields, please ✋';
    return;
  }
  if (!navigator.onLine) {
    loginError.textContent = "you're offline — try again when connected";
    return;
  }

  setLoginLoading(true);

  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Invalid credentials');
    }

    const data = await res.json();
    if (!data || !data.token) throw new Error('Login response was invalid');

    state.token = data.token;
    const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600;
    state.expiresAt = Date.now() + ttl * 1000;

    if (state.tokenTimer) clearTimeout(state.tokenTimer);
    state.tokenTimer = setTimeout(() => {
      doLogout('Session expired. Login again.');
    }, ttl * 1000);

    loginForm.reset();
    showApp();
  } catch (err) {
    loginError.textContent = err.message || 'Login failed';
  } finally {
    setLoginLoading(false);
  }
});

/* ═══════════ App / Logout ═══════════ */
function showApp() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  state.query = '';
  searchInput.value = '';
  searchClear.classList.add('hidden');
  loadFiles();
}

function doLogout(message) {
  state.token = null;
  state.expiresAt = 0;
  if (state.tokenTimer) clearTimeout(state.tokenTimer);
  state.tokenTimer = null;

  // cancel pending uploads
  for (const task of state.uploadQueue) {
    if (task.xhr && task.status === 'uploading') {
      try { task.xhr.abort(); } catch (_) {}
    }
  }
  state.uploadQueue = [];
  state.activeUploads = 0;
  uploadQueueEl.innerHTML = '';
  uploadQueueEl.classList.add('hidden');

  appView.classList.add('hidden');
  loginView.classList.remove('hidden');
  loginError.textContent = message || '';

  filesList.innerHTML = '';
  state.files = [];
  state.listLoaded = false;
  statCount.textContent = '0';
  statSize.textContent = '0 B';
  countChip.textContent = '';
  closePreview();
}

logoutBtn.addEventListener('click', () => doLogout());

/* ═══════════ API helper ═══════════ */
async function api(path, options = {}) {
  if (!state.token) throw new Error('Not authenticated');

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    doLogout('Session expired. Login again.');
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Request failed (${res.status})`);
  }

  // some endpoints might return empty bodies
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return {};
}

/* ═══════════ File type meta ═══════════ */
const FILE_META = {
  image:   { icon: '🖼️', cls: 'file-icon-image',   exts: ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','heic'] },
  video:   { icon: '🎬', cls: 'file-icon-video',   exts: ['mp4','webm','mov','avi','mkv','m4v'] },
  audio:   { icon: '🎵', cls: 'file-icon-audio',   exts: ['mp3','wav','ogg','flac','m4a','aac','opus'] },
  code:    { icon: '💻', cls: 'file-icon-code',    exts: ['js','mjs','cjs','jsx','ts','tsx','py','html','htm','css','scss','sass','less','json','xml','yaml','yml','toml','go','rs','java','c','h','cpp','hpp','cc','rb','php','sh','bash','zsh','fish','sql','lua','r','pl','kt','swift','dart','vue','svelte'] },
  pdf:     { icon: '📕', cls: 'file-icon-pdf',     exts: ['pdf'] },
  archive: { icon: '📦', cls: 'file-icon-archive', exts: ['zip','rar','7z','tar','gz','bz2','xz'] },
  data:    { icon: '📊', cls: 'file-icon-data',    exts: ['xls','xlsx','csv','ppt','pptx','ods','numbers'] },
  doc:     { icon: '📝', cls: 'file-icon-doc',     exts: ['doc','docx','txt','md','markdown','rtf','odt','pages'] },
};

function getFileMeta(name) {
  if (!name) return { icon: '📄', cls: '', exts: [] };
  const ext = name.split('.').pop().toLowerCase();
  for (const val of Object.values(FILE_META)) {
    if (val.exts.includes(ext)) return val;
  }
  return { icon: '📄', cls: '', exts: [] };
}

/* ═══════════ Prism lang mapping ═══════════ */
function extToPrismLang(ext) {
  const map = {
    html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
    css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust',
    java: 'java', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp', swift: 'swift', kt: 'kotlin', dart: 'dart',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', markdown: 'markdown',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
    sql: 'sql', lua: 'lua', r: 'r', pl: 'perl',
    ini: 'ini', cfg: 'ini', conf: 'ini', env: 'bash',
    dockerfile: 'docker', makefile: 'makefile',
  };
  return map[ext] || null;
}

/* ═══════════ Skeletons ═══════════ */
function renderSkeleton(count = 3) {
  filesList.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton-row">
      <div class="skeleton-box skeleton-icon"></div>
      <div class="skeleton-info">
        <div class="skeleton-box skeleton-line"></div>
        <div class="skeleton-box skeleton-line skeleton-line-sm"></div>
      </div>
    </div>
  `).join('');
}

/* ═══════════ Load files ═══════════ */
async function loadFiles(showSkeleton = true) {
  if (state.loadingFiles) return;
  state.loadingFiles = true;
  if (showSkeleton) renderSkeleton();

  try {
    const data = await api('/list-files');
    const files = Array.isArray(data.files) ? data.files : [];
    state.files = files;
    state.listLoaded = true;

    statCount.textContent = Number.isFinite(data.count) ? data.count : files.length;
    statSize.textContent = formatSize(Number(data.total_size) || 0);

    applyFilter();
  } catch (err) {
    if (err.message === 'Unauthorized') return;
    filesList.innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <p>couldn't load your files</p>
        <p class="hint">${escapeHtml(err.message)}</p>
        <button class="retry-btn" data-retry>try again</button>
      </div>`;
    const btn = filesList.querySelector('[data-retry]');
    if (btn) btn.addEventListener('click', () => loadFiles());
  } finally {
    state.loadingFiles = false;
  }
}

/* ═══════════ Filter / render ═══════════ */
function applyFilter() {
  const q = state.query.toLowerCase().trim();
  const filtered = q
    ? state.files.filter(f => displayName(f.key).toLowerCase().includes(q))
    : state.files;

  renderFiles(filtered, q);
}

function renderFiles(files, query = '') {
  if (!files.length) {
    countChip.textContent = '';
    if (query) {
      filesList.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔍</div>
          <p>no matches for "${escapeHtml(query)}"</p>
          <p class="hint">try a different search</p>
        </div>`;
    } else {
      filesList.innerHTML = `
        <div class="empty-state">
          <div class="icon">🌌</div>
          <p>nothing here yet</p>
          <p class="hint">drop something to get started ✨</p>
        </div>`;
    }
    return;
  }

  countChip.textContent = query
    ? `${files.length} / ${state.files.length}`
    : `${files.length} ${files.length === 1 ? 'file' : 'files'}`;

  filesList.innerHTML = files.map((f, i) => {
    const name = displayName(f.key);
    const meta = getFileMeta(name);
    const sizeStr = formatSize(Number(f.size) || 0);
    const timeStr = relativeTime(f.last_modified);
    const delay = Math.min(i * 28, 300);
    return `
      <div class="file-row" data-key="${escapeHtml(f.key)}" style="animation-delay:${delay}ms">
        <div class="file-icon-wrap ${meta.cls}">${meta.icon}</div>
        <div class="file-info">
          <span class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <span class="file-meta">
            <span>${sizeStr}</span>
            <span class="file-meta-dot"></span>
            <span>${escapeHtml(timeStr)}</span>
          </span>
        </div>
        <div class="file-actions">
          <button class="view-btn" title="view" aria-label="View ${escapeHtml(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="dl-btn" title="download" aria-label="Download ${escapeHtml(name)}">
            ${ICON_DL}
          </button>
          <button class="rename-btn" title="rename" aria-label="Rename ${escapeHtml(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button class="del-btn" title="delete" aria-label="Delete ${escapeHtml(name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

/* ═══════════ File action delegation ═══════════ */
filesList.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const row = e.target.closest('.file-row');
  if (!row) return;
  const key = row.dataset.key;
  if (!key) return;

  if (btn.classList.contains('view-btn'))   previewFile(key);
  else if (btn.classList.contains('dl-btn'))     downloadFile(key);
  else if (btn.classList.contains('rename-btn')) renameFile(key);
  else if (btn.classList.contains('del-btn'))    deleteFile(key);
});

/* ═══════════ Search ═══════════ */
const applyFilterDebounced = debounce(applyFilter, 120);

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  searchClear.classList.toggle('hidden', !searchInput.value);
  applyFilterDebounced();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  state.query = '';
  searchClear.classList.add('hidden');
  applyFilter();
  searchInput.focus();
});

/* ⌘K / Ctrl+K to focus search */
document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'k' && !appView.classList.contains('hidden')) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

/* ═══════════ Upload ═══════════ */
let dragCounter = 0;

uploadZone.addEventListener('click', (e) => {
  if (e.target.closest('input')) return;
  fileInput.click();
});

uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

uploadZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

uploadZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    uploadZone.classList.remove('dragover');
  }
});

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  uploadZone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length) enqueueFiles(files);
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  if (files.length) enqueueFiles(files);
  fileInput.value = '';
});

fabUpload.addEventListener('click', () => fileInput.click());

/* Paste upload */
document.addEventListener('paste', (e) => {
  if (appView.classList.contains('hidden')) return;
  const target = e.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  const files = Array.from(e.clipboardData?.files || []);
  if (files.length) {
    e.preventDefault();
    enqueueFiles(files);
  }
});

/* ═══════════ Upload queue ═══════════ */
function enqueueFiles(files) {
  if (!navigator.onLine) {
    showToast("you're offline — can't upload now", 'error');
    return;
  }
  if (state.files.length + files.length > MAX_TOTAL_FILES) {
    showToast(`too many files (max ${MAX_TOTAL_FILES} in vault)`, 'warning');
    return;
  }

  const oversized = files.filter(f => f.size > MAX_FILE_SIZE);
  if (oversized.length) {
    const names = oversized.slice(0, 3).map(f => f.name).join(', ');
    const extra = oversized.length > 3 ? ` +${oversized.length - 3} more` : '';
    showToast(`too large (max 4 MB): ${names}${extra}`, 'error', 5000);
  }

  const valid = files.filter(f => f.size <= MAX_FILE_SIZE && f.size > 0);
  if (!valid.length) return;

  for (const file of valid) {
    const task = {
      id: uid(),
      file,
      status: 'queued',   // queued | uploading | done | error | cancelled
      progress: 0,
      error: null,
      xhr: null,
    };
    state.uploadQueue.push(task);
    renderUploadItem(task);
  }

  uploadQueueEl.classList.remove('hidden');
  pumpQueue();
}

function pumpQueue() {
  while (state.activeUploads < MAX_CONCURRENT_UPLOADS) {
    const next = state.uploadQueue.find(t => t.status === 'queued');
    if (!next) break;
    startUpload(next);
  }
  if (!state.uploadQueue.some(t => t.status === 'queued' || t.status === 'uploading')) {
    // All done → cleanup after delay
    if (state.uploadQueue.every(t => t.status === 'done' || t.status === 'cancelled')) {
      setTimeout(hideQueueIfDone, 1400);
    }
  }
}

function renderUploadItem(task) {
  let el = uploadQueueEl.querySelector(`[data-upload-id="${task.id}"]`);
  const meta = getFileMeta(task.file.name);

  if (!el) {
    el = document.createElement('div');
    el.className = 'upload-item';
    el.dataset.uploadId = task.id;
    el.innerHTML = `
      <div class="upload-item-icon ${meta.cls}">${meta.icon}</div>
      <div class="upload-item-body">
        <div class="upload-item-name" title="${escapeHtml(task.file.name)}">${escapeHtml(task.file.name)}</div>
        <div class="upload-item-meta">
          <span class="upload-item-size">${formatSize(task.file.size)}</span>
          <span class="upload-item-pct">0%</span>
        </div>
        <div class="upload-item-progress">
          <div class="upload-item-bar"></div>
        </div>
      </div>
      <button class="upload-item-cancel" aria-label="Cancel upload">${ICON_X}</button>
    `;
    el.querySelector('.upload-item-cancel').addEventListener('click', () => cancelUpload(task));
    uploadQueueEl.appendChild(el);
  }

  const bar = el.querySelector('.upload-item-bar');
  const pctEl = el.querySelector('.upload-item-pct');
  const cancelBtn = el.querySelector('.upload-item-cancel');

  el.classList.remove('done', 'error');
  bar.style.width = task.progress + '%';

  if (task.status === 'uploading' || task.status === 'queued') {
    pctEl.textContent = task.status === 'queued' ? 'queued' : (task.progress + '%');
    cancelBtn.innerHTML = ICON_X;
    cancelBtn.setAttribute('aria-label', 'Cancel upload');
  } else if (task.status === 'done') {
    el.classList.add('done');
    bar.style.width = '100%';
    pctEl.textContent = 'done';
    cancelBtn.innerHTML = '✓';
    cancelBtn.setAttribute('aria-label', 'Uploaded');
    cancelBtn.disabled = true;
    cancelBtn.style.opacity = '0.5';
  } else if (task.status === 'error') {
    el.classList.add('error');
    pctEl.textContent = 'failed';
    cancelBtn.innerHTML = ICON_X;
    cancelBtn.setAttribute('aria-label', 'Remove');
  } else if (task.status === 'cancelled') {
    el.style.opacity = '0.5';
    pctEl.textContent = 'cancelled';
    cancelBtn.disabled = true;
  }
}

function startUpload(task) {
  task.status = 'uploading';
  state.activeUploads++;
  renderUploadItem(task);

  const xhr = new XMLHttpRequest();
  task.xhr = xhr;
  xhr.open('POST', `${API}/upload`);
  xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
  xhr.timeout = 90000;

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      task.progress = Math.round((e.loaded / e.total) * 100);
      renderUploadItem(task);
    }
  };

  xhr.onload = () => {
    state.activeUploads--;
    if (xhr.status === 401) {
      doLogout('Session expired. Login again.');
      return;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      task.status = 'done';
      task.progress = 100;
      renderUploadItem(task);
      showToast(`${task.file.name} uploaded`, 'success');
      loadFiles(false);
    } else {
      let msg = 'Upload failed';
      try {
        const data = JSON.parse(xhr.responseText);
        msg = data.detail || msg;
      } catch (_) {}
      task.status = 'error';
      task.error = msg;
      renderUploadItem(task);
      showToast(msg, 'error');
    }
    pumpQueue();
  };

  xhr.onerror = () => {
    state.activeUploads--;
    task.status = 'error';
    task.error = 'Network error';
    renderUploadItem(task);
    showToast('Network error during upload', 'error');
    pumpQueue();
  };

  xhr.ontimeout = () => {
    state.activeUploads--;
    task.status = 'error';
    task.error = 'Timed out';
    renderUploadItem(task);
    showToast('Upload timed out', 'error');
    pumpQueue();
  };

  xhr.onabort = () => {
    state.activeUploads--;
    task.status = 'cancelled';
    renderUploadItem(task);
    pumpQueue();
  };

  xhr.send((() => {
    const fd = new FormData();
    fd.append('file', task.file, task.file.name);
    return fd;
  })());
}

function cancelUpload(task) {
  if (task.status === 'uploading' && task.xhr) {
    try { task.xhr.abort(); } catch (_) {}
  } else if (task.status === 'queued') {
    task.status = 'cancelled';
    renderUploadItem(task);
    pumpQueue();
  } else if (task.status === 'error') {
    const el = uploadQueueEl.querySelector(`[data-upload-id="${task.id}"]`);
    if (el) el.remove();
    state.uploadQueue = state.uploadQueue.filter(t => t.id !== task.id);
  }
  hideQueueIfDone();
}

function hideQueueIfDone() {
  const remaining = state.uploadQueue.some(t =>
    t.status === 'uploading' || t.status === 'queued' || t.status === 'error'
  );
  if (!remaining) {
    uploadQueueEl.classList.add('hidden');
    uploadQueueEl.innerHTML = '';
    state.uploadQueue = [];
  }
}

/* ═══════════ Download ═══════════ */
async function downloadFile(key) {
  try {
    const res = await fetch(`${API}/download/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });

    if (res.status === 401) {
      doLogout('Session expired. Login again.');
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Download failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = displayName(key);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(`${displayName(key)} downloaded`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ═══════════ Delete ═══════════ */
async function deleteFile(key) {
  const name = displayName(key);
  const ok = await showConfirm({
    title: 'delete this file?',
    message: `"${name}" will be permanently removed.`,
    okText: 'delete',
    icon: '🗑️',
    danger: true,
  });
  if (!ok) return;

  try {
    await api(`/delete-file?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    showToast(`${name} deleted`, 'success');
    loadFiles(false);
    if (state.currentPreviewKey === key) closePreview();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ═══════════ Rename ═══════════ */
async function renameFile(key) {
  const currentName = displayName(key);
  const newName = await showRename(currentName);
  if (!newName || newName === currentName) return;

  // guard against path-ish characters
  if (/[\\/]/.test(newName)) {
    showToast('name cannot contain slashes', 'error');
    return;
  }

  try {
    const res = await api('/rename', {
      method: 'POST',
      body: JSON.stringify({ key, new_name: newName }),
    });
    if (res && res.status === 'unchanged') return;
    showToast(`renamed to ${newName}`, 'success');
    loadFiles(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ═══════════ Copy to clipboard ═══════════ */
async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    ta.remove();
  }
}

previewCopy.addEventListener('click', async () => {
  if (state.currentPreviewText === null) return;
  try {
    await copyTextToClipboard(state.currentPreviewText);
    previewCopy.innerHTML = ICON_CHECK;
    previewCopy.classList.add('copied');
    setTimeout(() => {
      previewCopy.innerHTML = ICON_COPY;
      previewCopy.classList.remove('copied');
    }, 1400);
  } catch (_) {
    showToast('copy failed', 'error');
  }
});

previewDownload.addEventListener('click', () => {
  if (state.currentPreviewKey) downloadFile(state.currentPreviewKey);
});

/* ═══════════ Preview ═══════════ */
let previewCleanup = null;

async function previewFile(key) {
  state.lastFocused = document.activeElement;
  state.currentPreviewKey = key;
  state.currentPreviewText = null;

  previewTitle.textContent = displayName(key);
  previewBody.innerHTML = `
    <div class="preview-loading">
      <div class="spinner-ring"></div>
      <span>loading…</span>
    </div>`;
  previewCopy.classList.add('hidden');
  previewCopy.innerHTML = ICON_COPY;
  previewCopy.classList.remove('copied');
  previewModal.classList.remove('hidden');

  previewCleanup = trapFocus(previewModal);
  setTimeout(() => previewClose.focus(), 60);

  try {
    const data = await api(`/preview?key=${encodeURIComponent(key)}`);

    if (!data || !data.type) {
      previewBody.innerHTML = `<div class="empty-state"><div class="icon">🤔</div><p>nothing to show</p></div>`;
      return;
    }

    if (data.type === 'text') {
      const ext = data.extension || getFileExtension(key);
      const lang = extToPrismLang(ext);
      const escaped = escapeHtml(data.content ?? '');
      const cls = lang ? ` class="language-${lang}"` : '';
      previewBody.innerHTML = `<pre${cls}><code${cls}>${escaped}</code></pre>`;

      if (lang && window.Prism && typeof Prism.highlightElement === 'function') {
        const codeEl = previewBody.querySelector('code');
        if (codeEl) {
          try { Prism.highlightElement(codeEl); } catch (_) {}
        }
      }

      state.currentPreviewText = data.content ?? '';
      previewCopy.classList.remove('hidden');
    } else if (data.type === 'too_large') {
      previewBody.innerHTML = `
        <div class="empty-state">
          <div class="icon">📦</div>
          <p>file too large to preview</p>
          <p class="hint">download it instead</p>
        </div>`;
    } else if (data.type === 'binary') {
      const ct = data.content_type || '';
      const url = data.url || '';

      if (ct.startsWith('image/')) {
        previewBody.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName(key))}" loading="lazy">`;
      } else if (ct === 'application/pdf') {
        previewBody.innerHTML = `<iframe src="${escapeHtml(url)}" title="PDF preview"></iframe>`;
      } else if (ct.startsWith('video/')) {
        previewBody.innerHTML = `<video src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>`;
      } else if (ct.startsWith('audio/')) {
        previewBody.innerHTML = `<audio src="${escapeHtml(url)}" controls preload="metadata"></audio>`;
      } else {
        previewBody.innerHTML = `
          <div class="empty-state">
            <div class="icon">👀</div>
            <p>preview not available</p>
            <p class="hint">download it to view</p>
          </div>`;
      }
    } else {
      previewBody.innerHTML = `
        <div class="empty-state">
          <div class="icon">🤔</div>
          <p>preview not available</p>
        </div>`;
    }
  } catch (err) {
    if (err.message === 'Unauthorized') return;
    previewBody.innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <p>couldn't load preview</p>
        <p class="hint">${escapeHtml(err.message)}</p>
      </div>`;
  }
}

function closePreview() {
  if (previewModal.classList.contains('hidden')) return;
  previewModal.classList.add('hidden');
  // stop media
  previewBody.querySelectorAll('video, audio').forEach(el => {
    try { el.pause(); el.src = ''; } catch (_) {}
  });
  previewBody.innerHTML = '';
  state.currentPreviewText = null;
  state.currentPreviewKey = null;
  previewCopy.classList.add('hidden');
  if (previewCleanup) previewCleanup();
  previewCleanup = null;
  if (state.lastFocused && document.contains(state.lastFocused)) {
    try { state.lastFocused.focus(); } catch (_) {}
  }
}

previewClose.addEventListener('click', closePreview);
previewModal.querySelector('[data-close-preview]').addEventListener('click', closePreview);

/* ═══════════ Global keyboard ═══════════ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!previewModal.classList.contains('hidden')) { closePreview(); return; }
    if (!confirmModal.classList.contains('hidden')) { closeConfirm(false); return; }
    if (!renameModal.classList.contains('hidden')) { closeRename(null); return; }
  }
});

/* ═══════════ Visibility → reload on return ═══════════ */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible'
      && state.token
      && !appView.classList.contains('hidden')) {
    // if token expired while away
    if (state.expiresAt && Date.now() > state.expiresAt) {
      doLogout('Session expired. Login again.');
      return;
    }
    // refresh list quietly
    if (state.listLoaded) loadFiles(false);
  }
});

/* ═══════════ Prevent accidental data loss on unload w/ uploads ═══════════ */
window.addEventListener('beforeunload', (e) => {
  const active = state.uploadQueue.some(t => t.status === 'uploading');
  if (active) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ═══════════ Init: focus username on first paint ═══════════ */
window.addEventListener('DOMContentLoaded', () => {
  const u = $('username');
  if (u && !loginView.classList.contains('hidden')) {
    setTimeout(() => u.focus(), 200);
  }
});