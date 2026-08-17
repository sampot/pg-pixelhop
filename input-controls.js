export const MOVE_DEADZONE_PX = 18;

export function directionFromDrag(originX, clientX, deadzone = MOVE_DEADZONE_PX) {
  const delta = clientX - originX;
  if (Math.abs(delta) <= deadzone) return 0;
  return delta < 0 ? -1 : 1;
}

export function createTouchInput() {
  return {
    movePointerId: null,
    moveOriginX: 0,
    moveX: 0,
    jumpPointerId: null,
    jump: false,
  };
}

export function reduceTouchInput(state, action) {
  switch (action.type) {
    case "move-start":
      if (state.movePointerId !== null) return state;
      return {
        ...state,
        movePointerId: action.pointerId,
        moveOriginX: action.clientX,
        moveX: 0,
      };
    case "move-drag":
      if (state.movePointerId !== action.pointerId) return state;
      return {
        ...state,
        moveX: directionFromDrag(state.moveOriginX, action.clientX),
      };
    case "move-end":
      if (state.movePointerId !== action.pointerId) return state;
      return {
        ...state,
        movePointerId: null,
        moveOriginX: 0,
        moveX: 0,
      };
    case "jump-start":
      if (state.jumpPointerId !== null) return state;
      return {
        ...state,
        jumpPointerId: action.pointerId,
        jump: true,
      };
    case "jump-end":
      if (state.jumpPointerId !== action.pointerId) return state;
      return {
        ...state,
        jumpPointerId: null,
        jump: false,
      };
    case "reset":
      return createTouchInput();
    default:
      return state;
  }
}
