"use client";
import Combo from "./Combo";
import {
  ROUND_SIEVES,
  ROUND_CARAT_BANDS,
  FANCY_LABELS,
  fancySizesFor,
  isRoundShape,
  trimPointer,
} from "@/lib/sieveSizes";
import { formatPointer, type DiaLine } from "@/lib/pdConfig";

// Picking a diamond size used to mean typing the sieve out by hand. Now the
// shape decides what is asked for:
//   Round  — one dropdown of sieve sizes (Size Name + Size MM) from the master.
//   Fancy  — a free MM box plus a dropdown of that shape's per-piece pointers.
// Every dropdown still accepts a typed value, so a size that isn't in the
// master yet never blocks the sheet.

const SHAPES = ["Round", ...FANCY_LABELS];

// Round sizes read "+15-15.5 · 3.60MM"; the stored value is just the name.
const roundOptions = [
  ...ROUND_SIEVES.map((s) => (s.mm ? `${s.name} · ${s.mm}` : s.name)),
  ...ROUND_CARAT_BANDS.map((b) => (b.label && b.label !== b.name ? `${b.name} · ${b.label}` : b.name)),
];
const nameOf = (option: string) => option.split(" · ")[0].trim();

function roundInfo(name: string) {
  const key = name.trim().toLowerCase();
  const sieve = ROUND_SIEVES.find((s) => s.name.toLowerCase() === key);
  if (sieve) return { mm: sieve.mm, pointer: sieve.pointer };
  const band = ROUND_CARAT_BANDS.find((b) => b.name.toLowerCase() === key);
  if (band) return { mm: "", pointer: band.pointer };
  return { mm: "", pointer: "" };
}

export default function DiamondSizePicker({
  lines,
  onChange,
}: {
  lines: DiaLine[];
  onChange: (next: DiaLine[]) => void;
}) {
  const set = (i: number, patch: Partial<DiaLine>) =>
    onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const add = () =>
    onChange([...lines, { shape: "Round", size: "", mm: "", pointer: "", pcs: "" }]);

  const remove = (i: number) => {
    const next = lines.filter((_, n) => n !== i);
    onChange(next.length ? next : [{ shape: "Round", size: "", mm: "", pointer: "", pcs: "" }]);
  };

  // Changing shape clears the size fields — a marquise pointer is meaningless
  // once the row becomes round.
  const setShape = (i: number, shape: string) =>
    set(i, { shape, size: "", mm: "", pointer: "" });

  const pickRound = (i: number, option: string) => {
    const name = nameOf(option);
    const info = roundInfo(name);
    set(i, { size: name, mm: info.mm, pointer: info.pointer });
  };

  return (
    <div className="dia-picker">
      {lines.map((l, i) => {
        const round = isRoundShape(l.shape);
        const fancy = fancySizesFor(l.shape);
        const mmOptions = Array.from(new Set(fancy.map((f) => f.mm).filter(Boolean)));
        const ptOptions = Array.from(new Set(fancy.map((f) => trimPointer(f.pointer))));

        return (
          <div className="dia-row" key={i}>
            <div className="dia-head">
              <span className="sr">{i + 1}</span>
              <Combo
                value={l.shape}
                onChange={(v) => setShape(i, v)}
                options={SHAPES}
                placeholder="Shape"
              />
              <input
                className="pcs"
                value={l.pcs}
                onChange={(e) => set(i, { pcs: e.target.value })}
                placeholder="Pcs"
                inputMode="numeric"
              />
              <button
                type="button"
                className="del"
                onClick={() => remove(i)}
                title="Remove this size"
                aria-label="Remove this size"
              >
                ×
              </button>
            </div>

            {round ? (
              <label className="field">
                <span>Sieve size</span>
                {/* The input holds only the size name. Rewriting it to
                    "name · mm" mid-type would move the caret under the
                    user's fingers, so the matched MM is shown beneath. */}
                <Combo
                  value={l.size}
                  onChange={(v) => pickRound(i, v)}
                  options={roundOptions}
                  placeholder="+15-15.5"
                />
                {l.mm && <p className="dia-hint">{l.mm}</p>}
              </label>
            ) : (
              <div className="two">
                <label className="field">
                  <span>Size MM</span>
                  <Combo
                    value={l.mm}
                    onChange={(v) => set(i, { mm: v })}
                    options={mmOptions}
                    placeholder="3*1.5MM"
                  />
                </label>
                <label className="field">
                  <span>Weight (per pc)</span>
                  {/* Raw while typing — tidying it here would swallow the
                      decimal point the moment "1." is typed. */}
                  <Combo
                    value={l.pointer}
                    onChange={(v) => set(i, { pointer: v })}
                    options={ptOptions}
                    placeholder="0.25"
                  />
                  {/* Whichever unit is written is the one that prints. */}
                  <p className="dia-note">
                    {formatPointer(l.pointer) || "Add cts or pts — a plain number prints as PTR"}
                  </p>
                </label>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="ghost" onClick={add}>+ Add diamond size</button>
    </div>
  );
}
