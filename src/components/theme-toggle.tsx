"use client";

import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  function toggleTheme() {
    const current = document.documentElement.dataset.theme ?? "light";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("studio-radar-theme", next);
  }

  return (
    <button className="icon-button theme-toggle" type="button" aria-label="Cambia tema" title="Cambia tema" onClick={toggleTheme}>
      <Moon className="theme-icon-dark" size={18} aria-hidden="true" />
      <Sun className="theme-icon-light" size={18} aria-hidden="true" />
    </button>
  );
}
