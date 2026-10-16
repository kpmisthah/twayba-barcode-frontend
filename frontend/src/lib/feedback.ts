/** Scan feedback: a beep (generated, no audio files) and a vibration where supported. */

let ctx: AudioContext | null = null;

function tone(frequency: number, ms: number, type: OscillatorType) {
  try {
    ctx ??= new AudioContext();
    // Browsers start audio suspended until a user gesture; tapping "Start camera" counts.
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
  } catch {
    // No audio available — the colour change still shows the result.
  }
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (e.g. iPhone).
  }
}

export function scanSuccess() {
  tone(1200, 120, "sine");
  vibrate(60);
}

export function scanError() {
  tone(220, 300, "square");
  vibrate([80, 60, 80]);
}

/** Call from a click handler so later beeps are allowed to play. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    // ignore
  }
}
