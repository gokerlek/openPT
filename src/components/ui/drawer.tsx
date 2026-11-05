"use client"

/*
 * Alttan açılan panel (shadcn Drawer gibi): üstte tutamaç, aşağı kaydırınca kapanır. Base UI `Drawer` üzerinde;
 * API `Sheet` ile birebir (Sheet* → Drawer*, `side` yok). Yan paneller `Sheet`te (sheet.tsx); konuma göre ikisi
 * arasında geçen panel `ResponsiveSheet` (responsive-sheet.tsx).
 *
 * Boy en çok ekran eksi üst güvenli alan; köşe yuvarlaklığı ve alt güvenli alan buradadır, çağıran tekrarlamaz.
 * İçerik daha uzunsa gövde (`drawer-body`) kayar, tutamaç ve X yerinde kalır; kendi kayan gövdesi olan çağıranda
 * (`min-h-0 flex-1 overflow-y-auto`) yalnız o kayar.
 *
 * Kaydırma mı sürükleme mi (Base UI kuralı): dokunuş gerçekten taşan bir kayan alanda (overflow-y auto/scroll)
 * başlarsa alan en üstte değilken liste kayar; en üstteyken aşağı çekiş paneli sürükler, yukarı çekiş listeyi
 * kaydırır. Kayan alan dışında (tutamaç, başlık, alt düğmeler) her aşağı çekiş paneli sürükler. Farede yalnız
 * tutamaçtan sürüklenir: içerik `Drawer.Content` içinde, orada metin seçilir. Kendi sürükleme hareketi olan öğe
 * (ör. sıralama tutamacı) `data-base-ui-swipe-ignore` ile paneli sürüklemez; meşgulken kapanmayı reddeden panel
 * de bu özniteliği popup'a verir (sürükleme titremesin). Açık seçim isteyen panel `swipeable={false}`: tutamaç
 * yok, sürüklenmez; Esc ve paneldeki düğmeler kapatır.
 *
 * Odak: `initialFocus` verilmezse açılışta panelin kendisine gider (Base UI Drawer varsayılanı; Dialog fare ve
 * klavyeyle ilk odaklanabilir öğeye, yani X'e gönderirdi). Panelin kendi odak halkası yoktur; X'in halkası yalnız
 * ona klavyeyle gelindiğinde görünür. Çağıran `initialFocus` ile başlığı ya da bir düğmeyi seçebilir.
 */

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "cn"

import { X } from "@/components/line-icons"
import { Button } from "@/components/ui/button"
import { useMessages } from "@/i18n/client"
import { commonMessages } from "@/i18n/messages/common"

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
  swipeable = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** `false`: tutamaç yok, panel sürüklenmez (Esc ve paneldeki düğmeler kapatır). */
  swipeable?: boolean
}) {
  const t = useMessages(commonMessages).actions
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
            "relative flex max-h-[calc(100dvh-max(1rem,env(safe-area-inset-top)))] w-full flex-col gap-4 rounded-t-2xl border-t bg-popover bg-clip-padding pb-[env(safe-area-inset-bottom)] text-sm text-popover-foreground outline-none",
            // İlk gölge panelin 3rem altına aynı renkte bir kopya: yukarı çekince altta boşluk görünmez
            // (gölge yerleşimi ve kaydırmayı etkilemez); ardından shadow-lg.
            "shadow-[0_3rem_0_var(--popover),0_10px_15px_-3px_rgb(0_0_0/0.1),0_4px_6px_-4px_rgb(0_0_0/0.1)]",
            // Sürüklerken parmağı izler (Base UI satır içi transform verir), bırakınca yerine döner. Kapanış X/Esc
            // ile 160 ms; kaydırarak kapanınca hıza göre (`--drawer-swipe-strength` 0.1–1) 36–360 ms.
            "[transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-220 ease-out data-swiping:select-none data-ending-style:duration-160 data-ending-style:ease-in data-swipe-dismiss:data-ending-style:duration-[calc(var(--drawer-swipe-strength)*360ms)]",
            "motion-safe:data-starting-style:[transform:translateY(100%)] motion-safe:data-ending-style:[transform:translateY(100%)]",
            "motion-reduce:transition-opacity motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0",
            className
          )}
          {...props}
          {...(swipeable ? {} : { "data-base-ui-swipe-ignore": "" })}
        >
          {/* Görünen çubuk küçük; tutma alanı (::after) 112×36 px, başlığın üst şeridini örtmez. Süs: ekran
              okuyucu ve sekme görmez. */}
          {swipeable ? (
            <div
              aria-hidden
              data-slot="drawer-handle"
              className="relative mx-auto mt-2 h-1.5 w-12 shrink-0 cursor-grab touch-none rounded-full bg-muted-foreground/40 after:absolute after:-top-2 after:left-1/2 after:h-9 after:w-28 after:-translate-x-1/2 active:cursor-grabbing"
            />
          ) : null}
          {/* Gövde: çocuklar burada flex sütunda (aralık panelden), panelin boyunu aşarsa kayar. */}
          <DrawerPrimitive.Content
            data-slot="drawer-body"
            className="flex min-h-0 flex-1 flex-col gap-[inherit] overflow-y-auto overscroll-contain"
          >
            {children}
          </DrawerPrimitive.Content>
          {showCloseButton ? (
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
              <span className="sr-only">{t.close}</span>
            </DrawerPrimitive.Close>
          ) : swipeable ? (
            // Görünen X yokken ekran okuyucu (dokunmatikte kaydırma hareketi yapamayan) için kapatma; klavyeyle
            // odaklanınca görünür. Sürüklenmeyen panelde yok: orada seçim paneldeki düğmelerle açıkça yapılır.
            <DrawerPrimitive.Close
              data-slot="drawer-close"
              className="sr-only rounded-lg bg-popover text-sm font-medium outline-none focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:right-[max(0.75rem,env(safe-area-inset-right))] focus-visible:inline-flex focus-visible:h-11 focus-visible:items-center focus-visible:px-3 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t.close}
            </DrawerPrimitive.Close>
          ) : null}
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
