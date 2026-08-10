/**
 * pg-pixelhop 核心引擎：重力、跳躍、碰撞、相機、敵人 AI、關卡過關。
 * 純 ESM、無 DOM，方便單元測試。
 *
 * 圖塊層 (tile-size grid, 64 px)：
 *   . 空
 *   # 草地實心
 *   S 草地頂
 *   B 磚塊（可頭頂撞）
 *   ? 問號（可頭頂撞出金幣）
 *   H 尖刺（接觸即死）
 *   L 熔岩（接觸即死）
 *   C 金幣（撿）
 *   P 管道（實心）
 *   M 終點旗
 *   b 棕地
 *   d 沙地
 *   s 石頭
 *
 * 平台層 (entities)：
 *   enemy: { type, x, y, vx, vy, ... }
 *   coin: { x, y }  (個別金幣，僅出現於浮空型關卡)
 *   spawn: { x, y }  (玩家起點；常見一個)
 *   exit: { x, y }  (終點旗位置；通常來自於 M 圖塊，但我們用獨立物件)
 *   spring: { x, y }  (彈簧，touch + 跳很高)
 *
 * 物理 (固定 dt)：
 *   g=0.55 px/frame², jump_v=-12, max_vy=16, run_v=4.5
 *   移動：水平速度立即變數；跳躍時 vy= jump_v 且 only-when-grounded
 *   變牛跳（="sprint jump"）：在地面按→時 vx 略增（小幅）
 */

export const TILE = 64; // px
export const W_TILES = 18; // visible columns
export const H_TILES = 13; // visible rows

export const GRAVITY = 0.55;
export const MAX_FALL = 16;
export const RUN_SPEED = 4.5;
export const SPRINT_SPEED = 6.5;
export const JUMP_V = -12;
export const SPRING_V = -18;
export const COYOTE_FRAMES = 6; // 離地後幾格內仍可跳
export const JUMP_BUFFER = 6; // 落地前幾格按下的跳會被保留

const SOLID = new Set(["#", "S", "B", "?", "P", "b", "s", "d", "M"]);
const KILL = new Set(["H", "L"]);

/** 解析字串地圖 → 2D 網格。空 / 補空白。 */
export function parseLevel(str) {
  const rows = str.split("\n").map((r) => r.trimEnd()).filter((r) => r.length > 0);
  const h = rows.length;
  let w = 0;
  for (const r of rows) if (r.length > w) w = r.length;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push(rows[y][x] || ".");
    }
    grid.push(row);
  }
  return { w, h, grid };
}

/** 從 grid 抽出 entity 列表（金幣／敵人／出口／彈簧）。 */
export function extractEntities(level) {
  const enemies = [];
  const coins = [];
  let exit = null;
  let spawn = null;
  const springs = [];
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const t = level.grid[y][x];
      if (t === "C") {
        coins.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, taken: false });
      } else if (t === "X") {
        spawn = { x: x * TILE, y: y * TILE };
      } else if (t === "E") {
        exit = { x: x * TILE, y: y * TILE - TILE };
      } else if (t === "J") {
        springs.push({ x: x * TILE, y: y * TILE - TILE * 0.4, used: false });
      } else if (t === "1" || t === "2" || t === "3") {
        enemies.push(makeEnemy(t, x, y));
      }
    }
  }
  return { enemies, coins, spawn, exit, springs };
}

function makeEnemy(kind, x, y) {
  if (kind === "1") {
    // slime — 左右巡
    return { kind: "slime", x: x * TILE, y: y * TILE, vx: 1.2, vy: 0, w: 56, h: 32, minX: x * TILE, maxX: x * TILE + TILE * 3, alive: true, anim: 0 };
  }
  if (kind === "2") {
    // frog — 跳
    return { kind: "frog", x: x * TILE, y: y * TILE, vx: 0, vy: 0, w: 56, h: 48, jumpTimer: 60, alive: true, facing: 1, anim: 0 };
  }
  if (kind === "3") {
    // fly — 顛簸漂浮
    return { kind: "fly", x: x * TILE, y: y * TILE, vx: 1.5, vy: 0, w: 52, h: 36, baseY: y * TILE, phase: 0, minX: x * TILE, maxX: x * TILE + TILE * 4, alive: true, anim: 0 };
  }
  return null;
}

