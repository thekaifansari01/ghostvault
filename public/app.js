let authToken = null;
let tokenExpiryTimer = null;
let allFiles = [];
let confirmResolve = null;

const API = "/api";

const loginView    = document.getElementById("login-view");
const appView      = document.getElementById("app-view");
const loginForm    = document.getElementById("login-form");
const loginError   = document.getElementById("login-error");
const loginBtn     = document.getElementById("login-btn");
const logoutBtn    = document.getElementById("logout-btn");
const uploadZone   = document.getElementById("upload-zone");
const fileInput    = document.getElementById("file-input");
const uploadStatus = document.getElementById("upload-status");
const uploadProgress = document.getElementById("upload-progress");
const progressBar  = document.getElementById("progress-bar");
const progressPercent = document.getElementById("progress-percent");
const filesList    = document.getElementById("files-list");
const searchInput  = document.getElementById("search-input");
const searchClear  = document.getElementById("search-clear");
const statCount    = document.getElementById("stat-count");
const statSize     = document.getElementById("stat-size");
const previewModal = document.getElementById("preview-modal");
const previewBody  = document.getElementById("preview-body");
const previewTitle = document.getElementById("preview-title");
const previewClose = document.getElementById("preview-close");
const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOk    = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const toastContainer = document.getElementById("toast-container");
const pwToggle     = document.getElementById("pw-toggle");
const fabUpload    = document.getElementById("fab-upload");

function showToast(message, type = "info") {
    const icons = { success: "✅", error: "⚠️", info: "ℹ️" };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || "ℹ️"}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("out");
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function showConfirm(title, message, okText = "delete") {
    return new Promise((resolve) => {
        confirmTitle.textContent = title;
        confirmMessage.textContent = message;
        confirmOk.textContent = okText;
        confirmModal.classList.remove("hidden");
        confirmResolve = resolve;
    });
}

