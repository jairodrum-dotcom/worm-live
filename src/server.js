require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 15000,
  pingTimeout: 30000,
  maxHttpBufferSize: 1e6,
  perMessageDeflate: false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const WORLD_SIZE = 24000;
const MAX_PLAYERS = 3000;
const TICK_RATE = 20;
const INITIAL_LENGTH = 20;
const SEGMENT_SPACING = 9;
const MAX_FOOD = 1600;
const BOT_COUNT = 5;
const CELL_SIZE = 1000;

const CHARACTERS = [
  { id: 'cobra', name: 'Cobra', primary: '#10b981', secondary: '#047857', glow: '#34d399', belly: '#a7f3d0' },
  { id: 'jacare', name: 'Jacaré', primary: '#3f6212', secondary: '#1a2e05', glow: '#84cc16', belly: '#d9f99d' },
  { id: 'lagarto', name: 'Lagarto', primary: '#d97706', secondary: '#78350f', glow: '#fbbf24', belly: '#fde68a' },
  { id: 'camaleao', name: 'Camaleão', primary: '#06b6d4', secondary: '#0e7490', glow: '#22d3ee', belly: '#cffafe' },
  { id: 'dragao', name: 'Dragão', primary: '#dc2626', secondary: '#7f1d1d', glow: '#f87171', belly: '#fecaca' },
  { id: 'axolote', name: 'Axolote', primary: '#ec4899', secondary: '#9d174d', glow: '#f472b6', belly: '#fbcfe8' }
];

const FRUITS = [
  { type: 'apple', emoji: '🍎', name: 'Maçã', value: 2, radius: 15, color: '#ef4444' },
  { type: 'banana', emoji: '🍌', name: 'Banana', value: 3, radius: 16, color: '#facc15' },
  { type: 'orange', emoji: '🍊', name: 'Laranja', value: 2, radius: 15, color: '#f97316' },
  { type: 'pear', emoji: '🍐', name: 'Pera', value: 3, radius: 15, color: '#a3e635' },
  { type: 'pineapple', emoji: '🍍', name: 'Abacaxi', value: 5, radius: 19, color: '#eab308' },
  { type: 'grapes', emoji: '🍇', name: 'Uvas', value: 4, radius: 17, color: '#a855f7' },
  { type: 'watermelon', emoji: '🍉', name: 'Melancia', value: 5, radius: 18, color: '#22c55e' },
  { type: 'strawberry', emoji: '🍓', name: 'Morango', value: 2, radius: 14, color: '#f43f5e' },
  { type: 'cherry', emoji: '🍒', name: 'Cereja', value: 3, radius: 14, color: '#e11d48' },
  { type: 'gem', emoji: '💎', name: 'Cristal LIVE', value: 12, radius: 21, color: '#38bdf8' }
];

const RIVERS = [
  { axis: 'y', base: 6000, amp: 550, freq: 0.0005, width: 320 },
  { axis: 'y', base: 18000, amp: 600, freq: 0.00045, width: 340 },
  { axis: 'x', base: 8000, amp: 500, freq: 0.0005, width: 320 },
  { axis: 'x', base: 16000, amp: 550, freq: 0.00048, width: 320 }
];

function isInRiver(x, y) {
  for (let i = 0; i < RIVERS.length; i++) {
    const r = RIVERS[i];
    if (r.axis === 'y') {
      const ry = r.base + Math.sin(x * r.freq) * r.amp;
      if (Math.abs(y - ry) < r.width * 0.5) return true;
    } else {
      const rx = r.base + Math.cos(y * r.freq) * r.amp;
      if (Math.abs(x - rx) < r.width * 0.5) return true;
    }
  }
  return false;
}

const players = new Map();
const foods = new Map();
let foodIdCounter = 1;

function randomPos(margin = 400) {
  return margin + Math.random() * (WORLD_SIZE - margin * 2);
}

function spawnFood(x, y, forcedFruit = null) {
  if (foods.size > MAX_FOOD * 1.4 && !forcedFruit) return null;
  const id = foodIdCounter++;
  const template = forcedFruit || FRUITS[Math.floor(Math.random() * (FRUITS.length - 1))];
  const food = {
    id,
    x: Math.round(x !== undefined ? x : randomPos(150)),
    y: Math.round(y !== undefined ? y : randomPos(150)),
    emoji: template.emoji,
    value: template.value,
    radius: template.radius,
    color: template.color,
    phase: Number((Math.random() * Math.PI * 2).toFixed(2))
  };
  foods.set(id, food);
  return food;
}

for (let i = 0; i < MAX_FOOD; i++) {
  spawnFood();
}

