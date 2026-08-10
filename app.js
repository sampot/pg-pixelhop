/**
 * pg-pixelhop 渲染＋輸入＋流程。
 *
 * 控制：←→ / A D 移動；↑ / W / Space / 點畫面跳；按住 Shift 衝刺；視窗外提供 on-screen 行動鍵。
 * 條件式：行動裝置隱藏鍵盤提示。
 */

import { parseLevel, newWorld, step, TILE, W_TILES, H_TILES, coinsRemaining, coinsTotal } from "./game.js";
import { LEVELS, levelByIndex } from "./levels.js";
import { PixelAudio } from "./audio.js";

const audio = new PixelAudio();

const ASSETS = {
  base: "assets",
  tiles: "assets/tiles",
  chars: "assets/characters",
  enemies: "assets/enemies",
  bg: "assets/bg",
};

const TILE_SOLID_FILTER = new Set(["#", "S", "B", "?", "P", "b", "s", "d", "M"]);

/* 圖載入 */
const imgCache = new Map();
function loadImg(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const img = new Image();
  img.src = path;
  imgCache.set(path, img);
  return img;
}

/* 對應圖塊 → 圖檔 */
const TILE_MAP = {
  "#": "terrain_grass_block.png",
  "S": "terrain_grass_block_top.png",
  "B": "brick_brown.png",
  "?": "block_coin.png",
  "H": "block_spikes.png",
  "L": "lava_top.png",
  "C": "coin_bronze.png",
  "P": "terrain_stone_block.png",
  "b": "terrain_brown_block.png",
  "d": "terrain_sand_block.png",
  "s": "terrain_stone_block.png",
  "M": "sign_exit.png",
};
const TILE_SOLID_TILE = new Set(["#", "S", "B", "?", "P", "b", "d", "s", "M"]);

const BG_BY_THEME = {
  grass: "background_color_hills.png",
  sand: "background_color_desert.png",
  stone: "background_color_grass.png",
  cave: "background_color_mushrooms.png",
  sky: "background_color_trees.png",
};

/* DOM */
const el = {
  canvas: document.getElementById("stage"),
  c: document.getElementById("stage").getContext("2d"),
  status: document.getElementById("status"),
  levelName: document.getElementById("level-name"),
  coins: document.getElementById("coins"),
  lives: document.getElementById("lives"),
  levelNum: document.getElementById("level-num"),
  levelTotal: document.getElementById("level-total"),
  levelSel: document.getElementById("level-select"),
  btnMute: document.getElementById("btn-mute"),
  btnWin: document.getElementById("btn-win"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnReset: document.getElementById("btn-reset"),
  touch: document.getElementById("touch-pad"),
  touchLeft: document.getElementById("t-left"),
  touchRight: document.getElementById("t-right"),
  touchJump: document.getElementById("t-jump"),
  bgm: document.getElementById("bgm"),
};
el.levelTotal.textContent = String(LEVELS.length);

let state = {
  world: null,
  levelIdx: 0,
  lives: 3,
  alive: true,
  won: false,
  busy: false,
  player: { x: 0, y: 0, vx: 0, vy: 0, w: 36, h: 56, onGround: false, facing: 1, dead: false, won: false, coyote: 0, buf: 0 },
  paused: false,
  lastLandVy: 0,
  pendingRestart: false,
};

const input = {
  left: false,
  right: false,
  jumpDown: false,
  jump: false,
  sprint: false,
};

/* 視口像素大小（依 canvas 解析度） */
const VIEW_W = W_TILES * TILE;
const VIEW_H = H_TILES * TILE;

function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // 讓 canvas 高寬跟著 CSS；內部分辨率乘 dpr
  const w = el.canvas.clientWidth;
  const h = el.canvas.clientHeight;
  el.canvas.width = Math.round(w * dpr);
  el.canvas.height = Math.round(h * dpr);
  el.c.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScale = w / VIEW_W;
}

