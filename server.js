const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── App Setup ───────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, maxHttpBufferSize: 5e6 });

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Disable browser caching so changes always show up
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Avatar upload
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } });
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ─── In-Memory Stores ────────────────────────────────────────────────────────
const users = new Map();
const groups = new Map();
const activeGames = new Map();
const activeCalls = new Map();
const usernames = new Set();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genInvite() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

function serializeGroup(g) {
  const members = [];
  for (const sid of g.members) {
    const u = users.get(sid);
    if (u) members.push({ userId: u.userId, username: u.username, avatar: u.avatar, points: u.points, socketId: sid });
  }
  return { id: g.id, name: g.name, inviteCode: g.inviteCode, adminId: g.adminId, members, createdAt: g.createdAt, totalPoints: g.totalPoints };
}

function recalcGroupPoints(g) {
  let t = 0;
  for (const sid of g.members) { const u = users.get(sid); if (u) t += u.points; }
  g.totalPoints = t;
}

function awardPoints(socketId, pts) {
  const u = users.get(socketId);
  if (!u) return;
  u.points += pts;
  if (u.groupId) {
    const g = groups.get(u.groupId);
    if (g) recalcGroupPoints(g);
  }
  io.to(socketId).emit('user:points-update', { points: u.points });
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function scrambleWord(word) {
  let s = shuffleArray(word.split('')).join('');
  while (s === word) s = shuffleArray(word.split('')).join('');
  return s;
}

// ─── Game Data Banks ─────────────────────────────────────────────────────────
const TRIVIA_BANK = [
  { question: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1 },
  { question: "Who painted the Mona Lisa?", options: ["Van Gogh", "Picasso", "Da Vinci", "Monet"], correctIndex: 2 },
  { question: "What is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3 },
  { question: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], correctIndex: 1 },
  { question: "What element does 'O' represent on the periodic table?", options: ["Osmium", "Oxygen", "Gold", "Oganesson"], correctIndex: 1 },
  { question: "In which year did World War II end?", options: ["1943", "1944", "1945", "1946"], correctIndex: 2 },
  { question: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], correctIndex: 2 },
  { question: "Which planet has the most moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], correctIndex: 1 },
  { question: "What gas do plants primarily absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], correctIndex: 2 },
  { question: "Who wrote 'Romeo and Juliet'?", options: ["Dickens", "Shakespeare", "Austen", "Hemingway"], correctIndex: 1 },
  { question: "What is the hardest natural substance on Earth?", options: ["Gold", "Iron", "Diamond", "Platinum"], correctIndex: 2 },
  { question: "Which country has the most population?", options: ["USA", "India", "China", "Indonesia"], correctIndex: 1 },
  { question: "What is the speed of light approximately?", options: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "100,000 km/s"], correctIndex: 0 },
  { question: "What is the largest mammal?", options: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], correctIndex: 1 },
  { question: "Which instrument has 88 keys?", options: ["Guitar", "Violin", "Piano", "Harp"], correctIndex: 2 },
  { question: "What is the chemical formula for water?", options: ["H2O", "CO2", "NaCl", "O2"], correctIndex: 0 },
  { question: "Which continent is the Sahara Desert located in?", options: ["Asia", "Africa", "Australia", "South America"], correctIndex: 1 },
  { question: "What is the currency of Japan?", options: ["Won", "Yuan", "Yen", "Ringgit"], correctIndex: 2 },
  { question: "Who discovered gravity when an apple fell on his head?", options: ["Einstein", "Newton", "Galileo", "Tesla"], correctIndex: 1 },
  { question: "What color is the 'black box' in an airplane actually?", options: ["Black", "Orange", "Red", "Yellow"], correctIndex: 1 },
  { question: "How many continents are there?", options: ["5", "6", "7", "8"], correctIndex: 2 },
  { question: "Which animal is known as the 'King of the Jungle'?", options: ["Tiger", "Lion", "Elephant", "Bear"], correctIndex: 1 },
  { question: "What does DNA stand for?", options: ["Deoxyribonucleic Acid", "Dinitro Acid", "Dynamic Nuclear Acid", "None"], correctIndex: 0 },
  { question: "What is the boiling point of water in Celsius?", options: ["90°C", "100°C", "110°C", "120°C"], correctIndex: 1 },
  { question: "Which country is famous for the Great Wall?", options: ["Japan", "India", "China", "Korea"], correctIndex: 2 },
  { question: "What is the square root of 144?", options: ["10", "11", "12", "14"], correctIndex: 2 },
  { question: "Who was the first person to walk on the moon?", options: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "John Glenn"], correctIndex: 2 },
  { question: "What is the main ingredient in guacamole?", options: ["Tomato", "Avocado", "Pepper", "Onion"], correctIndex: 1 },
  { question: "Which programming language is known as the 'language of the web'?", options: ["Python", "Java", "JavaScript", "C++"], correctIndex: 2 },
  { question: "What is the longest river in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1 },
  { question: "Which organ pumps blood in the body?", options: ["Liver", "Brain", "Heart", "Lungs"], correctIndex: 2 },
  { question: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correctIndex: 1 },
  { question: "Which movie features the character 'Darth Vader'?", options: ["Star Trek", "Star Wars", "Guardians", "Alien"], correctIndex: 1 },
  { question: "What does 'www' stand for in a URL?", options: ["World Web Wide", "World Wide Web", "Web World Wide", "Wide World Web"], correctIndex: 1 },
  { question: "How many days does February have in a leap year?", options: ["28", "29", "30", "27"], correctIndex: 1 }
];

