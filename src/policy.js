// policy.js — turns what the model sees into a yes/no "blur this".
// The model only reports body regions with a confidence. This file decides
// which regions matter at each strength, so the rules can change without
// retraining anything.

// Index order is fixed by the model. Do not reorder.
export const LABELS = [
  "FEMALE_GENITALIA_COVERED",
  "FACE_FEMALE",
  "BUTTOCKS_EXPOSED",
  "FEMALE_BREAST_EXPOSED",
  "FEMALE_GENITALIA_EXPOSED",
  "MALE_BREAST_EXPOSED",
  "ANUS_EXPOSED",
  "FEET_EXPOSED",
  "BELLY_COVERED",
  "FEET_COVERED",
  "ARMPITS_COVERED",
  "ARMPITS_EXPOSED",
  "FACE_MALE",
  "BELLY_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_COVERED",
  "FEMALE_BREAST_COVERED",
  "BUTTOCKS_COVERED",
];

// label -> minimum confidence needed to act on it. A label that is absent
// never causes a blur at that level.
const t = (labels, threshold) => Object.fromEntries(labels.map((l) => [l, threshold]));

export const LEVELS = {
  standard: {
    title: "Standard",
    blurb: "Nudity",
    thresholds: {
      ...t(["FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_EXPOSED"], 0.3),
      ...t(["FEMALE_BREAST_EXPOSED", "BUTTOCKS_EXPOSED"], 0.35),
    },
  },
  strong: {
    title: "Strong",
    blurb: "Nudity and revealing clothing",
    thresholds: {
      ...t(["FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_EXPOSED"], 0.25),
      ...t(["FEMALE_BREAST_EXPOSED", "BUTTOCKS_EXPOSED", "MALE_BREAST_EXPOSED"], 0.3),
      ...t(["BELLY_EXPOSED", "ARMPITS_EXPOSED"], 0.4),
      ...t(["FEMALE_BREAST_COVERED", "BUTTOCKS_COVERED", "FEMALE_GENITALIA_COVERED"], 0.45),
    },
  },
  maximum: {
    title: "Maximum",
    blurb: "All of the above, plus faces",
    thresholds: {
      ...t(["FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_EXPOSED"], 0.2),
      ...t(["FEMALE_BREAST_EXPOSED", "BUTTOCKS_EXPOSED", "MALE_BREAST_EXPOSED"], 0.25),
      ...t(["BELLY_EXPOSED", "ARMPITS_EXPOSED", "FEET_EXPOSED"], 0.35),
      ...t(
        ["FEMALE_BREAST_COVERED", "BUTTOCKS_COVERED", "FEMALE_GENITALIA_COVERED", "BELLY_COVERED"],
        0.4
      ),
      ...t(["FACE_FEMALE", "FACE_MALE"], 0.45),
    },
  },
};

// Whose pictures to blur. The model labels most regions by sex (FEMALE_*,
// MALE_*, FACE_*), so a mode drops the other side's labels. Regions it cannot
// tell apart (buttocks, midriff, armpits, feet) are blurred in both modes.
export const MODES = {
  man: { title: "Man", blurb: "Blurs women" },
  woman: { title: "Woman", blurb: "Blurs men" },
};
export const DEFAULT_MODE = "man";

const isFemale = (label) => label.startsWith("FEMALE_") || label === "FACE_FEMALE";
const isMale = (label) => label.startsWith("MALE_") || label === "FACE_MALE";

export const DEFAULT_LEVEL = "strong";

export function thresholdsFor(level, mode) {
  const all = (LEVELS[level] ?? LEVELS[DEFAULT_LEVEL]).thresholds;
  const drop = mode === "woman" ? isFemale : isMale;
  return Object.fromEntries(Object.entries(all).filter(([label]) => !drop(label)));
}

/**
 * @param {{label:string, score:number, box:number[]}[]} detections
 * @param {Record<string, number>} thresholds
 * @returns {{blur:boolean, reasons:string[]}}
 */
export function decide(detections, thresholds) {
  const reasons = new Set();
  for (const d of detections) {
    const min = thresholds[d.label];
    if (min === undefined || d.score < min) continue;
    reasons.add(d.label);
  }
  return { blur: reasons.size > 0, reasons: [...reasons] };
}