function closeConfirm(result) {
    confirmModal.classList.add("hidden");
    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

confirmOk.addEventListener("click", () => closeConfirm(true));
confirmCancel.addEventListener("click", () => closeConfirm(false));
confirmModal.querySelector("[data-close-confirm]").addEventListener("click", () => closeConfirm(false));

pwToggle.addEventListener("click", () => {
    const pw = document.getElementById("password");
    const isText = pw.type === "text";
    pw.type = isText ? "password" : "text";
    pwToggle.style.color = isText ? "" : "var(--accent)";
});

function setLoginLoading(loading) {
    if (loading) {
        loginBtn.querySelector(".btn-text").textContent = "entering";
        loginBtn.querySelector(".btn-arrow").classList.add("hidden");
        loginBtn.querySelector(".btn-spinner").classList.remove("hidden");
        loginBtn.disabled = true;
    } else {
        loginBtn.querySelector(".btn-text").textContent = "enter vault";
        loginBtn.querySelector(".btn-arrow").classList.remove("hidden");
        loginBtn.querySelector(".btn-spinner").classList.add("hidden");
        loginBtn.disabled = false;
    }
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
        loginError.textContent = "please fill in both fields.";
        return;
    }

    setLoginLoading(true);

    try {
        const res = await fetch(`${API}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || "Invalid credentials");
        }

        const data = await res.json();
        authToken = data.token;

        tokenExpiryTimer = setTimeout(() => {
            doLogout("Session expired. Login again.");
        }, data.expires_in * 1000);

        showApp();
    } catch (err) {
        loginError.textContent = err.message;
    } finally {
        setLoginLoading(false);
    }
});

function showApp() {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    loginForm.reset();
    loadFiles();
}

function doLogout(message) {
    authToken = null;
    if (tokenExpiryTimer) clearTimeout(tokenExpiryTimer);
    tokenExpiryTimer = null;
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
    loginError.textContent = message || "";
    filesList.innerHTML = "";
    uploadStatus.textContent = "";
    allFiles = [];
    searchInput.value = "";
    searchClear.classList.add("hidden");
    closePreview();
}

logoutBtn.addEventListener("click", () => doLogout());

async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
            ...(options.headers || {}),
        },
    });

    if (res.status === 401) {
        doLogout("Session expired. Login again.");
        throw new Error("Unauthorized");
    }
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Request failed (${res.status})`);
    }
    return res.json();
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

function displayName(key) {
    const idx = key.indexOf("_");
    return idx > 0 ? key.slice(idx + 1) : key;
}

function getFileMeta(name) {
    const ext = name.split(".").pop().toLowerCase();
    const map = {
        image: { icon: "🖼️", cls: "file-icon-image", exts: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"] },
        video: { icon: "🎬", cls: "file-icon-video", exts: ["mp4", "webm", "mov", "avi", "mkv"] },
        audio: { icon: "🎵", cls: "file-icon-audio", exts: ["mp3", "wav", "ogg", "flac", "m4a"] },
        code:  { icon: "💻", cls: "file-icon-code",  exts: ["js", "py", "html", "css", "json", "xml", "ts", "jsx", "tsx", "go", "rs", "java", "c", "cpp", "rb", "php", "sh", "yaml", "yml"] },
        pdf:   { icon: "📕", cls: "file-icon-pdf",   exts: ["pdf"] },
        archive: { icon: "📦", cls: "file-icon-archive", exts: ["zip", "rar", "7z", "tar", "gz"] },
        data:  { icon: "📊", cls: "file-icon-data",  exts: ["xls", "xlsx", "csv", "ppt", "pptx"] },
        doc:   { icon: "📝", cls: "file-icon-doc",   exts: ["doc", "docx", "txt", "md", "rtf"] },
    };
    for (const [key, val] of Object.entries(map)) {
        if (val.exts.includes(ext)) return val;
    }
    return { icon: "📄", cls: "", exts: [] };
}

function renderSkeleton(count = 3) {
    filesList.innerHTML = Array.from({ length: count }).map(() => `
        <div class="skeleton-row">
            <div class="skeleton-box skeleton-icon"></div>
            <div class="skeleton-info">
                <div class="skeleton-box skeleton-line"></div>
                <div class="skeleton-box skeleton-line skeleton-line-sm"></div>
            </div>
        </div>
    `).join("");
}

async function loadFiles(showSkeleton = true) {
    if (showSkeleton) renderSkeleton();
    try {
        const data = await api("/list-files");
        allFiles = data.files;
        statCount.textContent = data.count;
        statSize.textContent = formatSize(data.total_size);
        applyFilter();
    } catch (err) {
        filesList.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${escapeHtml(err.message)}</p></div>`;
    }
}

function applyFilter() {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = q
        ? allFiles.filter(f => displayName(f.key).toLowerCase().includes(q))
        : allFiles;
    renderFiles(filtered, q);
}

function renderFiles(files, query = "") {
    if (!files.length) {
        if (query) {
            filesList.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🔍</div>
                    <p>no files match "${escapeHtml(query)}"</p>
                    <p class="hint">try a different search</p>
                </div>
            `;
        } else {
            filesList.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🌌</div>
                    <p>nothing here yet</p>
                    <p class="hint">drop something to get started ✨</p>
                </div>
            `;
        }
        return;
    }

    filesList.innerHTML = files.map((f, i) => {
        const name = displayName(f.key);
        const meta = getFileMeta(name);
        return `
        <div class="file-row" data-key="${escapeHtml(f.key)}" style="animation-delay: ${Math.min(i * 30, 350)}ms">
            <div class="file-icon-wrap ${meta.cls}">${meta.icon}</div>
            <div class="file-info">
                <span class="file-name">${escapeHtml(name)}</span>
                <span class="file-meta">
                    ${formatSize(f.size)}
                    <span class="file-meta-dot"></span>
                    ${new Date(f.last_modified).toLocaleString()}
                </span>
            </div>
            <div class="file-actions">
                <button class="view-btn" title="view" aria-label="view">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                <button class="dl-btn" title="download" aria-label="download">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                </button>
                <button class="del-btn" title="delete" aria-label="delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
        `;
    }).join("");
}

filesList.addEventListener("click", (e) => {
    const row = e.target.closest(".file-row");
    if (!row) return;
    const key = row.dataset.key;

    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.classList.contains("view-btn")) previewFile(key);
    if (btn.classList.contains("dl-btn"))   downloadFile(key);
    if (btn.classList.contains("del-btn"))  deleteFile(key);
});

searchInput.addEventListener("input", () => {
    searchClear.classList.toggle("hidden", !searchInput.value);
    applyFilter();
});

searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.classList.add("hidden");
    applyFilter();
    searchInput.focus();
});

uploadZone.addEventListener("click", (e) => {
    if (e.target.closest("input")) return;
    fileInput.click();
});

uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
    uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("dragover");
    const files = e.dataTransfer.files;
    if (files.length) handleUpload(files[0]);
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) handleUpload(file);
});

fabUpload.addEventListener("click", () => fileInput.click());

async function handleUpload(file) {
    const MAX_SIZE = 4 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast(`file too large (max 4 MB)`, "error");
        return;
    }

    uploadStatus.textContent = `uploading ${file.name}...`;
    uploadProgress.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressPercent.textContent = "0%";

    try {
        const formData = new FormData();
        formData.append("file", file);

        await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API}/upload`);
            xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
            xhr.timeout = 60000;

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = pct + "%";
                    progressPercent.textContent = pct + "%";
                }
            };

            xhr.onload = () => {
                if (xhr.status === 401) {
                    doLogout("Session expired. Login again.");
                    reject(new Error("Unauthorized"));
                    return;
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    let msg = "Upload failed";
                    try {
                        const data = JSON.parse(xhr.responseText);
                        msg = data.detail || msg;
                    } catch (_) {}
                    reject(new Error(msg));
                }
            };

            xhr.onerror = () => reject(new Error("Network error"));
            xhr.ontimeout = () => reject(new Error("Upload timed out"));
            xhr.send(formData);
        });

        uploadStatus.textContent = `✓ uploaded`;
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        showToast(`${file.name} uploaded`, "success");
        fileInput.value = "";
        setTimeout(() => {
            uploadProgress.classList.add("hidden");
            progressBar.style.width = "0%";
            uploadStatus.textContent = "";
        }, 900);
        loadFiles(false);
    } catch (err) {
        uploadStatus.textContent = `✗ ${err.message}`;
        showToast(err.message, "error");
        uploadProgress.classList.add("hidden");
    }
}

