import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root {...props} />
}

function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger {...props} />
}

function AlertDialogPortal(props: ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal {...props} />
}

function AlertDialogBackdrop({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Backdrop>) {
  return (
    <AlertDialogPrimitive.Backdrop
      className={cn(
        "fixed inset-0 z-50 bg-black/50 transition-opacity",
        "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogPopup({
  className,
  children,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Popup>) {
  return (
    <AlertDialogPortal>
      <AlertDialogBackdrop />
      <AlertDialogPrimitive.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-800 bg-zinc-950 p-6 shadow-lg transition-all",
          "data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          "data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPortal>
  )
}

function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-lg font-semibold text-zinc-100", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("mt-2 text-sm text-zinc-400", className)}
      {...props}
    />
  )
}

function AlertDialogClose(props: ComponentProps<typeof AlertDialogPrimitive.Close>) {
  return <AlertDialogPrimitive.Close {...props} />
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
}
