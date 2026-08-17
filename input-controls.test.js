import { describe, expect, it } from "vitest";
import {
  createTouchInput,
  directionFromDrag,
  reduceTouchInput,
} from "./input-controls.js";

describe("directionFromDrag", () => {
  it("keeps movement neutral inside the deadzone", () => {
    expect(directionFromDrag(100, 117, 18)).toBe(0);
    expect(directionFromDrag(100, 82, 18)).toBe(0);
  });

  it("maps horizontal drag beyond the deadzone to left or right", () => {
    expect(directionFromDrag(100, 119, 18)).toBe(1);
    expect(directionFromDrag(100, 81, 18)).toBe(-1);
  });
});

describe("reduceTouchInput", () => {
  it("tracks one movement pointer and follows it across the origin", () => {
    let state = reduceTouchInput(createTouchInput(), {
      type: "move-start",
      pointerId: 4,
      clientX: 120,
    });
    state = reduceTouchInput(state, {
      type: "move-drag",
      pointerId: 4,
      clientX: 155,
    });
    expect(state.moveX).toBe(1);

    state = reduceTouchInput(state, {
      type: "move-drag",
      pointerId: 4,
      clientX: 85,
    });
    expect(state.moveX).toBe(-1);

    state = reduceTouchInput(state, { type: "move-end", pointerId: 4 });
    expect(state).toMatchObject({ movePointerId: null, moveX: 0 });
  });

  it("keeps movement and jump pointers independent", () => {
    let state = reduceTouchInput(createTouchInput(), {
      type: "move-start",
      pointerId: 1,
      clientX: 80,
    });
    state = reduceTouchInput(state, {
      type: "jump-start",
      pointerId: 2,
    });
    state = reduceTouchInput(state, {
      type: "move-drag",
      pointerId: 1,
      clientX: 40,
    });
    state = reduceTouchInput(state, { type: "jump-end", pointerId: 2 });

    expect(state).toMatchObject({ moveX: -1, jump: false });
  });

  it("ignores unrelated pointers and resets all held input", () => {
    let state = reduceTouchInput(createTouchInput(), {
      type: "move-start",
      pointerId: 7,
      clientX: 100,
    });
    state = reduceTouchInput(state, {
      type: "move-drag",
      pointerId: 8,
      clientX: 200,
    });
    expect(state.moveX).toBe(0);

    state = reduceTouchInput(state, { type: "reset" });
    expect(state).toEqual(createTouchInput());
  });
});
