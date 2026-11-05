"use client"

import { cn } from "cn"
import { useMessages } from "@/i18n/client"
import { uiMessages } from "@/i18n/messages/ui"
import { Spinner as SpinnerIcon } from "@/components/line-icons"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useMessages(uiMessages).kit
  return (
    <SpinnerIcon data-slot="spinner" role="status" aria-label={t.spinner} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
