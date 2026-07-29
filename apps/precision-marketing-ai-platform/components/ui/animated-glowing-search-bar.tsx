"use client";

import type { ChangeEvent } from "react";
import { Input } from "antd";

interface AnimatedGlowingSearchBarProps {
  "aria-label": string;
  buttonLabel?: string;
  className?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSearch: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function AnimatedGlowingSearchBar({
  "aria-label": ariaLabel,
  buttonLabel = "发送",
  className = "",
  onChange,
  onSearch,
  placeholder,
  value,
}: AnimatedGlowingSearchBarProps) {
  return (
    <div className={`animated-search-shell ${className}`.trim()}>
      <Input.Search
        aria-label={ariaLabel}
        className="animated-search-control"
        enterButton={buttonLabel}
        onChange={onChange}
        onSearch={onSearch}
        placeholder={placeholder}
        size="large"
        value={value}
      />
    </div>
  );
}
