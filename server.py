#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import minipg as psycopg   # our built-in PostgreSQL connector (standard library only, nothing to install)
from minipg import dict_row

ROOT = Path(__file__).resolve().parent
SQL_FILE = ROOT / "database" / "dotacs.sql"

# the only files the browser may download
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/recognizer.js": ("recognizer.js", "text/javascript; charset=utf-8"),
    "/api.js": ("api.js", "text/javascript; charset=utf-8"),
    "/gestures.json": ("gestures.json", "application/json; charset=utf-8"),
}

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$")
CATEGORIES = ("letters", "words", "all")
SESSION_SECONDS = 7 * 24 * 3600
MAX_FAILS = 5
BLOCK_SECONDS = 15 * 60
MAX_BODY = 64 * 1024


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
def load_database_url() -> str | None:
    """DATABASE_URL from the environment, or from the .env file next to this script."""
    url = os.environ.get("DATABASE_URL")
    env = ROOT / ".env"
    if not url and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
    return url or None


DATABASE_URL = load_database_url()


def connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
def hash_password(password: str, iterations: int = 240_000) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(test, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


DUMMY_HASH = hash_password(secrets.token_hex(8))  # checked for unknown usernames, so both cases take as long


# ---------------------------------------------------------------------------
# Sign-in sessions and wrong-password blocking (kept in memory)
# ---------------------------------------------------------------------------
sessions: dict[str, tuple[int, float]] = {}    # random token -> (User_ID, expiry time)
failures: dict[tuple[str, str], list[float]] = {}  # (username, ip) -> times of wrong passwords
lock = threading.Lock()


def new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with lock:
        sessions[token] = (user_id, time.time() + SESSION_SECONDS)
    return token


def session_user_id(token: str | None) -> int | None:
    with lock:
        entry = sessions.get(token or "")
        if entry and entry[1] > time.time():
            return entry[0]
        sessions.pop(token or "", None)
    return None


def end_sessions_of(user_id: int) -> None:
    with lock:
        for token in [t for t, (uid, _) in sessions.items() if uid == user_id]:
            del sessions[token]


def is_blocked(username: str, ip: str) -> bool:
    now = time.time()
    with lock:
        recent = [t for t in failures.get((username, ip), []) if now - t < BLOCK_SECONDS]
        failures[(username, ip)] = recent
        return len(recent) >= MAX_FAILS


def record_failure(username: str, ip: str) -> None:
    with lock:
        failures.setdefault((username, ip), []).append(time.time())


# ---------------------------------------------------------------------------
# Input checks
# ---------------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def text_field(body: dict, key: str, low: int, high: int, label: str) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not low <= len(value.strip()) <= high:
        raise ApiError(400, f"{label} must be {low} to {high} characters")
    return value.strip()


def number_field(body: dict, key: str, low: int, high: int) -> int:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ApiError(400, f"{key} must be a whole number from {low} to {high}")
    return value


def user_json(row) -> dict:
    return {"id": row["user_id"], "username": row["username"], "email": row["email"], "role": row["role"]}


# ---------------------------------------------------------------------------
# API endpoints. Each gets the database connection and the signed-in user (or None).
# ---------------------------------------------------------------------------
ROUTES = {}


def route(method: str, path: str, signed_in: bool = False, admin: bool = False):
    def add(fn):
        ROUTES[(method, path)] = (fn, signed_in, admin)
        return fn
    return add


@route("GET", "/api/health")
def health(req, db, user, body, query):
    return {"ok": True, "app": "dotacs", "database": "postgresql", "user": user_json(user) if user else None}


@route("POST", "/api/register")
def register(req, db, user, body, query):
    username = text_field(body, "username", 3, 20, "Username").lower()
    if not USERNAME_RE.match(username):
        raise ApiError(400, "Username can only use letters, numbers and _")
    email = text_field(body, "email", 6, 254, "Email").lower()
    if not EMAIL_RE.match(email):
        raise ApiError(400, "That email address does not look right")
    password = body.get("password")
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise ApiError(400, "Password must be 8 to 128 characters")
    try:
        row = db.execute(
            "INSERT INTO Users (Username, Email, PasswordHash) VALUES (%s, %s, %s) RETURNING *",
            (username, email, hash_password(password)),
        ).fetchone()
        db.commit()
    except psycopg.errors.UniqueViolation:
        db.rollback()
        raise ApiError(409, "That username or email is already used")
    req.set_cookie(new_session(row["user_id"]))
    return {"user": user_json(row)}, 201


@route("POST", "/api/login")
def login(req, db, user, body, query):
    username = str(body.get("username") or "").strip().lower()[:40]
    password = str(body.get("password") or "")[:128]
    ip = req.client_address[0]
    if is_blocked(username, ip):
        raise ApiError(429, "Too many wrong passwords. Wait 15 minutes and try again.")
    row = db.execute("SELECT * FROM Users WHERE Username = %s", (username,)).fetchone()
    if not check_password(password, row["passwordhash"] if row else DUMMY_HASH) or not row:
        record_failure(username, ip)
        raise ApiError(401, "Wrong username or password")  # same message whether or not the user exists
    req.set_cookie(new_session(row["user_id"]))
    return {"user": user_json(row)}


@route("POST", "/api/logout")
def logout(req, db, user, body, query):
    with lock:
        sessions.pop(req.token or "", None)
    req.set_cookie("", clear=True)
    return {"ok": True}


@route("DELETE", "/api/me", signed_in=True)
def delete_account(req, db, user, body, query):
    if not check_password(str(body.get("password") or "")[:128], user["passwordhash"]):
        raise ApiError(403, "Wrong password")
    if user["role"] == "admin":
        raise ApiError(400, "The admin account cannot be deleted here")
    db.execute("DELETE FROM Users WHERE User_ID = %s", (user["user_id"],))  # ON DELETE CASCADE removes their rows too
    db.commit()
    end_sessions_of(user["user_id"])
    req.set_cookie("", clear=True)
    return {"ok": True}


@route("GET", "/api/sentences", signed_in=True)
def list_sentences(req, db, user, body, query):
    rows = db.execute(
        "SELECT SentenceText, CreatedAt FROM Sentences WHERE User_ID = %s ORDER BY CreatedAt DESC LIMIT 60",
        (user["user_id"],),
    ).fetchall()
    return {"sentences": [{"text": r["sentencetext"], "at": r["createdat"].isoformat()} for r in rows]}


@route("POST", "/api/sentences", signed_in=True)
def add_sentence(req, db, user, body, query):
    text = text_field(body, "text", 1, 500, "Sentence")
    db.execute("INSERT INTO Sentences (User_ID, SentenceText) VALUES (%s, %s)", (user["user_id"], text))
    db.commit()
    return {"ok": True}, 201


@route("DELETE", "/api/sentences", signed_in=True)
def clear_sentences(req, db, user, body, query):
    count = db.execute("DELETE FROM Sentences WHERE User_ID = %s", (user["user_id"],)).rowcount
    db.commit()
    return {"deleted": count}


@route("POST", "/api/scores", signed_in=True)
def add_score(req, db, user, body, query):
    category = body.get("category")
    if category not in CATEGORIES:
        raise ApiError(400, "category must be letters, words or all")
    points = number_field(body, "points", 0, 100000)
    solved = number_field(body, "solved", 0, 1000)
    db.execute(
        "INSERT INTO Scores (User_ID, Category, Points, SignsSolved) VALUES (%s, %s, %s, %s)",
        (user["user_id"], category, points, solved),
    )
    db.commit()
    rank = db.execute(
        """SELECT COUNT(*) + 1 AS rank FROM
             (SELECT User_ID, MAX(Points) AS best FROM Scores WHERE Category = %s GROUP BY User_ID) AS b
           WHERE best > (SELECT MAX(Points) FROM Scores WHERE Category = %s AND User_ID = %s)""",
        (category, category, user["user_id"]),
    ).fetchone()["rank"]
    return {"rank": rank}, 201


@route("GET", "/api/leaderboard")
def leaderboard(req, db, user, body, query):
    category = query.get("category", ["letters"])[0]
    if category not in CATEGORIES:
        raise ApiError(400, "category must be letters, words or all")
    rows = db.execute(
        """SELECT Users.User_ID, Users.Username, MAX(Scores.Points) AS best, COUNT(*) AS rounds
           FROM Users JOIN Scores ON Users.User_ID = Scores.User_ID
           WHERE Scores.Category = %s
           GROUP BY Users.User_ID, Users.Username
           ORDER BY best DESC
           LIMIT 10""",
        (category,),
    ).fetchall()
    return {"leaders": [
        {"rank": i + 1, "name": r["username"], "best": r["best"], "rounds": r["rounds"],
         "me": bool(user and r["user_id"] == user["user_id"])}
        for i, r in enumerate(rows)
    ]}


@route("GET", "/api/stats", signed_in=True)
def stats(req, db, user, body, query):
    row = db.execute(
        """SELECT (SELECT COUNT(*) FROM Sentences WHERE User_ID = %s) AS sentences,
                  (SELECT COUNT(*) FROM Scores WHERE User_ID = %s) AS rounds,
                  (SELECT COALESCE(MAX(Points), 0) FROM Scores WHERE User_ID = %s) AS best""",
        (user["user_id"],) * 3,
    ).fetchone()
    best = db.execute(
        "SELECT Category, MAX(Points) AS best FROM Scores WHERE User_ID = %s GROUP BY Category", (user["user_id"],)
    ).fetchall()
    return {"sentences": row["sentences"], "rounds": row["rounds"], "best": row["best"],
            "bestByCategory": {r["category"]: r["best"] for r in best}}


@route("GET", "/api/admin/overview", signed_in=True, admin=True)
def admin_overview(req, db, user, body, query):
    counts = db.execute(
        """SELECT (SELECT COUNT(*) FROM Users) AS users, (SELECT COUNT(*) FROM Sentences) AS sentences,
                  (SELECT COUNT(*) FROM Scores) AS scores, version() AS version"""
    ).fetchone()
    return {"tables": {"Users": counts["users"], "Sentences": counts["sentences"], "Scores": counts["scores"]},
            "version": counts["version"].split(" on ")[0], "demoAllowed": req.is_local}


@route("POST", "/api/admin/injection-demo", signed_in=True, admin=True)
def injection_demo(req, db, user, body, query):
    """The report's example, run for real: the same lookup written unsafely and safely.
    Runs on a temporary copy of Users (no password hashes in it), inside a READ ONLY
    transaction that is always rolled back, so an attack typed here cannot change anything."""
    if not req.is_local:
        raise ApiError(403, "The demo only runs on the computer the server runs on")
    typed = body.get("username")
    if not isinstance(typed, str) or len(typed) > 120:
        raise ApiError(400, "username must be text of at most 120 characters")
    db.execute("CREATE TEMP TABLE Users AS SELECT User_ID, Username, Role FROM public.Users")  # hides the real table
    db.commit()
    total = db.execute("SELECT COUNT(*) AS n FROM Users").fetchone()["n"]
    db.commit()

    def run(sql, params=None):
        db.execute("SET TRANSACTION READ ONLY")
        db.execute("SET LOCAL statement_timeout = '2s'")
        try:
            rows = db.execute(sql, params).fetchall()
            return [[str(v) for v in r.values()] for r in rows], None
        except psycopg.Error as e:
            return [], str(e).splitlines()[0]
        finally:
            db.rollback()

    # UNSAFE: the typed text is glued into the SQL, so a quote in it changes the query itself
    unsafe_sql = "SELECT * FROM Users WHERE Username = '" + typed + "'"
    unsafe_rows, unsafe_error = run(unsafe_sql)
    # SAFE: the SQL is fixed; the typed text is sent separately and is only ever a value
    safe_sql = "SELECT * FROM Users WHERE Username = %s"
    safe_rows, _ = run(safe_sql, (typed,))
    return {"columns": ["user_id", "username", "role"], "total": total,
            "unsafe": {"sql": unsafe_sql, "rows": unsafe_rows, "error": unsafe_error},
            "safe": {"sql": safe_sql.replace("%s", "?"), "param": typed, "rows": safe_rows}}


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "dotacs"
    sys_version = ""

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.address_string(), fmt % args))

    @property
    def is_local(self) -> bool:
        return self.client_address[0] in ("127.0.0.1", "::1")

    def set_cookie(self, token: str, clear: bool = False) -> None:
        age = 0 if clear else SESSION_SECONDS
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        self.cookies.append(f"dotacs_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{secure}")

    def send(self, status: int, data: bytes, ctype: str, head_only: bool = False) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        for c in self.cookies:
            self.send_header("Set-Cookie", c)
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def send_json(self, status: int, obj) -> None:
        self.send(status, json.dumps(obj).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        self.handle_request("GET")

    def do_HEAD(self):
        self.handle_request("HEAD")

    def do_POST(self):
        self.handle_request("POST")

    def do_DELETE(self):
        self.handle_request("DELETE")

    def handle_request(self, method: str) -> None:
        self.cookies = []
        url = urlparse(self.path)
        if not url.path.startswith("/api/"):
            entry = STATIC_FILES.get(url.path)
            if method not in ("GET", "HEAD") or not entry:
                self.send(404, b"Not found", "text/plain; charset=utf-8", method == "HEAD")
                return
            self.send(200, (ROOT / entry[0]).read_bytes(), entry[1], method == "HEAD")
            return

        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie") or "")
        except Exception:
            pass
        self.token = cookie["dotacs_session"].value if "dotacs_session" in cookie else None

        entry = ROUTES.get((method, url.path))
        if not entry:
            self.send_json(404, {"error": "Not found"})
            return
        fn, need_user, need_admin = entry
        if not DATABASE_URL:
            self.send_json(503, {"error": "The database is not set up (see README.md)"})
            return
        try:
            body = {}
            if method != "GET":
                # requests that change data must come from our own page, as JSON
                if self.headers.get("X-Dotacs") != "1":
                    raise ApiError(403, "Missing X-Dotacs header")
                origin = self.headers.get("Origin")
                if origin and urlparse(origin).netloc != self.headers.get("Host"):
                    raise ApiError(403, "Cross-site request blocked")
                length = int(self.headers.get("Content-Length") or 0)
                if length > MAX_BODY:
                    raise ApiError(413, "Request is too large")
                if length:
                    if not (self.headers.get("Content-Type") or "").startswith("application/json"):
                        raise ApiError(415, "Send JSON")
                    try:
                        body = json.loads(self.rfile.read(length))
                    except ValueError:
                        raise ApiError(400, "Request body must be JSON")
                    if not isinstance(body, dict):
                        raise ApiError(400, "Request body must be a JSON object")
            with connect() as db:
                uid = session_user_id(self.token)
                user = db.execute("SELECT * FROM Users WHERE User_ID = %s", (uid,)).fetchone() if uid else None
                if need_user and not user:
                    raise ApiError(401, "Please sign in")
                if need_admin and user["role"] != "admin":
                    raise ApiError(403, "Admins only")
                result = fn(self, db, user, body, parse_qs(url.query))
            status = 200
            if isinstance(result, tuple):
                result, status = result
            self.send_json(status, result)
        except ApiError as e:
            self.send_json(e.status, {"error": e.message})
        except Exception as e:  # details go to the console only, never to the browser
            print("Server error:", type(e).__name__, e, file=sys.stderr)
            self.send_json(500, {"error": "Something went wrong on the server"})


# ---------------------------------------------------------------------------
# First run: create the tables and an admin account
# ---------------------------------------------------------------------------
def setup_database(reset_admin: bool = False) -> None:
    with connect() as db:
        exists = db.execute("SELECT to_regclass('public.users') IS NOT NULL AS ok").fetchone()["ok"]
        if not exists:
            db.execute(SQL_FILE.read_text(encoding="utf-8"))
            print("Created the tables and sample data from database/dotacs.sql")
            print("(sample accounts such as demo, maria, alex use the password 'signdemo2026')")
        admin = db.execute("SELECT User_ID FROM Users WHERE Role = 'admin' LIMIT 1").fetchone()
        password = secrets.token_urlsafe(9)
        if not admin:
            db.execute(
                "INSERT INTO Users (Username, Email, PasswordHash, Role) VALUES ('admin', 'admin@dotacs.local', %s, 'admin')",
                (hash_password(password),),
            )
        elif reset_admin:
            db.execute("UPDATE Users SET PasswordHash = %s WHERE User_ID = %s", (hash_password(password), admin["user_id"]))
        if not admin or reset_admin:
            print("")
            print("  Admin account:  username admin   password " + password)
            print("  Write it down; it is shown only once. New one: python server.py --reset-admin")
            print("")


def main() -> None:
    parser = argparse.ArgumentParser(description="dotacs server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reset-admin", action="store_true", help="print a new admin password and stop")
    args = parser.parse_args()

    if not DATABASE_URL:
        print("No DATABASE_URL found. Put it in a .env file (see README.md).")
        print("Starting anyway: the app works, but without accounts.")
    else:
        try:
            setup_database(reset_admin=args.reset_admin)
        except psycopg.Error as e:
            print("Could not reach the database:", str(e).splitlines()[0])
            sys.exit(1)
        print("Connected to PostgreSQL.")
        if args.reset_admin:
            return

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"dotacs is running at http://localhost:{args.port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
