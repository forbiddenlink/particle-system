/**
 * Frequency-band energy extracted from an FFT spectrum, each normalized to 0..1.
 */
export interface FrequencyBands {
  bass: number;
  mid: number;
  treble: number;
}

/** Average a slice of the spectrum and normalize from 0..255 to 0..1. */
function bandAverage(freq: Uint8Array, start: number, end: number): number {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += freq[i];
  return sum / (end - start) / 255;
}

/**
 * Split an FFT magnitude spectrum (e.g. from AnalyserNode.getByteFrequencyData)
 * into bass / mid / treble energy. Splits at 10% and 40% of the bins, which
 * roughly maps to low / mid / high for typical analyser sizes.
 *
 * @param freq  Byte frequency data, each bin 0..255.
 * @returns  Normalized band energies in 0..1 (all zero for an empty spectrum).
 */
export function analyzeFrequencyBands(freq: Uint8Array): FrequencyBands {
  const n = freq.length;
  if (n === 0) return { bass: 0, mid: 0, treble: 0 };
  const bassEnd = Math.max(1, Math.floor(n * 0.1));
  const midEnd = Math.max(bassEnd, Math.floor(n * 0.4));
  return {
    bass: bandAverage(freq, 0, bassEnd),
    mid: bandAverage(freq, bassEnd, midEnd),
    treble: bandAverage(freq, midEnd, n),
  };
}
