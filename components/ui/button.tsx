import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[6px] text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00E599] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#00E599] text-[#09090B] font-semibold hover:bg-[#00E599]/90 shadow-sm shadow-emerald-950/20 active:scale-[0.98]",
        destructive:
          "bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 active:scale-[0.98]",
        outline:
          "border border-white/[0.08] bg-transparent text-[#FAFAFA] hover:bg-[#18181B] hover:text-[#FAFAFA] active:scale-[0.98]",
        secondary:
          "bg-[#18181B] text-[#FAFAFA] border border-white/[0.08] hover:bg-[#27272A] active:scale-[0.98]",
        ghost:
          "text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#FAFAFA]",
        link:
          "text-[#00E599] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-[6px] px-2.5 text-xs",
        lg: "h-10 rounded-[6px] px-6 text-sm",
        icon: "h-8 w-8 rounded-[6px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
