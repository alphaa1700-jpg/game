const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/* ---------- USERS & TEAMS ---------- */
const USERS = {
  alpha:   { password: "alpha123",   name: "Alpha",   team: "BLUE" },
  beta:    { password: "beta123",    name: "Beta",    team: "BLUE" },
  charlie: { password: "charlie123", name: "Charlie", team: "RED"  },
  delta:   { password: "delta123",   name: "Delta",   team: "RED"  }
};

/* ---------- GAME STATE ---------- */
let players = {};
let bullets = {};
let explosions = [];

/* ---------- CLIENT HTML ---------- */
const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Multiplayer Fighter Jet</title>
<style>
body { margin:0; background:black; color:white; font-family:sans-serif; }
canvas { display:block; margin:auto; background:#050b1a; }
#login { text-align:center; margin-top:200px; }
#score { position:absolute; top:10px; left:10px; }
</style>
</head>
<body>

<div id="login">
<h2>Fighter Jet Login</h2>
<input id="u" placeholder="username"><br><br>
<input id="p" type="password" placeholder="password"><br><br>
<button onclick="login()">Login</button>
</div>

<div id="score"></div>
<canvas id="game" width="800" height="600" style="display:none"></canvas>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let myId = null;
let state = { players:{}, bullets:{}, explosions:[] };

/* ---- AUDIO ---- */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();
function beep(freq, dur){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
}

/* ---- LOGIN ---- */
function login(){
  socket.emit("login", {
    username: document.getElementById("u").value,
    password: document.getElementById("p").value
  });
}

socket.on("login-success", id => {
  myId = id;
  document.getElementById("login").style.display = "none";
  document.getElementById("game").style.display = "block";
});

socket.on("login-fail", msg => alert(msg));
socket.on("state", s => state = s);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ---- INPUT ---- */
document.addEventListener("keydown", e => {
  if (!myId) return;
  if (e.key === "ArrowUp") socket.emit("move",{dx:0,dy:-5});
  if (e.key === "ArrowDown") socket.emit("move",{dx:0,dy:5});
  if (e.key === "ArrowLeft") socket.emit("move",{dx:-5,dy:0});
  if (e.key === "ArrowRight") socket.emit("move",{dx:5,dy:0});
});

canvas.addEventListener("click", () => {
  socket.emit("shoot");
  beep(700, 0.08);
});

/* ---- DRAW LOOP ---- */
function draw(){
  ctx.clearRect(0,0,800,600);

  // jets
  for (const id in state.players){
    const p = state.players[id];

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    ctx.fillStyle = p.team === "BLUE" ? "cyan" : "red";
    ctx.beginPath();
    ctx.moveTo(18,0);      // nose
    ctx.lineTo(-12,-10);
    ctx.lineTo(-6,0);
    ctx.lineTo(-12,10);
    ctx.closePath();
    ctx.fill();

    // engine flame
    ctx.fillStyle = "orange";
    ctx.beginPath();
    ctx.moveTo(-14,-4);
    ctx.lineTo(-22,0);
    ctx.lineTo(-14,4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // hp bar
    ctx.fillStyle="red";
    ctx.fillRect(p.x-10,p.y-18,20,4);
    ctx.fillStyle="lime";
    ctx.fillRect(p.x-10,p.y-18,20*(p.hp/100),4);
  }

  // bullets
  ctx.fillStyle="yellow";
  for (const k in state.bullets){
    const b = state.bullets[k];
    ctx.fillRect(b.x,b.y,8,3);
  }

  // explosions
  state.explosions.forEach(e=>{
    ctx.beginPath();
    ctx.arc(e.x,e.y,e.r,0,Math.PI*2);
    ctx.fillStyle="rgba(255,140,0,"+(1-e.life)+")";
    ctx.fill();
  });

  // scoreboard
  document.getElementById("score").innerHTML =
    Object.values(state.players)
      .map(p => p.name+" ("+p.team+") : "+p.score)
      .join("<br>");

  requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>
`;

/* ---------- ROUTE ---------- */
app.get("/", (req,res) => res.type("html").send(HTML));

/* ---------- SOCKET ---------- */
io.on("connection", socket => {

  socket.on("login", ({username,password}) => {
    const u = USERS[username];
    if (!u || u.password !== password) {
      socket.emit("login-fail","Invalid credentials");
      return;
    }

    for (const id in players) {
      if (players[id].username === username) {
        socket.emit("login-fail","User already logged in");
        return;
      }
    }

    players[socket.id] = {
      username,
      name: u.name,
      team: u.team,
      x: Math.random()*760+20,
      y: Math.random()*560+20,
      angle: 0,
      hp: 100,
      score: 0
    };

    socket.emit("login-success", socket.id);
  });

  socket.on("move", ({dx,dy}) => {
    const p = players[socket.id];
    if (!p) return;

    p.x += dx;
    p.y += dy;
    p.angle = Math.atan2(dy, dx); // ROTATION HERE
  });

  socket.on("shoot", () => {
    const p = players[socket.id];
    if (!p) return;

    bullets[Date.now()+Math.random()] = {
      x: p.x + Math.cos(p.angle)*18,
      y: p.y + Math.sin(p.angle)*18,
      vx: Math.cos(p.angle)*8,
      vy: Math.sin(p.angle)*8,
      owner: socket.id
    };
  });

  socket.on("disconnect", () => delete players[socket.id]);
});

/* ---------- GAME LOOP ---------- */
setInterval(() => {
  for (const id in bullets){
    const b = bullets[id];
    b.x += b.vx;
    b.y += b.vy;

    for (const pid in players){
      if (pid === b.owner) continue;
      const t = players[pid];
      const o = players[b.owner];
      if (!t || !o || t.team === o.team) continue;

      if (
        b.x>t.x-10 && b.x<t.x+10 &&
        b.y>t.y-10 && b.y<t.y+10
      ){
        t.hp -= 25;
        o.score++;
        explosions.push({x:t.x,y:t.y,r:5,life:0});
        delete bullets[id];

        if (t.hp <= 0){
          t.hp = 100;
          t.x = Math.random()*760+20;
          t.y = Math.random()*560+20;
        }
        break;
      }
    }
  }

  explosions.forEach(e=>{ e.r+=2; e.life+=0.05; });
  explosions = explosions.filter(e=>e.life<1);

  io.emit("state",{players,bullets,explosions});
},30);

/* ---------- START ---------- */
server.listen(3000,"0.0.0.0",()=>{
  console.log("✈️ Multiplayer Fighter Jet with ROTATION running");
});
