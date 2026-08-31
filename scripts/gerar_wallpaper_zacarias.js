const fs = require('fs');
const path = require('path');

const imgs = {
  mascaras: fs.readFileSync('C:/Users/Pichau/Downloads/zacarias_mascara.png'),
  semMascara: fs.readFileSync('C:/Users/Pichau/Downloads/zacarias_sem_mascara.png')
};

const b64 = {
  mascaras: imgs.mascaras.toString('base64'),
  semMascara: imgs.semMascara.toString('base64')
};

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zacarias - Dance Floor</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 100vw; height: 100vh; overflow: hidden;
    background: #0a0014;
    display: flex; align-items: flex-end; justify-content: center;
    font-family: 'Segoe UI', sans-serif;
  }
  canvas#floor {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 0;
  }
  .character {
    position: fixed;
    bottom: 0; left: 50%; transform: translateX(-50%);
    z-index: 10;
    width: auto; height: 85vh;
    animation: bounce 0.6s ease-in-out infinite alternate;
  }
  .character img {
    height: 100%; width: auto;
    filter: drop-shadow(0 0 20px rgba(255, 0, 100, 0.5))
            drop-shadow(0 0 40px rgba(0, 200, 255, 0.3));
    image-rendering: auto;
  }
  @keyframes bounce {
    0% { transform: translateX(-50%) translateY(0px); }
    100% { transform: translateX(-50%) translateY(-18px); }
  }
  .mask-layer {
    position: fixed;
    bottom: 0; left: 50%; transform: translateX(-50%);
    z-index: 11;
    width: auto; height: 85vh;
    animation: maskDrop 4s ease-in-out infinite;
    pointer-events: none;
  }
  .mask-layer img {
    height: 100%; width: auto;
    filter: drop-shadow(0 0 15px rgba(255, 50, 100, 0.7));
    image-rendering: auto;
  }
  @keyframes maskDrop {
    0%, 100% { opacity: 0; transform: translateX(-50%) translateY(-40px); }
    15% { opacity: 1; }
    50% { opacity: 1; transform: translateX(-50%) translateY(0px); }
    65% { opacity: 0; }
  }
  .glow-line {
    position: fixed;
    width: 2px; height: 100vh;
    background: linear-gradient(180deg, transparent 0%, #ff006688 50%, transparent 100%);
    z-index: 1;
    animation: glowPulse 2s ease-in-out infinite alternate;
  }
  @keyframes glowPulse {
    0% { opacity: 0.2; }
    100% { opacity: 0.8; }
  }
  .particle {
    position: fixed;
    width: 3px; height: 3px;
    border-radius: 50%;
    z-index: 5;
    animation: floatUp linear infinite;
    opacity: 0;
  }
  @keyframes floatUp {
    0% { opacity: 0; transform: translateY(0) scale(0.5); }
    20% { opacity: 1; }
    80% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-100vh) scale(1.5); }
  }
  .spotlight {
    position: fixed;
    width: 300px; height: 300px;
    border-radius: 50%;
    z-index: 2;
    filter: blur(80px);
    animation: spotlightMove 6s ease-in-out infinite alternate;
    pointer-events: none;
  }
  @keyframes spotlightMove {
    0% { transform: translate(-100px, -50px); }
    100% { transform: translate(100px, 50px); }
  }
</style>
</head>
<body>

<canvas id="floor"></canvas>

<div class="spotlight" style="top:10%;left:20%;background:radial-gradient(circle,rgba(255,0,102,0.3),transparent);"></div>
<div class="spotlight" style="top:20%;right:20%;background:radial-gradient(circle,rgba(0,200,255,0.3),transparent);animation-delay:-3s;"></div>
<div class="spotlight" style="top:5%;left:60%;background:radial-gradient(circle,rgba(120,0,255,0.25),transparent);animation-delay:-1.5s;"></div>

<div class="character" id="char">
  <img id="imgSemMascara" src="data:image/png;base64,${b64.semMascara}" alt="Zacarias" style="display:block;">
  <img id="imgComMascara" src="data:image/png;base64,${b64.mascaras}" alt="Zacarias Mask" style="position:absolute;top:0;left:0;display:none;">
</div>

<div class="mask-layer" id="maskFloat">
  <img src="data:image/png;base64,${b64.mascaras}" alt="mask float">
</div>

