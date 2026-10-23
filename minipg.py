"""minipg: a tiny PostgreSQL connector written with only the Python standard library,
so dotacs runs without installing anything.

It speaks the PostgreSQL network protocol directly: encrypted connections (SSL/TLS),
password login (SCRAM-SHA-256, MD5 or plain), and parameterized queries, where the SQL
and the values are sent to the server separately (this is what stops SQL injection).
It offers the same few functions as the popular psycopg library, so server.py looks
like normal Python database code.
"""
import base64, datetime, decimal, hashlib, hmac, re, secrets, socket, ssl, struct, types
from urllib.parse import urlparse, unquote, parse_qs


class Error(Exception):
    sqlstate = None
    def __init__(self, msg="", sqlstate=None):
        super().__init__(msg)
        self.sqlstate = sqlstate
class OperationalError(Error): pass
class DatabaseError(Error): pass
class IntegrityError(DatabaseError): pass
class UniqueViolation(IntegrityError): pass
class ForeignKeyViolation(IntegrityError): pass
class CheckViolation(IntegrityError): pass
_BY_CODE = {"23505": UniqueViolation, "23503": ForeignKeyViolation, "23514": CheckViolation}
errors = types.SimpleNamespace(Error=Error, OperationalError=OperationalError, DatabaseError=DatabaseError,
                               IntegrityError=IntegrityError, UniqueViolation=UniqueViolation,
                               ForeignKeyViolation=ForeignKeyViolation, CheckViolation=CheckViolation, BY_CODE=_BY_CODE)


def dict_row(cursor):
    names = [d[0] for d in cursor.description]
    return lambda values: dict(zip(names, values))


def tuple_row(cursor):
    return lambda values: tuple(values)


rows = types.SimpleNamespace(dict_row=dict_row, tuple_row=tuple_row)

def _conv(oid, raw):
    if raw is None: return None
    s = raw.decode()
    if oid in (20, 21, 23, 26): return int(s)
    if oid == 1700: return decimal.Decimal(s)
    if oid in (700, 701): return float(s)
    if oid == 16: return s == "t"
    if oid == 1114: return datetime.datetime.fromisoformat(s)
    if oid == 1184: return datetime.datetime.fromisoformat(s if not re.search(r"[+-]\d\d$", s) else s + ":00")
    return s

def _param(v):
    if v is None: return None
    if isinstance(v, bool): return b"t" if v else b"f"
    if isinstance(v, datetime.datetime): return v.isoformat().encode()
    return str(v).encode()

class Cursor:
    def __init__(self, conn):
        self.conn = conn; self.description = None; self._rows = []; self.rowcount = -1; self._i = 0
    def execute(self, query, params=None):
        self.conn._run(self, query, params); return self
    def fetchone(self):
        if self._i >= len(self._rows): return None
        r = self._rows[self._i]; self._i += 1; return r
    def fetchall(self):
        r = self._rows[self._i:]; self._i = len(self._rows); return r
    def __iter__(self):
        return iter(self.fetchall())
    def close(self): pass
    def __enter__(self): return self
    def __exit__(self, *a): pass

