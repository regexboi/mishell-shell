import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn(
        "group/mishell-scroll relative overflow-hidden",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-none">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      orientation={orientation}
      className={cn(
        "flex touch-none select-none bg-transparent p-0 opacity-0 transition-opacity duration-150 group-hover/mishell-scroll:opacity-100 group-focus-within/mishell-scroll:opacity-100",
        orientation === "vertical" && "h-full w-1",
        orientation === "horizontal" && "h-1 w-full flex-col",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_52%,transparent)]" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
