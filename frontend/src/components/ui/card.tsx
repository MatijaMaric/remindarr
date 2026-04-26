import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("border", {
  variants: {
    tone: {
      solid: "bg-zinc-900",
      translucent: "bg-zinc-900/60",
      overlay: "bg-zinc-900/95 backdrop-blur-sm",
    },
    border: {
      subtle: "border-white/[0.06]",
    },
    radius: {
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
    },
    padding: {
      none: "",
      sm: "p-2.5",
      md: "p-4",
      lg: "p-6",
      xl: "p-8",
    },
  },
  defaultVariants: {
    tone: "solid",
    border: "subtle",
    radius: "xl",
    padding: "md",
  },
});

export type CardVariants = VariantProps<typeof cardVariants>;

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & CardVariants
>(({ className, tone, border, radius, padding, ...rest }, ref) => (
  <div
    ref={ref}
    className={cn(cardVariants({ tone, border, radius, padding }), className)}
    {...rest}
  />
));
Card.displayName = "Card";
