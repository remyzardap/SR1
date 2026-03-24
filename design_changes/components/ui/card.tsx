import * as React from "react";

import { cn } from "@/lib/utils";

interface CardProps extends React.ComponentProps<"div"> {
  elevation?: 1 | 2 | 3 | 4;
  hover?: boolean;
  interactive?: boolean;
}

function Card({ className, elevation = 1, hover = false, interactive = false, ...props }: CardProps) {
  const elevationStyles = {
    1: "bg-[var(--elev-1-bg)] border-[var(--elev-1-border)] shadow-[var(--elev-1-shadow)]",
    2: "bg-[var(--elev-2-bg)] border-[var(--elev-2-border)] shadow-[var(--elev-2-shadow)]",
    3: "bg-[var(--elev-3-bg)] border-[var(--elev-3-border)] shadow-[var(--elev-3-shadow)]",
    4: "bg-[var(--elev-4-bg)] border-[var(--elev-4-border)] shadow-[var(--elev-4-shadow)]",
  };

  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-2xl border transition-all duration-[var(--duration-fast)] ease-[var(--spring-smooth)]",
        elevationStyles[elevation],
        hover && "hover:shadow-[var(--elev-hover)] hover:-translate-y-0.5",
        interactive && "cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-5 pt-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold text-[15px] text-[var(--t1)]", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[var(--t3)] text-[13px]", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 pb-5", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-5 pb-5 [.border-t]:pt-5", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
