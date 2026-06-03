window.Leaderboard = {
  init() {
    document.getElementById('btn-global-leaderboard').addEventListener('click', () => {
      App.openModal('modal-global-leaderboard');
      this.refresh();
    });

    document.getElementById('btn-lb-group').addEventListener('click', (e) => {
      e.target.classList.add('active');
      document.getElementById('btn-lb-global').classList.remove('active');
      document.getElementById('lb-group-content').style.display = 'flex';
      document.getElementById('lb-global-content').style.display = 'none';
    });

    document.getElementById('btn-lb-global').addEventListener('click', (e) => {
      e.target.classList.add('active');
      document.getElementById('btn-lb-group').classList.remove('active');
      document.getElementById('lb-group-content').style.display = 'none';
      document.getElementById('lb-global-content').style.display = 'flex';
      this.refresh();
    });

    socket.on('points:leaderboard', (data) => {
      this.renderGlobalLeaderboard(data);
    });
  },

  refresh() {
    // Re-render group leaderboard
    if (AppState.currentGroup) {
      const sortedMembers = [...AppState.currentGroup.members].sort((a, b) => b.points - a.points);
      const list = document.getElementById('lb-group-list');
      list.innerHTML = '';
      
      const maxPts = sortedMembers.length > 0 ? sortedMembers[0].points : 1;

      sortedMembers.forEach((m, idx) => {
        const pct = Math.max(5, (m.points / maxPts) * 100);
        const row = document.createElement('div');
        row.className = 'lb-row';
        row.innerHTML = `
          <div class="lb-rank">#${idx + 1}</div>
          <div class="lb-avatar">${App.renderAvatar(m.avatar, 40)}</div>
          <div class="lb-name-col">
            <div class="lb-name">${m.username} ${m.userId === AppState.currentGroup.adminId ? '👑' : ''}</div>
          </div>
          <div class="lb-bar-container">
            <div class="lb-bar" style="width: 0%"></div>
          </div>
          <div class="lb-score-col">
            <div class="lb-score">${Math.floor(m.points)}</div>
          </div>
        `;
        list.appendChild(row);
        
        // animate bar
        setTimeout(() => {
          row.querySelector('.lb-bar').style.width = `${pct}%`;
        }, 50);
      });
    }

    // Request global leaderboard update
    socket.emit('points:leaderboard');
  },

  renderGlobalLeaderboard(data) {
    // 1. Sidebar tab rendering
    const gList1 = document.getElementById('lb-global-groups-list');
    const uList1 = document.getElementById('lb-global-users-list');
    
    // 2. Modal rendering
    const gList2 = document.getElementById('global-lb-groups-list');
    const uList2 = document.getElementById('global-lb-users-list');

    const renderGroups = (container) => {
      if (!container) return;
      container.innerHTML = '';
      data.groups.slice(0, 10).forEach((g, i) => {
        const div = document.createElement('div');
        div.className = 'lb-row';
        div.innerHTML = `
          <div class="lb-rank">#${i + 1}</div>
          <div class="lb-name-col">
            <div class="lb-name">${g.name}</div>
            <div class="lb-sub">${g.memberCount} members</div>
          </div>
          <div class="lb-score-col"><div class="lb-score">${Math.floor(g.totalPoints)}</div></div>
        `;
        container.appendChild(div);
      });
    };

    const renderUsers = (container) => {
      if (!container) return;
      container.innerHTML = '';
      data.users.slice(0, 10).forEach((u, i) => {
        const div = document.createElement('div');
        div.className = 'lb-row';
        div.innerHTML = `
          <div class="lb-rank">#${i + 1}</div>
          <div class="lb-avatar">${App.renderAvatar(u.avatar, 40)}</div>
          <div class="lb-name-col">
            <div class="lb-name">${u.username}</div>
            <div class="lb-sub">${u.groupName || 'No group'}</div>
          </div>
          <div class="lb-score-col"><div class="lb-score">${Math.floor(u.points)}</div></div>
        `;
        container.appendChild(div);
      });
    };

    renderGroups(gList1);
    renderGroups(gList2);
    renderUsers(uList1);
    renderUsers(uList2);
  }
};
