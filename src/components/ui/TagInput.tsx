"use client";

import { useState, useRef, KeyboardEvent } from "react";

interface TagInputProps {
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  placeholder?: string;
  suggestions?: string[];
}

export function TagInput({
  label = "Tags",
  value,
  onChange,
  max = 10,
  placeholder = "Add tag...",
  suggestions = [],
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(input.toLowerCase()) &&
      !value.includes(s.toLowerCase()),
  );

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </label>
      <div
        className="focus-within-ring flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-[var(--shadow-xs)] transition-[border-color] hover:border-[var(--border-strong)]"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-6 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 text-xs font-medium text-[var(--text)]"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="ml-0.5 text-[var(--muted)] hover:text-[var(--text)]"
              aria-label={`Remove tag ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        {value.length < max && (
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              placeholder={value.length === 0 ? placeholder : ""}
              className="h-6 w-full min-w-[80px] border-none bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
            />
            {showSuggestions && input && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 z-10 mt-1 max-h-32 w-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(s)}
                    className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--surface-2)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {value.length >= max && (
        <p className="text-xs text-[var(--muted)]">
          Maximum of {max} tags reached.
        </p>
      )}
    </div>
  );
}
