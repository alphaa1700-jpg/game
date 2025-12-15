const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/* ---------- GAME CONSTANTS ---------- */
const WIDTH = 1200;
const HEIGHT = 800;
const JET_RADIUS = 15;

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
let explosions = [];

/* ---------- CLIENT HTML ---------- */
const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Multiplayer Jet Combat</title>
<style>
body { margin:0; background:black; color:white; font-family:sans-serif; }
canvas { display:block; margin:auto; background:#050b1a; cursor:crosshair; }
#loginBox { text-align:center; margin-top:200px; }
#score { position:absolute; top:10px; left:10px; }
</style>
</head>
<body>

<div id="loginBox">
<h2>Jet Combat Login</h2>
<input id="username" placeholder="username"><br><br>
<input id="password" type="password" placeholder="password"><br><br>
<button onclick="doLogin()">Login</button>
</div>

<div id="score"></div>
<canvas id="game" width="${WIDTH}" height="${HEIGHT}" style="display:none"></canvas>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let myId = null;
let state = { players:{}, bullets:{}, explosions:[] };

function doLogin() {
  socket.emit("login", {
    username: document.getElementById("username").value,
    password: document.getElementById("password").value
  });
}

socket.on("login-success", id => {
  myId = id;
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("game").style.display = "block";
});

socket.on("login-fail", msg => alert(msg));
socket.on("state", s => state = s);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ---------- INPUT ---------- */

// mouse aiming
canvas.addEventListener("mousemove", e => {
  if (!myId) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  socket.emit("aim", { mx, my });
});

// thrust
document.addEventListener("keydown", e => {
  if (!myId) return;
  if (e.key === "ArrowUp") socket.emit("thrust");
});

// shoot
canvas.addEventListener("click", () => socket.emit("shoot"));

/* ---------- DRAW ---------- */
function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  for (const id in state.players) {
    const p = state.players[id];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + p.bank);

    ctx.fillStyle = p.team === "BLUE" ? "cyan" : "red";
    ctx.beginPath();
    ctx.moveTo(18,0);
    ctx.lineTo(-12,-8);
    ctx.lineTo(-6,0);
    ctx.lineTo(-12,8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // health bar
    ctx.fillStyle = "red";
    ctx.fillRect(p.x-12, p.y-22, 24, 4);
    ctx.fillStyle = "lime";
    ctx.fillRect(p.x-12, p.y-22, 24 * (p.hp/100), 4);
  }

  ctx.fillStyle = "yellow";
  Object.values(state.bullets).forEach(b => {
    ctx.fillRect(b.x, b.y, 6, 3);
  });

  state.explosions.forEach(e => {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,120,0,"+(1-e.life)+")";
    ctx.fill();
  });

  document.getElementById("score").innerHTML =
    Object.values(state.players)
      .map(p => p.name + " (" + p.team + ") : " + p.score)
      .join("<br>");

  requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>
`;

app.get("/", (_, res) => res.type("html").send(HTML));

/* ---------- SOCKET LOGIC ---------- */
io.on("connection", socket => {

  socket.on("login", ({username, password}) => {
    const u = USERS[username];
    if (!u || u.password !== password) {
      socket.emit("login-fail", "Invalid credentials");
      return;
    }

    for (const id in players) {
      if (players[id].username === username) delete players[id];
    }

    players[socket.id] = {
      username,
      name: u.name,
      team: u.team,
      x: Math.random()*(WIDTH-2*JET_RADIUS)+JET_RADIUS,
      y: Math.random()*(HEIGHT-2*JET_RADIUS)+JET_RADIUS,
      vx: 0,
      vy: 0,
      angle: 0,
      targetAngle: 0,
      bank: 0,
      hp: 100,
      score: 0
    };

    socket.emit("login-success", socket.id);
  });

  socket.on("aim", ({mx,my}) => {
    const p = players[socket.id];
    if (!p) return;
    p.targetAngle = Math.atan2(my - p.y, mx - p.x);
  });

  socket.on("thrust", () => {
    const p = players[socket.id];
    if (!p) return;
    p.vx += Math.cos(p.angle) * 0.6;
    p.vy += Math.sin(p.angle) * 0.6;
  });

  socket.on("shoot", () => {
    const p = players[socket.id];
    if (!p) return;
    bullets[Date.now()+Math.random()] = {
      x: p.x,
      y: p.y,
      angle: p.angle,
      owner: socket.id
    };
  });

  socket.on("disconnect", () => delete players[socket.id]);
});

/* ---------- GAME LOOP ---------- */
setInterval(() => {
  for (const id in players) {
    const p = players[id];

    // smooth rotation toward mouse
    let diff = p.targetAngle - p.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    p.angle += diff * 0.15;
    p.bank = -diff * 0.8;

    p.x += p.vx;
    p.y += p.vy;

    p.x = Math.max(JET_RADIUS, Math.min(WIDTH-JET_RADIUS, p.x));
    p.y = Math.max(JET_RADIUS, Math.min(HEIGHT-JET_RADIUS, p.y));

    p.vx *= 0.98;
    p.vy *= 0.98;
    p.bank *= 0.9;
  }

  for (const id in bullets) {
    const b = bullets[id];
    const o = players[b.owner];
    if (!o) { delete bullets[id]; continue; }

    b.x += Math.cos(b.angle) * 6;
    b.y += Math.sin(b.angle) * 6;

    if (b.x<0||b.x>WIDTH||b.y<0||b.y>HEIGHT) {
      delete bullets[id];
      continue;
    }

    for (const pid in players) {
      const t = players[pid];
      if (t.team === o.team) continue;

      if (Math.hypot(b.x - t.x, b.y - t.y) < JET_RADIUS) {
        t.hp -= 30;
        o.score++;
        explosions.push({x:t.x,y:t.y,r:5,life:0});
        delete bullets[id];

        if (t.hp <= 0) {
          t.hp = 100;
          t.x = Math.random()*(WIDTH-2*JET_RADIUS)+JET_RADIUS;
          t.y = Math.random()*(HEIGHT-2*JET_RADIUS)+JET_RADIUS;
        }
        break;
      }
    }
  }

  explosions.forEach(e => { e.r+=2; e.life+=0.05; });
  explosions = explosions.filter(e => e.life < 1);

  io.emit("state", {players, bullets, explosions});
}, 30);

server.listen(3000, "0.0.0.0", () => {
  console.log("✈️ Jet Combat — mouse-aim enabled");
});
