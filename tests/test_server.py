"""Tests for the dotacs server and its PostgreSQL database, focused on security.

These tests ERASE the tables in the database they use, so point them at a separate,
empty test database (never the real one):

    Windows:      set TEST_DATABASE_URL=postgresql://...
    Mac / Linux:  export TEST_DATABASE_URL=postgresql://...
    then:         python -m unittest discover tests -v
"""
import http.client
import json
import os
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

TEST_URL = os.environ.get("TEST_DATABASE_URL")
PASSWORD = "signdemo2026"


class Browser:
    """Keeps the session cookie and sends the headers the app sends."""

    def __init__(self, port):
        self.port, self.cookie = port, None

    def request(self, method, path, body=None, headers=None, raw=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        h = {"X-Dotacs": "1", "Host": f"127.0.0.1:{self.port}"}
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            h["Content-Type"] = "application/json"
        if self.cookie:
            h["Cookie"] = self.cookie
        h.update(headers or {})
        conn.request(method, path, body=data, headers=h)
        res = conn.getresponse()
        payload = res.read()
        self.set_cookie_header = res.getheader("Set-Cookie") or ""
        if self.set_cookie_header:
            token = self.set_cookie_header.split(";", 1)[0]
            self.cookie = None if token.endswith("=") else token
        try:
            parsed = json.loads(payload) if payload else None
        except ValueError:
            parsed = payload
        conn.close()
        return res.status, parsed

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, {} if body is None else body, **kw)

    def delete(self, path, body=None, **kw):
        return self.request("DELETE", path, {} if body is None else body, **kw)


