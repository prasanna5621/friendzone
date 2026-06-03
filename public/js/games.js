window.Games = {
  activeGameType: null,

  init() {
    // Lobby selection
    document.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', () => {
        const type = card.dataset.game;
        socket.emit('game:create', { groupId: AppState.currentGroupId, gameType: type });
      });
    });

    // Waiting room actions
    document.getElementById('btn-game-join').addEventListener('click', () => {
      socket.emit('game:join', { gameId: AppState.currentGameId });
    });
    
    document.getElementById('btn-game-start').addEventListener('click', () => {
      socket.emit('game:start', { gameId: AppState.currentGameId });
    });
    
    document.getElementById('btn-game-cancel').addEventListener('click', () => {
      socket.emit('game:leave', { gameId: AppState.currentGameId });
      this.showLobby();
    });

    // Post-game actions
    document.getElementById('btn-game-back').addEventListener('click', () => {
      this.showLobby();
    });

    // Socket events
    socket.on('game:created', (state) => {
      AppState.currentGameId = state.id;
      this.activeGameType = state.type;
      this.showWaitingRoom(state);
    });

    socket.on('game:player-joined', (state) => {
      this.showWaitingRoom(state);
    });

    socket.on('game:started', (state) => {
      this.showArena(state);
    });

    socket.on('game:update', (state) => {
      this.updateArena(state);
    });

    socket.on('game:finished', (results) => {
      this.showResults(results);
      if (results.winners && results.winners.includes(AppState.username)) {
        App.playSound('success');
        App.triggerConfetti();
      }
    });
  },

  showLobby() {
    AppState.currentGameId = null;
    this.activeGameType = null;
    document.getElementById('game-lobby').style.display = 'block';
    document.getElementById('game-waiting').style.display = 'none';
    document.getElementById('game-arena').style.display = 'none';
  },

  showWaitingRoom(state) {
    document.getElementById('game-lobby').style.display = 'none';
    document.getElementById('game-waiting').style.display = 'flex';
    document.getElementById('game-arena').style.display = 'none';

    const titleMap = { tictactoe: 'Tic-Tac-Toe', rps: 'Rock Paper Scissors', trivia: 'Trivia Quiz', wordscramble: 'Word Scramble', reaction: 'Reaction Test', memory: 'Memory Cards', typeracer: 'Type Racer' };
    document.getElementById('game-waiting-title').textContent = `${titleMap[state.type]} - Waiting Room`;

    const playersDiv = document.getElementById('game-waiting-players');
    playersDiv.innerHTML = state.players.map(p => `
      <div class="waiting-player">
        <div class="avatar">${p.avatar}</div>
        <span>${p.username}</span>
      </div>
    `).join('');

    const amInGame = state.players.find(p => p.userId === AppState.userId);
    const isAdmin = state.creatorId === AppState.userId;

    document.getElementById('btn-game-join').style.display = amInGame ? 'none' : 'inline-flex';
    document.getElementById('btn-game-start').style.display = isAdmin ? 'inline-flex' : 'none';
  },

  showArena(state) {
    document.getElementById('game-waiting').style.display = 'none';
    document.getElementById('game-arena').style.display = 'flex';
    document.getElementById('game-result').style.display = 'none';
    
    const titleMap = { tictactoe: 'Tic-Tac-Toe', rps: 'Rock Paper Scissors', trivia: 'Trivia Quiz', wordscramble: 'Word Scramble', reaction: 'Reaction Test', memory: 'Memory Cards', typeracer: 'Type Racer' };
    document.getElementById('game-arena-title').textContent = titleMap[state.type];
    
    this.updateArena(state);
  },

  updateArena(state) {
    this.updateScores(state);
    const board = document.getElementById('game-board');
    const status = document.getElementById('game-status');

    if (state.type === 'tictactoe') this.renderTicTacToe(state, board, status);
    else if (state.type === 'rps') this.renderRPS(state, board, status);
    else if (state.type === 'trivia') this.renderTrivia(state, board, status);
    else if (state.type === 'wordscramble') this.renderWordScramble(state, board, status);
    else if (state.type === 'reaction') this.renderReaction(state, board, status);
    else if (state.type === 'memory') this.renderMemory(state, board, status);
    else if (state.type === 'typeracer') this.renderTypeRacer(state, board, status);
  },

  updateScores(state) {
    const scoresDiv = document.getElementById('game-score-display');
    if (!state.players) return;
    
    scoresDiv.innerHTML = state.players.map(p => `
      <div class="player-score">
        <span class="pts">${p.score || 0}</span>
        <span class="name">${p.username}</span>
      </div>
    `).join('');
  },

  showResults(results) {
    const overlay = document.getElementById('game-result');
    overlay.style.display = 'flex';
    
    document.getElementById('game-result-title').textContent = results.title || 'Game Over!';
    
    let html = '';
    if (results.winners) {
      html += `<h3>Winner: ${results.winners.join(', ')}</h3>`;
    }
    
    if (results.pointsAwarded) {
      html += `<div style="margin:20px 0;display:flex;flex-direction:column;gap:10px">`;
      results.pointsAwarded.forEach(p => {
        html += `<div>${p.username}: <span style="color:var(--warning)">+${p.points} pts</span></div>`;
      });
      html += `</div>`;
    }
    
    document.getElementById('game-result-details').innerHTML = html;
  },

  // === TIC TAC TOE ===
  renderTicTacToe(state, board, status) {
    board.innerHTML = `<div class="ttt-grid"></div>`;
    const grid = board.querySelector('.ttt-grid');
    
    const myPlayer = state.players.find(p => p.userId === AppState.userId);
    const isMyTurn = state.status === 'playing' && state.players[state.currentPlayerIndex].userId === AppState.userId;
    
    status.textContent = isMyTurn ? 'Your turn!' : `${state.players[state.currentPlayerIndex].username}'s turn`;

    state.board.forEach((cell, i) => {
      const div = document.createElement('div');
      div.className = `ttt-cell ${cell ? 'filled' : ''} ${cell === 'X' ? 'x' : cell === 'O' ? 'o' : ''}`;
      div.textContent = cell || '';
      
      if (!cell && isMyTurn) {
        div.addEventListener('click', () => {
          socket.emit('game:move', { gameId: state.id, move: { position: i } });
        });
      }
      grid.appendChild(div);
    });
  },

  // === ROCK PAPER SCISSORS ===
  renderRPS(state, board, status) {
    const myPlayer = state.players.find(p => p.userId === AppState.userId);
    const roundTxt = `Round ${state.round} of ${state.maxRounds}`;
    status.textContent = roundTxt;

    if (state.updateType === 'reveal') {
      const p1 = state.players[0];
      const p2 = state.players[1];
      const emojis = { rock: '✊', paper: '✋', scissors: '✌️' };
      board.innerHTML = `
        <h3 style="margin-bottom:20px">${state.roundResult}</h3>
        <div style="display:flex; gap: 40px; font-size:64px">
          <div style="text-align:center">
            <div>${emojis[p1.choice]}</div>
            <div style="font-size:16px">${p1.username}</div>
          </div>
          <div style="text-align:center">
            <div>${emojis[p2.choice]}</div>
            <div style="font-size:16px">${p2.username}</div>
          </div>
        </div>
      `;
    } else {
      if (myPlayer && myPlayer.choice) {
        board.innerHTML = `<h2>Waiting for opponent...</h2>`;
      } else if (myPlayer) {
        board.innerHTML = `
          <h2>Make your choice:</h2>
          <div class="rps-choices">
            <button class="rps-btn" data-choice="rock">✊</button>
            <button class="rps-btn" data-choice="paper">✋</button>
            <button class="rps-btn" data-choice="scissors">✌️</button>
          </div>
        `;
        board.querySelectorAll('.rps-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            socket.emit('game:move', { gameId: state.id, move: { choice: btn.dataset.choice } });
            btn.classList.add('selected');
            board.querySelectorAll('.rps-btn').forEach(b => b.disabled = true);
          });
        });
      } else {
        board.innerHTML = `<h2>Match in progress...</h2>`;
      }
    }
  },

  // === TRIVIA ===
  renderTrivia(state, board, status) {
    if (state.updateType === 'reveal') {
      const q = state.questions[state.currentQuestion];
      board.innerHTML = `
        <div class="trivia-container">
          <h2 class="trivia-q">${q.question}</h2>
          <div class="trivia-options">
            ${q.options.map((opt, i) => `
              <div class="trivia-btn ${i === q.correctIndex ? 'correct' : 'wrong'}">
                ${opt}
              </div>
            `).join('')}
          </div>
        </div>
      `;
      status.textContent = "Revealing answer...";
    } else {
      const q = state.questions[state.currentQuestion];
      const myPlayer = state.players.find(p => p.userId === AppState.userId);
      const answered = myPlayer && myPlayer.answered;

      board.innerHTML = `
        <div class="trivia-container">
          <div class="timer-bar-bg"><div class="timer-bar-fill" id="trivia-timer"></div></div>
          <h2 class="trivia-q">${q.question}</h2>
          <div class="trivia-options">
            ${q.options.map((opt, i) => `
              <button class="trivia-btn" data-idx="${i}" ${answered || !myPlayer ? 'disabled' : ''}>
                ${opt}
              </button>
            `).join('')}
          </div>
        </div>
      `;

      if (myPlayer && !answered) {
        board.querySelectorAll('.trivia-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            btn.style.background = 'var(--primary)';
            board.querySelectorAll('.trivia-btn').forEach(b => b.disabled = true);
            socket.emit('game:move', { gameId: state.id, move: { answerIndex: parseInt(btn.dataset.idx) } });
          });
        });
      }

      status.textContent = `Question ${state.currentQuestion + 1} of ${state.questions.length}`;

      // Simulate timer visually
      const timebar = document.getElementById('trivia-timer');
      if (timebar) {
        timebar.style.transition = 'width 15s linear';
        setTimeout(() => timebar.style.width = '0%', 50);
      }
    }
  },

  // === WORD SCRAMBLE ===
  renderWordScramble(state, board, status) {
    const myPlayer = state.players.find(p => p.userId === AppState.userId);
    
    if (state.updateType === 'reveal') {
      board.innerHTML = `
        <h2>The word was:</h2>
        <div class="scramble-word">${state.answer}</div>
      `;
      status.textContent = "Next round starting...";
    } else {
      board.innerHTML = `
        <div class="timer-bar-bg" style="width:400px"><div class="timer-bar-fill" id="scramble-timer"></div></div>
        <div class="scramble-word">${state.scrambled}</div>
        ${myPlayer ? `
          <div class="scramble-input-group">
            <input type="text" id="scramble-input" class="scramble-input" placeholder="Type answer..." autocomplete="off">
          </div>
        ` : '<h2>Guessing in progress...</h2>'}
      `;

      if (myPlayer) {
        const input = document.getElementById('scramble-input');
        input.focus();
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            socket.emit('game:move', { gameId: state.id, move: { answer: input.value.trim() } });
            input.value = '';
          }
        });
      }
      
      status.textContent = `Round ${state.currentRound + 1} of ${state.words.length}`;
      
      const timebar = document.getElementById('scramble-timer');
      if (timebar) {
        timebar.style.transition = 'width 20s linear';
        setTimeout(() => timebar.style.width = '0%', 50);
      }
    }
  },

  // === REACTION TEST ===
  renderReaction(state, board, status) {
    const myPlayer = state.players.find(p => p.userId === AppState.userId);
    status.textContent = `Round ${state.round + 1} of ${state.maxRounds}`;

    if (state.phase === 'countdown') {
      board.innerHTML = `<div class="reaction-board"><div class="reaction-text">Get Ready... 3</div></div>`;
    } else if (state.phase === 'wait') {
      board.innerHTML = `<div class="reaction-board wait" id="react-btn"><div class="reaction-text">WAIT FOR GREEN</div></div>`;
      if (myPlayer) {
        document.getElementById('react-btn').addEventListener('mousedown', () => {
          // clicked too early
          socket.emit('game:move', { gameId: state.id, move: { reactionTime: 9999 } });
          board.innerHTML = `<h2>Too early! Disqualified this round.</h2>`;
        });
      }
    } else if (state.phase === 'go') {
      board.innerHTML = `<div class="reaction-board go" id="react-btn"><div class="reaction-text">CLICK NOW!</div></div>`;
      if (myPlayer && !myPlayer.disqualified) {
        const start = Date.now();
        document.getElementById('react-btn').addEventListener('mousedown', () => {
          const time = Date.now() - start;
          socket.emit('game:move', { gameId: state.id, move: { reactionTime: time } });
          board.innerHTML = `<h2>Reaction: ${time}ms</h2>`;
        });
      }
    } else if (state.phase === 'roundOver') {
      board.innerHTML = `<h2>Round Over</h2>`;
    }
  },

  // === MEMORY CARDS ===
  renderMemory(state, board, status) {
    const isMyTurn = state.status === 'playing' && state.players[state.currentPlayerIndex].userId === AppState.userId;
    status.textContent = isMyTurn ? 'Your turn!' : `${state.players[state.currentPlayerIndex].username}'s turn`;

    board.innerHTML = `<div class="memory-grid"></div>`;
    const grid = board.querySelector('.memory-grid');

    state.board.forEach((val, i) => {
      const isRevealed = state.revealed[i] || state.matched[i];
      const isMatched = state.matched[i];
      
      const card = document.createElement('div');
      card.className = `memory-card ${isRevealed ? 'flipped' : ''} ${isMatched ? 'matched' : ''}`;
      card.innerHTML = `
        <div class="memory-card-inner">
          <div class="memory-front">?</div>
          <div class="memory-back">${val}</div>
        </div>
      `;
      
      if (!isRevealed && isMyTurn && state.flipped.length < 2) {
        card.addEventListener('click', () => {
          socket.emit('game:move', { gameId: state.id, move: { position: i } });
        });
      }
      grid.appendChild(card);
    });
  },

  // === TYPE RACER ===
  renderTypeRacer(state, board, status) {
    const myPlayer = state.players.find(p => p.userId === AppState.userId);
    status.textContent = `Round ${state.currentRound + 1} of ${state.sentences.length}`;

    if (state.updateType === 'reveal') {
      board.innerHTML = `<h2>Round Finished</h2>`;
    } else {
      const sentence = state.sentences[state.currentRound];
      
      let typedHTML = '';
      if (myPlayer) {
        const typed = myPlayer.typed || '';
        for (let i = 0; i < sentence.length; i++) {
          if (i < typed.length) {
            typedHTML += `<span class="${typed[i] === sentence[i] ? 'correct' : 'wrong'}">${sentence[i]}</span>`;
          } else if (i === typed.length) {
            typedHTML += `<span class="current">${sentence[i]}</span>`;
          } else {
            typedHTML += `<span>${sentence[i]}</span>`;
          }
        }
      } else {
        typedHTML = `<span>${sentence}</span>`;
      }

      board.innerHTML = `
        <div class="type-sentence">${typedHTML}</div>
        ${myPlayer && !myPlayer.finished ? `
          <input type="text" id="type-input" class="type-input" autocomplete="off" spellcheck="false">
        ` : `<h2>${myPlayer && myPlayer.finished ? `Finished! WPM: ${myPlayer.wpm}` : 'Watching...'}</h2>`}
      `;

      if (myPlayer && !myPlayer.finished) {
        const input = document.getElementById('type-input');
        input.focus();
        input.addEventListener('input', () => {
          const typed = input.value;
          socket.emit('game:move', { gameId: state.id, move: { typed, time: Date.now() } });
          
          // Local optimistic update for smooth typing
          myPlayer.typed = typed;
          this.renderTypeRacer(state, board, status);
          
          // Re-focus input after re-render
          const newInp = document.getElementById('type-input');
          if (newInp) {
            newInp.value = typed;
            newInp.focus();
          }
        });
      }
    }
  }
};
