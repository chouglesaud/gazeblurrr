// Small set of accessible building blocks (Radix primitives + Tailwind), in the shadcn/ui style.
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioPrimitive from "@radix-ui/react-radio-group";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Switch(props: SwitchPrimitive.SwitchProps) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={clsx(
        "relative h-[22px] w-10 shrink-0 rounded-full bg-[#b4b4b4] outline-offset-2 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40",
        "data-[state=checked]:bg-accent",
        props.className
      )}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[20px]" />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox(props: CheckboxPrimitive.CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      className={clsx(
        "grid size-4 shrink-0 place-items-center rounded-[4px] border border-muted bg-bg",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        props.className
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3 text-accent-fg" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export const RadioGroup = RadioPrimitive.Root;

export function RadioItem(props: RadioPrimitive.RadioGroupItemProps) {
  return (
    <RadioPrimitive.Item
      {...props}
      className={clsx(
        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-muted bg-bg",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "data-[state=checked]:border-accent",
        props.className
      )}
    >
      <RadioPrimitive.Indicator className="size-2 rounded-full bg-accent" />
    </RadioPrimitive.Item>
  );
}

type Option = { value: string; label: string };

export function Select({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  label: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={clsx(
          "flex h-8 items-center justify-between gap-2 rounded-md border border-line bg-bg px-2.5 text-left",
          "hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-bg text-fg shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-hover"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-accent" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Button({
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "link" }) {
  return (
    <button
      {...props}
      className={clsx(
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40",
        variant === "link"
          ? "text-accent hover:underline"
          : "h-8 rounded-md border px-3",
        variant === "default" && "border-line bg-bg hover:bg-hover",
        variant === "primary" && "border-accent bg-accent text-accent-fg hover:brightness-95",
        variant === "danger" && "border-line bg-bg text-danger hover:bg-hover",
        className
      )}
    />
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <img
      src={chrome.runtime.getURL("icons/icon48.png")}
      width={size}
      height={size}
      alt=""
      className="rounded-md"
    />
  );
}

export function Field({ children }: { children: ReactNode }) {
  return <div className="grid gap-1">{children}</div>;
}