<script>
const canvas = document.getElementById('floor');
const ctx = canvas.getContext('2d');
let W, H;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Grid floor
let gridOffset = 0;
function drawFloor(t) {
  ctx.clearRect(0, 0, W, H);
  const horizon = H * 0.45;
  const vanishX = W / 2;

  // Dark background
  ctx.fillStyle = '#0a0014';
  ctx.fillRect(0, 0, W, H);

  // Perspective grid
  const rows = 20;
  const cols = 14;
  gridOffset = (t * 0.0003) % 1;

  ctx.strokeStyle = 'rgba(255, 0, 102, 0.15)';
  ctx.lineWidth = 1;

  // Horizontal lines (receding)
  for (let i = 0; i <= rows; i++) {
    const p = (i + gridOffset) / rows;
    const y = horizon + (H - horizon) * Math.pow(p, 1.5);
    const spread = p * W * 0.8;
    ctx.beginPath();
    ctx.moveTo(vanishX - spread, y);
    ctx.lineTo(vanishX + spread, y);
    const pulse = 0.1 + 0.08 * Math.sin(t * 0.002 + i * 0.5);
    ctx.strokeStyle = 'rgba(0, 200, 255, ' + pulse + ')';
    ctx.stroke();
  }

  // Vertical lines (converging to vanish)
  for (let i = -cols/2; i <= cols/2; i++) {
    const topX = vanishX + i * 3;
    const botX = vanishX + i * (W * 0.8 / cols);
    ctx.beginPath();
    ctx.moveTo(topX, horizon);
    ctx.lineTo(botX, H);
    const pulse = 0.1 + 0.06 * Math.sin(t * 0.003 + i * 0.7);
    ctx.strokeStyle = 'rgba(255, 0, 102, ' + pulse + ')';
    ctx.stroke();
  }

  // Glow squares on grid intersections
  for (let r = 0; r < 12; r++) {
    for (let c = -3; c <= 3; c++) {
      const p = (r + gridOffset) / rows;
      const y = horizon + (H - horizon) * Math.pow(p, 1.5);
      const spread = p * W * 0.8;
      const x = vanishX + c * (spread / 3);
      const brightness = 0.05 + 0.05 * Math.sin(t * 0.004 + r * 0.8 + c * 0.6);
      if (brightness > 0.07) {
        ctx.fillStyle = 'rgba(255, 0, 102, ' + brightness + ')';
        ctx.fillRect(x - 3, y - 1.5, 6, 3);
      }
    }
  }

  // Horizon glow
  const grad = ctx.createRadialGradient(vanishX, horizon, 0, vanishX, horizon, W * 0.5);
  grad.addColorStop(0, 'rgba(120, 0, 255, 0.15)');
  grad.addColorStop(0.5, 'rgba(255, 0, 102, 0.08)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizon - 100, W, 200);
}

// Particles
const particles = [];
function spawnParticle() {
  const colors = ['#ff0066', '#00c8ff', '#7800ff', '#ff3366', '#00ffcc'];
  particles.push({
    x: Math.random() * W,
    y: H + 10,
    vy: -(0.5 + Math.random() * 1.5),
    vx: (Math.random() - 0.5) * 0.8,
    size: 1.5 + Math.random() * 3,
    life: 0,
    maxLife: 200 + Math.random() * 300,
    color: colors[Math.floor(Math.random() * colors.length)]
  });
}

function updateParticles() {
  particles.forEach((p, i) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life++;
    const lifeRatio = p.life / p.maxLife;
    const alpha = lifeRatio < 0.2 ? lifeRatio * 5 : lifeRatio > 0.8 ? (1 - lifeRatio) * 5 : 1;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha * 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life >= particles[i].maxLife) particles.splice(i, 1);
  }
}

// Glow lines
const lines = [];
for (let i = 0; i < 8; i++) {
  const el = document.createElement('div');
  el.className = 'glow-line';
  el.style.left = (10 + Math.random() * 80) + '%';
  el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
  el.style.animationDelay = (-Math.random() * 2) + 's';
  const colors = ['rgba(255,0,102,0.4)', 'rgba(0,200,255,0.4)', 'rgba(120,0,255,0.4)'];
  el.style.background = 'linear-gradient(180deg, transparent 0%, ' + colors[i % 3] + ' 50%, transparent 100%)';
  document.body.appendChild(el);
}

// Floating particles (DOM)
for (let i = 0; i < 25; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.style.left = Math.random() * 100 + '%';
  p.style.bottom = '-10px';
  p.style.animationDuration = (4 + Math.random() * 6) + 's';
  p.style.animationDelay = (-Math.random() * 8) + 's';
  const colors = ['#ff0066', '#00c8ff', '#7800ff', '#ff6699'];
  p.style.background = colors[Math.floor(Math.random() * colors.length)];
  p.style.boxShadow = '0 0 6px ' + p.style.background;
  document.body.appendChild(p);
}

// Mask toggle animation
let maskOn = false;
setInterval(() => {
  maskOn = !maskOn;
  document.getElementById('imgSemMascara').style.display = maskOn ? 'none' : 'block';
  document.getElementById('imgComMascara').style.display = maskOn ? 'block' : 'none';
}, 4000);

// Main loop
let lastSpawn = 0;
function frame(t) {
  drawFloor(t);
  updateParticles();
  if (t - lastSpawn > 150) {
    spawnParticle();
    lastSpawn = t;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script>
</body>
</html>`;

fs.writeFileSync('C:/Users/Pichau/Downloads/wallpaper_zacarias.html', html, 'utf8');
console.log('Wallpaper salvo em: C:/Users/Pichau/Downloads/wallpaper_zacarias.html');
console.log('Tamanho:', (html.length / 1024).toFixed(0), 'KB');
