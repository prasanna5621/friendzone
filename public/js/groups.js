window.Groups = {
  init() {
    document.getElementById('btn-create-group').addEventListener('click', () => App.openModal('modal-create-group'));
    document.getElementById('btn-join-group').addEventListener('click', () => App.openModal('modal-join-group'));
    
    document.getElementById('btn-confirm-create').addEventListener('click', () => {
      const name = document.getElementById('create-group-name').value;
      if (name.trim()) socket.emit('group:create', { name: name.trim() });
    });
    
    document.getElementById('btn-confirm-join').addEventListener('click', () => {
      const code = document.getElementById('join-group-code').value;
      if (code.trim()) socket.emit('group:join', { inviteCode: code.trim() });
    });

    document.getElementById('btn-back-dashboard').addEventListener('click', () => {
      App.showScreen('screen-dashboard');
      socket.emit('group:list');
    });

    document.getElementById('btn-leave-group').addEventListener('click', () => {
      if (AppState.currentGroupId) {
        socket.emit('group:leave', { groupId: AppState.currentGroupId });
        AppState.currentGroupId = null;
        AppState.currentGroup = null;
        App.showScreen('screen-dashboard');
        socket.emit('group:list');
        App.showToast('Left group', 'info');
      }
    });

    document.getElementById('btn-copy-invite').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('group-invite-code').textContent);
      App.showToast('Invite code copied!', 'success');
    });

    // Socket events
    socket.on('group:created', (group) => this.enterGroup(group));
    socket.on('group:joined', (group) => this.enterGroup(group));
    
    socket.on('group:list', (list) => {
      AppState.allGroups = list;
      this.renderAllGroupsList();
      // Filter user's groups (we don't have this array explicitly, so we just show all if none, or update if we had a local array, but let's just rely on currentGroup for now or server tracking. Since the server doesn't send user's specific groups, we'll keep the user's groups in AppState.groups manually upon join/create)
    });

    socket.on('group:members', (members) => {
      if (AppState.currentGroup) {
        AppState.currentGroup.members = members;
        this.renderMembersList();
      }
    });

    socket.on('group:member-joined', ({ groupId, member }) => {
      if (AppState.currentGroupId === groupId && AppState.currentGroup) {
        if (!AppState.currentGroup.members.find(m => m.userId === member.userId)) {
          AppState.currentGroup.members.push(member);
          this.renderMembersList();
          App.showToast(`${member.username} joined the group!`, 'success');
        }
      }
    });

    socket.on('group:member-left', ({ groupId, userId }) => {
      if (AppState.currentGroupId === groupId && AppState.currentGroup) {
        const idx = AppState.currentGroup.members.findIndex(m => m.userId === userId);
        if (idx !== -1) {
          const name = AppState.currentGroup.members[idx].username;
          AppState.currentGroup.members.splice(idx, 1);
          this.renderMembersList();
          App.showToast(`${name} left the group.`, 'info');
        }
      }
    });
  },

  enterGroup(group) {
    App.closeAllModals();
    AppState.currentGroupId = group.id;
    AppState.currentGroup = group;
    
    // Add to user's groups if not there
    if (!AppState.groups.find(g => g.id === group.id)) {
      AppState.groups.push(group);
    }
    this.renderGroupsList();

    document.getElementById('group-name-display').textContent = group.name;
    document.getElementById('group-invite-code').textContent = group.inviteCode;
    
    if (group.adminId === AppState.userId) {
      document.getElementById('group-admin-badge').style.display = 'inline-block';
    } else {
      document.getElementById('group-admin-badge').style.display = 'none';
    }

    this.renderMembersList();
    App.showScreen('screen-group');
    App.switchTab('chat');
    
    if (window.Chat) window.Chat.loadHistory(group.id);
  },

  renderGroupsList() {
    const list = document.getElementById('groups-list');
    if (AppState.groups.length === 0) {
      list.innerHTML = `<div class="group-card-placeholder"><span class="placeholder-icon">🏠</span><p>No groups yet. Create one or join with a code!</p></div>`;
      return;
    }
    
    list.innerHTML = '';
    AppState.groups.forEach(g => {
      const card = document.createElement('div');
      card.className = 'group-card glass-panel';
      card.innerHTML = `
        <h4>${g.name}</h4>
        <div class="group-meta">
          <span>👥 ${g.members ? g.members.length : '?'}</span>
          <span>⚡ ${g.totalPoints || 0}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        socket.emit('group:members', { groupId: g.id });
        this.enterGroup(g);
      });
      list.appendChild(card);
    });
  },

  renderAllGroupsList() {
    const list = document.getElementById('all-groups-list');
    list.innerHTML = '';
    if (AppState.allGroups.length === 0) {
      list.innerHTML = '<p style="color:var(--text-secondary)">No groups exist yet.</p>';
      return;
    }
    
    AppState.allGroups.forEach(g => {
      const row = document.createElement('div');
      row.className = 'all-group-row';
      row.innerHTML = `
        <div><strong>${g.name}</strong></div>
        <div style="display:flex;gap:15px;color:var(--text-secondary);font-size:13px">
          <span>👥 ${g.memberCount}</span>
          <span style="color:var(--warning)">⚡ ${g.totalPoints} pts</span>
        </div>
      `;
      list.appendChild(row);
    });
  },

  renderMembersList() {
    if (!AppState.currentGroup) return;
    const members = AppState.currentGroup.members || [];
    document.getElementById('member-count-display').textContent = members.length;
    
    const list = document.getElementById('members-list');
    list.innerHTML = '';
    
    members.forEach(m => {
      const li = document.createElement('li');
      li.className = 'member-item';
      li.innerHTML = `
        ${App.renderAvatar(m.avatar, 28)}
        <span class="member-name">${m.username} ${m.userId === AppState.currentGroup.adminId ? '👑' : ''}</span>
        <span class="member-points">${Math.floor(m.points)}</span>
      `;
      list.appendChild(li);
    });
  }
};
