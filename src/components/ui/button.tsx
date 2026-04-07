import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border text-xs font-medium uppercase tracking-[0.28em] transition duration-150 outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--border-strong)] bg-[color:var(--panel-strong)] px-4 py-2 text-[color:var(--text-primary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]",
        ghost:
          "border-transparent bg-transparent px-3 py-2 text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]",
        accent:
          "border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] px-4 py-2 text-[color:var(--accent)] hover:bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)]",
      },
      size: {
        default: "h-10",
        sm: "h-8 px-3 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { Button, buttonVariants };