const WORD_BANK = [
  "elephant", "keyboard", "mountain", "chocolate", "universe", "dinosaur", "umbrella",
  "adventure", "butterfly", "sunflower", "telephone", "waterfall", "lightning", "treasure",
  "carnival", "marathon", "astronaut", "calendar", "firework", "goldfish", "backpack",
  "mushroom", "sandwich", "pineapple", "notebook", "champagne", "kangaroo", "flamingo",
  "paradise", "building", "harmonica", "champion", "tomorrow", "seashell", "airplane",
  "blueberry", "starfish", "pancake", "terminal", "swimming", "computer", "birthday",
  "triangle", "squirrel", "football", "honeybee", "crossing", "platinum", "guardian",
  "dolphin", "absolute", "discover", "exchange", "pharmacy"
];

const TYPE_SENTENCES = [
  "The quick brown fox jumps over the lazy dog",
  "Pack my box with five dozen liquor jugs",
  "How vexingly quick daft zebras jump",
  "The five boxing wizards jump quickly",
  "A journey of a thousand miles begins with a single step",
  "To be or not to be that is the question",
  "All that glitters is not gold but it sure looks shiny",
  "In the middle of difficulty lies opportunity and growth",
  "The only way to do great work is to love what you do",
  "Life is what happens when you are busy making other plans",
  "Stay hungry stay foolish and never stop learning new things",
  "Innovation distinguishes between a leader and a follower",
  "The best time to plant a tree was twenty years ago",
  "Do not go where the path may lead go where there is no path",
  "Every great developer you know started as a beginner once"
];

const MEMORY_EMOJIS = ['🐶', '🐱', '🦊', '🐸', '🦁', '🐯', '🐨', '🐼'];

// ─── Game Logic Helpers ──────────────────────────────────────────────────────
function checkTTTWin(board) {
  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return board.every(c => c !== null) ? 'draw' : null;
}

