import confetti from "canvas-confetti";

// Celebratory confetti bursts shared across the Nebula Casino games.

export function burstWin() {
  confetti({
    particleCount: 70,
    spread: 75,
    startVelocity: 38,
    origin: { y: 0.65 },
    colors: ["#22C55E", "#86EFAC", "#FBBF24", "#ffffff"],
    scalar: 0.9,
  });
}

export function burstBig() {
  confetti({
    particleCount: 110,
    spread: 110,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors: ["#A855F7", "#22C55E", "#FBBF24", "#3B82F6", "#ffffff"],
  });
  setTimeout(
    () =>
      confetti({
        particleCount: 50,
        angle: 90,
        spread: 60,
        origin: { y: 0.5 },
        colors: ["#FBBF24", "#ffffff"],
      }),
    180
  );
}

export function burstJackpot() {
  const end = Date.now() + 1100;
  (function frame() {
    confetti({ particleCount: 7, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors: ["#FBBF24", "#F59E0B", "#ffffff"] });
    confetti({ particleCount: 7, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors: ["#A855F7", "#FBBF24", "#ffffff"] });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(
    () =>
      confetti({
        particleCount: 160,
        spread: 130,
        startVelocity: 50,
        origin: { y: 0.55 },
        colors: ["#FBBF24", "#F59E0B", "#A855F7", "#ffffff"],
      }),
    250
  );
}