class Connection:
    def __init__(self, url, row_factory=None, autocommit=False):
        u = urlparse(url)
        opts = {k: v[0] for k, v in parse_qs(u.query).items()}
        self.row_factory = row_factory or tuple_row
        self.autocommit = autocommit
        self.in_tx = False
        self.closed = False
        host = u.hostname or "localhost"
        user = unquote(u.username or "postgres")
        password = unquote(u.password or "")
        db = unquote((u.path or "/")[1:]) or user
        sslmode = opts.get("sslmode", "prefer")
        try:
            sock = socket.create_connection((host, u.port or 5432), timeout=15)
        except OSError as e:
            raise OperationalError(f"could not connect to {host}: {e}")
        if sslmode != "disable":
            sock.sendall(struct.pack("!ii", 8, 80877103))  # SSLRequest
            answer = sock.recv(1)
            if answer == b"S":
                ctx = ssl.create_default_context()
                if sslmode in ("require", "prefer", "allow"):  # encrypt, like libpq, without checking the certificate
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                sock = ctx.wrap_socket(sock, server_hostname=host)
            elif sslmode in ("require", "verify-ca", "verify-full"):
                raise OperationalError("the server does not support SSL but sslmode=" + sslmode)
        self.sock = sock
        params = b"user\0" + user.encode() + b"\0database\0" + db.encode() + b"\0"
        if "options" in opts:
            params += b"options\0" + opts["options"].encode() + b"\0"
        body = struct.pack("!i", 196608) + params + b"\0"
        self.sock.sendall(struct.pack("!i", len(body) + 4) + body)
        scram = None
        while True:
            t, m = self._read()
            if t == b"R":
                code = struct.unpack("!i", m[:4])[0]
                if code == 0:
                    pass
                elif code == 3:   # plain password
                    self._send(b"p", password.encode() + b"\0")
                elif code == 5:   # MD5
                    inner = hashlib.md5((password + user).encode()).hexdigest()
                    self._send(b"p", b"md5" + hashlib.md5(inner.encode() + m[4:8]).hexdigest().encode() + b"\0")
                elif code == 10:  # SCRAM-SHA-256 start
                    mechs = [x.decode() for x in m[4:].split(b"\0") if x]
                    if "SCRAM-SHA-256" not in mechs:
                        raise OperationalError("server wants an unsupported login method: " + ", ".join(mechs))
                    nonce = base64.b64encode(secrets.token_bytes(18)).decode()
                    first_bare = "n=,r=" + nonce
                    msg = ("n,," + first_bare).encode()
                    self._send(b"p", b"SCRAM-SHA-256\0" + struct.pack("!i", len(msg)) + msg)
                    scram = {"nonce": nonce, "first_bare": first_bare}
                elif code == 11:  # SCRAM-SHA-256 challenge
                    server_first = m[4:].decode()
                    f = dict(part.split("=", 1) for part in server_first.split(","))
                    if not f["r"].startswith(scram["nonce"]):
                        raise OperationalError("SCRAM: bad server nonce")
                    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(f["s"]), int(f["i"]))
                    client_key = hmac.new(salted, b"Client Key", "sha256").digest()
                    stored_key = hashlib.sha256(client_key).digest()
                    without_proof = "c=biws,r=" + f["r"]
                    auth_msg = (scram["first_bare"] + "," + server_first + "," + without_proof).encode()
                    sig = hmac.new(stored_key, auth_msg, "sha256").digest()
                    proof = base64.b64encode(bytes(a ^ b for a, b in zip(client_key, sig))).decode()
                    scram["server_key"] = hmac.new(salted, b"Server Key", "sha256").digest()
                    scram["auth_msg"] = auth_msg
                    self._send(b"p", (without_proof + ",p=" + proof).encode())
                elif code == 12:  # SCRAM-SHA-256 final: check the server knows the password too
                    v = dict(part.split("=", 1) for part in m[4:].decode().split(","))
                    expect = hmac.new(scram["server_key"], scram["auth_msg"], "sha256").digest()
                    if base64.b64decode(v.get("v", "")) != expect:
                        raise OperationalError("SCRAM: server signature did not match")
                else:
                    raise OperationalError(f"unsupported login method (code {code})")
            elif t == b"E":
                raise self._err(m)
            elif t == b"Z":
                break

    # --- protocol helpers
    def _recv(self, n):
        buf = b""
        while len(buf) < n:
            c = self.sock.recv(n - len(buf))
            if not c: raise OperationalError("server closed the connection")
            buf += c
        return buf
    def _read(self):
        t = self._recv(1); n = struct.unpack("!i", self._recv(4))[0]
        return t, self._recv(n - 4)
    def _send(self, t, body=b""):
        self.sock.sendall(t + struct.pack("!i", len(body) + 4) + body)
    def _err(self, m):
        f = {}
        for part in m.split(b"\0"):
            if part: f[chr(part[0])] = part[1:].decode()
        code = f.get("C")
        cls = _BY_CODE.get(code, DatabaseError)
        return cls(f.get("M", "error"), code)
    def _collect(self, cur, extended):
        desc = None; results = []; error = None; cur_rows = None; first_rows = None; first_desc = None; count = -1
        while True:
            t, m = self._read()
            if t == b"T":
                n = struct.unpack("!h", m[:2])[0]; pos = 2; desc = []
                for _ in range(n):
                    end = m.index(b"\0", pos); name = m[pos:end].decode(); pos = end + 1
                    _tbl, _col, oid, _sz, _mod, _fmt = struct.unpack("!ihihih", m[pos:pos + 18]); pos += 18
                    desc.append((name, oid))
                cur_rows = []
            elif t == b"D":
                n = struct.unpack("!h", m[:2])[0]; pos = 2; vals = []
                for i in range(n):
                    ln = struct.unpack("!i", m[pos:pos + 4])[0]; pos += 4
                    raw = None if ln == -1 else m[pos:pos + ln]; pos += max(ln, 0)
                    vals.append(_conv(desc[i][1], raw))
                cur_rows.append(vals)
            elif t == b"C":
                tag = m[:-1].decode(); parts = tag.split()
                if parts and parts[-1].isdigit() and parts[0] in ("INSERT", "UPDATE", "DELETE", "SELECT", "MERGE"): c = int(parts[-1])
                else: c = -1
                if first_desc is None and (desc is not None or not results):
                    first_desc = desc; first_rows = cur_rows; count = c
                results.append(tag); desc = None; cur_rows = None
            elif t == b"E":
                error = self._err(m)
            elif t == b"Z":
                status = m[:1]
                self.in_tx = status in (b"T", b"E")
                break
        if error: raise error
        cur.description = [(n, o) for n, o in first_desc] if first_desc else None
        if first_desc:
            make = self.row_factory(cur)
            cur._rows = [make(v) for v in first_rows]
        else:
            cur._rows = []
        cur._i = 0; cur.rowcount = count
    def _run(self, cur, query, params):
        if self.closed: raise OperationalError("connection is closed")
        if not self.autocommit and not self.in_tx:
            self._send(b"Q", b"BEGIN\0"); self._collect(Cursor(self), False)
        if params is None:
            self._send(b"Q", query.encode() + b"\0"); self._collect(cur, False); return
        params = list(params); idx = [0]
        def sub(mo):
            if mo.group(0) == "%%": return "%"
            idx[0] += 1; return f"${idx[0]}"
        q = re.sub(r"%%|%s", sub, query)
        if idx[0] != len(params): raise Error(f"query has {idx[0]} placeholders but {len(params)} parameters")
        self._send(b"P", b"\0" + q.encode() + b"\0" + struct.pack("!h", 0))
        bind = b"\0\0" + struct.pack("!h", 0) + struct.pack("!h", len(params))
        for p in params:
            b = _param(p)
            bind += struct.pack("!i", -1) if b is None else struct.pack("!i", len(b)) + b
        bind += struct.pack("!h", 0)
        self._send(b"B", bind); self._send(b"D", b"P\0"); self._send(b"E", b"\0" + struct.pack("!i", 0)); self._send(b"S")
        # consume ParseComplete/BindComplete/NoData then reuse collector
        self._collect_ext(cur)
    def _collect_ext(self, cur):
        # same as _collect but skips '1','2','n','s'
        orig = self._read
        def filtered():
            while True:
                t, m = orig()
                if t in (b"1", b"2", b"n", b"s", b"N", b"S"): continue
                return t, m
        self._read = filtered
        try: self._collect(cur, True)
        finally: self._read = orig
    # --- public API
    def cursor(self): return Cursor(self)
    def execute(self, query, params=None):
        c = Cursor(self); c.execute(query, params); return c
    def commit(self):
        if self.in_tx: self._send(b"Q", b"COMMIT\0"); self._collect(Cursor(self), False)
    def rollback(self):
        if self.in_tx: self._send(b"Q", b"ROLLBACK\0"); self._collect(Cursor(self), False)
    def close(self):
        if not self.closed:
            try: self._send(b"X"); self.sock.close()
            except OSError: pass
            self.closed = True
    def __enter__(self): return self
    def __exit__(self, et, ev, tb):
        try:
            if et is None: self.commit()
            else: self.rollback()
        finally: self.close()

def connect(conninfo="", row_factory=None, autocommit=False, **kw):
    return Connection(conninfo, row_factory=row_factory, autocommit=autocommit)

__version__ = "1.0"
