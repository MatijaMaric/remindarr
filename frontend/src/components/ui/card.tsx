import React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("border", {
  variants: {
    tone: {
      solid: "bg-card",
      translucent: "bg-card/60",
      overlay: "bg-card/95 backdrop-blur-sm",
    },
    border: {
      subtle: "border-border",
    },
    radius: {
      lg: "rounded-md",
      xl: "rounded-lg",
      "2xl": "rounded-xl",
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
