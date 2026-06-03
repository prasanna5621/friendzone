window.Chat = {
  crossChatMessages: new Map(), // targetGroupId -> array of msgs
  crossChatTarget: null,

  init() {
    const btnSend = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input');
    
    let typingTimeout;
    input.addEventListener('input', () => {
      socket.emit('chat:typing', { groupId: AppState.currentGroupId, isTyping: true });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('chat:typing', { groupId: AppState.currentGroupId, isTyping: false });
      }, 2000);
    });

    btnSend.addEventListener('click', () => this.sendChat(input.value));
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChat(input.value);
    });
    
    const btnPoll = document.getElementById('btn-chat-poll');
    if (btnPoll) {
      btnPoll.addEventListener('click', () => {
        const question = prompt("Enter poll question:");
        if (!question) return;
        const opt1 = prompt("Option 1:");
        const opt2 = prompt("Option 2:");
        if (opt1 && opt2) {
          socket.emit('poll:create', { groupId: AppState.currentGroupId, question, options: [opt1, opt2] });
        }
      });
    }

    socket.on('chat:message', (msg) => {
      this.appendMessage(msg);
      if (msg.senderId !== AppState.userId && !msg.isSystem) App.playSound('message');
    });
    
    socket.on('chat:reaction-updated', (data) => this.updateReactions(data));
    socket.on('chat:typing', (data) => this.handleTyping(data));
    socket.on('poll:updated', (data) => this.updatePoll(data));
    
    socket.on('chat:history', (data) => {
      if (data.groupId === AppState.currentGroupId) {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        if (data.messages && data.messages.length > 0) {
          data.messages.forEach(m => this.appendMessage(m, false));
          this.scrollToBottom();
        } else {
          container.innerHTML = `
            <div class="chat-welcome">
              <span>👋</span>
              <p>Welcome! Start chatting with your group.</p>
            </div>
          `;
        }
      }
    });

    // Cross-group chat
    document.getElementById('btn-cross-chat').addEventListener('click', () => {
      App.openModal('modal-cross-chat');
      this.renderCrossChatGroups();
    });

    const crossInput = document.getElementById('cross-chat-input');
    document.getElementById('btn-send-cross-chat').addEventListener('click', () => this.sendCrossChat(crossInput.value));
    crossInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendCrossChat(crossInput.value);
    });

    socket.on('chat:cross-group-message', (msg) => {
      const isFromUs = msg.fromGroupId === AppState.currentGroupId;
      const targetId = isFromUs ? this.crossChatTarget : msg.fromGroupId;
      
      if (!this.crossChatMessages.has(targetId)) {
        this.crossChatMessages.set(targetId, []);
      }
      this.crossChatMessages.get(targetId).push(msg);

      if (document.getElementById('modal-cross-chat').classList.contains('active') && this.crossChatTarget === targetId) {
        this.renderCrossChatMessages();
      } else if (!isFromUs) {
        App.showToast(`New message from ${msg.fromGroupName}`, 'info');
      }
    });
  },

  sendChat(text) {
    if (!text.trim() || !AppState.currentGroupId) return;
    socket.emit('chat:send', { groupId: AppState.currentGroupId, text: text.trim() });
    document.getElementById('chat-input').value = '';
  },

  loadHistory(groupId) {
    socket.emit('chat:history', { groupId });
  },

  appendMessage(msg, autoScroll = true) {
    const container = document.getElementById('chat-messages');
    const welcome = container.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const isOwn = msg.senderId === AppState.userId;
    div.id = `msg-${msg.id}`;
    
    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let contentHtml = '';
    
    if (msg.isSystem) {
      contentHtml = `<div class="msg-text" style="color:var(--secondary); font-style:italic;">${this.escapeHTML(msg.text)}</div>`;
    } else if (msg.isPoll) {
      contentHtml = `
        <div class="msg-header">
          <span class="msg-sender">${isOwn ? 'You' : msg.senderName}</span>
          <span class="msg-time">${timeStr}</span>
        </div>
        <div class="poll-container" id="poll-${msg.id}">
          <div class="poll-question">📊 ${this.escapeHTML(msg.question)}</div>
          <div class="poll-options">
            ${msg.options.map(opt => `
              <div class="poll-option" onclick="Chat.votePoll('${msg.id}', ${opt.id})">
                <div class="poll-bar" style="width: ${opt.votes.length * 10}%"></div>
                <div class="poll-text"><span>${this.escapeHTML(opt.text)}</span> <span>${opt.votes.length}</span></div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="msg-header">
          <span class="msg-sender">${isOwn ? 'You' : msg.senderName}</span>
          <span class="msg-time">${timeStr}</span>
        </div>
        <div class="msg-text">${this.escapeHTML(msg.text)}</div>
        <div class="msg-reactions" id="reactions-${msg.id}">
          ${this.renderReactions(msg.id, msg.reactions)}
          <span class="reaction-badge" onclick="Chat.addReaction('${msg.id}')" title="Add Reaction">➕</span>
        </div>
      `;
    }

    div.innerHTML = `
      ${msg.isSystem ? '' : App.renderAvatar(msg.senderAvatar, 40)}
      <div class="msg-content" style="flex:1;">
        ${contentHtml}
      </div>
    `;
    
    // Remove typing indicator before appending new message
    const typingInd = container.querySelector('.typing-indicator');
    if (typingInd) typingInd.remove();
    
    container.appendChild(div);
    if (autoScroll) this.scrollToBottom();
  },

  scrollToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  },

  renderCrossChatGroups() {
    const list = document.getElementById('cross-chat-groups');
    list.innerHTML = '';
    
    const others = AppState.allGroups.filter(g => g.id !== AppState.currentGroupId);
    if (others.length === 0) {
      list.innerHTML = '<p style="padding: 10px; color: var(--text-secondary)">No other groups available.</p>';
      return;
    }

    others.forEach(g => {
      const item = document.createElement('div');
      item.className = `cross-chat-group-item ${this.crossChatTarget === g.id ? 'active' : ''}`;
      item.innerHTML = `
        <div class="cross-chat-group-name">${g.name}</div>
        <div class="cross-chat-group-pts">⚡ ${g.totalPoints || 0} pts</div>
      `;
      item.addEventListener('click', () => {
        document.querySelectorAll('.cross-chat-group-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        this.crossChatTarget = g.id;
        this.renderCrossChatMessages();
      });
      list.appendChild(item);
    });

    if (!this.crossChatTarget && others.length > 0) {
      this.crossChatTarget = others[0].id;
      list.firstChild.classList.add('active');
    }
    
    this.renderCrossChatMessages();
  },

  renderCrossChatMessages() {
    const container = document.getElementById('cross-chat-messages');
    container.innerHTML = '';
    
    if (!this.crossChatTarget) return;

    const msgs = this.crossChatMessages.get(this.crossChatTarget) || [];
    if (msgs.length === 0) {
      container.innerHTML = '<div style="margin:auto;color:var(--text-secondary)">No messages yet. Say hi!</div>';
      return;
    }

    msgs.forEach(msg => {
      const isFromUs = msg.fromGroupId === AppState.currentGroupId;
      const div = document.createElement('div');
      div.className = `message ${isFromUs ? 'own-message' : ''}`;
      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `
        ${App.renderAvatar(msg.senderAvatar, 40)}
        <div class="msg-content">
          <div class="msg-header">
            <span class="msg-sender">${msg.senderName} <span style="font-size:10px;color:var(--text-muted)">(${msg.fromGroupName})</span></span>
            <span class="msg-time">${timeStr}</span>
          </div>
          <div class="msg-text">${this.escapeHTML(msg.text)}</div>
        </div>
      `;
      container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
  },

  sendCrossChat(text) {
    if (!text.trim() || !this.crossChatTarget || !AppState.currentGroupId) return;
    socket.emit('chat:cross-group', { 
      fromGroupId: AppState.currentGroupId, 
      toGroupId: this.crossChatTarget, 
      text: text.trim() 
    });
    document.getElementById('cross-chat-input').value = '';
  },

  escapeHTML(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  },

  handleTyping(data) {
    if (data.userId === AppState.userId) return;
    const container = document.getElementById('chat-messages');
    let ind = container.querySelector('.typing-indicator');
    if (data.isTyping) {
      if (!ind) {
        ind = document.createElement('div');
        ind.className = 'typing-indicator';
        container.appendChild(ind);
      }
      ind.textContent = `${data.username} is typing...`;
      this.scrollToBottom();
    } else if (ind) {
      ind.remove();
    }
  },

  addReaction(messageId) {
    const emoji = prompt("Enter an emoji (e.g. 👍, ❤️, 😂, 🔥, 😮):", "👍");
    if (!emoji) return;
    socket.emit('chat:react', { groupId: AppState.currentGroupId, messageId, emoji });
  },

  updateReactions(data) {
    const container = document.getElementById(`reactions-${data.messageId}`);
    if (container) {
      container.innerHTML = this.renderReactions(data.messageId, data.reactions) + 
        `<span class="reaction-badge" onclick="Chat.addReaction('${data.messageId}')" title="Add Reaction">➕</span>`;
    }
  },

  renderReactions(messageId, reactionsObj) {
    if (!reactionsObj) return '';
    let html = '';
    for (const [emoji, users] of Object.entries(reactionsObj)) {
      if (users.length > 0) {
        const hasMyVote = users.includes(AppState.userId);
        html += `<span class="reaction-badge ${hasMyVote ? 'active' : ''}" onclick="Chat.addReaction('${messageId}')">${emoji} ${users.length}</span>`;
      }
    }
    return html;
  },

  votePoll(pollId, optionId) {
    socket.emit('poll:vote', { groupId: AppState.currentGroupId, pollId, optionId });
  },

  updatePoll(data) {
    const pollContainer = document.getElementById(`poll-${data.pollId}`);
    if (pollContainer) {
      const optsContainer = pollContainer.querySelector('.poll-options');
      const totalVotes = data.options.reduce((sum, opt) => sum + opt.votes.length, 0);
      optsContainer.innerHTML = data.options.map(opt => {
        const pct = totalVotes > 0 ? (opt.votes.length / totalVotes) * 100 : 0;
        return `
          <div class="poll-option" onclick="Chat.votePoll('${data.pollId}', ${opt.id})">
            <div class="poll-bar" style="width: ${pct}%"></div>
            <div class="poll-text"><span>${this.escapeHTML(opt.text)}</span> <span>${opt.votes.length}</span></div>
          </div>
        `;
      }).join('');
    }
  }
};
