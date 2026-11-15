require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const WORLD_SIZE = 6000;
const TICK_RATE = 25;
const INITIAL_LENGTH = 18;
const SEGMENT_SPACING = 8;
const MAX_FOOD = 320;
const BOT_COUNT = 12;

const SKINS = [
  { name: 'Esmeralda', primary: '#10b981', secondary: '#047857', glow: '#34d399' },
  { name: 'Rubi', primary: '#ef4444', secondary: '#991b1b', glow: '#f87171' },
  { name: 'Ouro', primary: '#f59e0b', secondary: '#b45309', glow: '#fbbf24' },
  { name: 'Safira', primary: '#3b82f6', secondary: '#1d4ed8', glow: '#60a5fa' },
  { name: 'Ametista', primary: '#a855f7', secondary: '#6b21a8', glow: '#c084fc' },
  { name: 'Ciano Neon', primary: '#06b6d4', secondary: '#0e7490', glow: '#22d3ee' },
  { name: 'Rosa Choque', primary: '#ec4899', secondary: '#9d174d', glow: '#f472b6' }
];

const FOOD_TYPES = [
  { type: 'apple', emoji: '🍎', value: 2, radius: 14, color: '#ef4444' },
  { type: 'strawberry', emoji: '🍓', value: 2, radius: 13, color: '#f43f5e' },
  { type: 'donut', emoji: '🍩', value: 4, radius: 16, color: '#ec4899' },
  { type: 'burger', emoji: '🍔', value: 6, radius: 18, color: '#f59e0b' },
  { type: 'pizza', emoji: '🍕', value: 5, radius: 17, color: '#eab308' },
  { type: 'gem', emoji: '💎', value: 12, radius: 20, color: '#38bdf8' }
];

const players = new Map();
const foods = new Map();
let foodIdCounter = 1;

function randomPos(margin = 300) {
  return margin + Math.random() * (WORLD_SIZE - margin * 2);
}

function spawnFood(x, y, forcedType = null) {
  const id = foodIdCounter++;
  const template = forcedType || FOOD_TYPES[Math.floor(Math.random() * (FOOD_TYPES.length - 1))];
  const food = {
    id,
    x: x !== undefined ? x : randomPos(100),
    y: y !== undefined ? y : randomPos(100),
    type: template.type,
    emoji: template.emoji,
    value: template.value,
    radius: template.radius,
    color: template.color,
    phase: Math.random() * Math.PI * 2
  };
  foods.set(id, food);
  return food;
}

for (let i = 0; i < MAX_FOOD; i++) {
  spawnFood();
}

function createWorm(id, name, isBot = false, skinIndex = null) {
  const startX = randomPos(500);
  const startY = randomPos(500);
  const angle = Math.random() * Math.PI * 2;
  const skin = SKINS[skinIndex !== null ? skinIndex % SKINS.length : Math.floor(Math.random() * SKINS.length)];

  const segments = [];
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    segments.push({
      x: startX - Math.cos(angle) * i * SEGMENT_SPACING,
      y: startY - Math.sin(angle) * i * SEGMENT_SPACING
    });
  }

  return {
    id,
    name: (name || 'Jogador').slice(0, 20),
    isBot,
    skin,
    x: startX,
    y: startY,
    angle,
    targetAngle: angle,
    speed: 4.2,
    boosting: false,
    liveBoostUntil: 0,
    score: 0,
    targetLength: INITIAL_LENGTH,
    segments,
    alive: true,
    botTurnTimer: 0
  };
}

// Spawn bots
const BOT_NAMES = ['TioJao_Bot', 'BoiNegro_VIP', 'FozGamer', 'NioFibra_1G', 'MestreCobra', 'LiveHunter', 'TikTokStar', 'ReiDaArena', 'CobraTurbo', 'NeonWorm', 'SlitherBR', 'AlphaLive'];
for (let i = 0; i < BOT_COUNT; i++) {
  const botId = `bot_${i + 1}`;
  players.set(botId, createWorm(botId, BOT_NAMES[i % BOT_NAMES.length], true, i));
}

