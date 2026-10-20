export const IDLE_MS = 120_000;

export type TheaterState = {
  lastActive: number;
  open: boolean;
  index: number;
  slideAt: number;
};

export function stepTheater(state: TheaterState, now: number, active: boolean, slides: number): TheaterState {
  if (slides <= 0) return { ...state, open: false };
  if (active) {
    return { lastActive: now, open: false, index: state.index % slides, slideAt: now };
  }
  if (!state.open) {
    if (now - state.lastActive >= IDLE_MS) {
      return { ...state, open: true, slideAt: now, index: state.index % slides };
    }
    return state;
  }
  if (now - state.slideAt >= IDLE_MS) {
    return { ...state, index: (state.index + 1) % slides, slideAt: now };
  }
  return state;
}