function createCreature(id, name, isBot = false, charId = 'cobra') {
  const startX = randomPos(800);
  const startY = randomPos(800);
  const angle = Math.random() * Math.PI * 2;
  const character = CHARACTERS.find(c => c.id === charId) || CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];

  const segments = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    segments.push({
      x: Math.round(startX - Math.cos(angle) * i * SEGMENT_SPACING),
      y: Math.round(startY - Math.sin(angle) * i * SEGMENT_SPACING)
    });
  }

  return {
    id,
    name: (name || 'Jogador').slice(0, 20),
    isBot,
    character,
    x: startX,
    y: startY,
    angle,
    targetAngle: angle,
    boosting: false,
    liveBoostUntil: 0,
    score: 0,
    kills: 0,
    targetLength: INITIAL_LENGTH,
    segments,
    alive: true,
    botTurnTimer: 0
  };
}

for (let i = 1; i <= BOT_COUNT; i++) {
  const botId = `bot_${i}`;
  const char = CHARACTERS[(i - 1) % CHARACTERS.length];
  players.set(botId, createCreature(botId, `Jogador ${i}`, true, char.id));
}

function killCreature(victim, killer = null, reason = 'Colidiu com outro jogador!') {
  if (!victim.alive) return;
  victim.alive = false;

  const step = victim.segments.length > 80 ? 4 : 2;
  for (let i = 0; i < victim.segments.length; i += step) {
    const seg = victim.segments[i];
    const fruit = FRUITS[i % (FRUITS.length - 1)];
    spawnFood(
      seg.x + (Math.random() - 0.5) * 24,
      seg.y + (Math.random() - 0.5) * 24,
      { emoji: fruit.emoji, value: 4, radius: 17, color: victim.character.glow }
    );
  }

  if (killer && !killer.isBot) {
    killer.kills += 1;
    killer.score += 150;
    killer.targetLength = Math.min(killer.targetLength + 6, 500);
    io.to(killer.id).emit('enemy_defeated', {
      victimName: victim.name,
      bonus: 150
    });
  }

  if (victim.isBot) {
    const botNum = victim.id.split('_')[1];
    const char = CHARACTERS[(Number(botNum) - 1) % CHARACTERS.length];
    setTimeout(() => {
      players.set(victim.id, createCreature(victim.id, `Jogador ${botNum}`, true, char.id));
    }, 2000);
  } else {
    io.to(victim.id).emit('died', { score: Math.floor(victim.score), kills: victim.kills, reason });
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, charId }) => {
    const humanCount = Array.from(players.values()).filter(p => !p.isBot).length;
    if (humanCount >= MAX_PLAYERS) {
      socket.emit('server_full', { max: MAX_PLAYERS });
      return;
    }
    const cleanName = String(name || 'Convidado').trim().slice(0, 20) || 'Convidado';
    const creature = createCreature(socket.id, cleanName, false, charId || 'cobra');
    players.set(socket.id, creature);
    socket.emit('joined', {
      id: socket.id,
      worldSize: WORLD_SIZE,
      rivers: RIVERS,
      characters: CHARACTERS,
      maxPlayers: MAX_PLAYERS
    });
  });

  socket.on('input', ({ angle, boosting }) => {
    const creature = players.get(socket.id);
    if (!creature || !creature.alive) return;
    if (typeof angle === 'number' && !Number.isNaN(angle)) {
      creature.targetAngle = angle;
    }
    creature.boosting = Boolean(boosting) && creature.targetLength > 12;
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
  });
});

app.post('/api/live-event', (req, res) => {
  if (ADMIN_TOKEN) {
    const auth = req.headers['x-admin-token'] || req.body.token;
    if (auth !== ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: 'Token inválido' });
    }
  }

  const { type, username, giftName, repeatCount = 1 } = req.body || {};
  const cleanUser = String(username || '').replace(/^@/, '').toLowerCase();

  let target = null;
  for (const w of players.values()) {
    if (!w.isBot && w.alive && w.name.replace(/^@/, '').toLowerCase() === cleanUser) {
      target = w;
      break;
    }
  }

  let effectMessage = '';
  let growth = 0;
  let boostMs = 0;

  if (type === 'like') {
    growth = 2;
    boostMs = 1500;
    effectMessage = `❤️ ${username} curtiu a LIVE! (+2 tamanho)`;
  } else if (type === 'follow') {
    growth = 10;
    boostMs = 4500;
    effectMessage = `⭐ ${username} seguiu @jairodrum! (+10 tamanho & Turbo)`;
  } else if (type === 'chat') {
    growth = 1;
    effectMessage = `💬 ${username}: ${req.body.comment || 'Comentou!'}`;
  } else if (type === 'gift') {
    const count = Math.min(Number(repeatCount) || 1, 100);
    growth = 12 * count;
    boostMs = 6500;
    effectMessage = `🎁 ${username} enviou ${giftName || 'Presente'} x${count}! (+${growth} tamanho)`;
  }

  if (target) {
    target.targetLength = Math.min(target.targetLength + growth, 500);
    target.score += growth * 10;
    if (boostMs > 0) {
      target.liveBoostUntil = Date.now() + boostMs;
    }
  } else if (growth > 0) {
    for (let i = 0; i < Math.min(growth, 20); i++) {
      spawnFood(undefined, undefined, FRUITS[FRUITS.length - 1]);
    }
  }

  if (effectMessage) {
    io.emit('live_banner', {
      type,
      username,
      message: effectMessage,
      matchedPlayer: Boolean(target)
    });
  }

  res.json({ ok: true, matchedPlayer: Boolean(target), growth });
});