function killWorm(worm, reason = 'Colidiu com outra cobra!') {
  if (!worm.alive) return;
  worm.alive = false;

  // Drop food along worm body
  for (let i = 0; i < worm.segments.length; i += 2) {
    const seg = worm.segments[i];
    spawnFood(
      seg.x + (Math.random() - 0.5) * 20,
      seg.y + (Math.random() - 0.5) * 20,
      { type: 'orb', emoji: '✨', value: 3, radius: 14, color: worm.skin.glow }
    );
  }

  if (worm.isBot) {
    setTimeout(() => {
      players.set(worm.id, createWorm(worm.id, worm.name, true));
    }, 2500);
  } else {
    io.to(worm.id).emit('died', { score: worm.score, reason });
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, skinIndex }) => {
    const cleanName = String(name || 'Convidado').trim().slice(0, 20) || 'Convidado';
    const worm = createWorm(socket.id, cleanName, false, skinIndex);
    players.set(socket.id, worm);
    socket.emit('joined', {
      id: socket.id,
      worldSize: WORLD_SIZE,
      skins: SKINS
    });
  });

  socket.on('input', ({ angle, boosting }) => {
    const worm = players.get(socket.id);
    if (!worm || !worm.alive) return;
    if (typeof angle === 'number' && !Number.isNaN(angle)) {
      worm.targetAngle = angle;
    }
    worm.boosting = Boolean(boosting) && worm.targetLength > 12;
  });

  socket.on('respawn', ({ name, skinIndex }) => {
    const existing = players.get(socket.id);
    const cleanName = String(name || (existing && existing.name) || 'Convidado').trim().slice(0, 20);
    const worm = createWorm(socket.id, cleanName, false, skinIndex);
    players.set(socket.id, worm);
    socket.emit('joined', {
      id: socket.id,
      worldSize: WORLD_SIZE,
      skins: SKINS
    });
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
  });
});

