// App State
window.AppState = {
  userId: null,
  username: '',
  avatar: '',
  points: 0,
  currentGroupId: null,
  currentGroup: null,
  groups: [],       
  allGroups: [],    
  currentTab: 'chat',
  inCall: false,
  currentGameId: null,
  status: ''
};

window.App = {
  audioCtx: null,
  soundEnabled: true,

  init() {
    this.createParticles();
    this.setupGlobals();
    
    // Initialize modules
    if (window.Auth) window.Auth.init();
    if (window.Groups) window.Groups.init();
    if (window.Chat) window.Chat.init();
    if (window.Video) window.Video.init();
    if (window.Whiteboard) window.Whiteboard.init();
    if (window.Games) window.Games.init();
    if (window.Leaderboard) window.Leaderboard.init();

    // Start heartbeat
    setInterval(() => {
      if (window.socket && window.socket.connected && AppState.userId) {
        window.socket.emit('user:heartbeat');
      }
    }, 30000);
  },

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  },

  switchTab(tabName) {
    AppState.currentTab = tabName;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.dataset.tab === tabName) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-panel').forEach(panel => {
      if (panel.id === `tab-${tabName}`) panel.classList.add('active');
      else panel.classList.remove('active');
    });

    if (tabName === 'whiteboard' && window.Whiteboard) window.Whiteboard.resize();
    if (tabName === 'leaderboard' && window.Leaderboard) window.Leaderboard.refresh();
    if (tabName === 'games' && window.Games) {
      document.getElementById('game-lobby').style.display = 'block';
      document.getElementById('game-waiting').style.display = 'none';
      document.getElementById('game-arena').style.display = 'none';
    }
    
    // Auto-close mobile drawer if open
    const drawer = document.querySelector('.sidebar-members');
    if (drawer && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
    }
  },

  openModal(modalId) {
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById(modalId).classList.add('active');
  },

  closeModal(modalId) {
    document.getElementById('modal-overlay').classList.remove('active');
    document.getElementById(modalId).classList.remove('active');
  },

  closeAllModals() {
    document.getElementById('modal-overlay').classList.remove('active');
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <span class="toast-close">✕</span>
    `;
    container.appendChild(toast);
    
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  },

  setupGlobals() {
    // Modal closes
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(btn.dataset.modal));
    });
    document.getElementById('modal-overlay').addEventListener('click', () => this.closeAllModals());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAllModals();
    });

    // Sidebar tabs
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Sound toggle
    const btnSound = document.getElementById('btn-toggle-sound');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        btnSound.textContent = this.soundEnabled ? '🔊' : '🔇';
      });
    }

    // Mobile members drawer
    const btnMembers = document.getElementById('btn-mobile-members');
    if (btnMembers) {
      btnMembers.addEventListener('click', () => {
        const drawer = document.querySelector('.sidebar-members');
        if (drawer) drawer.classList.toggle('open');
      });
    }
  },

  createParticles() {
    const bg = document.getElementById('particles-bg');
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 4 + 2;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      p.style.left = `${Math.random() * 100}vw`;
      p.style.top = `${Math.random() * 100}vh`;
      p.style.opacity = Math.random() * 0.4 + 0.1;
      p.style.animationDuration = `${Math.random() * 20 + 10}s`;
      p.style.animationDelay = `${Math.random() * 5}s`;
      bg.appendChild(p);
    }
  },

  renderAvatar(avatar, size = 40) {
    if (!avatar) avatar = '🦊';
    if (avatar.startsWith('data:') || avatar.startsWith('/')) {
      return `<div class="msg-avatar" style="width:${size}px;height:${size}px"><img src="${avatar}" alt="avatar"></div>`;
    }
    return `<div class="msg-avatar" style="width:${size}px;height:${size}px;font-size:${size/2}px">${avatar}</div>`;
  },

  playSound(type) {
    if (!this.soundEnabled) return;
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    const now = this.audioCtx.currentTime;
    
    if (type === 'message') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      osc.frequency.setValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'join') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  },

  triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const pieces = [];
    const colors = ['#6c5ce7', '#00cec9', '#fd79a8', '#00b894', '#fdcb6e'];
    
    for(let i=0; i<120; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height / 2 + 100,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 1) * 20 - 5,
        size: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10
      });
    }
    
    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let active = false;
      
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5; // gravity
        p.rot += p.rotSpeed;
        if (p.y < canvas.height) active = true;
        
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
      });
      
      if (active && frame < 200) {
        frame++;
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    animate();
  }
};

document.addEventListener('DOMContentLoaded', () => window.App.init());
