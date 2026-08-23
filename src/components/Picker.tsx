"use client";

// A dropdown and nothing else — the opposite of Combo, which also accepts
// anything typed.
//
// Used where a spelling would invent something the rest of the portal has to
// agree on: a manufacturer, a party, a product. Two things it does that a bare
// <select> does not:
//
//   * an empty value shows a prompt rather than silently reading as the first
//     option, so "not chosen yet" is visible;
//   * a saved value that is no longer on the list is still shown. Lists get
//     edited, and a sheet reopening blank — quietly dropping what it said —
//     is worse than one showing an option that has since been retired.
export default function Picker({
  value,
  onChange,
  options,
  prompt = "Choose…",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  prompt?: string;
  id?: string;
}) {
  const off = value.trim() !== "" && !options.some((o) => o === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{prompt}</option>
      {off && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
