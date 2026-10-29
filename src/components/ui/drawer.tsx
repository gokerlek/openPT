"use client"

/*
 * Alttan açılan panel (shadcn Drawer gibi): üstte tutamaç, aşağı kaydırınca kapanır. Base UI `Drawer` üzerinde;
 * API `Sheet` ile birebir (Sheet* → Drawer*, `side` yok). Yan paneller `Sheet`te (sheet.tsx) kalır.
 *
 * Kaydırma mı sürükleme mi (Base UI kuralı): dokunuş gerçekten taşan bir kayan alanda (overflow-y auto/scroll)
 * başlarsa alan en üstte değilken liste kayar; en üstteyken aşağı çekiş paneli sürükler, yukarı çekiş listeyi
 * kaydırır. Kayan alan dışında (tutamaç, başlık, alt düğmeler) her aşağı çekiş paneli sürükler. Farede yalnız
 * tutamaçtan sürüklenir: içerik `Drawer.Content` içinde, orada metin seçilir. Kendi sürükleme hareketi olan öğe
 * (ör. sıralama tutamacı) `data-base-ui-swipe-ignore` ile paneli sürüklemez.
 *
 * Açılışta odak başlıkta ya da `initialFocus` verilmezse panelin kendisinde (Base UI Drawer varsayılanı; Dialog
 * gibi ilk düğmeye, yani X'e gitmez): odak halkası yalnız gerçek klavye odağında görünür.
 */

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "cn"

import { X } from "@/components/line-icons"
import { Button } from "@/components/ui/button"

function Drawer({
  ...props
}: Omit<DrawerPrimitive.Root.Props, "swipeDirection">) {
  return (
    <DrawerPrimitive.Root data-slot="drawer" swipeDirection="down" {...props} />
  )
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        // Sürükledikçe silikleşir (`--drawer-swipe-progress` 0→1); iOS 26+'da görünür alanın tamamını örter.
        "fixed inset-0 z-50 min-h-dvh bg-black/10 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-220 dark:bg-black/50 supports-backdrop-filter:backdrop-blur-xs supports-[-webkit-touch-callout:none]:absolute data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-160",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        className="fixed inset-0 z-50 flex items-end justify-center"
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "relative flex max-h-[90dvh] w-full flex-col gap-4 rounded-t-2xl border-t bg-popover bg-clip-padding pb-[env(safe-area-inset-bottom)] text-sm text-popover-foreground outline-none",
            // İlk gölge panelin 3rem altına aynı renkte bir kopya: yukarı çekince altta boşluk görünmez
            // (gölge yerleşimi ve kaydırmayı etkilemez); ardından shadow-lg.
            "shadow-[0_3rem_0_var(--popover),0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)]",
            // Sürüklerken parmağı izler (Base UI satır içi transform verir), bırakınca yerine döner ya da
            // hızıyla orantılı sürede aşağı kayıp kapanır.
            "[transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-220 ease-out data-swiping:select-none data-ending-style:duration-[calc(var(--drawer-swipe-strength)*160ms)] data-ending-style:ease-in",
            "motion-safe:data-starting-style:[transform:translateY(100%)] motion-safe:data-ending-style:[transform:translateY(100%)]",
            "motion-reduce:transition-opacity motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
            className
          )}
          {...props}
        >
          {/* Görünen çubuk küçük; tutma alanı (::after) 112×44 px. Süs: ekran okuyucu ve sekme görmez. */}
          <div
            aria-hidden
            data-slot="drawer-handle"
            className="relative mx-auto mt-2 h-1.5 w-12 shrink-0 cursor-grab touch-none rounded-full bg-muted-foreground/40 after:absolute after:-top-2 after:left-1/2 after:h-11 after:w-28 after:-translate-x-1/2 active:cursor-grabbing"
          />
          {/* `contents`: çocuklar panelin flex düzeninde kalır (başlık / kayan gövde / alt düğmeler). */}
          <DrawerPrimitive.Content data-slot="drawer-body" className="contents">
            {children}
          </DrawerPrimitive.Content>
          {showCloseButton && (
            <DrawerPrimitive.Close
              data-slot="drawer-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-3 right-[max(0.75rem,env(safe-area-inset-right))] touch:size-11"
                  size="icon-sm"
                />
              }
            >
              <X />
              <span className="sr-only">Kapat</span>
            </DrawerPrimitive.Close>
          )}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
