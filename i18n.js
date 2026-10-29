// i18n.js: the Kazakh interface.
//
// The page is written in English. When Kazakh is chosen, every English text on the page
// (and every text the app writes later) is swapped for its Kazakh version from the lists
// below; choosing English puts the original texts back. Signs and hints come from
// gestures.json, which has its own Kazakh sign set, so they are not translated here.

// exact texts
const KK = {
  // header and status
  "sign to speech": "ымнан сөзге",
  "Loading...": "Жүктелуде...",
  "Practice challenge (G)": "Жаттығу ойыны (G)",
  "Practice": "Жаттығу",
  "Teach it your hands for better accuracy (M)": "Дәлдікті арттыру үшін қолыңызды үйретіңіз (M)",
  "Teach": "Үйрету",
  "Hologram mode: hide the camera, keep the hand (H)": "Голограмма режимі: камера суреті жасырылады, қол қалады (H)",
  "Hologram": "Голограмма",
  "Light / dark (T)": "Жарық / қараңғы (T)",
  "Switch light and dark theme": "Жарық және қараңғы тақырыпты ауыстыру",
  "Sign in to save your sentences and scores": "Сөйлемдер мен ұпайларды сақтау үшін кіріңіз",
  "Sign in": "Кіру",
  "About this prototype: what works and where data is stored": "Прототип туралы: не жұмыс істейді және деректер қайда сақталады",
  "About this prototype": "Прототип туралы",
  "Settings and shortcuts (?)": "Баптаулар мен пернелер (?)",
  "Settings": "Баптаулар",
  "Language (L)": "Тіл (L)",
  "Camera on": "Камера қосулы",
  "Loading hand tracker...": "Қол трекері жүктелуде...",
  "Hand tracker failed to load": "Қол трекері жүктелмеді",
  "Starting camera...": "Камера іске қосылуда...",
  "Camera access denied": "Камераға рұқсат жоқ",
  "gestures.json failed to load": "gestures.json жүктелмеді",
  "Error loading JSON": "JSON жүктеу қатесі",
  "Signed out: your session ended": "Сеанс аяқталды, жүйеден шықтыңыз",
  "Cannot reach the server": "Серверге қосылу мүмкін емес",
  "Could not save to the database": "Дерекқорға сақтау мүмкін болмады",
  "Your account and its data were deleted": "Аккаунтыңыз және оның деректері жойылды",

  // camera area
  "No hand": "Қол жоқ",
  "1 hand": "1 қол",
  "2 hands": "2 қол",
  "Still": "Қозғалыссыз",
  "Moving": "Қозғалуда",
  "Loading the sign list": "Белгілер тізімі жүктелуде",
  "Loading the hand tracker": "Қол трекері жүктелуде",
  "Starting the camera": "Камера іске қосылуда",
  "Try again": "Қайталау",
  "Could not download the hand-tracking model. Check the internet connection and reload the page.":
    "Қолды бақылау моделін жүктеу мүмкін болмады. Интернетті тексеріп, бетті қайта жүктеңіз.",
  "No camera was found. Plug one in and try again.": "Камера табылмады. Камераны қосып, қайталап көріңіз.",
  "The camera is blocked. Click the camera icon in the address bar, allow access, then try again.":
    "Камера бұғатталған. Мекенжай жолағындағы камера белгішесін басып, рұқсат беріңіз де, қайталап көріңіз.",
  "Unknown Gesture": "Танылмады",
  "No hand detected": "Қол көрінбейді",
  "Show a gesture": "Белгі көрсетіңіз",
  "Sign captured. Lower your hands to continue.": "Белгі қабылданды. Жалғастыру үшін қолды түсіріңіз.",

  // practice game
  "60-second challenge": "60 секундтық сынақ",
  "Sign as many as you can before the clock runs out. Fast answers and streaks score more.":
    "Уақыт біткенше барынша көп белгі көрсетіңіз. Жылдам жауаптар мен қатарынан дұрыс жауаптар көбірек ұпай береді.",
  "Which signs": "Қай белгілер",
  "Letters": "Әріптер",
  "Words": "Сөздер",
  "Everything": "Барлығы",
  "Start (Enter)": "Бастау (Enter)",
  "Close": "Жабу",
  "Score": "Ұпай",
  "Reps": "Қайталау",
  "Streak": "Серия",
  "Skip (S)": "Өткізу (S)",
  "Another sign (S)": "Басқа белгі (S)",
  "Teach it this sign": "Осы белгіні үйрету",
  "Teach it again": "Қайта үйрету",
  "Exit (Esc)": "Шығу (Esc)",
  "Two hands, moving": "Екі қол, қозғалыспен",
  "Two hands": "Екі қол",
  "Motion sign": "Қозғалысты белгі",
  "Hold still": "Қозғалтпай ұстаңыз",
  "Get your hand ready...": "Қолыңызды дайындаңыз...",
  "Go!": "Бастадық!",
  "Time's up": "Уақыт бітті",
  "Play again (Enter)": "Қайта ойнау (Enter)",
  "Done": "Дайын",
  "Saving to your account...": "Аккаунтқа сақталуда...",
  "This score could not be saved.": "Бұл ұпайды сақтау мүмкін болмады.",
  "Sign in to save your scores and join the leaderboard.": "Ұпайларды сақтап, көшбасшылар тізіміне қосылу үшін кіріңіз.",
  "New personal best!": "Жаңа жеке рекорд!",
  "Lightning fast!": "Найзағайдай жылдам!",
  "Nice!": "Жарайсыз!",

  // teach mode
  "Teach it your hands": "Қолыңызды үйретіңіз",
  "Everyone signs a little differently. Show each sign for two seconds and dotacs learns how":
    "Әркім сәл басқаша көрсетеді. Әр белгіні екі секунд көрсетіңіз, сонда dotacs",
  "your": "сіздің",
  "hands look, which makes it far more accurate for you. It also works for left-handed signers. All letters take about two minutes.":
    "қолыңыздың пішінін үйреніп, сізге әлдеқайда дәл жұмыс істейді. Солақайларға да жарайды. Барлық әріпке шамамен екі минут кетеді.",
  "Start teaching (Enter)": "Үйретуді бастау (Enter)",
  "Sign": "Белгі",
  "Back": "Артқа",
  "Stop (Esc)": "Тоқтату (Esc)",
  "Get ready...": "Дайындалыңыз...",
  "Get ready... show your hand": "Дайындалыңыз... қолыңызды көрсетіңіз",
  "Hold it... tilt your hand a little": "Ұстап тұрыңыз... қолыңызды сәл еңкейтіңіз",
  "Show your hand to the camera": "Қолыңызды камераға көрсетіңіз",
  "I could not see your hand well. Again.": "Қолыңыз анық көрінбеді. Қайтадан.",
  "Do the sign now": "Белгіні қазір көрсетіңіз",
  "I did not see a movement. Again.": "Қозғалыс көрінбеді. Қайтадан.",
  "Got it!": "Қабылданды!",

  // sentence bar
  "Spell a word or sign a phrase. Hold each sign for a moment.": "Сөзді әріптеп теріңіз немесе тіркесті көрсетіңіз. Әр белгіні сәл ұстап тұрыңыз.",
  "Finish the word:": "Сөзді аяқтау:",
  "Read the sentence aloud (Enter)": "Сөйлемді дауыстап оқу (Enter)",
  "Speak": "Айту",
  "Finish the word you are spelling (Space)": "Терілген сөзді аяқтау (Space)",
  "Next word": "Келесі сөз",
  "Remove the last letter or word (Backspace)": "Соңғы әріпті немесе сөзді өшіру (Backspace)",
  "Undo": "Өшіру",
  "Copy the sentence as text": "Сөйлемді мәтін ретінде көшіру",
  "Copy": "Көшіру",
  "Copied": "Көшірілді",
  "Copy failed": "Көшіру сәтсіз",
  "Full screen presentation mode (F)": "Толық экранды көрсетілім режимі (F)",
  "Present": "Көрсету",
  "Exit": "Шығу",
  "Start over (Escape)": "Басынан бастау (Escape)",
  "Clear": "Тазалау",

  // sign guide and history
  "Sign guide": "Белгілер анықтамасы",
  "Letters & numbers": "Әріптер мен сандар",
  "History": "Тарих",
  "Find a sign (click one to practise)": "Белгіні іздеу (жаттығу үшін басыңыз)",
  "Motion": "Қозғалыс",
  "Download transcript": "Жазбаны жүктеп алу",
  "Clear history": "Тарихты тазалау",
  "No sign matches that search.": "Іздеуге сәйкес белгі жоқ.",
  "Loading signs...": "Белгілер жүктелуде...",
  "You taught this sign. Click to practise it.": "Бұл белгіні сіз үйреттіңіз. Жаттығу үшін басыңыз.",
  "Practise this sign": "Осы белгіні жаттықтыру",
  "Sentences you speak are saved to your account and show up here.": "Айтқан сөйлемдеріңіз аккаунтқа сақталып, осында көрінеді.",
  "Sentences you speak will show up here.": "Айтқан сөйлемдеріңіз осында көрінеді.",
  "Say": "Айту",

  // settings
  "Signing": "Белгі көрсету",
  "Hold a sign this long to add it": "Белгіні қосу үшін ұстап тұру уақыты",
  "Pause that ends a spelled word": "Терілген сөзді аяқтайтын үзіліс",
  "Which hand types when both are in view": "Екі қол көрінгенде қайсысы тереді",
  "The hand that appeared first": "Бірінші көрінген қол",
  "The hand on the left of the screen": "Экранның сол жағындағы қол",
  "The hand on the right of the screen": "Экранның оң жағындағы қол",
  "Suggest words while spelling": "Теру кезінде сөз ұсыну",
  "Voice": "Дауыс",
  "System default": "Жүйенің әдепкі дауысы",
  "Say each word out loud as soon as it is added": "Әр сөзді қосылған бойда дауыстап айту",
  "Speaking speed": "Сөйлеу жылдамдығы",
  "Look and sound": "Көрініс пен дыбыс",
  "Hologram mode (hide the camera picture)": "Голограмма режимі (камера суретін жасыру)",
  "Draw the hand skeleton": "Қол қаңқасын салу",
  "Sound effects": "Дыбыс әсерлері",
  "Particles and confetti": "Бөлшектер мен конфетти",
  "Show frame rate": "Кадр жиілігін көрсету",
  "Keyboard": "Пернетақта",
  "Speak the sentence": "Сөйлемді айту",
  "Finish the spelled word": "Терілген сөзді аяқтау",
  "Accept the first word suggestion": "Бірінші ұсынылған сөзді таңдау",
  "Clear the sentence, or leave practice": "Сөйлемді тазалау немесе жаттығудан шығу",
  "Practice challenge": "Жаттығу ойыны",
  "Skip a sign in practice or teaching": "Жаттығуда не үйретуде белгіні өткізу",
  "Hologram mode": "Голограмма режимі",
  "Presentation mode": "Көрсетілім режимі",
  "Light or dark theme": "Жарық не қараңғы тақырып",
  "Choose the language": "Тілді таңдау",
  "This panel": "Осы панель",
  "Signs you taught": "Сіз үйреткен белгілер",
  "Teach signs": "Белгілерді үйрету",
  "Save to a file": "Файлға сақтау",
  "Load from a file": "Файлдан жүктеу",
  "Forget all": "Барлығын ұмыту",
  "Reset": "Қалпына келтіру",
  "Restore default settings": "Әдепкі баптауларды қайтару",
  "You have not taught it any signs yet. Teaching takes about two minutes and makes recognition much more accurate for your hands.":
    "Сіз әлі ешбір белгі үйретпедіңіз. Үйрету шамамен екі минут алады және тануды сіздің қолыңызға әлдеқайда дәл етеді.",
  "That file could not be loaded. Choose a file saved from dotacs (dotacs-my-signs.json).":
    "Файлды жүктеу мүмкін болмады. dotacs сақтаған файлды таңдаңыз (dotacs-my-signs.json).",
  "Forget all the signs you taught? This cannot be undone.": "Үйреткен барлық белгілерді ұмыту керек пе? Мұны қайтару мүмкін емес.",
  "Delete all your saved sentences from your account?": "Аккаунтыңыздағы барлық сақталған сөйлемдерді жою керек пе?",

  // about panel
  "What works today, and where your data goes": "Бүгін не жұмыс істейді және деректеріңіз қайда барады",
  "Where the data is stored": "Деректер қайда сақталады",
  "Data": "Деректер",
  "Stored in": "Қайда сақталады",
  "Status": "Күйі",
  "Camera picture": "Камера суреті",
  "Nowhere: it never leaves your device": "Ешқайда: ол құрылғыңыздан шықпайды",
  "Working": "Жұмыс істейді",
  "Taught signs, settings, language, guest history": "Үйретілген белгілер, баптаулар, тіл, қонақ тарихы",
  "This browser (localStorage)": "Осы браузер (localStorage)",
  "Accounts, sentences, scores, recognition logs": "Аккаунттар, сөйлемдер, ұпайлар, тану журналы",
  "PostgreSQL: tables Users, Sentences, Scores, RecognitionLogs": "PostgreSQL: Users, Sentences, Scores, RecognitionLogs кестелері",
  "Checking...": "Тексерілуде...",
  "Shown only": "Тек сипатталған",
  "This copy is connected to our server and PostgreSQL database. Sign in to save your data.":
    "Бұл нұсқа біздің серверге және PostgreSQL дерекқорына қосылған. Деректерді сақтау үшін кіріңіз.",
  "This copy runs without our server, so the database part is only described here and everything stays in your browser. With server.py running, accounts and saving work (see README).":
    "Бұл нұсқа біздің серверсіз жұмыс істейді, сондықтан дерекқор бөлігі тек осында сипатталған, ал бәрі браузеріңізде қалады. server.py іске қосылғанда аккаунттар мен сақтау жұмыс істейді (README қараңыз).",
  "Smart feature: the webcam as a sensor": "Ақылды мүмкіндік: веб-камера сенсор ретінде",
  "The webcam films your hand; MediaPipe finds 21 points on it about 30 times a second, in the browser. Our engine (recognizer.js) turns the points into a sign and a confidence. Signed in, each recognised sign, its method and confidence are saved in RecognitionLogs, so we can see which signs are hard to recognise.":
    "Веб-камера қолыңызды түсіреді; MediaPipe браузерде секундына шамамен 30 рет қолдан 21 нүкте табады. Біздің қозғалтқыш (recognizer.js) осы нүктелерді белгіге және сенімділік деңгейіне айналдырады. Аккаунтқа кірсеңіз, әр танылған белгі, оның тәсілі мен сенімділігі RecognitionLogs кестесіне сақталады, сондықтан қай белгілерді тану қиын екенін көре аламыз.",
  "Functions": "Функциялар",
  "Function": "Функция",
  "Sign to text: 54 English and 71 Kazakh signs (letters, numbers, words), incl. moving and two-hand signs":
    "Белгіден мәтінге: 54 ағылшын және 71 қазақ белгісі (әріптер, сандар, сөздер), қозғалысты және екі қолмен көрсетілетін белгілерді қоса",
  "Kazakh fingerspelling (42 letters) and 25 Kazakh phrases": "Қазақ дактиль әліпбиі (42 әріп) және 25 қазақша тіркес",
  ": Ф, Ю and Я only after Teach mode; phrases still to be checked with Kazakh signers":
    ": Ф, Ю және Я тек «Үйрету» режимінен кейін; тіркестерді қазақ ым тілін білетіндермен тексеру керек",
  "Interface and voice in Kazakh or English": "Интерфейс пен дауыс қазақша немесе ағылшынша",
  ": a Kazakh voice depends on the device (Russian is used if there is none)": ": қазақ дауысы құрылғыға байланысты (болмаса, орыс дауысы қолданылады)",
  "Read the sentence aloud (Speak)": "Сөйлемді дауыстап оқу (Айту)",
  "Teach mode: learns your own hands": "Үйрету режимі: өз қолыңызды үйренеді",
  "60-second practice game": "60 секундтық жаттығу ойыны",
  "Accounts, saved sentences and scores, leaderboard": "Аккаунттар, сақталған сөйлемдер мен ұпайлар, көшбасшылар тізімі",
  "(needs our server)": "(біздің сервер қажет)",
  "Recognition logs for data analysis": "Деректерді талдауға арналған тану журналы",
  "Use on a phone": "Телефонда қолдану",
  "Partly": "Ішінара",
  ": works in the browser; speed depends on the phone": ": браузерде жұмыс істейді; жылдамдығы телефонға байланысты",
  "Taught signs on another computer": "Үйретілген белгілер басқа компьютерде",
  ": by saving them to a file": ": файлға сақтау арқылы",
  "Russian sign words": "Орыс ым тілінің сөздері",
  "Planned": "Жоспарда",
  "Whole sign-language sentences and grammar": "Ым тіліндегі толық сөйлемдер мен грамматика",

  // account
  "Save your sentences and scores": "Сөйлемдер мен ұпайларыңызды сақтаңыз",
  "Sign in or create an account": "Кіру немесе аккаунт ашу",
  "Create account": "Аккаунт ашу",
  "Username": "Пайдаланушы аты",
  "Password": "Құпиясөз",
  "at least 8 characters": "кемінде 8 таңба",
  "With an account, the sentences you speak and your practice scores are saved in the dotacs database (PostgreSQL), so they follow you to any computer.":
    "Аккаунт болса, айтқан сөйлемдеріңіз бен жаттығу ұпайларыңыз dotacs дерекқорында (PostgreSQL) сақталады, сондықтан кез келген компьютерде қолжетімді болады.",
  "sentences": "сөйлем",
  "practice rounds": "жаттығу раунды",
  "best score": "үздік ұпай",
  "Leaderboard": "Көшбасшылар",
  "Sign out": "Шығу",
  "Delete my account": "Аккаунтымды жою",
  "This permanently deletes your account, your sentences and your scores. Type your password to confirm.":
    "Бұл аккаунтыңызды, сөйлемдеріңізді және ұпайларыңызды біржола жояды. Растау үшін құпиясөзді енгізіңіз.",
  "Delete forever": "Біржола жою",
  "Your account and the leaderboard": "Аккаунтыңыз және көшбасшылар",
  "Enter a username and a password.": "Пайдаланушы аты мен құпиясөзді енгізіңіз.",
  "Username: 3 to 20 letters, numbers or _ only.": "Пайдаланушы аты: 3–20 латын әрпі, сан немесе _ ғана.",
  "Enter a valid email address.": "Дұрыс email енгізіңіз.",
  "Password: at least 8 characters.": "Құпиясөз: кемінде 8 таңба.",
  "Could not load the leaderboard.": "Көшбасшылар тізімін жүктеу мүмкін болмады.",
  "Nobody has played this one yet. Be the first!": "Мұны әлі ешкім ойнаған жоқ. Бірінші болыңыз!",
  "Database (admin only)": "Дерекқор (тек әкімші)",
  "SQL injection demo": "SQL инъекция демосы"
};

