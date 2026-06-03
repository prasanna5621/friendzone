window.socket = io();

window.socket.on('connect', () => {
  console.log('Connected to server:', window.socket.id);
});

window.socket.on('disconnect', () => {
  console.log('Disconnected from server');
  if (window.App) window.App.showToast('Disconnected from server', 'error');
});

window.socket.on('connect_error', (err) => {
  console.error('Connection error:', err);
});
