// api.js: how the page talks to server.py, which keeps the PostgreSQL database.
// Every call returns { ok, status, data, error } and never throws, so the app keeps
// working (as a guest) when the server or database is not available.

async function call(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? { "X-Dotacs": "1" } : { "Content-Type": "application/json", "X-Dotacs": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store"
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    return { ok: res.ok && data !== null, status: res.status, data, error: res.ok ? null : (data && data.error) || `Server error (${res.status})` };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: "Cannot reach the server" };
  }
}

export const api = {
  health: () => call("GET", "/api/health"),
  register: (username, email, password) => call("POST", "/api/register", { username, email, password }),
  login: (username, password) => call("POST", "/api/login", { username, password }),
  logout: () => call("POST", "/api/logout", {}),
  deleteAccount: (password) => call("DELETE", "/api/me", { password }),

  sentences: () => call("GET", "/api/sentences"),
  addSentence: (text) => call("POST", "/api/sentences", { text }),
  clearSentences: () => call("DELETE", "/api/sentences", {}),

  addScore: (category, points, solved) => call("POST", "/api/scores", { category, points, solved }),
  stats: () => call("GET", "/api/stats"),
  leaderboard: (category) => call("GET", `/api/leaderboard?category=${encodeURIComponent(category)}`),

  adminOverview: () => call("GET", "/api/admin/overview"),
  injectionDemo: (username) => call("POST", "/api/admin/injection-demo", { username })
};
