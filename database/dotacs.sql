DROP TABLE IF EXISTS Scores, Sentences, Users;

CREATE TABLE Users (
    User_ID      SERIAL       PRIMARY KEY,
    Username     VARCHAR(20)  NOT NULL UNIQUE,
    Email        VARCHAR(254) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role         VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (Role IN ('user', 'admin')),
    CreatedAt    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE Sentences (
    Sentence_ID  SERIAL       PRIMARY KEY,
    User_ID      INT          NOT NULL REFERENCES Users(User_ID) ON DELETE CASCADE,
    SentenceText VARCHAR(500) NOT NULL,
    CreatedAt    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE Scores (
    Score_ID     SERIAL       PRIMARY KEY,
    User_ID      INT          NOT NULL REFERENCES Users(User_ID) ON DELETE CASCADE,
    Category     VARCHAR(10)  NOT NULL CHECK (Category IN ('letters', 'words', 'all')),
    Points       INT          NOT NULL CHECK (Points >= 0),
    SignsSolved  INT          NOT NULL DEFAULT 0 CHECK (SignsSolved >= 0),
    PlayedAt     TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX Scores_Category_Points ON Scores (Category, Points DESC);


-- ---------------------------------------------------------------- sample data

INSERT INTO Users (Username, Email, PasswordHash, CreatedAt) VALUES
    ('demo', 'demo@example.com', 'pbkdf2_sha256$240000$TyXoSXI9wK2Uvg89dpJYYQ==$jOy1kcyx7CqU3YvmDoJVNQLL4voT1RGg+JBEI3pyc2E=', '2026-09-28 19:00'),
    ('maria', 'maria@example.com', 'pbkdf2_sha256$240000$WOsA8ZxwfjTRzBeJBrMctg==$4B5NolbpZH9cR6Q2u9mqFc6wZsBHooi/pViyDAlc4FY=', '2026-09-29 20:07'),
    ('alex', 'alex@example.com', 'pbkdf2_sha256$240000$635p06dNgCRaT+ysDL4avw==$otzVbHKUwd82O6FJ3J8CxmYLVns6CLasSaPKxkL9Pvc=', '2026-09-30 21:14'),
    ('lina', 'lina@example.com', 'pbkdf2_sha256$240000$rmxYtZLhXcvbqHZWQcB85A==$ZGOVZKRZNjlicZCYZ7nAc4Yu/rnUeuhs04rw+1ibLR8=', '2026-10-01 22:21'),
    ('omar', 'omar@example.com', 'pbkdf2_sha256$240000$PZVS5ty8tn2q/tJ7LbpvDw==$BZUKaBK6Trwmjw2s/HETkyRdTGmzmBYuAEmgo4rWdr8=', '2026-10-02 23:28'),
    ('yuki', 'yuki@example.com', 'pbkdf2_sha256$240000$9LIKMtAR6NQAtPxIEtDcvw==$0IConnQAeVdeyNRAYomzzmUtZV00adMxTg4osXwGtB4=', '2026-10-03 10:35'),
    ('nadia', 'nadia@example.com', 'pbkdf2_sha256$240000$vA5BMNdylwf8ug0U3DofTA==$g6NG+Pdp6tVfTl155bTlDlz/atQvpkgCs7Agp14KKrM=', '2026-10-04 19:42'),
    ('leo', 'leo@example.com', 'pbkdf2_sha256$240000$YMxFJM3T7DVZeKMiBNFBXw==$51aEvqlIuWUve9sD26N/FoyJ0/fwSv1MhHGvHOO8G5g=', '2026-10-05 20:49'),
    ('sara', 'sara@example.com', 'pbkdf2_sha256$240000$+27aHEa5+ZOY8oL1AldF4w==$2MTPJV0Rl8s1N2Seqlu7z0yj7bRmwNfmZvUiTWoYdsY=', '2026-10-06 21:56'),
    ('tom', 'tom@example.com', 'pbkdf2_sha256$240000$lhe8stT0Php/Eimt0ELp0w==$NKm13FrMJNxHw+WohLk9EWHK9L/fQ0AGYpx5vSuZZno=', '2026-10-07 22:03');

INSERT INTO Sentences (User_ID, SentenceText, CreatedAt) VALUES
    ((SELECT User_ID FROM Users WHERE Username = 'maria'), 'Hello friend', '2026-10-12 09:05'),
    ((SELECT User_ID FROM Users WHERE Username = 'maria'), 'Thank you', '2026-10-12 09:40'),
    ((SELECT User_ID FROM Users WHERE Username = 'alex'), 'Water please', '2026-10-13 11:10'),
    ((SELECT User_ID FROM Users WHERE Username = 'demo'), 'Hello I love you', '2026-10-13 15:22'),
    ((SELECT User_ID FROM Users WHERE Username = 'lina'), 'Eat more', '2026-10-14 12:00'),
    ((SELECT User_ID FROM Users WHERE Username = 'omar'), 'Call me', '2026-10-14 18:30'),
    ((SELECT User_ID FROM Users WHERE Username = 'yuki'), 'Help', '2026-10-15 08:45'),
    ((SELECT User_ID FROM Users WHERE Username = 'nadia'), 'Sorry bye', '2026-10-15 16:05'),
    ((SELECT User_ID FROM Users WHERE Username = 'demo'), 'Cab', '2026-10-16 10:12'),
    ((SELECT User_ID FROM Users WHERE Username = 'sara'), 'Good yes', '2026-10-17 14:50'),
    ((SELECT User_ID FROM Users WHERE Username = 'leo'), 'Hungry drink water', '2026-10-18 13:25'),
    ((SELECT User_ID FROM Users WHERE Username = 'maria'), 'Love you', '2026-10-19 19:15');

INSERT INTO Scores (User_ID, Category, Points, SignsSolved, PlayedAt) VALUES
    ((SELECT User_ID FROM Users WHERE Username = 'demo'), 'letters', 3962, 24, '2026-10-16 17:00'),
    ((SELECT User_ID FROM Users WHERE Username = 'demo'), 'letters', 2875, 19, '2026-10-17 17:07'),
    ((SELECT User_ID FROM Users WHERE Username = 'demo'), 'words', 2410, 15, '2026-10-17 17:14'),
    ((SELECT User_ID FROM Users WHERE Username = 'maria'), 'letters', 6095, 34, '2026-10-18 17:21'),
    ((SELECT User_ID FROM Users WHERE Username = 'maria'), 'letters', 5480, 31, '2026-10-18 17:28'),
    ((SELECT User_ID FROM Users WHERE Username = 'alex'), 'letters', 4948, 29, '2026-10-19 17:35'),
    ((SELECT User_ID FROM Users WHERE Username = 'lina'), 'words', 3870, 22, '2026-10-19 17:42'),
    ((SELECT User_ID FROM Users WHERE Username = 'omar'), 'letters', 1341, 9, '2026-10-20 17:49'),
    ((SELECT User_ID FROM Users WHERE Username = 'yuki'), 'all', 4410, 26, '2026-10-20 17:56'),
    ((SELECT User_ID FROM Users WHERE Username = 'nadia'), 'letters', 5299, 31, '2026-10-21 17:03'),
    ((SELECT User_ID FROM Users WHERE Username = 'leo'), 'words', 2105, 14, '2026-10-21 17:10'),
    ((SELECT User_ID FROM Users WHERE Username = 'sara'), 'letters', 4960, 28, '2026-10-21 17:17');