const POOL = { letters: "Әріптер", words: "Сөздер", everything: "Барлығы" };

// texts with something in them that changes (a sign, a number)
const PATTERNS = [
  [/^Hold to add “(.+)”$/, "«$1» қосу үшін ұстап тұрыңыз"],
  [/^Hold to answer with “(.+)”$/, "«$1» деп жауап беру үшін ұстап тұрыңыз"],
  [/^Added “(.+)”\. Keep holding to type it again\.$/, "«$1» қосылды. Қайта теру үшін ұстай беріңіз."],
  [/^Added “(.+)”$/, "«$1» қосылды"],
  [/^Answered “(.+)”$/, "Жауап: «$1»"],
  [/^Right now it looks like “(.+)”$/, "Қазір «$1» сияқты"],
  [/^Not sure yet\. Make the “(.+)” shape clearer\.$/, "Әзірге сенімсіз. «$1» қалпын анығырақ жасаңыз."],
  [/^That was “(.+)”\. If you are sure your sign is right, teach it this sign\.$/, "Бұл «$1» болды. Белгіңіз дұрыс екеніне сенімді болсаңыз, осы белгіні үйретіңіз."],
  [/^That was “(.+)”\. Look at the hint and try again\.$/, "Бұл «$1» болды. Кеңесті қарап, қайталап көріңіз."],
  [/^(\d+)% sure$/, "$1% сенімді"],
  [/^(\d+) signs?$/, "$1 белгі"],
  [/^best (\d+)$/, "рекорд $1"],
  [/^(\d+) taught$/, "$1 үйретілген"],
  [/^(\d+) signs? taught$/, "$1 белгі үйретілген"],
  [/^best streak (\d+)$/, "ең ұзақ серия $1"],
  [/^Your best: (\d+)$/, "Сіздің рекордыңыз: $1"],
  [/^(\d+) in a row!$/, "Қатарынан $1!"],
  [/^(\d+) rounds?$/, "$1 раунд"],
  [/^Get ready\.\.\. (\d+)$/, "Дайындалыңыз... $1"],
  [/^Saved$/, "Сақталды"],
  [/^you are #(\d+) on the (letters|words|everything) leaderboard$/, (m, n, c) => `«${POOL[c]}» тізімінде №${n} орын`],
  [/^Done! (\d+) signs? taught and saved in this browser\.$/, "Дайын! $1 белгі үйретіліп, осы браузерде сақталды."],
  [/^You have taught it (\d+) signs?: (.*)\. They are saved in this browser\. Save them to a file to use them on another computer or share them with your group\.$/,
    "Сіз $1 белгі үйреттіңіз: $2. Олар осы браузерде сақталған. Басқа компьютерде қолдану немесе тобыңызбен бөлісу үшін файлға сақтаңыз."]
];

let lang = "en";
export const getLanguage = () => lang;

// the Kazakh version of one English text, or null when there is none
function kkOf(text) {
  const key = text.replace(/\s+/g, " ").trim();
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(KK, key)) return KK[key];
  for (const [rx, rep] of PATTERNS) if (rx.test(key)) return key.replace(rx, rep);
  if (key.includes(" · ")) {          // "Camera on · 3 signs taught · aru" is translated part by part
    const parts = key.split(" · ");
    const tr = parts.map(kkOf);
    if (tr.some(Boolean)) return parts.map((p, i) => tr[i] ?? p).join(" · ");
  }
  return null;
}

