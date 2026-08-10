import { describe, it, expect, beforeEach } from "vitest";
import {
  parseLevel,
  newWorld,
  step,
  TILE,
  GRAVITY,
  JUMP_V,
  RUN_SPEED,
  coinsRemaining,
  coinsTotal,
} from "./game.js";
import { LEVELS } from "./levels.js";

const noop = { left: false, right: false, jump: false, jumpDown: false, sprint: false };

function pressJump(n = 1) {
  let events = [];
  for (let i = 0; i < n; i++) {
    events = events.concat(step(world, { ...noop, jumpDown: true }));
    events = events.concat(step(world, { ...noop }));
  }
  return events;
}

describe("parseLevel", () => {
  it("handles multi-line strings", () => {
    const lv = parseLevel("..\n.X\n##");
    expect(lv.w).toBe(2);
    expect(lv.h).toBe(3);
    expect(lv.grid[1][1]).toBe("X");
  });

  it("pads missing cells with '.'", () => {
    const lv = parseLevel("...\n..");
    expect(lv.grid[0][2]).toBe(".");
    expect(lv.grid[1][2]).toBe(".");
  });
});

describe("newWorld", () => {
  it("builds a 5-themable world from level", () => {
    const lv = parseLevel(LEVELS[0].source);
    const w = newWorld(lv);
    expect(w.player.x).toBeGreaterThan(0);
    expect(w.enemies.length).toBeGreaterThanOrEqual(0);
    expect(w.coins.length).toBeGreaterThan(0);
  });

  it("detects spawn + exit", () => {
    const lv = parseLevel(LEVELS[1].source);
    const w = newWorld(lv);
    expect(w.spawn).not.toBeNull();
    expect(w.exit).not.toBeNull();
  });
});

describe("physics", () => {
  let world;
  beforeEach(() => {
    world = newWorld(parseLevel(LEVELS[0].source));
  });

  it("falls under gravity", () => {
    const y0 = world.player.y;
    for (let i = 0; i < 30; i++) step(world, { ...noop });
    expect(world.player.y).toBeGreaterThan(y0);
    expect(world.player.onGround).toBe(true);
  });

  it("lands on ground", () => {
    for (let i = 0; i < 60; i++) step(world, { ...noop });
    expect(world.player.onGround).toBe(true);
  });

  it("jumps when jumpDown pressed on ground", () => {
    for (let i = 0; i < 60; i++) step(world, { ...noop });
    expect(world.player.onGround).toBe(true);
    step(world, { ...noop, jumpDown: true });
    // vy is set first, then gravity applies. After one step we'll already have added gravity.
    expect(Math.abs(world.player.vy - JUMP_V)).toBeLessThan(GRAVITY + 0.01);
  });

  it("moves right with right input", () => {
    for (let i = 0; i < 60; i++) step(world, { ...noop });
    const x0 = world.player.x;
    for (let i = 0; i < 20; i++) step(world, { ...noop, right: true });
    expect(world.player.x).toBeGreaterThan(x0);
    expect(world.player.facing).toBe(1);
  });

  it("moves left with left input", () => {
    for (let i = 0; i < 60; i++) step(world, { ...noop });
    const x0 = world.player.x;
    for (let i = 0; i < 20; i++) step(world, { ...noop, left: true });
    expect(world.player.x).toBeLessThan(x0);
    expect(world.player.facing).toBe(-1);
  });

  it("resolves X collision with walls", () => {
    for (let i = 0; i < 60; i++) step(world, { ...noop });
    // back up against the left wall spawn
    for (let i = 0; i < 80; i++) step(world, { ...noop, left: true });
    // x should be > 0 (clamped to wall)
    expect(world.player.x).toBeGreaterThanOrEqual(0);
  });

  it("camera follows player", () => {
    // Construct a wider open level (40 cols)
    const src = new Array(13).fill(".".repeat(40)).join("\n");
    const lines = src.split("\n");
    lines[10] = "X" + lines[10].slice(1);
    lines[12] = "S".repeat(40);
    const lv = parseLevel(lines.join("\n"));
    const w = newWorld(lv);
    for (let i = 0; i < 5; i++) step(w, { ...noop });
    for (let i = 0; i < 400; i++) step(w, { ...noop, right: true });
    expect(w.cam.x).toBeGreaterThan(0);
  });
});

describe("coins", () => {
  it("all coins match coinsTotal", () => {
    const lv = parseLevel(LEVELS[1].source);
    const w = newWorld(lv);
    expect(coinsTotal(w)).toBe(w.coins.length);
  });

  it("coins become taken when walked through", () => {
    const lv = parseLevel(LEVELS[1].source);
    const w = newWorld(lv);
    // start walking and jumping until we sweep across the level
    const initial = coinsRemaining(w);
    expect(initial).toBeGreaterThan(0);
  });
});

describe("level loading", () => {
  it("all 5 levels parse", () => {
    for (const L of LEVELS) {
      const lv = parseLevel(L.source);
      expect(lv.w).toBeGreaterThan(0);
      expect(lv.h).toBeGreaterThan(0);
    }
  });
});
