const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/* ---------- CONSTANTS ---------- */
const WIDTH = 1200;
const HEIGHT = 800;
const JET_RADIUS = 18;

/* ---------- USERS ---------- */
const USERS = {
  alpha:   { password: "alpha123",   name: "Alpha",   team: "BLUE" },
  beta:    { password: "beta123",    name: "Beta",    team: "BLUE" },
  charlie: { password: "charlie123", name: "Charlie", team: "RED"  },
  delta:   { password: "delta123",   name: "Delta",   team: "RED"  }
};

/* ---------- GAME STATE ---------- */
let players = {};
let bullets = {};

/* ---------- CLIENT ---------- */
const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>TOP GUN</title>
<style>
body {
  margin:0;
  background:black;
  font-family:Arial, Helvetica, sans-serif;
  overflow:hidden;
}
#loginBox {
  text-align:center;
  margin-top:200px;
  color:white;
}
#score {
  position:absolute;
  top:10px;
  left:10px;
  color:white;
  text-shadow:1px 1px 3px black;
  font-size:14px;
}
canvas {
  display:block;
  margin:auto;
  cursor:crosshair;
}
</style>
</head>
<body>

<div id="loginBox">
  <h1>TOP GUN</h1>
  <p>Multiplayer Jet Combat</p>
  <input id="username" placeholder="username"><br><br>
  <input id="password" type="password" placeholder="password"><br><br>
  <button onclick="doLogin()">Enter Cockpit</button>
</div>

<div id="score"></div>
<canvas id="game" width="${WIDTH}" height="${HEIGHT}" style="display:none"></canvas>

<script src="/socket.io/socket.io.js"></script>
<script>
/* ================= AUDIO SYSTEM ================= */
let audioCtx;
let engineOsc, engineGain;

function initAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Engine sound
  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 90;
  engineGain.gain.value = 0;

  engineOsc.connect(engineGain).connect(audioCtx.destination);
  engineOsc.start();
}

function engineOn(speed=1) {
  if (!engineGain) return;
  engineGain.gain.linearRampToValueAtTime(0.08*speed, audioCtx.currentTime + 0.1);
  engineOsc.frequency.linearRampToValueAtTime(90 + speed*120, audioCtx.currentTime + 0.1);
}

function engineOff() {
  if (!engineGain) return;
  engineGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
}

function gunSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = 600;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

/* ================= GAME ================= */
const socket = io();
let myId = null;
let state = { players:{}, bullets:{} };
let mode = "day";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ---------- CLOUDS ---------- */
const clouds = [];
for (let i = 0; i < 15; i++) {
  clouds.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: 40 + Math.random() * 60,
    speed: 0.2 + Math.random() * 0.3
  });
}

/* ---------- LOGIN ---------- */
function doLogin() {
  initAudio();
  socket.emit("login", {
    username: username.value,
    password: password.value
  });
}

socket.on("login-success", id => {
  myId = id;
  loginBox.style.display = "none";
  canvas.style.display = "block";
});

socket.on("login-fail", alert);
socket.on("state", s => state = s);

/* ---------- INPUT ---------- */
canvas.addEventListener("mousemove", e => {
  if (!myId) return;
  const r = canvas.getBoundingClientRect();
  socket.emit("aim", {
    mx: e.clientX - r.left,
    my: e.clientY - r.top
  });
});

document.addEventListener("keydown", e => {
  if (e.key === "ArrowUp") {
    socket.emit("thrust");
    engineOn(1);
  }
  if (e.key === "d" || e.key === "D") mode = "day";
  if (e.key === "n" || e.key === "N") mode = "night";
});

document.addEventListener("keyup", e => {
  if (e.key === "ArrowUp") engineOff();
});

canvas.addEventListener("click", () => {
  gunSound();
  socket.emit("shoot");
});

/* ---------- DRAW ---------- */
function drawSky() {
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  if (mode === "day") {
    g.addColorStop(0,"#6db3f2");
    g.addColorStop(1,"#1e69de");
  } else {
    g.addColorStop(0,"#020024");
    g.addColorStop(1,"#090979");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);
}