// for texts the page cannot show by itself (confirm and alert boxes)
export function t(text) { return lang === "kk" ? (kkOf(text) ?? text) : text; }

// ---------------------------------------------------------------------------
// Swapping the texts on the page
// ---------------------------------------------------------------------------
const SKIP = "script, style, svg, [data-no-i18n], .glyph, .txt, .nm";
const ATTRS = ["title", "placeholder", "aria-label"];
const textMemo = new WeakMap();   // text node -> { en, kk }
const attrMemo = new WeakMap();   // element -> { attr: { en, kk } }

function withSpaces(orig, text) {
  const lead = orig.match(/^\s*/)[0], trail = orig.match(/\s*$/)[0];
  return lead + text + trail;
}

function doText(node) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const cur = node.nodeValue;
  let m = textMemo.get(node);
  // the app wrote a new text since the last swap: that is the new English original
  if (!m || (cur !== m.en && cur !== m.kk)) {
    const kk = kkOf(cur);
    m = { en: cur, kk: kk === null ? null : withSpaces(cur, kk) };
    textMemo.set(node, m);
  }
  const want = lang === "kk" && m.kk !== null ? m.kk : m.en;
  if (cur !== want) node.nodeValue = want;
}

function doAttrs(el) {
  if (el.closest(SKIP)) return;
  let memo = attrMemo.get(el);
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const cur = el.getAttribute(a);
    if (!memo) { memo = {}; attrMemo.set(el, memo); }
    let m = memo[a];
    if (!m || (cur !== m.en && cur !== m.kk)) { m = memo[a] = { en: cur, kk: kkOf(cur) }; }
    const want = lang === "kk" && m.kk !== null ? m.kk : m.en;
    if (cur !== want) el.setAttribute(a, want);
  }
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches(SKIP)) return;
  doAttrs(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n); else doAttrs(n);
  }
}

let observer = null;
export function setUiLanguage(next) {
  lang = next === "kk" ? "kk" : "en";
  document.documentElement.lang = lang;
  walk(document.body);
  if (!observer) {
    // texts the app writes later are swapped as soon as they appear
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") doText(r.target);
        else if (r.type === "attributes") doAttrs(r.target);
        else r.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
}
