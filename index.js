const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const players = {};
const bullets = [];

/* ---------- HTML + CLIENT CODE (INLINE) ---------- */
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Multiplayer Shooter</title>
  <style>
    body { margin: 0; background: #000; }
    canvas { display: block; margin: auto; background: #111; }
  </style>
</head>
<body>
<canvas id="game" width="800" height="600"></canvas>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let players = {};
let bullets = [];
let myId = null;

socket.on("init", (data) => {
  myId = data.id;
});

socket.on("state", (state) => {
  players = state.players;
  bullets = state.bullets;
});

document.addEventListener("keydown", (e) => {
  if (!players[myId]) return;

  if (e.key === "ArrowUp") socket.emit("move", { y: -5 });
  if (e.key === "ArrowDown") socket.emit("move", { y: 5 });
  if (e.key === "ArrowLeft") socket.emit("move", { x: -5 });
  if (e.key === "ArrowRight") socket.emit("move", { x: 5 });
});

canvas.addEventListener("click", () => {
  socket.emit("shoot");
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // players
  for (const id in players) {
    const p = players[id];
    ctx.fillStyle = id === myId ? "cyan" : "lime";
    ctx.fillRect(p.x, p.y, 20, 20);

    // health bar
    ctx.fillStyle = "red";
    ctx.fillRect(p.x, p.y - 5, 20, 3);
    ctx.fillStyle = "green";
    ctx.fillRect(p.x, p.y - 5, 20 * (p.hp / 100), 3);
  }

  // bullets
  ctx.fillStyle = "yellow";
  bullets.forEach(b => {
    ctx.fillRect(b.x, b.y, 4, 4);
  });

  requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>
`);
});

/* ---------- SERVER GAME LOGIC ---------- */
io.on("connection", (socket) => {
  players[socket.id] = {
    x: Math.random() * 760,
    y: Math.random() * 560,
    hp: 100
  };

  socket.emit("init", { id: socket.id });

  socket.on("move", (delta) => {
    const p = players[socket.id];
    if (!p) return;
    p.x += delta.x || 0;
    p.y += delta.y || 0;
  });

  socket.on("shoot", () => {
    const p = players[socket.id];
    if (!p) return;

    bullets.push({
      x: p.x + 10,
      y: p.y + 10,
      vx: 8,
      vy: 0,
      owner: socket.id
    });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

/* ---------- GAME LOOP ---------- */
setInterval(() => {
  // move bullets
  bullets.forEach(b => {
    b.x += b.vx;
    b.y += b.vy;
  });

  // collision detection
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    for (const id in players) {
      if (id === b.owner) continue;
      const p = players[id];

      if (
        b.x > p.x &&
        b.x < p.x + 20 &&
        b.y > p.y &&
        b.y < p.y + 20
      ) {
        p.hp -= 20;
        bullets.splice(i, 1);

        if (p.hp <= 0) {
          p.x = Math.random() * 760;
          p.y = Math.random() * 560;
          p.hp = 100;
        }
        break;
      }
    }
  }

  io.emit("state", { players, bullets });
}, 30);

/* ---------- START SERVER ---------- */
server.listen(3000, "0.0.0.0", () => {
  console.log("Multiplayer Shooter running on port 3000");
});