/* 動態等比縮放：依畫面高寬縮到對應視口寬度 */
let drawScale = 1;
function fitCanvas() {
  const rect = el.canvas.getBoundingClientRect();
  const viewRatio = VIEW_W / VIEW_H;
  let h = rect.height;
  let w = rect.height * viewRatio;
  if (w > rect.width) {
    w = rect.width;
    h = rect.width / viewRatio;
  }
  return { w, h, ox: (rect.width - w) / 2, oy: (rect.height - h) / 2 };
}

/* 載入關卡 */
function loadLevel(idx) {
  state.levelIdx = idx;
  const L = levelByIndex(idx);
  const lv = parseLevel(L.source);
  state.world = newWorld(lv);
  el.levelName.textContent = L.name;
  el.levelNum.textContent = String(idx + 1);
  el.coins.textContent = `${coinsTotal(state.world) - coinsRemaining(state.world)}/${coinsTotal(state.world)}`;
  el.lives.textContent = String(state.lives);
  state.won = false;
  state.alive = true;
  state.pendingRestart = false;
  audio.stopBgm();
  audio.play("click");
  if (audio.enabled) audio.playBgm();
  setStatus(`第 ${idx + 1} 關 — ${L.name}`);
}

/* 事件 */
const evts = [];
function pushEvent(e) {
  evts.push(e);
}

function applyEvents() {
  for (const e of evts) {
    if (e.kind === "coin") audio.play("coin");
    else if (e.kind === "spring") audio.play("spring");
    else if (e.kind === "exit") audio.play("exit");
    else if (e.kind === "die") audio.play("hurt");
    else if (e.kind === "stomp") audio.play("coin");
  }
  if (state.won) {
    setStatus("過關！按「下一關」繼續。", "win");
    audio.play("win");
    audio.stopBgm();
  }
  if (state.player.dead && state.alive) {
    state.alive = false;
    state.lives--;
    el.lives.textContent = String(state.lives);
  }
  el.coins.textContent = `${coinsTotal(state.world) - coinsRemaining(state.world)}/${coinsTotal(state.world)}`;
  evts.length = 0;
}

function setStatus(msg, tone) {
  el.status.textContent = msg;
  el.status.dataset.tone = tone || "";
}

/* 鍵盤 / 觸控 */
function wireInput() {
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    audio.unlock();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      input.left = true;
    } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      input.right = true;
    } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " " || e.key === "Spacebar") {
      input.jumpDown = true;
      input.jump = true;
    } else if (e.key === "Shift") {
      input.sprint = true;
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = false;
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = false;
    else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " " || e.key === "Spacebar") input.jump = false;
    else if (e.key === "Shift") input.sprint = false;
  });

  // 行動裝置虛擬按鍵
  const mkHold = (el, on) => {
    const start = (e) => { e.preventDefault(); audio.unlock(); on(true); };
    const end = (e) => { e.preventDefault(); on(false); };
    el.addEventListener("touchstart", start, { passive: false });
    el.addEventListener("touchend", end, { passive: false });
    el.addEventListener("touchcancel", end, { passive: false });
    el.addEventListener("mousedown", start);
    el.addEventListener("mouseup", end);
    el.addEventListener("mouseleave", end);
  };
  mkHold(el.touchLeft, (v) => (input.left = v));
  mkHold(el.touchRight, (v) => (input.right = v));
  mkHold(el.touchJump, (v) => {
    if (v) input.jumpDown = true;
    input.jump = v;
  });

  // 點畫面跳
  el.canvas.addEventListener("pointerdown", (e) => {
    audio.unlock();
    const rect = el.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.4) input.left = true;
    else if (x > 0.6) input.right = true;
    else {
      input.jumpDown = true;
      input.jump = true;
    }
    setTimeout(() => {
      input.left = false;
      input.right = false;
      input.jump = false;
    }, 200);
  });

  // 按鈕
  el.btnMute.addEventListener("click", () => {
    const on = !audio.enabled;
    audio.setEnabled(on);
    el.btnMute.setAttribute("aria-pressed", String(on));
    el.btnMute.textContent = on ? "音效開" : "音效關";
    if (on) audio.playBgm();
    else audio.stopBgm();
  });
  el.btnReset.addEventListener("click", () => loadLevel(state.levelIdx));
  el.btnPrev.addEventListener("click", () => {
    if (state.levelIdx > 0) loadLevel(state.levelIdx - 1);
  });
  el.btnNext.addEventListener("click", () => {
    if (state.levelIdx < LEVELS.length - 1) loadLevel(state.levelIdx + 1);
  });
  el.levelSel.addEventListener("change", (e) => loadLevel(Number(e.target.value)));

  window.addEventListener("resize", () => {
    resizeCanvas();
  });
}

