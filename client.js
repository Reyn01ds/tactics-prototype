
const socket = io();

const state = {
  roomId: null,
  name: null,
  locked: false,
  avatars: {},
  sprites: {},
  labels: {}
};

// UI elements
const joinBtn = document.getElementById('join');
const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const statusEl = document.getElementById('status');
const lockBtn = document.getElementById('lock');
const unlockBtn = document.getElementById('unlock');
const resetBtn = document.getElementById('reset');

joinBtn.onclick = () => {
  const roomId = roomInput.value.trim() || 'demo';
  const name = nameInput.value.trim() || 'Anon';
  state.roomId = roomId;
  state.name = name;
  socket.emit('join', { roomId, name });
  statusEl.textContent = `Joined ${roomId} as ${name}`;
};

lockBtn.onclick = () => socket.emit('coachCommand', { cmd: 'lock' });
unlockBtn.onclick = () => socket.emit('coachCommand', { cmd: 'unlock' });
resetBtn.onclick = () => socket.emit('coachCommand', { cmd: 'reset' });

socket.on('connect', () => statusEl.textContent = 'Connected');
socket.on('disconnect', () => statusEl.textContent = 'Disconnected');

socket.on('state', (s) => {
  state.locked = s.locked;
  state.avatars = s.avatars || {};
  renderState();
});

socket.on('controlUpdate', () => {
  // no-op; render happens on 'state'
});

// PIXI setup
const app = new PIXI.Application();
const canvasDiv = document.getElementById('canvas');
await app.init({ backgroundAlpha: 0, width: 900, height: 660, antialias: true });
canvasDiv.appendChild(app.canvas);

// Pitch (800x600) centered with margin
const pitch = new PIXI.Graphics();
pitch.roundRect(50, 30, 800, 600, 16).stroke({ width: 4, color: 0xE6E6E6 }).fill(0x0a5a28);
app.stage.addChild(pitch);

// Lines (halfway, center circle, boxes)
const lines = new PIXI.Graphics();
lines.stroke({ width: 2, color: 0xE6E6E6 });
// halfway line
lines.moveTo(450, 30).lineTo(450, 630);
// center circle
lines.circle(450, 330, 70);
// penalty boxes
lines.rect(50, 180, 120, 300);
lines.rect(730, 180, 120, 300);
// 6-yard boxes
lines.rect(50, 260, 50, 140);
lines.rect(800, 260, 50, 140);
// penalty spots
lines.circle(160, 330, 2);
lines.circle(740, 330, 2);
app.stage.addChild(lines);

// Interactions
let dragging = null;

function createSpriteForAvatar(av) {
  const g = new PIXI.Graphics();
  const isBall = av.id === 'BALL';
  const color = isBall ? 0xF5D142 : 0x2188FF;
  g.circle(0, 0, isBall ? 10 : 14).fill(color).stroke({ width: 2, color: 0x0F172A });
  const c = new PIXI.Container();
  c.addChild(g);

  const label = new PIXI.Text({
    text: av.id + (av.name ? ` (${av.name})` : ''),
    style: { fontFamily: 'Arial', fontSize: 12, fill: 0xFFFFFF, stroke: { color: 0x000000, width: 3 } }
  });
  label.x = -label.width / 2;
  label.y = -28;
  c.addChild(label);

  c.x = av.x;
  c.y = av.y;
  c.eventMode = 'static';
  c.cursor = 'pointer';

  c.on('pointerdown', (e) => {
    if (!state.avatars[av.id]) return;
    // request control if not controlled by me
    socket.emit('requestControl', { avatarId: av.id });
    dragging = av.id;
  });

  app.stage.addChild(c);
  state.sprites[av.id] = c;
  state.labels[av.id] = label;
}

function removeSpriteForAvatar(id) {
  const sp = state.sprites[id];
  if (sp && sp.parent) sp.parent.removeChild(sp);
  delete state.sprites[id];
  delete state.labels[id];
}

function renderState() {
  // add/update/remove sprites to match state.avatars
  // remove missing
  for (const id of Object.keys(state.sprites)) {
    if (!state.avatars[id]) removeSpriteForAvatar(id);
  }
  // add new
  for (const [id, av] of Object.entries(state.avatars)) {
    if (!state.sprites[id]) createSpriteForAvatar(av);
  }
  // update positions and labels
  for (const [id, av] of Object.entries(state.avatars)) {
    const sp = state.sprites[id];
    if (!sp) continue;
    sp.x = av.x;
    sp.y = av.y;
    const label = state.labels[id];
    if (label) {
      label.text = av.id + (av.name ? ` (${av.name})` : '');
      label.x = -label.width / 2;
    }
    // tint if controlledBy set
    const g = sp.children[0];
    if (g && g.tint !== undefined) {
      g.tint = av.controlledBy ? 0x7FB3FF : 0xFFFFFF;
    }
  }
}

function withinPitch(x, y) {
  return x >= 60 && x <= 840 && y >= 40 && y <= 620;
}

// drag loop -> send moves if dragging
app.ticker.add(() => {
  if (!dragging) return;
  const sp = state.sprites[dragging];
  if (!sp) return;
  const m = app.renderer.events.pointer.global;
  const nx = Math.max(60, Math.min(840, m.x));
  const ny = Math.max(40, Math.min(620, m.y));
  if (Math.hypot(sp.x - nx, sp.y - ny) > 1) {
    socket.emit('move', { avatarId: dragging, x: nx, y: ny });
  }
});

app.stage.on('pointerup', () => { dragging = null; });
app.stage.on('pointerupoutside', () => { dragging = null; });

// Auto-join from URL params if present
const params = new URLSearchParams(location.search);
if (params.get('room')) roomInput.value = params.get('room');
if (params.get('name')) nameInput.value = params.get('name');