function rpsWinner(c1, c2) {
  if (c1 === c2) return 'draw';
  if ((c1 === 'rock' && c2 === 'scissors') || (c1 === 'scissors' && c2 === 'paper') || (c1 === 'paper' && c2 === 'rock')) return 0;
  return 1;
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // ── User Registration ──
  socket.on('user:register', ({ username, avatar }) => {
    if (!username || username.trim().length === 0) {
      return socket.emit('user:error', { message: 'Username is required' });
    }
    const uname = username.trim();
    if (usernames.has(uname.toLowerCase())) {
      return socket.emit('user:error', { message: 'Username already taken' });
    }
    const userId = uuidv4();
    usernames.add(uname.toLowerCase());
    socket.emit('user:registered', { userId, username: uname, avatar: avatar || '🦊', status: '', points: 0 });
  });

  socket.on('user:reconnect', (data) => {
    if (!data.userId || !data.username) return;
    
    // Cleanup old socket
    for (const [sid, u] of users.entries()) {
      if (u.userId === data.userId) {
        users.delete(sid);
        if (u.groupId) {
          const g = groups.get(u.groupId);
          if (g) g.members.delete(sid);
        }
      }
    }
    
    usernames.add(data.username.toLowerCase());
    const u = { 
      userId: data.userId, 
      username: data.username, 
      avatar: data.avatar || '🦊', 
      status: data.status || '', 
      points: data.points || 0, 
      groupId: data.groupId || null, 
      lastActive: Date.now() 
    };
    users.set(socket.id, u);
    
    socket.emit('user:registered', { userId: u.userId, username: u.username, avatar: u.avatar, status: u.status, points: u.points });
    
    if (u.groupId) {
      const g = groups.get(u.groupId);
      if (g) {
        g.members.add(socket.id);
        socket.join(`group:${g.id}`);
        socket.emit('group:joined', serializeGroup(g));
        socket.to(`group:${g.id}`).emit('group:member-joined', {
          groupId: g.id,
          member: { userId: u.userId, username: u.username, avatar: u.avatar, status: u.status, points: u.points, socketId: socket.id }
        });
      } else {
        u.groupId = null;
      }
    }
  });

  // ── Heartbeat ──
  socket.on('user:heartbeat', () => {
    const u = users.get(socket.id);
    if (u) {
      u.lastActive = Date.now();
      awardPoints(socket.id, 0.5);
    }
  });

  // ── Group Create ──
  socket.on('group:create', ({ name }) => {
    const u = users.get(socket.id);
    if (!u) return;
    if (!name || name.trim().length === 0) return socket.emit('user:error', { message: 'Group name is required' });
    const groupId = uuidv4();
    const inviteCode = genInvite();
    const group = {
      id: groupId, name: name.trim(), inviteCode, adminId: u.userId,
      members: new Set([socket.id]), createdAt: Date.now(), messages: [], totalPoints: u.points
    };
    groups.set(groupId, group);
    u.groupId = groupId;
    socket.join(`group:${groupId}`);
    socket.emit('group:created', serializeGroup(group));
  });

  // ── Group Join ──
  socket.on('group:join', ({ inviteCode }) => {
    const u = users.get(socket.id);
    if (!u) return;
    if (!inviteCode) return socket.emit('user:error', { message: 'Invite code is required' });
    const code = inviteCode.trim().toUpperCase();
    let targetGroup = null;
    for (const g of groups.values()) {
      if (g.inviteCode === code) { targetGroup = g; break; }
    }
    if (!targetGroup) return socket.emit('user:error', { message: 'Invalid invite code' });
    if (targetGroup.members.has(socket.id)) return socket.emit('user:error', { message: 'Already in this group' });
    targetGroup.members.add(socket.id);
    u.groupId = targetGroup.id;
    recalcGroupPoints(targetGroup);
    socket.join(`group:${targetGroup.id}`);
    socket.emit('group:joined', serializeGroup(targetGroup));
    socket.to(`group:${targetGroup.id}`).emit('group:member-joined', {
      groupId: targetGroup.id,
      member: { userId: u.userId, username: u.username, avatar: u.avatar, status: u.status, points: u.points, socketId: socket.id }
    });
  });

  // ── Group Leave ──
  socket.on('group:leave', ({ groupId }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const g = groups.get(groupId);
    if (!g) return;
    g.members.delete(socket.id);
    u.groupId = null;
    socket.leave(`group:${groupId}`);
    recalcGroupPoints(g);
    socket.to(`group:${groupId}`).emit('group:member-left', { groupId, userId: u.userId });
    // Transfer admin
    if (g.adminId === u.userId && g.members.size > 0) {
      const nextSid = g.members.values().next().value;
      const nextU = users.get(nextSid);
      if (nextU) g.adminId = nextU.userId;
    }
    if (g.members.size === 0) groups.delete(groupId);
  });

  // ── Group List ──
  socket.on('group:list', () => {
    const list = [];
    for (const g of groups.values()) {
      list.push({ id: g.id, name: g.name, memberCount: g.members.size, totalPoints: g.totalPoints });
    }
    socket.emit('group:list', list);
  });

  // ── Group Members ──
  socket.on('group:members', ({ groupId }) => {
    const g = groups.get(groupId);
    if (!g) return;
    const members = [];
    for (const sid of g.members) {
      const u = users.get(sid);
      if (u) members.push({ userId: u.userId, username: u.username, avatar: u.avatar, status: u.status, points: u.points, socketId: sid });
    }
    socket.emit('group:members', members);
  });

  // ── Chat ──
  socket.on('chat:send', ({ groupId, text }) => {
    const u = users.get(socket.id);
    if (!u || !text) return;
    const g = groups.get(groupId);
    if (!g) return;
    const msg = {
      id: uuidv4(), senderId: u.userId, senderName: u.username, senderAvatar: u.avatar,
      text: text.trim(), timestamp: Date.now(), groupId, reactions: {}
    };
    
    // Dice roller intercept
    if (msg.text === '/roll') {
      const roll = Math.floor(Math.random() * 6) + 1;
      msg.text = `🎲 Rolled a ${roll}!`;
      msg.isSystem = true;
    }

    g.messages.push(msg);
    if (g.messages.length > 200) g.messages.shift();
    io.to(`group:${groupId}`).emit('chat:message', msg);
  });

  socket.on('chat:history', ({ groupId }) => {
    const g = groups.get(groupId);
    if (!g) return socket.emit('chat:history', { groupId, messages: [] });
    socket.emit('chat:history', { groupId, messages: g.messages });
  });

  socket.on('chat:cross-group', ({ fromGroupId, toGroupId, text }) => {
    const u = users.get(socket.id);
    if (!u || !text) return;
    const fromG = groups.get(fromGroupId);
    const toG = groups.get(toGroupId);
    if (!fromG || !toG) return;
    const msg = {
      fromGroupId, fromGroupName: fromG.name,
      senderId: u.userId, senderName: u.username, senderAvatar: u.avatar,
      text: text.trim(), timestamp: Date.now()
    };
    io.to(`group:${toGroupId}`).emit('chat:cross-group-message', msg);
    // Also echo back to sender's group
    io.to(`group:${fromGroupId}`).emit('chat:cross-group-message', { ...msg, fromGroupName: `You → ${toG.name}` });
  });

  socket.on('chat:react', ({ groupId, messageId, emoji }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const g = groups.get(groupId);
    if (!g) return;
    const msg = g.messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    if (!msg.reactions[emoji].includes(u.userId)) {
      msg.reactions[emoji].push(u.userId);
      io.to(`group:${groupId}`).emit('chat:reaction-updated', { messageId, reactions: msg.reactions });
    }
  });

  socket.on('chat:typing', ({ groupId, isTyping }) => {
    const u = users.get(socket.id);
    if (!u) return;
    socket.to(`group:${groupId}`).emit('chat:typing', { userId: u.userId, username: u.username, isTyping });
  });

  socket.on('poll:create', ({ groupId, question, options }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const g = groups.get(groupId);
    if (!g) return;
    const pollId = uuidv4();
    const pollOpts = options.map((opt, i) => ({ id: i, text: opt, votes: [] }));
    const msg = {
      id: pollId, senderId: u.userId, senderName: u.username, senderAvatar: u.avatar,
      isPoll: true, question, options: pollOpts, timestamp: Date.now(), groupId
    };
    g.messages.push(msg);
    io.to(`group:${groupId}`).emit('chat:message', msg);
  });

  socket.on('poll:vote', ({ groupId, pollId, optionId }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const g = groups.get(groupId);
    if (!g) return;
    const poll = g.messages.find(m => m.id === pollId && m.isPoll);
    if (!poll) return;
    
    // Remove existing vote
    poll.options.forEach(opt => {
      opt.votes = opt.votes.filter(id => id !== u.userId);
    });
    // Add new vote
    const opt = poll.options.find(o => o.id === optionId);
    if (opt) {
      opt.votes.push(u.userId);
      io.to(`group:${groupId}`).emit('poll:updated', { pollId, options: poll.options });
    }
  });

  socket.on('user:status', ({ status }) => {
    const u = users.get(socket.id);
    if (!u) return;
    u.status = status;
    if (u.groupId) {
      io.to(`group:${u.groupId}`).emit('user:status-updated', { userId: u.userId, status });
    }
  });

  // ── Video Call Signaling ──
  socket.on('call:join', ({ groupId }) => {
    const u = users.get(socket.id);
    if (!u) return;
    if (!activeCalls.has(groupId)) activeCalls.set(groupId, new Set());
    const callSet = activeCalls.get(groupId);
    // Send existing users to the joiner
    const existing = [];
    for (const sid of callSet) {
      const eu = users.get(sid);
      if (eu) existing.push({ userId: eu.userId, username: eu.username, avatar: eu.avatar, socketId: sid });
    }
    socket.emit('call:existing-users', existing);
    callSet.add(socket.id);
    socket.to(`group:${groupId}`).emit('call:user-joined', { userId: u.userId, username: u.username, avatar: u.avatar, socketId: socket.id });
  });

  socket.on('call:signal', ({ targetSocketId, signal }) => {
    io.to(targetSocketId).emit('call:signal', { fromSocketId: socket.id, signal });
  });

  socket.on('call:leave', ({ groupId }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const callSet = activeCalls.get(groupId);
    if (callSet) {
      callSet.delete(socket.id);
      if (callSet.size === 0) activeCalls.delete(groupId);
    }
    socket.to(`group:${groupId}`).emit('call:user-left', { userId: u.userId, socketId: socket.id });
  });

  // ── Whiteboard ──
  socket.on('wb:draw', ({ groupId, stroke }) => {
    const u = users.get(socket.id);
    if (!u) return;
    socket.to(`group:${groupId}`).emit('wb:draw', { userId: u.userId, stroke });
  });

  socket.on('wb:clear', ({ groupId }) => {
    io.to(`group:${groupId}`).emit('wb:clear');
  });

  socket.on('wb:undo', ({ groupId }) => {
    const u = users.get(socket.id);
    if (!u) return;
    socket.to(`group:${groupId}`).emit('wb:undo', { userId: u.userId });
  });

  // ── Games ──
  socket.on('game:create', ({ groupId, gameType }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const gameId = uuidv4();
    const player = { socketId: socket.id, userId: u.userId, username: u.username, avatar: u.avatar, score: 0 };
    let game = { gameId, gameType, groupId, creator: socket.id, players: [player], status: 'waiting' };

    switch (gameType) {
      case 'tictactoe':
        game.board = Array(9).fill(null);
        game.currentPlayerIndex = 0;
        game.symbols = ['X', 'O'];
        game.maxPlayers = 2;
        break;
      case 'rps':
        game.round = 0;
        game.maxRounds = 5;
        game.choices = {};
        game.maxPlayers = 2;
        break;
      case 'trivia':
        game.questions = shuffleArray(TRIVIA_BANK).slice(0, 10);
        game.currentQuestion = -1;
        game.answers = {};
        game.timer = null;
        game.firstCorrect = null;
        game.maxPlayers = 20;
        break;
      case 'wordscramble':
        game.words = shuffleArray(WORD_BANK).slice(0, 8);
        game.currentRound = -1;
        game.currentWord = '';
        game.scrambled = '';
        game.timer = null;
        game.roundWinner = null;
        game.maxPlayers = 20;
        break;
      case 'reaction':
        game.round = 0;
        game.maxRounds = 5;
        game.phase = 'idle';
        game.goTime = 0;
        game.roundResults = {};
        game.timer = null;
        game.maxPlayers = 20;
        break;
      case 'memory':
        const emojis = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
        game.board = shuffleArray(emojis);
        game.revealed = Array(16).fill(false);
        game.matched = Array(16).fill(false);
        game.currentPlayerIndex = 0;
        game.flipped = [];
        game.flipTimer = null;
        game.maxPlayers = 2;
        break;
      case 'typeracer':
        game.sentences = shuffleArray(TYPE_SENTENCES).slice(0, 3);
        game.currentRound = -1;
        game.currentSentence = '';
        game.startTime = 0;
        game.finishOrder = [];
        game.maxPlayers = 20;
        break;
    }

    activeGames.set(gameId, game);
    io.to(`group:${groupId}`).emit('game:created', {
      gameId, gameType, creator: player, players: game.players, status: 'waiting', maxPlayers: game.maxPlayers
    });
  });

  socket.on('game:join', ({ gameId }) => {
    const u = users.get(socket.id);
    if (!u) return;
    const game = activeGames.get(gameId);
    if (!game || game.status !== 'waiting') return;
    if (game.players.find(p => p.socketId === socket.id)) return;
    if (game.players.length >= game.maxPlayers) return socket.emit('user:error', { message: 'Game is full' });
    const player = { socketId: socket.id, userId: u.userId, username: u.username, avatar: u.avatar, score: 0 };
    game.players.push(player);
    io.to(`group:${game.groupId}`).emit('game:player-joined', { gameId, player, players: game.players });
  });

  socket.on('game:start', ({ gameId }) => {
    const game = activeGames.get(gameId);
    if (!game || game.status !== 'waiting') return;
    if (game.creator !== socket.id) return;
    const minP = (game.gameType === 'tictactoe' || game.gameType === 'rps' || game.gameType === 'memory') ? 2 : 2;
    if (game.players.length < minP) return socket.emit('user:error', { message: `Need at least ${minP} players` });
    game.status = 'playing';

    switch (game.gameType) {
      case 'tictactoe':
        io.to(`group:${game.groupId}`).emit('game:started', {
          gameId, state: { board: game.board, currentPlayerIndex: 0, players: game.players, symbols: game.symbols }
        });
        break;
      case 'rps':
        game.round = 1;
        game.choices = {};
        io.to(`group:${game.groupId}`).emit('game:started', {
          gameId, state: { round: 1, maxRounds: 5, players: game.players }
        });
        break;
      case 'trivia':
        game.currentQuestion = 0;
        startTriviaRound(game);
        break;
      case 'wordscramble':
        game.currentRound = 0;
        startWordScrambleRound(game);
        break;
      case 'reaction':
        game.round = 1;
        startReactionRound(game);
        break;
      case 'memory':
        io.to(`group:${game.groupId}`).emit('game:started', {
          gameId, state: {
            boardSize: 16, matched: game.matched, revealed: game.revealed,
            currentPlayerIndex: 0, players: game.players, flipped: []
          }
        });
        break;
      case 'typeracer':
        game.currentRound = 0;
        startTypeRacerRound(game);
        break;
    }
  });

  socket.on('game:move', ({ gameId, move }) => {
    const game = activeGames.get(gameId);
    if (!game || game.status !== 'playing') return;
    const playerIdx = game.players.findIndex(p => p.socketId === socket.id);
    if (playerIdx === -1) return;

    switch (game.gameType) {
      case 'tictactoe': handleTTTMove(game, playerIdx, move); break;
      case 'rps': handleRPSMove(game, playerIdx, move); break;
      case 'trivia': handleTriviaMove(game, playerIdx, move); break;
      case 'wordscramble': handleWordScrambleMove(game, playerIdx, move); break;
      case 'reaction': handleReactionMove(game, playerIdx, move); break;
      case 'memory': handleMemoryMove(game, playerIdx, move); break;
      case 'typeracer': handleTypeRacerMove(game, playerIdx, move); break;
    }
  });

  socket.on('game:leave', ({ gameId }) => {
    const game = activeGames.get(gameId);
    if (!game) return;
    game.players = game.players.filter(p => p.socketId !== socket.id);
    if (game.players.length === 0) {
      if (game.timer) clearTimeout(game.timer);
      activeGames.delete(gameId);
    } else {
      io.to(`group:${game.groupId}`).emit('game:update', {
        gameId, type: 'player-left', state: { players: game.players }
      });
    }
  });

  // ── Leaderboard ──
  socket.on('points:leaderboard', () => {
    const groupsList = [];
    for (const g of groups.values()) {
      groupsList.push({ name: g.name, totalPoints: g.totalPoints, memberCount: g.members.size });
    }
    groupsList.sort((a, b) => b.totalPoints - a.totalPoints);

    const usersList = [];
    for (const u of users.values()) {
      let gName = '';
      if (u.groupId) { const g = groups.get(u.groupId); if (g) gName = g.name; }
      usersList.push({ username: u.username, avatar: u.avatar, points: u.points, groupName: gName });
    }
    usersList.sort((a, b) => b.points - a.points);

    socket.emit('points:leaderboard', { groups: groupsList, users: usersList.slice(0, 20) });
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (!u) return;
    console.log(`Disconnected: ${socket.id} (${u.username})`);

    // Remove from calls
    for (const [gid, callSet] of activeCalls) {
      if (callSet.has(socket.id)) {
        callSet.delete(socket.id);
        io.to(`group:${gid}`).emit('call:user-left', { userId: u.userId, socketId: socket.id });
        if (callSet.size === 0) activeCalls.delete(gid);
      }
    }

    // Remove from games
    for (const [gid, game] of activeGames) {
      const idx = game.players.findIndex(p => p.socketId === socket.id);
      if (idx !== -1) {
        game.players.splice(idx, 1);
        if (game.players.length === 0) {
          if (game.timer) clearTimeout(game.timer);
          activeGames.delete(gid);
        } else {
          io.to(`group:${game.groupId}`).emit('game:update', { gameId: gid, type: 'player-left', state: { players: game.players } });
        }
      }
    }

    // Remove from group
    if (u.groupId) {
      const g = groups.get(u.groupId);
      if (g) {
        g.members.delete(socket.id);
        recalcGroupPoints(g);
        io.to(`group:${u.groupId}`).emit('group:member-left', { groupId: u.groupId, userId: u.userId });
        if (g.adminId === u.userId && g.members.size > 0) {
          const nextSid = g.members.values().next().value;
          const nextU = users.get(nextSid);
          if (nextU) g.adminId = nextU.userId;
        }
        if (g.members.size === 0) groups.delete(u.groupId);
      }
    }

    usernames.delete(u.username.toLowerCase());
    users.delete(socket.id);
  });
});

