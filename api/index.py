from dotenv import load_dotenv
load_dotenv()

import os
import hmac
import time
import uuid
import base64
import mimetypes
import urllib.request
import requests
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

REQUIRED_ENV = ["APP_USERNAME", "APP_PASSWORD_HASH", "JWT_SECRET", "BLOB_READ_WRITE_TOKEN"]
missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
if missing:
    raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

APP_USERNAME = os.environ["APP_USERNAME"]
APP_PASSWORD_HASH = os.environ["APP_PASSWORD_HASH"]
JWT_SECRET = os.environ["JWT_SECRET"]
BLOB_READ_WRITE_TOKEN = os.environ["BLOB_READ_WRITE_TOKEN"]

BLOB_BASE_URL = "https://blob.vercel-storage.com"
BLOB_API_VERSION = "7"

JWT_ALGORITHM = "HS256"
JWT_EXPIRY_MINUTES = 15
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_PREVIEW_BYTES = 4 * 1024 * 1024
BLOB_TIMEOUT = 15

BLOCKED_EXTENSIONS = {
    "exe", "bat", "cmd", "com", "msi", "dll", "scr", "vbs", "vbe",
    "js", "jse", "wsf", "wsh", "ps1", "psm1", "jar", "app", "deb",
    "rpm", "dmg", "pkg", "sh", "bash", "run", "bin",
}

ph = PasswordHasher()

app = FastAPI(title="GhostVault")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' https: data:; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' https:; "
            "frame-src https: data:;"
        )
        return response


app.add_middleware(SecurityHeadersMiddleware)

rate_limit_store = defaultdict(list)


def rate_limit(bucket: str, client_id: str, max_requests: int, window_seconds: int):
    key = f"{bucket}:{client_id}"
    now = time.time()
    attempts = [t for t in rate_limit_store[key] if now - t < window_seconds]
    rate_limit_store[key] = attempts
    if len(attempts) >= max_requests:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")
    rate_limit_store[key].append(now)


def get_client_id(request: Request, user: str = None) -> str:
    if user:
        return user
    return request.client.host if request.client else "unknown"


class LoginRequest(BaseModel):
    username: str
    password: str


def create_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload["sub"]


def blob_headers():
    return {
        "authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}",
        "x-api-version": BLOB_API_VERSION,
    }


def list_all_blobs():
    try:
        resp = requests.get(
            f"{BLOB_BASE_URL}/",
            headers=blob_headers(),
            timeout=BLOB_TIMEOUT,
        )
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Storage service unreachable")

    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to list files")

    return resp.json().get("blobs", [])


def find_blob(key: str):
    for b in list_all_blobs():
        if b["pathname"] == key:
            return b
    return None


def check_file_extension(filename: str):
    if "." not in filename:
        return
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{ext}' is not allowed for security reasons.",
        )


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "GhostVault"}


@app.post("/api/login")
def login(req: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_limit("login", client_ip, max_requests=5, window_seconds=900)

    if not hmac.compare_digest(req.username, APP_USERNAME):
        try:
            ph.verify(APP_PASSWORD_HASH, "dummy-password-for-timing")
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Invalid credentials")

    try:
        ph.verify(APP_PASSWORD_HASH, req.password)
    except VerifyMismatchError:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"token": create_token(req.username), "expires_in": JWT_EXPIRY_MINUTES * 60}


@app.get("/api/list-files")
def list_files(request: Request, user: str = Depends(verify_token)):
    rate_limit("list", user, max_requests=120, window_seconds=3600)

    files = []
    total_size = 0
    for b in list_all_blobs():
        size = b.get("size", 0)
        total_size += size
        files.append({
            "key": b["pathname"],
            "size": size,
            "last_modified": b.get("uploadedAt", ""),
        })

    files.sort(key=lambda x: x["last_modified"], reverse=True)
    return {"files": files, "total_size": total_size, "count": len(files)}


