export type GameCardMotion = "victory" | "defeat";

/** The effect follows the server's scoreboard, never a client-selected style. */
export function gameCardMotion(win: boolean): GameCardMotion {
  return win ? "victory" : "defeat";
}