// ─── Game Handler Functions ──────────────────────────────────────────────────

// Tic-Tac-Toe
function handleTTTMove(game, playerIdx, move) {
  if (playerIdx !== game.currentPlayerIndex) return;
  const pos = move.position;
  if (pos < 0 || pos > 8 || game.board[pos] !== null) return;
  game.board[pos] = game.symbols[playerIdx];
  const result = checkTTTWin(game.board);
  if (result) {
    game.status = 'finished';
    const isWin = result !== 'draw';
    const winner = isWin ? game.players[playerIdx] : null;
    if (isWin) {
      awardPoints(game.players[playerIdx].socketId, 10);
    } else {
      game.players.forEach(p => awardPoints(p.socketId, 2));
    }
    io.to(`group:${game.groupId}`).emit('game:finished', {
      gameId: game.gameId, winner: winner ? { userId: winner.userId, username: winner.username } : null,
      isDraw: !isWin, scores: game.players.map(p => ({ username: p.username, score: p.score })),
      pointsAwarded: isWin ? { [winner.username]: 10 } : Object.fromEntries(game.players.map(p => [p.username, 2]))
    });
    activeGames.delete(game.gameId);
  } else {
    game.currentPlayerIndex = 1 - game.currentPlayerIndex;
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'move', state: { board: game.board, currentPlayerIndex: game.currentPlayerIndex, players: game.players }
    });
  }
}

