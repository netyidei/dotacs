# dotacs: sign to speech

dotacs reads sign language from a webcam, writes it as text and reads it aloud.
Users can sign in so the sentences they speak, their practice game scores and a log of the signs
the app recognised are saved in a **PostgreSQL** database. The **About** button in the app shows
the main scenario, where the data is stored and which functions are done, partly done or planned.

## Run it

You need Python 3.8 or newer, a webcam, and a free PostgreSQL database. **Nothing to download or install**:
the project has its own small PostgreSQL connector (`minipg.py`, standard Python only).

1. **Make a free PostgreSQL database.** For example on [neon.tech](https://neon.tech): sign up,
   create a project, then click **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-something.neon.tech/neondb?sslmode=require`.
   (Supabase works the same way, and so does PostgreSQL installed on your own computer.)

2. **Paste the connection string into a file called `.env`** in this folder
   (copy `.env.example` and fill it in):

   ```
   DATABASE_URL=postgresql://user:password@ep-something.neon.tech/neondb?sslmode=require
   ```

3. **Start it** and open **http://localhost:8000**:

   ```
   python server.py
   ```

On the first run the server creates the tables with sample data and prints a password for the
**admin** account. Write it down: it is shown only once (`python server.py --reset-admin` makes a new one).
Sample accounts: `demo`, `maria`, `alex` and others, all with the password `signdemo2026`.

Without steps 1 and 2 the app still works, just without accounts (nothing is saved in the database).

## Put it online (a link anyone can open, no login)

The camera only works on `https://` pages (or `localhost`), so use a free host that gives you HTTPS.

**Quick: GitHub Pages (guest mode, no database).** Make a public GitHub repository, upload these files,
then Settings → Pages → Branch `main` → Save. The link looks like `https://yourname.github.io/dotacs/`.
Sign to text, Speak, Teach mode and the practice game all work there; accounts do not (there is no
server), and the About panel says so honestly ("Shown only").

**Full: Render (with the database).** On [render.com](https://render.com) make a *Web Service* from the
same repository: Runtime *Python*, Build command *(leave empty)*, Start command `python server.py`, and add
an environment variable `DATABASE_URL` with your Neon connection string. The server reads Render's `PORT`
by itself. The free plan sleeps when nobody uses it, so the first visit can take about a minute.

**QR code for the poster:** paste the final link into any QR generator (for example the
"Create QR code" option in Chrome's share menu) and download it as PNG, at least 6 × 6 cm on the poster.

## The database

PostgreSQL, **4 tables**. Each table is like a spreadsheet: one row per item.

![ERD](database/erd.png)

| Table | One row is | Fields (type) |
|---|---|---|
| **Users** | one account | User_ID (INT, primary key), Username (VARCHAR, unique), Email (VARCHAR, unique), PasswordHash (VARCHAR), Role (VARCHAR: user or admin), CreatedAt (TIMESTAMP) |
| **Sentences** | one sentence a user had the app speak | Sentence_ID (INT, primary key), User_ID (INT, foreign key to Users), SentenceText (VARCHAR), CreatedAt (TIMESTAMP) |
| **Scores** | one round of the 60-second practice game | Score_ID (INT, primary key), User_ID (INT, foreign key to Users), Category (VARCHAR), Points (INT), SignsSolved (INT), PlayedAt (TIMESTAMP) |
| **RecognitionLogs** *(new in Assignment 4)* | one sign the app recognised for a signed-in user | Log_ID (INT, primary key), User_ID (INT, foreign key to Users), Sign (VARCHAR), Method (VARCHAR: hold, motion or pair), Confidence (NUMERIC 0 to 1), CreatedAt (TIMESTAMP) |

- **Primary key:** the row's own unique number (like a student ID).
- **Foreign key:** a column that points to a row in another table. `Sentences.User_ID` says whose sentence it is.
- **One-to-many:** one user has many sentences, scores and recognition logs.
- **ON DELETE CASCADE:** when a user deletes their account, their sentences, scores and logs are deleted too.

**Why RecognitionLogs:** it is the "smart" data of the project. Each row says which sign the webcam saw,
how (held still, a motion, or a two-hand sign) and how sure the recogniser was. Grouping it by sign
(query g) shows which signs the app finds hardest, so we know what to improve next. Only the sign name
and numbers are stored, never camera images.

### Where the app uses it

| You do this in the app | The database does |
|---|---|
| Create an account | `INSERT INTO Users ...` |
| Sign in | `SELECT * FROM Users WHERE Username = %s` |
| Press **Speak** | `INSERT INTO Sentences ...` |
| Open the **History** tab | `SELECT ... FROM Sentences WHERE User_ID = %s` |
| Finish a practice round | `INSERT INTO Scores ...` |
| Make a sign while signed in | `INSERT INTO RecognitionLogs ...` |
| Open the leaderboard | `SELECT ... FROM Users JOIN Scores ... GROUP BY ...` |
| Delete your account | `DELETE FROM Users WHERE User_ID = %s` |

### The queries for the report

`database/queries.sql` has them all; `database/screenshots/` shows each one with its real result.

```sql
-- a. Lookup: practice scores above 4000 points
SELECT * FROM Scores WHERE Points > 4000;

-- b. Join: each user's name next to their scores
SELECT Users.Username, Scores.Points FROM Users JOIN Scores ON Users.User_ID = Scores.User_ID;

-- c. Update: a user changes their email
UPDATE Users SET Email = 'maria.k@example.com' WHERE User_ID = 2;
```

## Security

| Threat | What dotacs does |
|---|---|
| **SQL injection** | Every query uses `%s` placeholders (parameterized queries): the typed text is sent separately and is only ever treated as data. Input is also checked first (type, length, allowed characters). |
| **Unauthorized access** | Passwords are stored as PBKDF2 hashes with a random salt, never as plain text. 5 wrong passwords in 15 minutes blocks that username from that computer. Users only see their own rows. Admin pages check `Role = 'admin'` (role-based access). |
| **Data breach** | The browser can only download the app's own files, never `.env` or the SQL files. Errors never show database details. Only the data the app needs is stored. |
| **Encryption in transit** | The connection string ends in `sslmode=require`, so everything between the server and the database travels encrypted (TLS). Passwords to the database are checked with SCRAM-SHA-256, so the database password itself is never sent. |
| **Encryption at rest** | Hosted PostgreSQL services such as Neon and Supabase encrypt the stored data on their disks. |
| **Updates and patches** | The hosting service patches PostgreSQL; we keep Python updated. |

**Unsafe vs safe** (sign in as admin and open the account panel to run this live):

```python
# UNSAFE: the typed text is glued into the SQL
db.execute("SELECT * FROM Users WHERE Username = '" + username + "'")
# typing  ' OR '1'='1  turns it into ... WHERE Username = '' OR '1'='1'  -> returns EVERY user

# SAFE: parameterized query (what server.py does)
db.execute("SELECT * FROM Users WHERE Username = %s", (username,))
# the typed text only fills the blank, so it looks for a user literally named ' OR '1'='1  -> 0 rows
```

## Files

| File | What it is |
|---|---|
| `index.html`, `recognizer.js`, `gestures.json` | the app and its sign recognition |
| `api.js` | how the page talks to the server |
| `server.py` | web server + all database code |
| `minipg.py` | built-in PostgreSQL connector: encrypted connection, password login, parameterized queries |
| `database/dotacs.sql` | creates the 4 tables and the sample data (the .sql appendix; runs in Neon's SQL Editor too) |
| `database/queries.sql` | the queries above, plus insert, leaderboard, delete, and two queries on RecognitionLogs (g, h) |
| `database/erd.png`, `database/erd.mmd` | the ERD (image, and Mermaid source for mermaid.live) |
| `database/screenshots/` | every query with its result, the data in each table, the table structure |
| `data/dotacs-data-analysis.xlsx` | data analysis: sheet *Data* (accuracy per sign, first vs current version, and RecognitionLogs rows) and sheet *Analysis* (formulas, findings, chart) |
| `bench/` | accuracy tests on simulated hands (needs Node.js): `node bench/noisy.mjs 60` gives 78.8% → 92.9%, `node bench/train.mjs` gives 91.0% → 99.4% after Teach mode. `old.mjs` is the first version, kept for comparison |
| `tests/test_server.py` | 17 tests (they erase the tables they use, so give them an empty test database: `TEST_DATABASE_URL=... python -m unittest discover tests`) |
