"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Searchable, creatable chip/tag input — used for job titles so users pick
 * from common suggestions or type their own, instead of typing a raw
 * comma-separated list into a plain text field.
 */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  id?: string;
}) {
  const [input, setInput] = useState("");

  const alreadySelected = new Set(value.map((v) => v.toLowerCase()));
  const filteredSuggestions = suggestions
    .filter((s) => !alreadySelected.has(s.toLowerCase()))
    .filter((s) => (input.trim() ? s.toLowerCase().includes(input.trim().toLowerCase()) : true))
    .slice(0, 6);

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || alreadySelected.has(trimmed.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, trimmed]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 px-3 py-2.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-sm font-medium text-brand-700"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 hover:bg-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : "Add another…"}
          className="min-w-[8rem] flex-1 border-none bg-transparent py-1 text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {filteredSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => addTag(suggestion)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