// Rock-Paper-Scissors
function handleRPSMove(game, playerIdx, move) {
  if (game.players.length !== 2) return;
  game.choices[playerIdx] = move.choice;
  io.to(game.players[playerIdx].socketId).emit('game:update', {
    gameId: game.gameId, type: 'chosen', state: { playerIndex: playerIdx }
  });
  if (Object.keys(game.choices).length === 2) {
    const w = rpsWinner(game.choices[0], game.choices[1]);
    if (w === 0) game.players[0].score++;
    else if (w === 1) game.players[1].score++;
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'reveal',
      state: {
        choices: { [game.players[0].username]: game.choices[0], [game.players[1].username]: game.choices[1] },
        roundWinner: w === 'draw' ? null : game.players[w].username,
        round: game.round, maxRounds: game.maxRounds,
        players: game.players
      }
    });
    game.choices = {};
    if (game.round >= game.maxRounds) {
      game.status = 'finished';
      const winner = game.players[0].score > game.players[1].score ? game.players[0] :
                     game.players[1].score > game.players[0].score ? game.players[1] : null;
      if (winner) {
        awardPoints(winner.socketId, 15);
        const loser = game.players.find(p => p.socketId !== winner.socketId);
        if (loser) awardPoints(loser.socketId, 3);
      } else {
        game.players.forEach(p => awardPoints(p.socketId, 5));
      }
      setTimeout(() => {
        io.to(`group:${game.groupId}`).emit('game:finished', {
          gameId: game.gameId, winner: winner ? { userId: winner.userId, username: winner.username } : null,
          isDraw: !winner, scores: game.players.map(p => ({ username: p.username, score: p.score })),
          pointsAwarded: winner ? { [winner.username]: 15, [game.players.find(p => p !== winner).username]: 3 } : Object.fromEntries(game.players.map(p => [p.username, 5]))
        });
        activeGames.delete(game.gameId);
      }, 2000);
    } else {
      game.round++;
      setTimeout(() => {
        io.to(`group:${game.groupId}`).emit('game:update', {
          gameId: game.gameId, type: 'new-round', state: { round: game.round, maxRounds: game.maxRounds, players: game.players }
        });
      }, 2500);
    }
  }
}