function drawClouds() {
  ctx.fillStyle = mode==="day"
    ? "rgba(255,255,255,0.8)"
    : "rgba(200,200,255,0.3)";

  clouds.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x,c.y,c.r,0,Math.PI*2);
    ctx.arc(c.x+c.r*0.6,c.y+10,c.r*0.8,0,Math.PI*2);
    ctx.arc(c.x-c.r*0.6,c.y+10,c.r*0.7,0,Math.PI*2);
    ctx.fill();
    c.x += c.speed;
    if (c.x - c.r > canvas.width) c.x = -c.r;
  });
}

function drawJet(p) {
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.rotate(p.angle+p.bank);

  ctx.fillStyle="#444";
  ctx.beginPath();
  ctx.ellipse(0,0,20,6,0,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle=p.team==="BLUE"?"#3cf":"#f33";
  ctx.beginPath();
  ctx.moveTo(-5,-2);
  ctx.lineTo(-18,-12);
  ctx.lineTo(-14,-2);
  ctx.lineTo(-18,12);
  ctx.lineTo(-5,2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle="#9ff";
  ctx.beginPath();
  ctx.ellipse(8,0,5,3,0,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle="orange";
  ctx.beginPath();
  ctx.moveTo(-22,-3);
  ctx.lineTo(-30,0);
  ctx.lineTo(-22,3);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/* ---------- LOOP ---------- */
function draw() {
  drawSky();
  drawClouds();
  Object.values(state.players).forEach(drawJet);

  ctx.fillStyle="yellow";
  Object.values(state.bullets).forEach(b=>{
    ctx.fillRect(b.x,b.y,6,3);
  });

  score.innerHTML =
    "<b>TOP GUN</b><br>Mode: "+mode.toUpperCase()+"<br><br>" +
    Object.values(state.players).map(
      p=>p.name+" ("+p.team+") : "+p.score
    ).join("<br>");

  requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>
`;

app.get("/", (_, res) => res.type("html").send(HTML));

/* ---------- SERVER ---------- */
io.on("connection", socket => {

  socket.on("login", ({username,password}) => {
    const u = USERS[username];
    if (!u || u.password !== password) {
      socket.emit("login-fail","Invalid credentials");
      return;
    }
    for (const id in players) {
      if (players[id].username === username) delete players[id];
    }
    players[socket.id] = {
      username,
      name:u.name,
      team:u.team,
      x:Math.random()*(WIDTH-40)+20,
      y:Math.random()*(HEIGHT-40)+20,
      vx:0,vy:0,
      angle:0,targetAngle:0,
      bank:0,hp:100,score:0
    };
    socket.emit("login-success",socket.id);
  });

  socket.on("aim", ({mx,my}) => {
    const p = players[socket.id];
    if (p) p.targetAngle = Math.atan2(my-p.y,mx-p.x);
  });

  socket.on("thrust", () => {
    const p = players[socket.id];
    if (p) {
      p.vx += Math.cos(p.angle)*0.6;
      p.vy += Math.sin(p.angle)*0.6;
    }
  });

  socket.on("shoot", () => {
    const p = players[socket.id];
    if (p) {
      bullets[Date.now()+Math.random()] = {
        x:p.x,y:p.y,angle:p.angle,owner:socket.id
      };
    }
  });

  socket.on("disconnect", () => delete players[socket.id]);
});

/* ---------- GAME LOOP ---------- */
setInterval(() => {
  for (const id in players) {
    const p = players[id];
    let d = p.targetAngle - p.angle;
    d = Math.atan2(Math.sin(d),Math.cos(d));
    p.angle += d*0.15;
    p.bank = -d*0.8;

    p.x += p.vx; p.y += p.vy;
    p.x=Math.max(JET_RADIUS,Math.min(WIDTH-JET_RADIUS,p.x));
    p.y=Math.max(JET_RADIUS,Math.min(HEIGHT-JET_RADIUS,p.y));
    p.vx*=0.98; p.vy*=0.98;
  }

  for (const id in bullets) {
    const b = bullets[id];
    b.x+=Math.cos(b.angle)*6;
    b.y+=Math.sin(b.angle)*6;
    if(b.x<0||b.x>WIDTH||b.y<0||b.y>HEIGHT) delete bullets[id];
  }

  io.emit("state",{players,bullets});
},30);

server.listen(3000, () => {
  console.log("✈️ TOP GUN — sound-enabled version running");
});
