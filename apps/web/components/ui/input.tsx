import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-kumo-component="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-kumo-line bg-kumo-base px-3 py-1 text-sm text-kumo-default transition-[border-color,box-shadow] duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-kumo-default placeholder:text-kumo-placeholder focus-visible:border-kumo-focus focus-visible:ring-2 focus-visible:ring-kumo-focus/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-kumo-tint aria-invalid:border-kumo-danger aria-invalid:ring-2 aria-invalid:ring-kumo-danger/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