// Trivia
function startTriviaRound(game) {
  if (game.currentQuestion >= game.questions.length) {
    finishTrivia(game);
    return;
  }
  game.answers = {};
  game.firstCorrect = null;
  const q = game.questions[game.currentQuestion];
  io.to(`group:${game.groupId}`).emit('game:update', {
    gameId: game.gameId, type: 'question',
    state: {
      questionIndex: game.currentQuestion, question: q.question, options: q.options,
      totalQuestions: game.questions.length, players: game.players, timeLimit: 15
    }
  });
  game.timer = setTimeout(() => {
    revealTrivia(game);
  }, 15000);
}

function handleTriviaMove(game, playerIdx, move) {
  if (game.answers[playerIdx] !== undefined) return;
  game.answers[playerIdx] = move.answerIndex;
  const q = game.questions[game.currentQuestion];
  if (move.answerIndex === q.correctIndex) {
    if (game.firstCorrect === null) {
      game.firstCorrect = playerIdx;
      game.players[playerIdx].score += 5;
    } else {
      game.players[playerIdx].score += 3;
    }
  }
  // Check if all answered
  if (Object.keys(game.answers).length === game.players.length) {
    clearTimeout(game.timer);
    revealTrivia(game);
  }
}

function revealTrivia(game) {
  const q = game.questions[game.currentQuestion];
  io.to(`group:${game.groupId}`).emit('game:update', {
    gameId: game.gameId, type: 'reveal',
    state: {
      correctIndex: q.correctIndex, answers: game.answers, players: game.players,
      firstCorrect: game.firstCorrect !== null ? game.players[game.firstCorrect].username : null,
      questionIndex: game.currentQuestion
    }
  });
  game.currentQuestion++;
  game.timer = setTimeout(() => startTriviaRound(game), 3000);
}

function finishTrivia(game) {
  game.status = 'finished';
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  awardPoints(winner.socketId, 15);
  game.players.forEach(p => { if (p.socketId !== winner.socketId) awardPoints(p.socketId, 3); });
  io.to(`group:${game.groupId}`).emit('game:finished', {
    gameId: game.gameId, winner: { userId: winner.userId, username: winner.username },
    scores: game.players.map(p => ({ username: p.username, score: p.score })),
    pointsAwarded: Object.fromEntries(game.players.map(p => [p.username, p.socketId === winner.socketId ? 15 : 3]))
  });
  activeGames.delete(game.gameId);
}