@unittest.skipUnless(TEST_URL, "set TEST_DATABASE_URL to an empty test database")
class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.DATABASE_URL = TEST_URL
        with server.connect() as db:
            db.execute(server.SQL_FILE.read_text(encoding="utf-8"))  # fresh tables + sample data
            db.execute(
                "INSERT INTO Users (Username, Email, PasswordHash, Role) VALUES ('admin', 'admin@test.local', %s, 'admin')",
                (server.hash_password("admin-test-password"),),
            )
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def browser(self):
        return Browser(self.port)

    def sql(self, query, params=None):
        with server.connect() as db:
            return db.execute(query, params).fetchall()

    def new_user(self, name):
        b = self.browser()
        status, body = b.post("/api/register", {"username": name, "email": f"{name}@test.local", "password": "a-long-password"})
        self.assertEqual(status, 201, body)
        return b

    # ---- files
    def test_only_app_files_are_served(self):
        b = self.browser()
        self.assertEqual(b.get("/")[0], 200)
        for path in ["/.env", "/server.py", "/database/dotacs.sql", "/../server.py", "/%2e%2e/.env", "/tests/test_server.py"]:
            self.assertEqual(b.get(path)[0], 404, path)

    # ---- accounts
    def test_register_checks_input(self):
        b = self.browser()
        for body in [
            {"username": "bob'; DROP TABLE Users;--", "email": "bob@test.local", "password": "a-long-password"},
            {"username": "bobby", "email": "not-an-email", "password": "a-long-password"},
            {"username": "bobby", "email": "bobby@test.local", "password": "short"},
            {"username": 42, "email": "bobby@test.local", "password": "a-long-password"},
        ]:
            self.assertEqual(b.post("/api/register", body)[0], 400, body)
        self.assertEqual(self.sql("SELECT COUNT(*) AS n FROM Users WHERE Username LIKE %s", ("bob%",))[0]["n"], 0)

    def test_passwords_are_hashed_and_salted(self):
        b = self.new_user("hashcheck")
        self.assertIn("HttpOnly", b.set_cookie_header)
        self.assertIn("SameSite=Strict", b.set_cookie_header)
        stored = self.sql("SELECT PasswordHash FROM Users WHERE Username = %s", ("hashcheck",))[0]["passwordhash"]
        self.assertTrue(stored.startswith("pbkdf2_sha256$"))
        self.assertNotIn("a-long-password", stored)
        sample = [r["passwordhash"] for r in self.sql("SELECT PasswordHash FROM Users WHERE Role = 'user' LIMIT 5")]
        self.assertEqual(len(set(sample)), len(sample))  # same password, different hash for every user

    def test_username_and_email_are_unique(self):
        self.new_user("uniquecheck")
        b = self.browser()
        self.assertEqual(b.post("/api/register", {"username": "UniqueCheck", "email": "x@test.local", "password": "a-long-password"})[0], 409)
        self.assertEqual(b.post("/api/register", {"username": "other", "email": "uniquecheck@test.local", "password": "a-long-password"})[0], 409)

    def test_sql_injection_in_login_does_not_work(self):
        b = self.browser()
        for name in ["' OR '1'='1", "admin'--", "' UNION SELECT * FROM Users--"]:
            self.assertEqual(b.post("/api/login", {"username": name, "password": "' OR '1'='1"})[0], 401, name)
        self.assertIsNone(b.cookie)

    def test_wrong_username_and_wrong_password_look_the_same(self):
        b = self.browser()
        self.assertEqual(b.post("/api/login", {"username": "maria", "password": "nope-nope"}),
                         b.post("/api/login", {"username": "nobody_here", "password": "nope-nope"}))

    def test_five_wrong_passwords_block_sign_in(self):
        b = self.browser()
        codes = [b.post("/api/login", {"username": "alex", "password": f"guess-{i}"})[0] for i in range(6)]
        self.assertEqual(codes, [401] * 5 + [429])
        self.assertEqual(b.post("/api/login", {"username": "alex", "password": PASSWORD})[0], 429)
        server.failures.clear()

    def test_sign_in_and_sign_out(self):
        b = self.browser()
        self.assertEqual(b.post("/api/login", {"username": "sara", "password": PASSWORD})[0], 200)
        old = b.cookie
        self.assertEqual(b.get("/api/stats")[0], 200)
        b.post("/api/logout")
        b.cookie = old  # the old cookie must not work after signing out
        self.assertEqual(b.get("/api/stats")[0], 401)

    # ---- access
    def test_private_data_needs_sign_in(self):
        b = self.browser()
        for path in ["/api/sentences", "/api/stats"]:
            self.assertEqual(b.get(path)[0], 401, path)
        b.cookie = "dotacs_session=made-up-token"
        self.assertEqual(b.get("/api/stats")[0], 401)

    def test_cross_site_requests_are_blocked(self):
        b = self.new_user("csrfcheck")
        self.assertEqual(b.post("/api/sentences", {"text": "hi"}, headers={"X-Dotacs": ""})[0], 403)
        self.assertEqual(b.post("/api/sentences", {"text": "hi"}, headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(b.request("POST", "/api/sentences", raw=b"text=hi",
                                   headers={"Content-Type": "application/x-www-form-urlencoded"})[0], 415)

    def test_users_only_see_their_own_sentences(self):
        a, b = self.new_user("privacy_a"), self.new_user("privacy_b")
        a.post("/api/sentences", {"text": "secret of a"})
        self.assertNotIn("secret of a", [s["text"] for s in b.get("/api/sentences")[1]["sentences"]])

    def test_sql_in_a_sentence_is_saved_as_plain_text(self):
        b = self.new_user("textcheck")
        attack = "Robert'); DROP TABLE Sentences;--"
        self.assertEqual(b.post("/api/sentences", {"text": attack})[0], 201)
        self.assertEqual(b.get("/api/sentences")[1]["sentences"][0]["text"], attack)
        self.assertGreater(self.sql("SELECT COUNT(*) AS n FROM Sentences")[0]["n"], 10)

    def test_scores_and_leaderboard(self):
        b = self.new_user("gamecheck")
        status, body = b.post("/api/scores", {"category": "letters", "points": 99999, "solved": 40})
        self.assertEqual((status, body["rank"]), (201, 1))
        self.assertTrue(b.get("/api/leaderboard?category=letters")[1]["leaders"][0]["me"])
        self.assertEqual(b.post("/api/scores", {"category": "letters", "points": -5, "solved": 1})[0], 400)
        self.assertEqual(b.get("/api/leaderboard?category=x%27%20OR%201%3D1--")[0], 400)

    def test_deleting_an_account_deletes_its_rows(self):
        b = self.new_user("deletecheck")
        b.post("/api/sentences", {"text": "bye"})
        b.post("/api/scores", {"category": "words", "points": 10, "solved": 1})
        uid = self.sql("SELECT User_ID FROM Users WHERE Username = %s", ("deletecheck",))[0]["user_id"]
        self.assertEqual(b.delete("/api/me", {"password": "wrong"})[0], 403)
        self.assertEqual(b.delete("/api/me", {"password": "a-long-password"})[0], 200)
        self.assertEqual(self.sql("SELECT COUNT(*) AS n FROM Sentences WHERE User_ID = %s", (uid,))[0]["n"], 0)
        self.assertEqual(self.sql("SELECT COUNT(*) AS n FROM Scores WHERE User_ID = %s", (uid,))[0]["n"], 0)

    # ---- admin
    def test_admin_pages_need_the_admin_role(self):
        b = self.new_user("notadmin")
        self.assertEqual(b.get("/api/admin/overview")[0], 403)

    def test_injection_demo(self):
        b = self.browser()
        self.assertEqual(b.post("/api/login", {"username": "admin", "password": "admin-test-password"})[0], 200)
        demo = b.post("/api/admin/injection-demo", {"username": "' OR '1'='1"})[1]
        self.assertEqual(len(demo["unsafe"]["rows"]), demo["total"])   # the attack lists every user
        self.assertEqual(demo["safe"]["rows"], [])                      # the safe query finds nobody
        drop = b.post("/api/admin/injection-demo", {"username": "x'; DROP TABLE public.Users; --"})[1]
        self.assertIn("read-only", drop["unsafe"]["error"])
        self.assertGreater(self.sql("SELECT COUNT(*) AS n FROM Users")[0]["n"], 10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
