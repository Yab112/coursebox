import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "success";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface-2 text-foreground hover:bg-border",
  ghost: "text-muted hover:text-foreground hover:bg-surface-2",
  outline: "border border-border bg-surface text-foreground hover:bg-surface-2",
  success: "bg-success-soft text-success hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-[15px] gap-2",
  icon: "h-9 w-9",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = "primary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";