// Word Scramble
function startWordScrambleRound(game) {
  if (game.currentRound >= game.words.length) {
    finishWordScramble(game);
    return;
  }
  game.currentWord = game.words[game.currentRound];
  game.scrambled = scrambleWord(game.currentWord);
  game.roundWinner = null;
  io.to(`group:${game.groupId}`).emit('game:update', {
    gameId: game.gameId, type: 'word',
    state: {
      scrambled: game.scrambled, round: game.currentRound + 1,
      totalRounds: game.words.length, players: game.players, timeLimit: 20
    }
  });
  game.timer = setTimeout(() => {
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'reveal',
      state: { answer: game.currentWord, winner: null, round: game.currentRound + 1, players: game.players }
    });
    game.currentRound++;
    game.timer = setTimeout(() => startWordScrambleRound(game), 3000);
  }, 20000);
}

function handleWordScrambleMove(game, playerIdx, move) {
  if (game.roundWinner !== null) return;
  if (move.answer && move.answer.trim().toLowerCase() === game.currentWord.toLowerCase()) {
    game.roundWinner = playerIdx;
    game.players[playerIdx].score += 5;
    clearTimeout(game.timer);
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'reveal',
      state: {
        answer: game.currentWord, winner: game.players[playerIdx].username,
        round: game.currentRound + 1, players: game.players
      }
    });
    game.currentRound++;
    game.timer = setTimeout(() => startWordScrambleRound(game), 3000);
  }
}

function finishWordScramble(game) {
  game.status = 'finished';
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  awardPoints(winner.socketId, 15);
  game.players.forEach(p => { if (p.socketId !== winner.socketId) awardPoints(p.socketId, 3); });
  io.to(`group:${game.groupId}`).emit('game:finished', {
    gameId: game.gameId, winner: { userId: winner.userId, username: winner.username },
    scores: game.players.map(p => ({ username: p.username, score: p.score })),
    pointsAwarded: Object.fromEntries(game.players.map(p => [p.username, p.socketId === winner.socketId ? 15 : 3]))
  });
  activeGames.delete(game.gameId);
}

// Reaction Test
function startReactionRound(game) {
  if (game.round > game.maxRounds) {
    finishReaction(game);
    return;
  }
  game.phase = 'countdown';
  game.roundResults = {};
  io.to(`group:${game.groupId}`).emit('game:update', {
    gameId: game.gameId, type: 'countdown', state: { round: game.round, maxRounds: game.maxRounds }
  });
  game.timer = setTimeout(() => {
    game.phase = 'wait';
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'wait', state: { round: game.round }
    });
    const delay = 2000 + Math.random() * 4000;
    game.timer = setTimeout(() => {
      game.phase = 'go';
      game.goTime = Date.now();
      io.to(`group:${game.groupId}`).emit('game:update', {
        gameId: game.gameId, type: 'go', state: { round: game.round, goTime: game.goTime }
      });
      game.timer = setTimeout(() => {
        finishReactionRound(game);
      }, 3000);
    }, delay);
  }, 3000);
}

function handleReactionMove(game, playerIdx, move) {
  if (game.roundResults[playerIdx] !== undefined) return;
  if (game.phase === 'wait') {
    game.roundResults[playerIdx] = 9999; // false start
  } else if (game.phase === 'go') {
    game.roundResults[playerIdx] = Math.max(1, move.reactionTime || 9999);
  }
  if (Object.keys(game.roundResults).length === game.players.length) {
    clearTimeout(game.timer);
    finishReactionRound(game);
  }
}

function finishReactionRound(game) {
  // Anyone who didn't respond gets max time
  game.players.forEach((_, i) => {
    if (game.roundResults[i] === undefined) game.roundResults[i] = 9999;
  });
  // Accumulate total times
  game.players.forEach((p, i) => {
    if (!p.totalTime) p.totalTime = 0;
    p.totalTime += game.roundResults[i];
    if (!p.roundTimes) p.roundTimes = [];
    p.roundTimes.push(game.roundResults[i]);
  });
  io.to(`group:${game.groupId}`).emit('game:update', {
    gameId: game.gameId, type: 'roundOver',
    state: {
      round: game.round, maxRounds: game.maxRounds,
      results: game.players.map((p, i) => ({ username: p.username, time: game.roundResults[i], totalTime: p.totalTime })),
      players: game.players
    }
  });
  game.round++;
  game.phase = 'idle';
  game.timer = setTimeout(() => startReactionRound(game), 3000);
}

function finishReaction(game) {
  game.status = 'finished';
  const sorted = [...game.players].sort((a, b) => (a.totalTime || 99999) - (b.totalTime || 99999));
  const winner = sorted[0];
  awardPoints(winner.socketId, 15);
  game.players.forEach(p => { if (p.socketId !== winner.socketId) awardPoints(p.socketId, 3); });
  io.to(`group:${game.groupId}`).emit('game:finished', {
    gameId: game.gameId, winner: { userId: winner.userId, username: winner.username },
    scores: game.players.map(p => ({ username: p.username, score: p.totalTime || 99999 })),
    pointsAwarded: Object.fromEntries(game.players.map(p => [p.username, p.socketId === winner.socketId ? 15 : 3]))
  });
  activeGames.delete(game.gameId);
}

