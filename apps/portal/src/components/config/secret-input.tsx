"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SecretInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  showPartialMask?: boolean;
}

function maskValue(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }
  return value.slice(0, 4) + "*".repeat(value.length - 8) + value.slice(-4);
}

const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  ({ className, showPartialMask = true, value, ...props }, ref) => {
    const [isVisible, setIsVisible] = React.useState(false);

    const displayValue = React.useMemo(() => {
      if (isVisible) return value;
      if (!value || typeof value !== "string") return "";
      if (!showPartialMask) return "*".repeat(String(value).length);
      return maskValue(String(value));
    }, [isVisible, value, showPartialMask]);

    return (
      <div className="relative">
        <input
          type={isVisible ? "text" : "password"}
          className={cn(
            "flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 pr-10 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm font-mono",
            !isVisible && value && showPartialMask && "text-transparent",
            className
          )}
          ref={ref}
          value={value}
          {...props}
        />
        <button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {isVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        {!isVisible && value && showPartialMask && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-gray-500 pointer-events-none">
            {displayValue}
          </div>
        )}
      </div>
    );
  }
);
SecretInput.displayName = "SecretInput";

export { SecretInput };
