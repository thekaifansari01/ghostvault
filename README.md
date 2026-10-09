# 👻 GhostVault

> Your files. Your rules. Zero traces.

A minimal, single-user, stateless file vault built with FastAPI + Vercel Blob.  
Login required to access files — but no sessions, no cookies, no traces.  
Restart the browser, and you're logged out. Restart the server, and everything resets except your files.

---

## ✨ Features

- 🔐 **Single-user auth** — one username, one password, configured via env vars
- 🚫 **No sessions** — auth token lives only in browser memory, gone on refresh
- ☁️ **Cloud storage** — files persist on Vercel Blob, accessible from anywhere
- 📤 **Upload, view, download, delete** — full file management
- 🔍 **Real-time search** — filter files by name
- 📊 **Storage stats** — total files + total size used
- 🎨 **Modern dark UI** — clean, fast, and lightweight
- 🛡️ **Security-first** — rate limiting, blocked extensions, size limits, security headers
- 📱 **Responsive** — works on mobile and desktop

---

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python 3.11+) |
| Frontend | Vanilla HTML/CSS/JS |
| Storage | Vercel Blob (public store) |
| Auth | JWT (HS256) + Argon2id password hashing |
| Hosting | Vercel |

---

## 📁 Project Structure

```
ghostvault/
├── api/
│   └── index.py           # FastAPI backend
├── public/
│   ├── index.html         # Frontend markup
│   ├── style.css          # Styles
│   └── app.js             # Frontend logic
├── requirements.txt
├── vercel.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 🚀 Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/thekaifansari01/ghostvault.git
cd ghostvault
```

### 2. Create a virtual environment

```bash
python -m venv .venv
```

**Windows:**
```bash
.venv\Scripts\activate
```

**Mac/Linux:**
```bash
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Create a Vercel Blob store

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Create a new project (or open an existing one)
3. Go to **Storage** → **Create Store** → **Blob**
4. Choose **Public** access
5. Connect it to your project
6. Copy the `BLOB_READ_WRITE_TOKEN` from the `.env.local` tab

### 5. Generate password hash + JWT secret

Create a temporary file `make_secrets.py`:

```python
import secrets
from argon2 import PasswordHasher

ph = PasswordHasher()
password = "YourStrongPasswordHere"

print("APP_PASSWORD_HASH=" + ph.hash(password))
print("JWT_SECRET=" + secrets.token_urlsafe(64))
```

Run it:

```bash
python make_secrets.py
```

Delete the file after copying the values.

### 6. Create `.env` file

```env
APP_USERNAME=admin
APP_PASSWORD_HASH=$argon2id$v=19$m=65536,t=3,p=4$...
JWT_SECRET=your_generated_jwt_secret
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxxxxx
```

### 7. Run the server

```bash
uvicorn api.index:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000) and log in.

---

## ☁️ Deploy on Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/ghostvault.git
git push -u origin main
```

### 2. Import project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Framework Preset: **Other**
4. Deploy

### 3. Add environment variables

Go to **Project Settings → Environment Variables** and add:

| Key | Value |
|---|---|
| `APP_USERNAME` | your username |
| `APP_PASSWORD_HASH` | Argon2 hash from step 5 |
| `JWT_SECRET` | 64-char random string |

`BLOB_READ_WRITE_TOKEN` is added automatically when you connect the Blob store.

Apply to: **Production, Preview, Development**

### 4. Redeploy

Go to **Deployments** → **Redeploy** to pick up the new env vars.

### 5. Access your vault

Your app is live at:

```
https://your-project.vercel.app
```

---

## 🔒 Security

| Layer | Implementation |
|---|---|
| Password storage | Argon2id hash (never plaintext) |
| Password comparison | Constant-time (`hmac.compare_digest`) |
| Auth token | JWT (HS256), 15-minute expiry |
| Token storage | Browser memory only (no cookie, no localStorage) |
| Rate limiting | Login 5/15min, upload 30/hr, download 200/hr, delete 60/hr |
| File size limit | 4 MB per file (Vercel function limit) |
| Blocked extensions | `.exe`, `.sh`, `.bat`, `.js`, `.vbs`, `.ps1`, and more |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Upload path safety | Basename + sanitized; UUID prefix on every key |
| Env validation | App fails to start if any required env var is missing |

---

## ⚠️ Limitations

- **4 MB upload limit** — imposed by Vercel Functions request body limit
- **Single user** — designed for one person; no multi-user support
- **No persistence for tokens** — page refresh logs you out (by design)
- **No file versioning** — overwriting is not supported; delete + re-upload

---

## 🗺️ Roadmap

- [ ] Multi-file upload
- [ ] File rename
- [ ] Folder support
- [ ] File sharing with expiry
- [ ] Trash / recycle bin
- [ ] Signed download URLs

---

## 🤝 Contributing

This is a personal project, but suggestions and issues are welcome.  
Open an issue or PR on GitHub.

---

## 📜 License

MIT License — do whatever you want with it.

---

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/)
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
- [Argon2](https://github.com/hynek/argon2-cffi)
- [PyJWT](https://pyjwt.readthedocs.io/)

---

Made with 👻 by Kaif Ansari