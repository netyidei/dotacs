-- dotacs: queries a real user of the app needs (PostgreSQL)
-- Run dotacs.sql first, then these one at a time.


-- a. LOOKUP: practice scores above 4000 points
SELECT * FROM Scores WHERE Points > 4000;


-- b. JOIN: each user's name next to their practice scores
SELECT Users.Username, Scores.Points FROM Users JOIN Scores ON Users.User_ID = Scores.User_ID;


-- c. UPDATE: Maria changes her email address
UPDATE Users SET Email = 'maria.k@example.com' WHERE User_ID = 2;
SELECT User_ID, Username, Email FROM Users WHERE User_ID = 2;


-- d. INSERT: Maria signs "Hello friend" and presses Speak
INSERT INTO Sentences (User_ID, SentenceText) VALUES (2, 'Hello friend');
SELECT * FROM Sentences WHERE User_ID = 2 ORDER BY CreatedAt DESC;


-- e. JOIN + GROUP BY: the leaderboard (each player's best letters score)
SELECT Users.Username, MAX(Scores.Points) AS BestScore, COUNT(*) AS RoundsPlayed
FROM Users JOIN Scores ON Users.User_ID = Scores.User_ID
WHERE Scores.Category = 'letters'
GROUP BY Users.Username
ORDER BY BestScore DESC;


-- f. DELETE: Leo deletes his account. ON DELETE CASCADE also deletes his sentences and scores.
SELECT (SELECT COUNT(*) FROM Sentences WHERE User_ID = 8) AS LeoSentences, (SELECT COUNT(*) FROM Scores WHERE User_ID = 8) AS LeoScores;
DELETE FROM Users WHERE User_ID = 8;
SELECT (SELECT COUNT(*) FROM Sentences WHERE User_ID = 8) AS LeoSentences, (SELECT COUNT(*) FROM Scores WHERE User_ID = 8) AS LeoScores;


-- ---------------------------------------------------------------------------
-- SECURITY: the same lookup written unsafely and safely
-- ---------------------------------------------------------------------------
-- UNSAFE (the typed text is glued into the SQL):
--     sql = "SELECT * FROM Users WHERE Username = '" + username + "'"
-- If someone types   ' OR '1'='1   the database receives:
SELECT * FROM Users WHERE Username = '' OR '1'='1';
-- '1'='1' is always true, so this returns EVERY user.
--
-- SAFE (parameterized query, what server.py does):
--     db.execute("SELECT * FROM Users WHERE Username = %s", (username,))
-- The SQL never changes; the typed text is sent separately and only compared as a name.
-- That is the same as asking for a user literally called ' OR '1'='1 , which returns 0 rows:
SELECT * FROM Users WHERE Username = ''' OR ''1''=''1';
