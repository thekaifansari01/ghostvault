let authToken = null;
let tokenExpiryTimer = null;
let allFiles = [];
let confirmResolve = null;
let renameResolve = null;
let currentPreviewText = null;

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
const previewCopy  = document.getElementById("preview-copy");
const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOk    = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");
const renameModal  = document.getElementById("rename-modal");
const renameInput  = document.getElementById("rename-input");
const renameSubtitle = document.getElementById("rename-subtitle");
const renameOk     = document.getElementById("rename-ok");
const renameCancel = document.getElementById("rename-cancel");
const toastContainer = document.getElementById("toast-container");
const pwToggle     = document.getElementById("pw-toggle");
const fabUpload    = document.getElementById("fab-upload");

const COPY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M20 6 9 17l-5-5"/></svg>';

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

function showRename(currentName) {
    return new Promise((resolve) => {
        renameSubtitle.textContent = `currently: ${currentName}`;
        renameInput.value = currentName;
        renameModal.classList.remove("hidden");
        renameResolve = resolve;
        setTimeout(() => {
            renameInput.focus();
            const dotIdx = currentName.lastIndexOf(".");
            if (dotIdx > 0) {
                renameInput.setSelectionRange(0, dotIdx);
            } else {
                renameInput.select();
            }
        }, 60);
    });
}

function closeRename(result) {
    renameModal.classList.add("hidden");
    if (renameResolve) {
        renameResolve(result);
        renameResolve = null;
    }
}

confirmOk.addEventListener("click", () => closeConfirm(true));
confirmCancel.addEventListener("click", () => closeConfirm(false));
confirmModal.querySelector("[data-close-confirm]").addEventListener("click", () => closeConfirm(false));

renameOk.addEventListener("click", () => {
    const val = renameInput.value.trim();
    if (!val) return;
    closeRename(val);
});

renameCancel.addEventListener("click", () => closeRename(null));
renameModal.querySelector("[data-close-rename]").addEventListener("click", () => closeRename(null));

renameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        const val = renameInput.value.trim();
        if (val) closeRename(val);
    }
});

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

function getFileExtension(key) {
    const name = displayName(key);
    const idx = name.lastIndexOf(".");
    return idx > 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function extToPrismLang(ext) {
    const map = {
        html: "markup", htm: "markup", xml: "markup", svg: "markup",
        css: "css", scss: "scss", sass: "sass", less: "less",
        js: "javascript", mjs: "javascript", cjs: "javascript",
        jsx: "jsx", ts: "typescript", tsx: "tsx",
        py: "python", rb: "ruby", php: "php", go: "go", rs: "rust",
        java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
        cs: "csharp", swift: "swift", kt: "kotlin", dart: "dart",
        json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
        md: "markdown", markdown: "markdown",
        sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
        sql: "sql", lua: "lua", r: "r", pl: "perl",
        ini: "ini", cfg: "ini", conf: "ini", env: "bash",
        dockerfile: "docker", makefile: "makefile",
    };
    return map[ext] || null;
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
    for (const [, val] of Object.entries(map)) {
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
                <button class="rename-btn" title="rename" aria-label="rename">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
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
    if (btn.classList.contains("rename-btn")) renameFile(key);
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

async function renameFile(key) {
    const currentName = displayName(key);
    const newName = await showRename(currentName);
    if (!newName || newName === currentName) return;

    try {
        const res = await api("/rename", {
            method: "POST",
            body: JSON.stringify({ key, new_name: newName }),
        });
        if (res.status === "unchanged") return;
        showToast(`renamed to ${newName}`, "success");
        loadFiles(false);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
    } finally {
        ta.remove();
    }
}

previewCopy.addEventListener("click", async () => {
    if (currentPreviewText === null) return;
    try {
        await copyTextToClipboard(currentPreviewText);
        previewCopy.innerHTML = CHECK_ICON;
        previewCopy.classList.add("copied");
        setTimeout(() => {
            previewCopy.innerHTML = COPY_ICON;
            previewCopy.classList.remove("copied");
        }, 1400);
    } catch (err) {
        showToast("copy failed", "error");
    }
});

async function previewFile(key) {
    previewTitle.textContent = displayName(key);
    previewBody.innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:24px 0;">loading...</p>';
    previewCopy.classList.add("hidden");
    previewCopy.innerHTML = COPY_ICON;
    previewCopy.classList.remove("copied");
    currentPreviewText = null;
    previewModal.classList.remove("hidden");

    try {
        const data = await api(`/preview?key=${encodeURIComponent(key)}`);

        if (data.type === "text") {
            const ext = data.extension || getFileExtension(key);
            const lang = extToPrismLang(ext);
            const escaped = escapeHtml(data.content);
            const preClass = lang ? ` class="language-${lang}"` : "";
            previewBody.innerHTML = `<pre${preClass}><code${preClass}>${escaped}</code></pre>`;
            if (lang && window.Prism && Prism.highlightElement) {
                const codeEl = previewBody.querySelector("code");
                if (codeEl) Prism.highlightElement(codeEl);
            }
            currentPreviewText = data.content;
            previewCopy.classList.remove("hidden");
        } else if (data.type === "too_large") {
            previewBody.innerHTML = `<div class="empty-state"><div class="icon">📦</div><p>file too large to preview</p><p class="hint">download it instead</p></div>`;
        } else if (data.type === "binary") {
            const ct = data.content_type || "";
            if (ct.startsWith("image/")) {
                previewBody.innerHTML = `<img src="${data.url}" alt="preview">`;
            } else if (ct === "application/pdf") {
                previewBody.innerHTML = `<iframe src="${data.url}"></iframe>`;
            } else if (ct.startsWith("video/")) {
                previewBody.innerHTML = `<video src="${data.url}" controls playsinline></video>`;
            } else if (ct.startsWith("audio/")) {
                previewBody.innerHTML = `<audio src="${data.url}" controls></audio>`;
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
    currentPreviewText = null;
    previewCopy.classList.add("hidden");
}

previewClose.addEventListener("click", closePreview);
previewModal.querySelector("[data-close]").addEventListener("click", closePreview);

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (!previewModal.classList.contains("hidden")) closePreview();
        if (!confirmModal.classList.contains("hidden")) closeConfirm(false);
        if (!renameModal.classList.contains("hidden")) closeRename(null);
    }
});