function getCellKey(x, y) {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  return `${cx}_${cy}`;
}

function getNearbyFromGrid(grid, x, y, radiusCells = 2) {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  const result = [];
  for (let dx = -radiusCells; dx <= radiusCells; dx++) {
    for (let dy = -radiusCells; dy <= radiusCells; dy++) {
      const bucket = grid.get(`${cx + dx}_${cy + dy}`);
      if (bucket) {
        for (let i = 0; i < bucket.length; i++) {
          result.push(bucket[i]);
        }
      }
    }
  }
  return result;
}

setInterval(() => {
  const now = Date.now();

  while (foods.size < MAX_FOOD) {
    spawnFood();
  }

  const foodGrid = new Map();
  for (const food of foods.values()) {
    const key = getCellKey(food.x, food.y);
    let bucket = foodGrid.get(key);
    if (!bucket) {
      bucket = [];
      foodGrid.set(key, bucket);
    }
    bucket.push(food);
  }

  const allAlive = [];
  const headGrid = new Map();
  const segmentGrid = new Map();

  for (const worm of players.values()) {
    if (!worm.alive) continue;
    allAlive.push(worm);

    const hKey = getCellKey(worm.x, worm.y);
    let hBucket = headGrid.get(hKey);
    if (!hBucket) {
      hBucket = [];
      headGrid.set(hKey, hBucket);
    }
    hBucket.push(worm);

    for (let i = 3; i < worm.segments.length; i += 2) {
      const seg = worm.segments[i];
      const sKey = getCellKey(seg.x, seg.y);
      let sBucket = segmentGrid.get(sKey);
      if (!sBucket) {
        sBucket = [];
        segmentGrid.set(sKey, sBucket);
      }
      sBucket.push({ owner: worm, x: seg.x, y: seg.y });
    }
  }

  for (let idx = 0; idx < allAlive.length; idx++) {
    const worm = allAlive[idx];
    if (!worm.alive) continue;

    if (worm.isBot) {
      worm.botTurnTimer--;
      if (worm.botTurnTimer <= 0) {
        worm.botTurnTimer = 15 + Math.floor(Math.random() * 20);
        const nearFoods = getNearbyFromGrid(foodGrid, worm.x, worm.y, 1);
        let nearest = null;
        let bestDist = 600;
        for (let i = 0; i < nearFoods.length; i++) {
          const f = nearFoods[i];
          const d = Math.hypot(f.x - worm.x, f.y - worm.y);
          if (d < bestDist) {
            bestDist = d;
            nearest = f;
          }
        }
        if (nearest) {
          worm.targetAngle = Math.atan2(nearest.y - worm.y, nearest.x - worm.x);
        } else {
          worm.targetAngle += (Math.random() - 0.5) * 1.3;
        }
        if (worm.x < 500) worm.targetAngle = 0;
        if (worm.x > WORLD_SIZE - 500) worm.targetAngle = Math.PI;
        if (worm.y < 500) worm.targetAngle = Math.PI / 2;
        if (worm.y > WORLD_SIZE - 500) worm.targetAngle = -Math.PI / 2;
      }
    }

    let diff = worm.targetAngle - worm.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    worm.angle += diff * 0.18;

    const inRiver = isInRiver(worm.x, worm.y);
    const isLiveBoost = now < worm.liveBoostUntil;
    const activeBoost = worm.boosting || isLiveBoost;
    let currentSpeed = activeBoost ? 7.8 : 4.6;
    if (inRiver) currentSpeed += 1.4;

    if (worm.boosting && !isLiveBoost && Math.random() < 0.14 && worm.targetLength > 12) {
      worm.targetLength -= 0.22;
      const tail = worm.segments[worm.segments.length - 1];
      if (tail && Math.random() < 0.25) {
        spawnFood(tail.x, tail.y, { emoji: '🍒', value: 1, radius: 11, color: worm.character.glow });
      }
    }

    worm.x += Math.cos(worm.angle) * currentSpeed;
    worm.y += Math.sin(worm.angle) * currentSpeed;

    if (worm.x <= 35 || worm.x >= WORLD_SIZE - 35 || worm.y <= 35 || worm.y >= WORLD_SIZE - 35) {
      killCreature(worm, null, 'Bateu na cerca elétrica da arena!');
      continue;
    }

    worm.segments.unshift({
      x: Math.round(worm.x),
      y: Math.round(worm.y)
    });

    for (let i = 1; i < worm.segments.length; i++) {
      const prev = worm.segments[i - 1];
      const curr = worm.segments[i];
      const dx = prev.x - curr.x;
      const dy = prev.y - curr.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SEGMENT_SPACING) {
        const a = Math.atan2(dy, dx);
        curr.x = Math.round(prev.x - Math.cos(a) * SEGMENT_SPACING);
        curr.y = Math.round(prev.y - Math.sin(a) * SEGMENT_SPACING);
      }
    }

    const desiredCount = Math.floor(worm.targetLength);
    while (worm.segments.length > desiredCount) {
      worm.segments.pop();
    }

    const headRadius = Math.min(15 + Math.sqrt(worm.targetLength) * 0.9, 36);

    const candidateFoods = getNearbyFromGrid(foodGrid, worm.x, worm.y, 1);
    for (let i = 0; i < candidateFoods.length; i++) {
      const food = candidateFoods[i];
      if (!foods.has(food.id)) continue;
      const dist = Math.hypot(worm.x - food.x, worm.y - food.y);
      if (dist < headRadius + food.radius + 7) {
        foods.delete(food.id);
        worm.targetLength = Math.min(worm.targetLength + food.value * 0.5, 500);
        worm.score += food.value * 10;
        if (!worm.isBot) {
          io.to(worm.id).emit('ate', {
            x: food.x,
            y: food.y,
            value: food.value * 10,
            color: food.color
          });
        }
      }
    }

    const candidateSegs = getNearbyFromGrid(segmentGrid, worm.x, worm.y, 1);
    for (let i = 0; i < candidateSegs.length; i++) {
      const seg = candidateSegs[i];
      const other = seg.owner;
      if (!other.alive || other.id === worm.id) continue;
      const otherRadius = Math.min(14 + Math.sqrt(other.targetLength) * 0.85, 34);
      const dist = Math.hypot(worm.x - seg.x, worm.y - seg.y);
      if (dist < headRadius * 0.72 + otherRadius * 0.72) {
        killCreature(worm, other, `Você foi derrotado por ${other.name}!`);
        break;
      }
    }
  }

  const leaderboard = allAlive
    .filter(w => w.alive)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(w => ({
      id: w.id,
      name: w.name,
      score: Math.floor(w.score)
    }));

  const radarPlayers = allAlive
    .filter(w => w.alive)
    .slice(0, 250)
    .map(w => ({
      x: Math.round(w.x),
      y: Math.round(w.y),
      c: w.character.glow,
      n: w.name
    }));

  const onlineCount = allAlive.length;

  for (let idx = 0; idx < allAlive.length; idx++) {
    const worm = allAlive[idx];
    if (worm.isBot || !worm.alive) continue;

    const nearWormsRaw = getNearbyFromGrid(headGrid, worm.x, worm.y, 3);
    const nearbyWorms = [];
    for (let i = 0; i < nearWormsRaw.length && nearbyWorms.length < 45; i++) {
      const other = nearWormsRaw[i];
      if (!other.alive) continue;
      nearbyWorms.push({
        id: other.id,
        name: other.name,
        character: other.character,
        x: other.x,
        y: other.y,
        angle: Number(other.angle.toFixed(2)),
        targetLength: other.targetLength,
        boosting: other.boosting || now < other.liveBoostUntil,
        segments: other.segments
      });
    }

    const nearFoodsRaw = getNearbyFromGrid(foodGrid, worm.x, worm.y, 3);
    const nearbyFoods = nearFoodsRaw.slice(0, 180);

    io.to(worm.id).emit('state', {
      self: {
        id: worm.id,
        x: worm.x,
        y: worm.y,
        score: Math.floor(worm.score),
        length: Math.floor(worm.targetLength),
        kills: worm.kills,
        alive: worm.alive
      },
      worms: nearbyWorms,
      foods: nearbyFoods,
      radarPlayers,
      leaderboard,
      onlineCount
    });
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`WORM LIVE 1.1 Ultra-Escala (ate ${MAX_PLAYERS} jogadores) rodando na porta ${PORT}`);
});