/* 主迴圈 */
function tick() {
  if (state.world) {
    const events = step(state.world, input);
    for (const e of events) pushEvent(e);
    if (state.world.player.dead) state.player.dead = true;
    if (state.world.player.won) state.won = true;
    // 落地音
    if (input.left || input.right || input.jump) audio.unlock();
    if (state.world.player.onGround && state.world.player.vy === 0 && Math.abs(state.lastLandVy) > 6) {
      audio.play("land");
    }
    state.lastLandVy = state.world.player.vy;
    applyEvents();

    // 死亡 → 0.6s 後重來本關
    if (state.world.player.dead && !state.pendingRestart) {
      state.pendingRestart = true;
      setTimeout(() => {
        if (state.lives > 0) {
          loadLevel(state.levelIdx);
        } else {
          setStatus("遊戲結束。", "warn");
          audio.stopBgm();
        }
      }, 700);
    }
    // 過關 → 不自動跳下一關，讓玩家按
    input.jumpDown = false;
  }
  draw();
  requestAnimationFrame(tick);
}

/* 渲染 */
function draw() {
  if (!state.world) return;
  const f = fitCanvas();
  const ctx = el.c;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#222";
  ctx.fillRect(0, 0, el.canvas.clientWidth, el.canvas.clientHeight);

  // 視口 push
  ctx.save();
  ctx.translate(f.ox, f.oy);
  ctx.scale(drawScale = f.w / VIEW_W, drawScale);

  // 背景
  drawBackground(ctx);

  // 圖塊
  drawTiles(ctx);

  // 寶物
  drawCoins(ctx);

  // 彈簧
  drawSprings(ctx);

  // 出口
  drawExit(ctx);

  // 敵人
  drawEnemies(ctx);

  // 玩家
  drawPlayer(ctx);

  // 邊框
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, VIEW_W, VIEW_H);

  ctx.restore();
}

function drawBackground(ctx) {
  const L = levelByIndex(state.levelIdx);
  const bg = loadImg(`${ASSETS.bg}/${BG_BY_THEME[L.theme] || "background_color_hills.png"}`);
  // 平鋪
  const pattern = ctx.createPattern(bg, "repeat");
  ctx.fillStyle = pattern;
  ctx.save();
  ctx.translate(-state.world.cam.x * 0.5, -state.world.cam.y * 0.5);
  ctx.fillRect(0, 0, VIEW_W + 400, VIEW_H + 400);
  ctx.restore();
}

function tileImg(t) {
  const file = TILE_MAP[t];
  if (!file) return null;
  return loadImg(`${ASSETS.tiles}/${file}`);
}

function drawTiles(ctx) {
  const cam = state.world.cam;
  const c0 = Math.max(0, Math.floor(cam.x / TILE));
  const c1 = Math.min(state.world.w - 1, Math.ceil((cam.x + VIEW_W) / TILE));
  const r0 = Math.max(0, Math.floor(cam.y / TILE));
  const r1 = Math.min(state.world.h - 1, Math.ceil((cam.y + VIEW_H) / TILE));
  for (let y = r0; y <= r1; y++) {
    for (let x = c0; x <= c1; x++) {
      const t = state.world.grid[y][x];
      if (t === ".") continue;
      const img = tileImg(t);
      if (!img) continue;
      ctx.drawImage(img, Math.floor(x * TILE - cam.x), Math.floor(y * TILE - cam.y), TILE, TILE);
    }
  }
}

