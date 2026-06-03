window.Video = {
  localStream: null,
  screenStream: null,
  peers: new Map(), // socketId -> { pc, stream, userId, username }
  iceServers: { urls: 'stun:stun.l.google.com:19302' },

  init() {
    const btnJoin = document.getElementById('btn-join-call');
    const btnMic = document.getElementById('btn-toggle-mic');
    const btnCam = document.getElementById('btn-toggle-camera');
    const btnScreen = document.getElementById('btn-share-screen');
    const btnLeave = document.getElementById('btn-leave-call');

    btnJoin.addEventListener('click', () => this.joinCall());
    btnLeave.addEventListener('click', () => this.leaveCall());
    
    btnMic.addEventListener('click', () => {
      if (!this.localStream) return;
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        if (audioTrack.enabled) {
          btnMic.classList.add('active');
          btnMic.classList.remove('muted');
          btnMic.textContent = '🎤';
        } else {
          btnMic.classList.remove('active');
          btnMic.classList.add('muted');
          btnMic.textContent = '🔇';
        }
      }
    });

    btnCam.addEventListener('click', () => {
      if (!this.localStream) return;
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (videoTrack.enabled) {
          btnCam.classList.add('active');
          btnCam.classList.remove('muted');
          btnCam.textContent = '📷';
        } else {
          btnCam.classList.remove('active');
          btnCam.classList.add('muted');
          btnCam.textContent = '🚫';
        }
      }
    });

    btnScreen.addEventListener('click', async () => {
      if (this.screenStream) {
        this.stopScreenShare();
      } else {
        await this.startScreenShare();
      }
    });

    // Signaling events
    socket.on('call:existing-users', (users) => {
      users.forEach(u => this.createPeer(u.socketId, u.userId, u.username, true));
    });

    socket.on('call:user-joined', (u) => {
      this.createPeer(u.socketId, u.userId, u.username, false);
      App.showToast(`${u.username} joined the call`, 'info');
      this.updateGrid();
    });

    socket.on('call:signal', async ({ fromSocketId, signal }) => {
      const peer = this.peers.get(fromSocketId);
      if (!peer) return;

      try {
        if (signal.type === 'offer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          socket.emit('call:signal', { targetSocketId: fromSocketId, signal: peer.pc.localDescription });
        } else if (signal.type === 'answer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (err) {
        console.error('Signaling error', err);
      }
    });

    socket.on('call:user-left', ({ userId, socketId }) => {
      const peer = this.peers.get(socketId);
      if (peer) {
        peer.pc.close();
        this.peers.delete(socketId);
        const tile = document.getElementById(`video-${socketId}`);
        if (tile) tile.remove();
        this.updateGrid();
      }
    });
  },

  async joinCall() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      AppState.inCall = true;

      document.getElementById('btn-join-call').style.display = 'none';
      document.querySelector('.video-placeholder').style.display = 'none';
      
      const controls = document.querySelectorAll('#btn-toggle-mic, #btn-toggle-camera, #btn-share-screen, #btn-leave-call');
      controls.forEach(btn => btn.style.display = 'inline-flex');

      // Setup UI buttons state
      document.getElementById('btn-toggle-mic').classList.add('active');
      document.getElementById('btn-toggle-camera').classList.add('active');

      this.addVideoTile('local', AppState.username, this.localStream, true);
      this.updateGrid();

      socket.emit('call:join', { groupId: AppState.currentGroupId });
    } catch (err) {
      console.error('Failed to get media', err);
      App.showToast('Could not access camera/microphone', 'error');
    }
  },

  leaveCall() {
    socket.emit('call:leave', { groupId: AppState.currentGroupId });
    AppState.inCall = false;

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.stopScreenShare();
    }

    this.peers.forEach(peer => peer.pc.close());
    this.peers.clear();

    document.getElementById('video-grid').innerHTML = `
      <div class="video-placeholder">
        <span>📹</span>
        <p>Click "Join Call" to start a video session</p>
      </div>
    `;

    document.getElementById('btn-join-call').style.display = 'inline-flex';
    document.querySelectorAll('#btn-toggle-mic, #btn-toggle-camera, #btn-share-screen, #btn-leave-call')
      .forEach(btn => btn.style.display = 'none');
  },

  createPeer(socketId, userId, username, isInitiator) {
    const pc = new RTCPeerConnection({ iceServers: [this.iceServers] });
    this.peers.set(socketId, { pc, stream: new MediaStream(), userId, username });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
    }

    pc.ontrack = (event) => {
      const peer = this.peers.get(socketId);
      if (peer) {
        event.streams[0].getTracks().forEach(t => peer.stream.addTrack(t));
        if (!document.getElementById(`video-${socketId}`)) {
          this.addVideoTile(socketId, username, peer.stream, false);
          this.updateGrid();
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:signal', { targetSocketId: socketId, signal: event.candidate });
      }
    };

    if (isInitiator) {
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('call:signal', { targetSocketId: socketId, signal: offer });
      });
    }
  },

  addVideoTile(id, label, stream, isLocal) {
    const grid = document.getElementById('video-grid');
    const tile = document.createElement('div');
    tile.className = `video-tile ${isLocal ? 'local-video' : ''}`;
    tile.id = `video-${id}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    
    const labelDiv = document.createElement('div');
    labelDiv.className = 'video-label';
    labelDiv.textContent = label;

    tile.appendChild(video);
    tile.appendChild(labelDiv);
    grid.appendChild(tile);
  },

  updateGrid() {
    const grid = document.getElementById('video-grid');
    const count = grid.children.length;
    grid.className = 'video-grid';
    if (count === 2) grid.classList.add('grid-2');
    else if (count === 3 || count === 4) grid.classList.add('grid-4');
    else if (count > 4) grid.classList.add('grid-many');
  },

  async startScreenShare() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = this.screenStream.getVideoTracks()[0];
      
      screenTrack.onended = () => this.stopScreenShare();

      // Replace local video track
      const localVideo = document.querySelector('#video-local video');
      if (localVideo) localVideo.srcObject = this.screenStream;

      // Replace track for all peers
      this.peers.forEach(peer => {
        const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      const btn = document.getElementById('btn-share-screen');
      btn.classList.add('active');
      btn.textContent = '🖥️ Stop Sharing';
    } catch (err) {
      console.error('Failed to share screen', err);
    }
  },

  stopScreenShare() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach(t => t.stop());
    this.screenStream = null;

    const camTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
    
    const localVideo = document.querySelector('#video-local video');
    if (localVideo) localVideo.srcObject = this.localStream;

    this.peers.forEach(peer => {
      const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && camTrack) sender.replaceTrack(camTrack);
    });

    const btn = document.getElementById('btn-share-screen');
    btn.classList.remove('active');
    btn.textContent = '🖥️ Share Screen';
  }
};
