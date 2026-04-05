import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api";

interface Props {
  titleId: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function TagList({ titleId, tags, onTagsChange }: Props) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function saveTags(newTags: string[]) {
    try {
      await api.updateTrackedTags(titleId, newTags);
      onTagsChange(newTags);
    } catch (err) {
      console.error("Failed to save tags", err);
    }
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    if (tags.length >= 10) {
      setError(t("tags.tooMany"));
      return;
    }
    if (tag.length > 30) {
      setError(t("tags.tooLong"));
      return;
    }
    setError(null);
    if (tags.includes(tag)) {
      setInput("");
      return;
    }
    const next = [...tags, tag];
    setInput("");
    void saveTags(next);
  }

  function removeTag(tag: string) {
    void saveTags(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 bg-zinc-800 text-zinc-300 text-[11px] px-1.5 py-0.5 rounded"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-amber-500 hover:text-amber-400 leading-none ml-0.5"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => {
          setError(null);
          setInput(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (input.trim()) addTag(input);
        }}
        placeholder={tags.length === 0 ? t("tags.placeholder") : undefined}
        className="bg-transparent text-[11px] text-zinc-300 placeholder-zinc-600 outline-none min-w-[60px] max-w-[100px]"
        maxLength={31}
      />
      {error && <span className="text-[10px] text-red-400 w-full">{error}</span>}
    </div>
  );
}