export function newWorld(level) {
  const entities = extractEntities(level);
  return {
    w: level.w,
    h: level.h,
    grid: level.grid,
    spawn: entities.spawn,
    exit: entities.exit,
    coins: entities.coins,
    enemies: entities.enemies,
    springs: entities.springs,
    coinCount: entities.coins.length,
    player: {
      x: entities.spawn ? entities.spawn.x : TILE * 2,
      y: entities.spawn ? entities.spawn.y : TILE * 4,
      vx: 0,
      vy: 0,
      w: 36,
      h: 56,
      onGround: false,
      coyote: 0,
      buf: 0,
      facing: 1,
      dead: false,
      won: false,
    },
    cam: { x: 0, y: 0 },
    time: 0,
  };
}

/** 從全域座標 → tile 索引。 */
export function tileAt(level, tx, ty) {
  const x = Math.floor(tx / TILE);
  const y = Math.floor(ty / TILE);
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return "#"; // 視界外 = 實心（防出界）
  return level.grid[y][x];
}

/** 玩家水平碰撞：對玩家矩形投以 (vx, 0) → 校正 + 修正水平速度。 */
function movePlayerX(world, vx) {
  const p = world.player;
  p.x += vx;
  // 對每行足部／頭部檢查
  const ys = [p.y + 4, p.y + p.h / 2, p.y + p.h - 4];
  for (const y of ys) {
    if (vx > 0) {
      const tx = p.x + p.w;
      const t = tileAt(world, tx, y);
      if (SOLID.has(t)) {
        p.x = Math.floor(tx / TILE) * TILE - p.w - 0.01;
      }
    } else if (vx < 0) {
      const tx = p.x;
      const t = tileAt(world, tx, y);
      if (SOLID.has(t)) {
        p.x = Math.floor(tx / TILE) * TILE + TILE + 0.01;
      }
    }
  }
}

/** 玩家垂直碰撞：投以 (0, vy) → 校正並處理踩地／頭頂。 */
function movePlayerY(world, vy) {
  const p = world.player;
  p.y += vy;
  const wasOnGround = p.onGround;
  p.onGround = false;
  // 水平取多點檢查
  const xs = [p.x + 4, p.x + p.w / 2, p.x + p.w - 4];
  if (vy > 0) {
    // 落下
    for (const x of xs) {
      const ty = p.y + p.h;
      const t = tileAt(world, x, ty);
      if (SOLID.has(t)) {
        p.y = Math.floor(ty / TILE) * TILE - p.h - 0.01;
        p.vy = 0;
        p.onGround = true;
        p.coyote = COYOTE_FRAMES;
      }
    }
  } else if (vy < 0) {
    // 上升頂頭
    for (const x of xs) {
      const ty = p.y;
      const t = tileAt(world, x, ty);
      if (SOLID.has(t)) {
        p.y = Math.floor(ty / TILE) * TILE + TILE + 0.01;
        p.vy = 0;
      }
    }
  }
}

