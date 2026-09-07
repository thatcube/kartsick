import React, { useEffect, useRef } from "react";
import type { MenuAction } from "../input";

export function navigateMenu(action: MenuAction, root: Element | null = document.querySelector("[data-game-menu]")): void {
  const controls = Array.from(root?.querySelectorAll<HTMLElement>("[data-pad]") ?? [])
    .filter(control => !control.hasAttribute("disabled") && control.getClientRects().length > 0);
  if (!controls.length) return;
  const focused = controls.findIndex(control => control === document.activeElement);
  const current = controls[Math.max(0, focused)];
  if (action === "accept") {
    current.click();
    return;
  }
  if (action === "left" || action === "right") {
    const direction = action === "left" ? -1 : 1;
    if (current instanceof HTMLInputElement && current.type === "range") {
      const value = Math.min(Number(current.max), Math.max(Number(current.min), Number(current.value) + direction * Number(current.step)));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(current, String(value));
      current.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (current.dataset.choice === "true") {
      current.dispatchEvent(new CustomEvent("kartsick-adjust", { detail: direction }));
      return;
    }
  }
  if (action === "up" || action === "down" || action === "left" || action === "right") {
    const next = (focused + (action === "up" || action === "left" ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus();
    controls[next].scrollIntoView({ block: "nearest" });
  }
}

export function Choice<T extends string | number>({ label, value, options, change, detail, disabled = false }: {
  label: string; value: T; options: readonly { value: T; label: string }[];
  change: (value: T) => void; detail?: string; disabled?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef({ value, options, change });
  latest.current = { value, options, change };
  function adjust(direction: number): void {
    const current = latest.current;
    const index = current.options.findIndex(option => option.value === current.value);
    if (index < 0 || !current.options.length) throw new RangeError(`Invalid ${label} choice.`);
    current.change(current.options[(index + direction + current.options.length) % current.options.length].value);
  }
  useEffect(() => {
    const button = ref.current;
    const listener = (event: Event) => {
      if (event instanceof CustomEvent && (event.detail === -1 || event.detail === 1)) adjust(event.detail);
    };
    button?.addEventListener("kartsick-adjust", listener);
    return () => button?.removeEventListener("kartsick-adjust", listener);
  }, []);
  return <button data-pad data-choice="true" ref={ref} className="game-choice" onClick={() => adjust(1)} disabled={disabled}>
    <span>{label}{detail && <small>{detail}</small>}</span>
    <strong><i aria-hidden="true">&#8249;</i>{options.find(option => option.value === value)?.label ?? String(value)}<i aria-hidden="true">&#8250;</i></strong>
  </button>;
}

export function Toggle({ label, value, change, detail }: { label: string; value: boolean; change: (value: boolean) => void; detail?: string }): React.JSX.Element {
  return <button data-pad className="game-choice" aria-pressed={value} onClick={() => change(!value)}>
    <span>{label}{detail && <small>{detail}</small>}</span><strong>{value ? "On" : "Off"}</strong>
  </button>;
}

export function Range({ label, value, min, max, step, change, suffix = "%" }: {
  label: string; value: number; min: number; max: number; step: number; change: (value: number) => void; suffix?: string;
}): React.JSX.Element {
  return <label className="game-range"><span>{label}<strong>{suffix === "%" ? Math.round(value * 100) : value.toFixed(2)}{suffix}</strong></span>
    <input data-pad type="range" aria-label={label} value={value} min={min} max={max} step={step} onInput={event => change(Number(event.currentTarget.value))} />
  </label>;
}
