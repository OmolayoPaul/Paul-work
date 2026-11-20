import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "afridetect.preferences";

export const TEXT_SIZES = {
  sm: { label: "Small", px: 15 },
  md: { label: "Default", px: 16 },
  lg: { label: "Large", px: 17.5 },
};

const DEFAULTS = { textSize: "md", sound: true };

export function loadPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyTextSize(preferences = loadPreferences()) {
  const size = TEXT_SIZES[preferences.textSize] || TEXT_SIZES.md;
  document.documentElement.style.fontSize = `${size.px}px`;
}

export function savePreferences(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — preferences stay in memory */
  }
  applyTextSize(next);
  window.dispatchEvent(new CustomEvent("afridetect:preferences", { detail: next }));
}

export function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    oscillator.onended = () => context.close();
  } catch {
    /* audio is optional */
  }
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(loadPreferences);

  useEffect(() => {
    const handler = (event) => setPreferences(event.detail);
    window.addEventListener("afridetect:preferences", handler);
    return () => window.removeEventListener("afridetect:preferences", handler);
  }, []);

  const update = useCallback((patch) => {
    savePreferences({ ...loadPreferences(), ...patch });
  }, []);

  return [preferences, update];
}