/** 玩家收集金幣、踩彈簧、踩入口。回傳事件。 */
function applyPlayerInteractions(world) {
  const p = world.player;
  const events = [];
  // 金幣
  for (const c of world.coins) {
    if (c.taken) continue;
    if (rectOverlap(p.x, p.y, p.w, p.h, c.x - 14, c.y - 14, 28, 28)) {
      c.taken = true;
      events.push({ kind: "coin" });
    }
  }
  // 彈簧
  for (const s of world.springs) {
    if (s.used) continue;
    if (rectOverlap(p.x, p.y, p.w, p.h, s.x, s.y, TILE, TILE * 0.5)) {
      if (p.vy > 0) {
        // 從上方踩
        s.used = true;
        p.vy = SPRING_V;
        p.onGround = false;
        events.push({ kind: "spring" });
      }
    }
  }
  // 出口
  if (world.exit && rectOverlap(p.x, p.y, p.w, p.h, world.exit.x, world.exit.y, TILE, TILE * 2)) {
    if (!p.won) {
      p.won = true;
      events.push({ kind: "exit" });
    }
  }
  // 死亡
  if (!p.dead) {
    const fx = p.x + p.w / 2;
    const fy = p.y + p.h - 4;
    const t = tileAt(world, fx, fy);
    if (KILL.has(t)) {
      p.dead = true;
      events.push({ kind: "die" });
    }
  }
  // 從地圖底部掉下
  if (p.y > world.h * TILE + 64) {
    p.dead = true;
    events.push({ kind: "die" });
  }
  return events;
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function rectOverlapCenter(a, b) {
  return rectOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
}

/** 敵人 AI tick。回傳「與玩家碰撞」事件。 */
function tickEnemies(world) {
  const p = world.player;
  const events = [];
  for (const e of world.enemies) {
    if (!e.alive) continue;
    e.anim = (e.anim + 0.1) % 2;
    if (e.kind === "slime") {
      e.x += e.vx;
      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
    } else if (e.kind === "frog") {
      e.jumpTimer--;
      if (e.jumpTimer <= 0) {
        e.vy = -9;
        e.vx = e.facing * 2.4;
        e.jumpTimer = 60 + Math.floor(Math.random() * 30);
      }
      e.vy += GRAVITY;
      if (e.vy > MAX_FALL) e.vy = MAX_FALL;
      // 簡化版：水平自由、垂直重力（先 x 再 y）
      e.x += e.vx;
      e.y += e.vy;
      // 與玩家或地面互動
      moveEntityY(world, e);
      // 反轉
      if (e.vy === 0 && e.onGround) {
        e.facing = Math.random() < 0.5 ? -1 : 1;
      }
    } else if (e.kind === "fly") {
      e.x += e.vx;
      e.phase += 0.08;
      e.y = e.baseY + Math.sin(e.phase) * 18;
      if (e.x < e.minX) { e.x = e.minX; e.vx = Math.abs(e.vx); }
      if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.vx = -Math.abs(e.vx); }
    }
    if (rectOverlapCenter(p, e)) {
      // 從上面踩（vy > 0 且腳在敵人上半）且非 fly
      const feetY = p.y + p.h;
      if (p.vy > 0 && e.kind !== "fly" && feetY < e.y + e.h * 0.55) {
        // 踩死
        e.alive = false;
        p.vy = -8;
        events.push({ kind: "stomp" });
      } else {
        p.dead = true;
        events.push({ kind: "die" });
      }
    }
  }
  return events;
}

function moveEntityY(world, e) {
  e.y += e.vy;
  e.onGround = false;
  const xs = [e.x + 4, e.x + e.w / 2, e.x + e.w - 4];
  if (e.vy > 0) {
    for (const x of xs) {
      const ty = e.y + e.h;
      const t = tileAt(world, x, ty);
      if (SOLID.has(t)) {
        e.y = Math.floor(ty / TILE) * TILE - e.h - 0.01;
        e.vy = 0;
        e.onGround = true;
      }
    }
  }
}

/** 一次完整 step。input: { left, right, jump, jumpDown, sprint, restart }。 */
export function step(world, input) {
  if (world.player.dead || world.player.won) {
    // 玩家已死／過關 → 等待 restart
    return [];
  }
  const p = world.player;
  // 水平
  if (input.left && !input.right) {
    p.vx = -RUN_SPEED;
    p.facing = -1;
  } else if (input.right && !input.left) {
    p.vx = RUN_SPEED;
    p.facing = 1;
  } else {
    p.vx = 0;
  }
  if (input.sprint && p.onGround) p.vx *= SPRINT_SPEED / RUN_SPEED;
  // 跳躍
  if (input.jumpDown) {
    p.buf = JUMP_BUFFER;
  }
  if (p.onGround) p.coyote = COYOTE_FRAMES;
  else p.coyote = Math.max(0, p.coyote - 1);
  if (p.buf > 0) {
    if (p.coyote > 0) {
      p.vy = JUMP_V;
      p.onGround = false;
      p.coyote = 0;
      p.buf = 0;
    } else {
      p.buf = Math.max(0, p.buf - 1);
    }
  }
  // 重力
  p.vy += GRAVITY;
  if (p.vy > MAX_FALL) p.vy = MAX_FALL;
  // 移動
  movePlayerX(world, p.vx);
  movePlayerY(world, p.vy);
  // 互動
  const evs = applyPlayerInteractions(world);
  // 敵人
  for (const e of tickEnemies(world)) evs.push(e);
  // 相機
  world.cam.x = clamp(p.x + p.w / 2 - W_TILES * TILE / 2, 0, world.w * TILE - W_TILES * TILE);
  world.cam.y = clamp(p.y + p.h / 2 - H_TILES * TILE / 2, 0, world.h * TILE - H_TILES * TILE);
  world.time++;
  return evs;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function coinsRemaining(world) {
  return world.coins.filter((c) => !c.taken).length;
}

export function coinsTotal(world) {
  return world.coinCount;
}
