import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      data-kumo-component="input"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-kumo-placeholder focus-visible:border-kumo-focus focus-visible:ring-2 focus-visible:ring-kumo-focus/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-kumo-tint aria-invalid:border-kumo-danger aria-invalid:ring-2 aria-invalid:ring-kumo-danger/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
