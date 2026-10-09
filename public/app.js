let authToken = null;
let tokenExpiryTimer = null;
let allFiles = [];

const API = "/api";

const loginView    = document.getElementById("login-view");
const appView      = document.getElementById("app-view");
const loginForm    = document.getElementById("login-form");
const loginError   = document.getElementById("login-error");
const logoutBtn    = document.getElementById("logout-btn");
const uploadZone   = document.getElementById("upload-zone");
const fileInput    = document.getElementById("file-input");
const uploadStatus = document.getElementById("upload-status");
const uploadProgress = document.getElementById("upload-progress");
const progressBar  = document.getElementById("progress-bar");
const filesList    = document.getElementById("files-list");
const searchInput  = document.getElementById("search-input");
const statCount    = document.getElementById("stat-count");
const statSize     = document.getElementById("stat-size");
const previewModal = document.getElementById("preview-modal");
const previewBody  = document.getElementById("preview-body");
const previewTitle = document.getElementById("preview-title");
const previewClose = document.getElementById("preview-close");
const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("out");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

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

function getFileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
    if (["mp4", "webm", "mov", "avi"].includes(ext)) return "🎬";
    if (["mp3", "wav", "ogg", "flac"].includes(ext)) return "🎵";
    if (["pdf"].includes(ext)) return "📕";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "📦";
    if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) return "📝";
    if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
    if (["ppt", "pptx"].includes(ext)) return "📽️";
    if (["js", "py", "html", "css", "json", "xml", "ts"].includes(ext)) return "💻";
    return "📄";
}

async function loadFiles() {
    filesList.innerHTML = '<p class="status">loading...</p>';
    try {
        const data = await api("/list-files");
        allFiles = data.files;
        statCount.textContent = data.count;
        statSize.textContent = formatSize(data.total_size);
        renderFiles(allFiles);
    } catch (err) {
        filesList.innerHTML = `<p class="status error">${escapeHtml(err.message)}</p>`;
    }
}

function renderFiles(files) {
    if (!files.length) {
        filesList.innerHTML = `
            <div class="empty-state">
                <div class="icon">🌌</div>
                <p>nothing here yet. drop something ✨</p>
            </div>
        `;
        return;
    }

    filesList.innerHTML = files.map((f, i) => {
        const name = displayName(f.key);
        return `
        <div class="file-row" data-key="${escapeHtml(f.key)}" style="animation-delay: ${Math.min(i * 40, 400)}ms">
            <div class="file-info">
                <span class="file-name">${getFileIcon(name)} ${escapeHtml(name)}</span>
                <span class="file-meta">${formatSize(f.size)} · ${new Date(f.last_modified).toLocaleString()}</span>
            </div>
            <div class="file-actions">
                <button class="view-btn">view</button>
                <button class="dl-btn">download</button>
                <button class="del-btn">delete</button>
            </div>
        </div>
        `;
    }).join("");
}

filesList.addEventListener("click", (e) => {
    const row = e.target.closest(".file-row");
    if (!row) return;
    const key = row.dataset.key;

    if (e.target.classList.contains("view-btn")) previewFile(key);
    if (e.target.classList.contains("dl-btn"))   downloadFile(key);
    if (e.target.classList.contains("del-btn"))  deleteFile(key);
});

searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
        renderFiles(allFiles);
        return;
    }
    const filtered = allFiles.filter(f => displayName(f.key).toLowerCase().includes(q));
    renderFiles(filtered);
});

uploadZone.addEventListener("click", () => fileInput.click());

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
    if (files.length) {
        handleUpload(files[0]);
    }
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (file) handleUpload(file);
});

async function handleUpload(file) {
    uploadStatus.textContent = `uploading ${file.name}...`;
    uploadProgress.classList.remove("hidden");
    progressBar.style.width = "0%";

    try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API}/upload`);
            xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = (e.loaded / e.total) * 100;
                    progressBar.style.width = pct + "%";
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
            xhr.send(formData);
        });

        uploadStatus.textContent = `✓ ${file.name} uploaded`;
        showToast(`${file.name} uploaded ✨`, "success");
        fileInput.value = "";
        setTimeout(() => {
            uploadProgress.classList.add("hidden");
            progressBar.style.width = "0%";
            uploadStatus.textContent = "";
        }, 1200);
        loadFiles();
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
        showToast(`${displayName(key)} downloaded ⬇️`, "success");
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function deleteFile(key) {
    if (!confirm(`delete "${displayName(key)}"?`)) return;
    try {
        await api(`/delete-file?key=${encodeURIComponent(key)}`, { method: "DELETE" });
        showToast(`${displayName(key)} deleted 🗑️`, "success");
        loadFiles();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function previewFile(key) {
    previewTitle.textContent = displayName(key);
    previewBody.innerHTML = '<p class="status">loading...</p>';
    previewModal.classList.remove("hidden");

    try {
        const data = await api(`/preview?key=${encodeURIComponent(key)}`);

        if (data.type === "text") {
            previewBody.innerHTML = `<pre>${escapeHtml(data.content)}</pre>`;
        } else if (data.type === "too_large") {
            previewBody.innerHTML = `<p class="status">file too large to preview. download it instead.</p>`;
        } else if (data.type === "binary") {
            if (data.content_type.startsWith("image/")) {
                previewBody.innerHTML = `<img src="${data.url}" alt="preview">`;
            } else if (data.content_type === "application/pdf") {
                previewBody.innerHTML = `<iframe src="${data.url}"></iframe>`;
            } else {
                previewBody.innerHTML = `<p class="status">preview not available for this file type.</p>`;
            }
        } else {
            previewBody.innerHTML = `<p class="status">preview not available.</p>`;
        }
    } catch (err) {
        previewBody.innerHTML = `<p class="status error">${escapeHtml(err.message)}</p>`;
    }
}

function closePreview() {
    previewModal.classList.add("hidden");
    previewBody.innerHTML = "";
}

previewClose.addEventListener("click", closePreview);
previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) closePreview();
});