async function downloadFile(key) {
    try {
        const res = await fetch(`${API}/download/${encodeURIComponent(key)}`, {
            headers: { "Authorization": `Bearer ${authToken}` },
        });

        if (res.status === 401) {
            doLogout("Session expired. Login again.");
            return;
        }
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || "Download failed");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = displayName(key);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(`${displayName(key)} downloaded`, "success");
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteFile(key) {
    const ok = await showConfirm(
        "delete this file?",
        `"${displayName(key)}" will be permanently removed.`,
        "delete"
    );
    if (!ok) return;

    try {
        await api(`/delete-file?key=${encodeURIComponent(key)}`, { method: "DELETE" });
        showToast(`${displayName(key)} deleted`, "success");
        loadFiles(false);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function previewFile(key) {
    previewTitle.textContent = displayName(key);
    previewBody.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:24px 0;">loading...</p>';
    previewModal.classList.remove("hidden");

    try {
        const data = await api(`/preview?key=${encodeURIComponent(key)}`);

        if (data.type === "text") {
            previewBody.innerHTML = `<pre>${escapeHtml(data.content)}</pre>`;
        } else if (data.type === "too_large") {
            previewBody.innerHTML = `<div class="empty-state"><div class="icon">📦</div><p>file too large to preview</p><p class="hint">download it instead</p></div>`;
        } else if (data.type === "binary") {
            if (data.content_type.startsWith("image/")) {
                previewBody.innerHTML = `<img src="${data.url}" alt="preview">`;
            } else if (data.content_type === "application/pdf") {
                previewBody.innerHTML = `<iframe src="${data.url}"></iframe>`;
            } else {
                previewBody.innerHTML = `<div class="empty-state"><div class="icon">👀</div><p>preview not available</p><p class="hint">download it to view</p></div>`;
            }
        } else {
            previewBody.innerHTML = `<div class="empty-state"><div class="icon">🤔</div><p>preview not available</p></div>`;
        }
    } catch (err) {
        previewBody.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${escapeHtml(err.message)}</p></div>`;
    }
}

function closePreview() {
    previewModal.classList.add("hidden");
    previewBody.innerHTML = "";
}

previewClose.addEventListener("click", closePreview);
previewModal.querySelector("[data-close]").addEventListener("click", closePreview);

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (!previewModal.classList.contains("hidden")) closePreview();
        if (!confirmModal.classList.contains("hidden")) closeConfirm(false);
    }
});