@app.post("/api/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user: str = Depends(verify_token)):
    rate_limit("upload", user, max_requests=30, window_seconds=3600)

    raw_name = file.filename or "unnamed"
    check_file_extension(raw_name)

    data = await file.read()

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum {MAX_UPLOAD_BYTES // (1024 * 1024)} MB allowed.",
        )

    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file not allowed.")

    safe_name = os.path.basename(raw_name).replace("/", "_").replace("\\", "_")
    key = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    content_type = file.content_type or "application/octet-stream"

    try:
        resp = requests.put(
            f"{BLOB_BASE_URL}/{key}",
            data=data,
            headers={
                "authorization": f"Bearer {BLOB_READ_WRITE_TOKEN}",
                "x-api-version": BLOB_API_VERSION,
                "x-content-type": content_type,
                "x-access": "public",
                "x-add-random-suffix": "0",
            },
            timeout=BLOB_TIMEOUT,
        )
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Storage service unreachable")

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail="Upload failed")

    return {"status": "uploaded", "key": key}


@app.get("/api/download/{key:path}")
def download_file(key: str, request: Request, user: str = Depends(verify_token)):
    rate_limit("download", user, max_requests=200, window_seconds=3600)

    target = find_blob(key)
    if not target:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with urllib.request.urlopen(target["url"], timeout=BLOB_TIMEOUT) as resp:
            content = resp.read()
    except Exception:
        raise HTTPException(status_code=503, detail="Failed to fetch file")

    safe_filename = key.replace('"', "")
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@app.get("/api/preview")
def preview_file(key: str, request: Request, user: str = Depends(verify_token)):
    rate_limit("preview", user, max_requests=200, window_seconds=3600)

    target = find_blob(key)
    if not target:
        raise HTTPException(status_code=404, detail="File not found")

    content_type = target.get("contentType", "application/octet-stream")
    size = target.get("size", 0)

    if size > MAX_PREVIEW_BYTES:
        return {"type": "too_large", "content_type": content_type}

    try:
        with urllib.request.urlopen(target["url"], timeout=BLOB_TIMEOUT) as resp:
            content = resp.read()
    except Exception:
        raise HTTPException(status_code=503, detail="Failed to fetch file")

    text_extensions = {
        "txt", "md", "py", "js", "ts", "jsx", "tsx", "html", "css", "scss",
        "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "env",
        "csv", "log", "sh", "bash", "zsh", "sql", "go", "rs", "java", "c",
        "cpp", "h", "hpp", "cs", "rb", "php", "swift", "kt", "dart", "r",
        "lua", "pl", "vim", "dockerfile", "makefile", "gitignore",
    }

    ext = ""
    if "." in key:
        ext = key.rsplit(".", 1)[-1].lower()

    text_mimes = ("text/", "application/json", "application/xml", "application/javascript")
    is_text_mime = any(content_type.startswith(t) for t in text_mimes)
    is_text_ext = ext in text_extensions

    if is_text_mime or is_text_ext:
        try:
            text = content.decode("utf-8", errors="replace")
        except Exception:
            text = ""
        return {"type": "text", "content": text, "content_type": content_type or "text/plain"}

    b64 = base64.b64encode(content).decode("ascii")
    data_url = f"data:{content_type};base64,{b64}"
    return {"type": "binary", "url": data_url, "content_type": content_type}


@app.delete("/api/delete-file")
def delete_file(key: str, request: Request, user: str = Depends(verify_token)):
    rate_limit("delete", user, max_requests=60, window_seconds=3600)

    target = find_blob(key)
    if not target:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        resp = requests.post(
            f"{BLOB_BASE_URL}/delete",
            json={"urls": [target["url"]]},
            headers=blob_headers(),
            timeout=BLOB_TIMEOUT,
        )
    except requests.RequestException:
        raise HTTPException(status_code=503, detail="Storage service unreachable")

    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=500, detail="Delete failed")

    return {"status": "deleted"}


app.mount("/", StaticFiles(directory="public", html=True), name="public")