// Memory Cards
function handleMemoryMove(game, playerIdx, move) {
  if (playerIdx !== game.currentPlayerIndex) return;
  const pos = move.position;
  if (pos < 0 || pos > 15 || game.matched[pos] || game.revealed[pos]) return;
  game.revealed[pos] = true;
  game.flipped.push(pos);

  if (game.flipped.length === 1) {
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'flip',
      state: {
        position: pos, emoji: game.board[pos], revealed: game.revealed,
        matched: game.matched, currentPlayerIndex: game.currentPlayerIndex, players: game.players, flipped: game.flipped
      }
    });
  } else if (game.flipped.length === 2) {
    const [p1, p2] = game.flipped;
    const isMatch = game.board[p1] === game.board[p2];

    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'flip',
      state: {
        position: pos, emoji: game.board[pos], revealed: game.revealed,
        matched: game.matched, currentPlayerIndex: game.currentPlayerIndex, players: game.players, flipped: game.flipped
      }
    });

    if (isMatch) {
      game.matched[p1] = true;
      game.matched[p2] = true;
      game.players[playerIdx].score++;
      game.flipped = [];
      // Check if all matched
      if (game.matched.every(m => m)) {
        game.status = 'finished';
        const winner = game.players[0].score > game.players[1].score ? game.players[0] :
                       game.players[1].score > game.players[0].score ? game.players[1] : null;
        if (winner) {
          awardPoints(winner.socketId, 15);
          game.players.forEach(p => { if (p.socketId !== winner.socketId) awardPoints(p.socketId, 5); });
        } else {
          game.players.forEach(p => awardPoints(p.socketId, 8));
        }
        setTimeout(() => {
          io.to(`group:${game.groupId}`).emit('game:finished', {
            gameId: game.gameId, winner: winner ? { userId: winner.userId, username: winner.username } : null,
            isDraw: !winner, scores: game.players.map(p => ({ username: p.username, score: p.score })),
            pointsAwarded: winner ? { [winner.username]: 15 } : Object.fromEntries(game.players.map(p => [p.username, 8]))
          });
          activeGames.delete(game.gameId);
        }, 1000);
      } else {
        setTimeout(() => {
          io.to(`group:${game.groupId}`).emit('game:update', {
            gameId: game.gameId, type: 'match',
            state: { matched: game.matched, revealed: game.revealed, currentPlayerIndex: game.currentPlayerIndex, players: game.players, flipped: [] }
          });
        }, 600);
      }
    } else {
      // No match - flip back after delay
      game.flipTimer = setTimeout(() => {
        game.revealed[p1] = false;
        game.revealed[p2] = false;
        game.flipped = [];
        game.currentPlayerIndex = 1 - game.currentPlayerIndex;
        io.to(`group:${game.groupId}`).emit('game:update', {
          gameId: game.gameId, type: 'no-match',
          state: { revealed: game.revealed, matched: game.matched, currentPlayerIndex: game.currentPlayerIndex, players: game.players, flipped: [] }
        });
      }, 1000);
    }
  }
}

// Type Racer
function startTypeRacerRound(game) {
  if (game.currentRound >= game.sentences.length) {
    finishTypeRacer(game);
    return;
  }
  game.currentSentence = game.sentences[game.currentRound];
  game.startTime = Date.now();
  game.finishOrder = [];
  io.to(`group:${game.groupId}`).emit('game:update', {
    gameId: game.gameId, type: 'sentence',
    state: {
      sentence: game.currentSentence, round: game.currentRound + 1,
      totalRounds: game.sentences.length, players: game.players, startTime: game.startTime
    }
  });
}

function handleTypeRacerMove(game, playerIdx, move) {
  if (game.finishOrder.includes(playerIdx)) return;
  if (move.typed === game.currentSentence) {
    game.finishOrder.push(playerIdx);
    const elapsed = (Date.now() - game.startTime) / 1000;
    const wordCount = game.currentSentence.split(' ').length;
    const wpm = Math.round((wordCount / elapsed) * 60);
    game.players[playerIdx].wpm = wpm;
    const position = game.finishOrder.length;
    const pts = position === 1 ? 8 : position === 2 ? 5 : position === 3 ? 3 : 1;
    game.players[playerIdx].score += pts;

    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'player-finished',
      state: {
        username: game.players[playerIdx].username, position, wpm,
        finishedCount: game.finishOrder.length, totalPlayers: game.players.length,
        players: game.players
      }
    });

    if (game.finishOrder.length === game.players.length) {
      game.currentRound++;
      setTimeout(() => startTypeRacerRound(game), 3000);
    }
  } else if (move.progress !== undefined) {
    // Progress update
    io.to(`group:${game.groupId}`).emit('game:update', {
      gameId: game.gameId, type: 'progress',
      state: { username: game.players[playerIdx].username, progress: move.progress }
    });
  }
}

function finishTypeRacer(game) {
  game.status = 'finished';
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  awardPoints(winner.socketId, 15);
  game.players.forEach(p => { if (p.socketId !== winner.socketId) awardPoints(p.socketId, 3); });
  io.to(`group:${game.groupId}`).emit('game:finished', {
    gameId: game.gameId, winner: { userId: winner.userId, username: winner.username },
    scores: game.players.map(p => ({ username: p.username, score: p.score, wpm: p.wpm || 0 })),
    pointsAwarded: Object.fromEntries(game.players.map(p => [p.username, p.socketId === winner.socketId ? 15 : 3]))
  });
  activeGames.delete(game.gameId);
}

// ─── Start Server ────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚀 FriendZone server running at http://0.0.0.0:${PORT}\n`);
});
