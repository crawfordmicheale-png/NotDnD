import { Game } from "./game/game";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const params = new URLSearchParams(window.location.search);
const seed = params.get("seed") ?? undefined;

const game = new Game(canvas, seed);
game.start();

// Handy for poking at the game from the devtools console.
(window as unknown as { ashfall: Game }).ashfall = game;
