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
SELECT * FROM Users WHERE Username = '' OR '1'='1';
-- '1'='1' is always true, so this returns EVERY user.
-- SAFE (parameterized query, what server.py does):
SELECT * FROM Users WHERE Username = ''' OR ''1''=''1';