function drawCoins(ctx) {
  const cam = state.world.cam;
  for (const c of state.world.coins) {
    if (c.taken) continue;
    if (c.x + 28 < cam.x || c.x - 28 > cam.x + VIEW_W) continue;
    if (c.y + 28 < cam.y || c.y - 28 > cam.y + VIEW_H) continue;
    const img = loadImg(`${ASSETS.tiles}/coin_gold.png`);
    const t = state.world.time;
    const wob = Math.sin(t * 0.2 + c.x * 0.1) * 4;
    ctx.drawImage(img, Math.floor(c.x - 14 - cam.x), Math.floor(c.y - 14 - cam.y + wob), 28, 28);
  }
}

function drawSprings(ctx) {
  const cam = state.world.cam;
  for (const s of state.world.springs) {
    const img = loadImg(`${ASSETS.tiles}/spring.png`);
    const imgPressed = loadImg(`${ASSETS.tiles}/spring_out.png`);
    const use = s.used ? imgPressed : img;
    ctx.drawImage(use, Math.floor(s.x - cam.x), Math.floor(s.y - cam.y), TILE, TILE * 0.5);
  }
}

function drawExit(ctx) {
  if (!state.world.exit) return;
  const img = loadImg(`${ASSETS.tiles}/sign_exit.png`);
  const e = state.world.exit;
  ctx.drawImage(img, Math.floor(e.x - state.world.cam.x), Math.floor(e.y - state.world.cam.y), TILE, TILE * 2);
  // 旗桿
  ctx.fillStyle = "#5b3a16";
  ctx.fillRect(e.x - state.world.cam.x + 30, e.y - state.world.cam.y, 4, TILE * 2);
}

function drawEnemies(ctx) {
  const cam = state.world.cam;
  for (const e of state.world.enemies) {
    if (!e.alive) continue;
    let file = null;
    if (e.kind === "slime") {
      file = e.anim < 1 ? "slime_normal_walk_a.png" : "slime_normal_walk_b.png";
    } else if (e.kind === "frog") {
      file = e.vy < -1 ? "frog_jump.png" : "frog_idle.png";
    } else if (e.kind === "fly") {
      file = e.anim < 1 ? "fly_a.png" : "fly_b.png";
    }
    if (!file) continue;
    const img = loadImg(`${ASSETS.enemies}/${file}`);
    const f = e.vx < 0 ? -1 : 1;
    if (f < 0) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(img, Math.floor(-(e.x + e.w) - cam.x), Math.floor(e.y - cam.y), e.w, e.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, Math.floor(e.x - cam.x), Math.floor(e.y - cam.y), e.w, e.h);
    }
  }
}

function drawPlayer(ctx) {
  const p = state.world.player;
  const cam = state.world.cam;
  let file;
  if (p.dead) file = "character_beige_hit.png";
  else if (!p.onGround && p.vy < -1) file = "character_beige_jump.png";
  else if (p.vx !== 0 && p.onGround) file = "character_beige_walk_a.png"; // 簡單二圖：a / b 以時間切
  else if (p.vx !== 0) file = "character_beige_walk_a.png";
  else file = "character_beige_idle.png";
  const img = loadImg(`${ASSETS.chars}/${file}`);
  if (p.facing < 0) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(img, Math.floor(-(p.x + p.w) - cam.x), Math.floor(p.y - cam.y), p.w, p.h);
    ctx.restore();
  } else {
    ctx.drawImage(img, Math.floor(p.x - cam.x), Math.floor(p.y - cam.y), p.w, p.h);
  }
}

/* 啟動 */
async function init() {
  try {
    resizeCanvas();
    wireInput();
    await audio.unlock();
    await audio.preloadAll();
    loadLevel(0);
    // 從 KV 拉最快紀錄
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch("/api/kv/pg-pixelhop-best", { signal: ctrl.signal });
      clearTimeout(to);
      if (res.ok) {
        const txt = await res.text();
        if (txt && /^\d+$/.test(txt)) {
          setStatus(`上次最少步 ${txt}`);
        }
      }
    } catch {
      /* ignore */
    }
    requestAnimationFrame(tick);
  } catch (e) {
    console.error("[pg-pixelhop] init failed", e);
    setStatus("初始化失敗：" + (e?.message || e), "warn");
  }
}

init();

// devtools helpers
if (typeof window !== "undefined") {
  window.__pg = { state, audio, input, get world() { return state.world; } };
}
