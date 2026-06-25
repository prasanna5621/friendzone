window.Auth = {
  selectedAvatar: '🦊',

  init() {
    const btnRegister = document.getElementById('btn-register');
    const inputUsername = document.getElementById('login-username');
    const inputStatus = document.getElementById('login-status');
    const avatarOptions = document.querySelectorAll('.avatar-option');
    const fileInput = document.getElementById('login-avatar-input');
    const previewImg = document.getElementById('login-avatar-preview');
    const previewEmoji = document.getElementById('login-avatar-emoji-preview');

    avatarOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        avatarOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this.selectedAvatar = opt.dataset.avatar;
        previewImg.style.display = 'none';
        previewEmoji.style.display = 'flex';
        previewEmoji.textContent = this.selectedAvatar;
      });
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.selectedAvatar = e.target.result;
          previewEmoji.style.display = 'none';
          previewImg.style.display = 'block';
          previewImg.src = this.selectedAvatar;
          avatarOptions.forEach(o => o.classList.remove('selected'));
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    btnRegister.addEventListener('click', () => this.register(inputUsername.value));
    inputUsername.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.register(inputUsername.value);
    });

    socket.on('user:registered', (data) => {
      AppState.userId = data.userId;
      AppState.username = data.username;
      AppState.avatar = data.avatar;
      AppState.status = data.status || '';
      
      localStorage.setItem('fz_session', JSON.stringify({
        userId: data.userId,
        username: data.username,
        avatar: data.avatar,
        status: AppState.status,
        groupId: AppState.currentGroupId
      }));
      
      document.getElementById('my-username-display').textContent = data.username;
      document.getElementById('my-avatar-display').innerHTML = App.renderAvatar(data.avatar, 32);
      
      const statusVal = document.getElementById('login-status').value.trim();
      if (statusVal) {
        AppState.status = statusVal;
        document.getElementById('my-status-display').textContent = statusVal;
        socket.emit('user:status', { status: statusVal });
      }
      
      App.showScreen('screen-dashboard');
      App.showToast(`Welcome, ${data.username}!`, 'success');
      
      socket.emit('group:list');
    });

    socket.on('user:error', (data) => {
      App.showToast(data.message, 'error');
    });

    socket.on('user:points-update', (data) => {
      AppState.points = Math.floor(data.points);
      document.getElementById('my-points-display').textContent = AppState.points;
    });
  },

  register(username) {
    if (!username.trim()) {
      App.showToast('Please enter a username', 'warning');
      return;
    }
    socket.emit('user:register', { username: username.trim(), avatar: this.selectedAvatar });
  },

  tryReconnect() {
    const sessionStr = localStorage.getItem('fz_session');
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session.userId && session.username) {
          socket.emit('user:reconnect', session);
        }
      } catch (e) {
        localStorage.removeItem('fz_session');
      }
    }
  }
};

// Listen for socket connects to attempt reconnect
socket.on('connect', () => {
  if (window.Auth) window.Auth.tryReconnect();
});
