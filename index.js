const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

let redis = null;
if (process.env.REDIS_URL) {
  const Redis = require("ioredis");
  redis = new Redis(process.env.REDIS_URL);
}

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

/* ---------- AUTH USERS ---------- */
const USERS = {
  alpha: { password: "alpha123", name: "Alpha" },
  beta: { password: "beta123", name: "Beta" },
  charlie: { password: "charlie123", name: "Charlie" },
  delta: { password: "delta123", name: "Delta" }
};

/* ---------- GAME STATE ---------- */
let players = {};
let bullets = {};

/* ---------- CLIENT ---------- */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Multiplayer Shooter</title>
  <style>
    body { margin:0; background:#000; color:#fff; font-family:sans-serif; }
    canvas { display:block; margin:auto; background:#111; }
    #login { text-align:center; margin-top:200px; }
    #score { position:absolute; top:10px; left:10px; }
  </style>
</head>
<body>

<div id="login">
  <h2>Login</h2>
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
let state = { players:{}, bullets:{} };

function login() {
  socket.emit("login", {
    username: document.getElementById("u").value,
    password: document.getElementById("p").value
  });
}

socket.on("login-success", (id) => {
  myId = id;
  document.getElementById("login").style.display="none";
  document.getElementById("game").style.display="block";
});

socket.on("login-fail", (msg) => {
  alert(msg);
});

socket.on("state", (s) => state = s);

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

document.addEventListener("keydown", e => {
  if (!myId) return;
  if (e.key==="ArrowUp") socket.emit("move",{y:-5});
  if (e.key==="ArrowDown") socket.emit("move",{y:5});
  if (e.key==="ArrowLeft") socket.emit("move",{x:-5});
  if (e.key==="ArrowRight") socket.emit("move",{x:5});
});

canvas.addEventListener("click", () => socket.emit("shoot"));

function draw() {
  ctx.clearRect(0,0,800,600);

  for (const id in state.players) {
    const p = state.players[id];
    ctx.fillStyle = id===myId ? "cyan" : "lime";
    ctx.fillRect(p.x,p.y,20,20);

    ctx.fillStyle="red";
    ctx.fillRect(p.x,p.y-5,20,3);
    ctx.fillStyle="green";
    ctx.fillRect(p.x,p.y-5,20*(p.hp/100),3);
  }

  document.getElementById("score").innerHTML =
    Object.values(state.players)
      .map(p => p.name + ": " + p.score)
      .join("<br>");

  for (const b of Object.values(state.bullets)) {
    ctx.fillStyle="yellow";
    ctx.fillRect(b.x,b.y,4,4);
  }

  requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>
`);
});

/* ---------- SOCKET ---------- */
io.on("connection", socket => {

  socket.on("login", ({username,password}) => {

    if (!USERS[username] || USERS[username].password !== password) {
      socket.emit("login-fail", "Invalid credentials");
      return;
    }

    // prevent same user twice
    for (const id in players) {
      if (players[id].username === username) {
        socket.emit("login-fail", "User already logged in");
        return;
      }
    }

    players[socket.id] = {
      username,
      name: USERS[username].name,
      x: Math.random()*760,
      y: Math.random()*560,
      hp: 100,
      score: 0
    };

    socket.emit("login-success", socket.id);
  });

  socket.on("move", d => {
    const p = players[socket.id];
    if (!p) return;
    p.x += d.x || 0;
    p.y += d.y || 0;
  });

  socket.on("shoot", () => {
    const p = players[socket.id];
    if (!p) return;

    bullets[Date.now()+Math.random()] = {
      x:p.x+10,y:p.y+10,vx:8,owner:socket.id
    };
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

/* ---------- GAME LOOP ---------- */
setInterval(() => {

  for (const id in bullets) {
    const b = bullets[id];
    b.x += b.vx;

    for (const pid in players) {
      if (pid === b.owner) continue;
      const p = players[pid];
      if (b.x>p.x && b.x<p.x+20 && b.y>p.y && b.y<p.y+20) {
        p.hp -= 20;
        players[b.owner].score++;
        delete bullets[id];

        if (p.hp <= 0) {
          p.hp = 100;
          p.x = Math.random()*760;
          p.y = Math.random()*560;
        }
      }
    }
  }

  io.emit("state", {players, bullets});
}, 30);

/* ---------- START ---------- */
server.listen(3000,"0.0.0.0",()=>{
  console.log("Multiplayer Shooter (4 Users Auth) running");
});
