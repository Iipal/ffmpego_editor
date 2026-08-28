import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Kumo-aligned Button — maps legacy shadcn variants to Kumo semantics.
 * - default → primary (brand blue, highest emphasis, 36px/8px radius)
 * - secondary → secondary (default for ordinary actions, base surface + line ring)
 * - outline → outline (transparent, ring line)
 * - ghost → ghost (minimal)
 * - destructive → destructive (danger, same emphasis as primary but danger tint)
 * Sizes align to Kumo: xs 20px, sm 26px, base 36px, lg 40px
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-kumo-focus focus-visible:ring-offset-1 focus-visible:ring-offset-kumo-canvas disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-kumo-danger/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-kumo-brand text-white border-transparent shadow-sm hover:bg-kumo-brand-hover active:bg-kumo-brand-hover [&_svg]:text-white",
        primary:
          "bg-kumo-brand text-white border-transparent shadow-sm hover:bg-kumo-brand-hover active:bg-kumo-brand-hover [&_svg]:text-white",
        secondary:
          "bg-kumo-base text-kumo-default border border-kumo-line shadow-sm hover:bg-kumo-tint hover:border-kumo-line active:bg-kumo-tint",
        outline:
          "bg-transparent text-kumo-default border border-kumo-line hover:bg-kumo-tint hover:text-kumo-strong",
        ghost:
          "bg-transparent border-transparent text-kumo-default shadow-none hover:bg-kumo-tint hover:text-kumo-strong",
        destructive:
          "bg-kumo-danger text-white border-transparent shadow-sm hover:bg-kumo-danger/90 active:bg-kumo-danger/90",
        "secondary-destructive":
          "bg-kumo-base text-kumo-danger border border-kumo-line hover:bg-kumo-danger-tint hover:border-kumo-danger/20",
        link: "text-kumo-link underline-offset-4 hover:underline border-transparent bg-transparent shadow-none h-auto px-0 py-0",
      },
      size: {
        default: "h-9 gap-1.5 px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-5 gap-1 px-1.5 text-xs rounded-sm has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-6.5 gap-1 px-2 text-xs rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-10 gap-2 px-4 text-sm",
        icon: "size-9 p-0",
        "icon-xs": "size-5 p-0 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-6.5 p-0 rounded-md",
        "icon-lg": "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-kumo-component="button"
      className={cn(buttonVariants({ variant: variant as any, size: size as any, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
