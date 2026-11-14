const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static("public"));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me";
const WORLD = 12000;
const TICK_MS = 50; // 20 updates/s; tune after load testing
const players = new Map();
const foods = [];
const FOOD_TARGET = 900;
const COLORS = ["#71f36b", "#ff5d82", "#55c8ff", "#ffd45b", "#bd78ff", "#ff9a55", "#4be0c1"];

const rand = (a,b) => Math.random()*(b-a)+a;
const wrap = n => (n + WORLD) % WORLD;
function addFood(x=rand(100,WORLD-100), y=rand(100,WORLD-100), value=1) {
  foods.push({ id: crypto.randomUUID(), x, y, value });
}
for (let i=0; i<FOOD_TARGET; i++) addFood();

function publicPlayer(p) {
  return { id:p.id, name:p.name, x:p.x, y:p.y, angle:p.angle, length:p.length, color:p.color, alive:p.alive };
}
function snapshotFor(p) {
  // Only nearby players and food are sent to this client (interest management).
  const radius = 950;
  const nearby = [...players.values()].filter(q => q.alive &&
    Math.abs(q.x-p.x) < radius && Math.abs(q.y-p.y) < radius).map(publicPlayer);
  const nearbyFood = foods.filter(f => Math.abs(f.x-p.x)<radius && Math.abs(f.y-p.y)<radius);
  const leaderboard = [...players.values()].filter(q=>q.alive)
    .sort((a,b)=>b.length-a.length).slice(0,10)
    .map(q=>({name:q.name,length:Math.floor(q.length)}));
  return { self: publicPlayer(p), players: nearby, foods: nearbyFood, leaderboard, world: WORLD };
}

io.on("connection", socket => {
  socket.on("join", data => {
    const name = String(data?.name || "Visitante").replace(/[<>]/g,"").slice(0,22);
    const p = {
      id: socket.id, name, x:rand(300,WORLD-300), y:rand(300,WORLD-300),
      angle:rand(-Math.PI,Math.PI), targetAngle:0, length:20,
      color:COLORS[Math.floor(Math.random()*COLORS.length)], alive:true,
      lastInput:0, giftBoostUntil:0
    };
    players.set(socket.id,p);
    socket.emit("joined", {id:p.id, world:WORLD});
  });
  socket.on("steer", data => {
    const p=players.get(socket.id); if(!p) return;
    const angle=Number(data?.angle);
    if(Number.isFinite(angle)) p.targetAngle=angle;
  });
  socket.on("disconnect",()=>players.delete(socket.id));
});

function emitEventToPlayer(playerId, event) {
  const p=players.get(playerId);
  if(!p) return false;
  if(event.type==="gift") {
    const growth=Math.max(1,Math.min(500,Number(event.growth)||0));
    p.length += growth;
    p.giftBoostUntil=Date.now()+Math.min(8000, Number(event.boostMs)||1500);
  } else if(event.type==="bonus") {
    p.length += Math.max(1,Math.min(100,Number(event.growth)||5));
  }
  io.to(playerId).emit("effect", {type:event.type, label:event.label||"Bônus!", growth:event.growth||0});
  return true;
}

// Protected bridge endpoint. A LIVE-event adapter/provider should call this endpoint.
// Never expose ADMIN_TOKEN in the browser or in a public repository.
app.post("/api/live-event", (req,res) => {
  if(req.get("authorization") !== `Bearer ${ADMIN_TOKEN}`) return res.status(401).json({error:"unauthorized"});
  const { playerId, username, type, giftName, growth } = req.body || {};
  let p = playerId ? players.get(String(playerId)) : [...players.values()].find(q=>q.name.toLowerCase()===String(username||"").toLowerCase());
  if(!p) return res.status(404).json({error:"player_not_found"});
  if(type==="gift") emitEventToPlayer(p.id,{type:"gift",growth:Number(growth)||20,label:giftName||"Presente",boostMs:2500});
  else if(type==="follow" || type==="comment" || type==="like") emitEventToPlayer(p.id,{type:"bonus",growth:type==="follow"?10:type==="comment"?3:1,label:type==="follow"?"Novo seguidor":type==="comment"?"Comentário":"Curtida"});
  else return res.status(400).json({error:"unsupported_event"});
  res.json({ok:true, playerId:p.id, playerName:p.name});
});

app.get("/health",(_,res)=>res.json({ok:true,players:players.size,food:foods.length,world:WORLD}));
setInterval(()=>{
  const now=Date.now();
  for(const p of players.values()){
    const d=Math.atan2(Math.sin(p.targetAngle-p.angle),Math.cos(p.targetAngle-p.angle));
    p.angle += Math.max(-0.12,Math.min(0.12,d));
    const speed = p.giftBoostUntil>now ? 5.0 : 3.0;
    p.x=wrap(p.x+Math.cos(p.angle)*speed);
    p.y=wrap(p.y+Math.sin(p.angle)*speed);
    // Lightweight food pickup. Production version should use spatial hashing.
    for(let i=foods.length-1;i>=0;i--){
      const f=foods[i];
      if(Math.abs(f.x-p.x)<13 && Math.abs(f.y-p.y)<13){
        p.length += f.value;
        foods.splice(i,1);
        addFood();
      }
    }
  }
  for(const p of players.values()) io.to(p.id).emit("state",snapshotFor(p));
},TICK_MS);

server.listen(PORT,()=>console.log(`WORM LIVE beta on http://localhost:${PORT}`));
