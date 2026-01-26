import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        pcd: "border-transparent bg-purple-600 text-white hover:bg-purple-700",
        elderly: "border-transparent bg-sky-400 text-white hover:bg-sky-500",
        upToDate: "border-transparent bg-red-600 text-white hover:bg-red-700",
        normal: "border-transparent bg-green-600 text-white hover:bg-green-700",
        large: "border-transparent bg-gray-900 text-white hover:bg-black",
        covered: "border-transparent bg-covered text-covered-foreground hover:bg-covered/80",
        uncovered: "border-transparent bg-uncovered text-uncovered-foreground hover:bg-uncovered/80",
        linked: "border-transparent bg-linked text-linked-foreground hover:bg-linked/80",
        unlinked: "border-transparent bg-unlinked text-unlinked-foreground hover:bg-unlinked/80",
        small: "border-transparent bg-small text-white hover:bg-small/80",
        floor: "bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-200",
        motorcycle: "bg-amber-800 text-white hover:bg-amber-900",
        common: "border-transparent bg-slate-500 text-white hover:bg-slate-600",
        
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
