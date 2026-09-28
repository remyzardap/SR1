import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-[var(--btn-fill)] text-[var(--btn-ink)] border border-[var(--line-2)] hover:shadow-[var(--elev-hover)] hover:-translate-y-0.5",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 border border-destructive",
        outline:
          "border border-[var(--line-2)] bg-transparent hover:bg-[var(--elev-1-bg)] hover:border-[var(--line-3)]",
        secondary:
          "bg-[var(--elev-1-bg)] text-[var(--t1)] border border-[var(--line-2)] hover:bg-[var(--glass-2)] hover:border-[var(--line-3)] hover:shadow-[var(--elev-hover)] hover:-translate-y-0.5",
        ghost:
          "bg-transparent hover:bg-[var(--elev-1-bg)] border border-transparent",
        link: "text-[var(--t1)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 rounded-lg has-[>svg]:px-3",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5 text-xs",
        lg: "h-11 rounded-xl px-6 has-[>svg]:px-4 text-base",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
