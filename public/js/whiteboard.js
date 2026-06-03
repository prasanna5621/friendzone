window.Whiteboard = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  tool: 'pen',
  color: '#00cec9',
  size: 3,
  currentStroke: [],
  history: [],

  init() {
    this.canvas = document.getElementById('whiteboard-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Tools
    document.querySelectorAll('.wb-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wb-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.id.replace('wb-tool-', '');
      });
    });

    const colorPicker = document.getElementById('wb-color');
    colorPicker.addEventListener('input', (e) => this.color = e.target.value);

    const sizePicker = document.getElementById('wb-size');
    const sizeDisplay = document.getElementById('wb-size-display');
    sizePicker.addEventListener('input', (e) => {
      this.size = parseInt(e.target.value);
      sizeDisplay.textContent = `${this.size}px`;
    });

    // Actions
    document.getElementById('btn-wb-clear').addEventListener('click', () => {
      this.clear();
      socket.emit('wb:clear', { groupId: AppState.currentGroupId });
    });

    document.getElementById('btn-wb-undo').addEventListener('click', () => {
      if (this.history.length > 0) {
        this.history.pop();
        this.redrawAll();
        socket.emit('wb:undo', { groupId: AppState.currentGroupId });
      }
    });

    // Drawing Events
    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

    // Touch
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
      this.canvas.dispatchEvent(mouseEvent);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
      this.canvas.dispatchEvent(mouseEvent);
    }, { passive: false });
    this.canvas.addEventListener('touchend', () => {
      const mouseEvent = new MouseEvent('mouseup');
      this.canvas.dispatchEvent(mouseEvent);
    });

    // Socket
    socket.on('wb:draw', (stroke) => {
      this.history.push(stroke);
      this.drawStroke(stroke);
    });
    socket.on('wb:clear', () => {
      this.history = [];
      this.clear();
    });
    socket.on('wb:undo', () => {
      if (this.history.length > 0) {
        this.history.pop();
        this.redrawAll();
      }
    });
  },

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth - 16;
    this.canvas.height = parent.clientHeight - 60; // account for toolbar
    this.redrawAll();
  },

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / (rect.right - rect.left) * this.canvas.width,
      y: (e.clientY - rect.top) / (rect.bottom - rect.top) * this.canvas.height
    };
  },

  startDrawing(e) {
    if (this.tool === 'text') {
      const pos = this.getPos(e);
      const text = prompt('Enter text:');
      if (text) {
        const stroke = { type: 'text', points: [pos], text, color: this.color, size: this.size * 5 };
        this.history.push(stroke);
        this.drawStroke(stroke);
        socket.emit('wb:draw', { groupId: AppState.currentGroupId, stroke });
      }
      return;
    }
    
    this.isDrawing = true;
    this.currentStroke = {
      type: this.tool,
      color: this.tool === 'eraser' ? '#ffffff' : this.color,
      size: this.tool === 'eraser' ? this.size * 3 : this.size,
      points: [this.getPos(e)]
    };
  },

  draw(e) {
    if (!this.isDrawing) return;
    const pos = this.getPos(e);
    
    if (this.tool === 'pen' || this.tool === 'eraser') {
      this.currentStroke.points.push(pos);
      this.redrawAll();
      this.drawStroke(this.currentStroke);
    } else {
      // Shape preview
      this.currentStroke.points[1] = pos;
      this.redrawAll();
      this.drawStroke(this.currentStroke);
    }
  },

  stopDrawing() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    if (this.currentStroke.points.length > 1 || this.tool === 'pen') {
      this.history.push(this.currentStroke);
      socket.emit('wb:draw', { groupId: AppState.currentGroupId, stroke: this.currentStroke });
    }
    this.currentStroke = null;
  },

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.history = [];
  },

  redrawAll() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.history.forEach(stroke => this.drawStroke(stroke));
  },

  drawStroke(stroke) {
    this.ctx.strokeStyle = stroke.color;
    this.ctx.fillStyle = stroke.color;
    this.ctx.lineWidth = stroke.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    if (stroke.type === 'pen' || stroke.type === 'eraser') {
      this.ctx.beginPath();
      if (stroke.points.length > 0) {
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
      }
      this.ctx.stroke();
    } else if (stroke.type === 'line' && stroke.points.length > 1) {
      this.ctx.beginPath();
      this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      this.ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
      this.ctx.stroke();
    } else if (stroke.type === 'rect' && stroke.points.length > 1) {
      const p1 = stroke.points[0];
      const p2 = stroke.points[1];
      this.ctx.beginPath();
      this.ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      this.ctx.stroke();
    } else if (stroke.type === 'circle' && stroke.points.length > 1) {
      const p1 = stroke.points[0];
      const p2 = stroke.points[1];
      const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      this.ctx.beginPath();
      this.ctx.arc(p1.x, p1.y, r, 0, 2 * Math.PI);
      this.ctx.stroke();
    } else if (stroke.type === 'text') {
      this.ctx.font = `${stroke.size}px 'Inter', sans-serif`;
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
    }
  }
};
