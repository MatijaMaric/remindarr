import { Tabs as TabsPrimitive } from "@base-ui/react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex items-center border-b border-border",
        "overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap shrink-0",
        "px-4 py-2.5 text-sm font-medium cursor-pointer select-none",
        "text-muted-foreground hover:text-foreground-secondary transition-colors",
        "border-b-2 border-transparent -mb-px",
        "data-[active]:text-primary-text data-[active]:border-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-border rounded-t-sm",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      className={cn("mt-6 space-y-8 focus-visible:outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