// Endpoint para eventos do TikTok LIVE (TikTool Bridge)
app.post('/api/live-event', (req, res) => {
  if (ADMIN_TOKEN) {
    const auth = req.headers['x-admin-token'] || req.body.token;
    if (auth !== ADMIN_TOKEN) {
      return res.status(401).json({ ok: false, error: 'Token inválido' });
    }
  }

  const { type, username, giftName, repeatCount = 1 } = req.body || {};
  const cleanUser = String(username || '').replace(/^@/, '').toLowerCase();

  let targetWorm = null;
  for (const w of players.values()) {
    if (!w.isBot && w.alive && w.name.replace(/^@/, '').toLowerCase() === cleanUser) {
      targetWorm = w;
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
    growth = 8;
    boostMs = 4000;
    effectMessage = `⭐ ${username} seguiu @jairodrum! (+8 tamanho & Turbo)`;
  } else if (type === 'chat') {
    growth = 1;
    effectMessage = `💬 ${username}: ${req.body.comment || 'Comentou!'}`;
  } else if (type === 'gift') {
    const count = Math.min(Number(repeatCount) || 1, 50);
    growth = 10 * count;
    boostMs = 6000;
    effectMessage = `🎁 ${username} enviou ${giftName || 'Presente'} x${count}! (+${growth} tamanho)`;
  }

  if (targetWorm) {
    targetWorm.targetLength = Math.min(targetWorm.targetLength + growth, 450);
    targetWorm.score += growth * 10;
    if (boostMs > 0) {
      targetWorm.liveBoostUntil = Date.now() + boostMs;
    }
  } else if (growth > 0) {
    // Spawna cristais especiais no mapa caso o espectador ainda não tenha entrado com o mesmo @
    for (let i = 0; i < Math.min(growth, 15); i++) {
      spawnFood(undefined, undefined, FOOD_TYPES[5]);
    }
  }

  if (effectMessage) {
    io.emit('live_banner', {
      type,
      username,
      message: effectMessage,
      matchedPlayer: Boolean(targetWorm)
    });
  }

  res.json({ ok: true, matchedPlayer: Boolean(targetWorm), growth });
});

// Game Loop
setInterval(() => {
  const now = Date.now();

  while (foods.size < MAX_FOOD) {
    spawnFood();
  }

  for (const worm of players.values()) {
    if (!worm.alive) continue;

    // Bot AI
    if (worm.isBot) {
      worm.botTurnTimer--;
      if (worm.botTurnTimer <= 0) {
        worm.botTurnTimer = 15 + Math.floor(Math.random() * 25);
        // Look for nearby food
        let nearest = null;
        let bestDist = 450;
        for (const f of foods.values()) {
          const d = Math.hypot(f.x - worm.x, f.y - worm.y);
          if (d < bestDist) {
            bestDist = d;
            nearest = f;
          }
        }
        if (nearest) {
          worm.targetAngle = Math.atan2(nearest.y - worm.y, nearest.x - worm.x);
        } else {
          worm.targetAngle += (Math.random() - 0.5) * 1.4;
        }
        // Avoid walls
        if (worm.x < 350) worm.targetAngle = 0;
        if (worm.x > WORLD_SIZE - 350) worm.targetAngle = Math.PI;
        if (worm.y < 350) worm.targetAngle = Math.PI / 2;
        if (worm.y > WORLD_SIZE - 350) worm.targetAngle = -Math.PI / 2;
      }
    }

    // Smooth steering
    let diff = worm.targetAngle - worm.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    worm.angle += diff * 0.16;

    const isLiveBoost = now < worm.liveBoostUntil;
    const activeBoost = worm.boosting || isLiveBoost;
    const currentSpeed = activeBoost ? 7.4 : 4.2;

    if (worm.boosting && !isLiveBoost && Math.random() < 0.15 && worm.targetLength > 12) {
      worm.targetLength -= 0.25;
      const tail = worm.segments[worm.segments.length - 1];
      if (tail && Math.random() < 0.3) {
        spawnFood(tail.x, tail.y, { type: 'spark', emoji: '✨', value: 1, radius: 10, color: worm.skin.glow });
      }
    }

    worm.x += Math.cos(worm.angle) * currentSpeed;
    worm.y += Math.sin(worm.angle) * currentSpeed;

    // World border collision
    if (worm.x <= 25 || worm.x >= WORLD_SIZE - 25 || worm.y <= 25 || worm.y >= WORLD_SIZE - 25) {
      killWorm(worm, 'Bateu na borda da arena!');
      continue;
    }

    // Move segments (true snake chain follow)
    worm.segments.unshift({ x: worm.x, y: worm.y });
    for (let i = 1; i < worm.segments.length; i++) {
      const prev = worm.segments[i - 1];
      const curr = worm.segments[i];
      const dx = prev.x - curr.x;
      const dy = prev.y - curr.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SEGMENT_SPACING) {
        const a = Math.atan2(dy, dx);
        curr.x = prev.x - Math.cos(a) * SEGMENT_SPACING;
        curr.y = prev.y - Math.sin(a) * SEGMENT_SPACING;
      }
    }

    const desiredCount = Math.floor(worm.targetLength);
    while (worm.segments.length > desiredCount) {
      worm.segments.pop();
    }

    // Head radius grows slightly with length
    const headRadius = Math.min(14 + Math.sqrt(worm.targetLength) * 0.85, 32);

    // Eat foods
    for (const [fId, food] of foods.entries()) {
      const dist = Math.hypot(worm.x - food.x, worm.y - food.y);
      if (dist < headRadius + food.radius + 6) {
        foods.delete(fId);
        worm.targetLength = Math.min(worm.targetLength + food.value * 0.45, 500);
        worm.score += food.value * 10;
        if (!worm.isBot) {
          io.to(worm.id).emit('ate', {
            x: food.x,
            y: food.y,
            value: food.value * 10,
            color: food.color,
            emoji: food.emoji
          });
        }
      }
    }

    // Worm-to-Worm Collision
    for (const other of players.values()) {
      if (!other.alive || other.id === worm.id) continue;
      const otherRadius = Math.min(13 + Math.sqrt(other.targetLength) * 0.8, 30);
      // Check against body segments (skip first 3 segments)
      for (let i = 3; i < other.segments.length; i += 2) {
        const seg = other.segments[i];
        const dist = Math.hypot(worm.x - seg.x, worm.y - seg.y);
        if (dist < headRadius * 0.75 + otherRadius * 0.75) {
          killWorm(worm, `Você bateu em ${other.name}!`);
          other.score += 100;
          break;
        }
      }
      if (!worm.alive) break;
    }
  }

  // Build Leaderboard
  const leaderboard = Array.from(players.values())
    .filter((w) => w.alive)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((w) => ({ id: w.id, name: w.name, score: Math.floor(w.score), skin: w.skin }));

  // Send personalized viewport state to each connected player
  for (const [socketId, worm] of players.entries()) {
    if (worm.isBot) continue;

    const viewRange = 1350;
    const nearbyWorms = [];
    for (const other of players.values()) {
      if (!other.alive) continue;
      const inRange =
        Math.abs(other.x - worm.x) < viewRange ||
        other.segments.some((s, idx) => idx % 4 === 0 && Math.abs(s.x - worm.x) < viewRange && Math.abs(s.y - worm.y) < viewRange);
      if (inRange) {
        nearbyWorms.push({
          id: other.id,
          name: other.name,
          skin: other.skin,
          x: other.x,
          y: other.y,
          angle: other.angle,
          score: Math.floor(other.score),
          targetLength: other.targetLength,
          boosting: other.boosting || now < other.liveBoostUntil,
          segments: other.segments
        });
      }
    }

    const nearbyFoods = [];
    for (const food of foods.values()) {
      if (Math.abs(food.x - worm.x) < viewRange && Math.abs(food.y - worm.y) < viewRange) {
        nearbyFoods.push(food);
      }
    }

    io.to(socketId).emit('state', {
      self: {
        id: worm.id,
        x: worm.x,
        y: worm.y,
        score: Math.floor(worm.score),
        length: Math.floor(worm.targetLength),
        alive: worm.alive,
        boosting: worm.boosting || now < worm.liveBoostUntil
      },
      worms: nearbyWorms,
      foods: nearbyFoods,
      leaderboard
    });
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`WORM LIVE 0.2 rodando na porta ${PORT}`);
});
