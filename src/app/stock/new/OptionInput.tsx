"use client";

import { useId, useState } from "react";

// A free-text input that also offers existing options (via a native datalist)
// and, when the typed value is new, a "save as option" button so it's available
// next time for everyone. Used for Gold Details, Location, Inch Size and Sieve.
export default function OptionInput({
  value,
  onChange,
  options,
  onSaveNew,
  placeholder,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  onSaveNew?: (v: string) => Promise<void> | void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const listId = useId();
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();
  const exists = options.some((o) => o.toLowerCase() === trimmed.toLowerCase());
  const canSave = !!onSaveNew && trimmed !== "" && !exists;

  return (
    <div>
      <input
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={style}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {canSave && (
        <button
          type="button"
          className="btn ghost small"
          style={{ marginTop: 4 }}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSaveNew!(trimmed);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : `＋ Save “${trimmed}” as an option`}
        </button>
      )}
    </div>
  );
}
