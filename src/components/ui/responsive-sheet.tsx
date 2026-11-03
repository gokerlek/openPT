"use client"

/*
 * Konuma göre kök değiştiren panel: `bottom` iken alttan `Drawer` (tutamaç, aşağı kaydırınca kapanır), değilse
 * sağdan `Sheet`. Drawer.Popup bir Drawer.Root ister; bu yüzden içerik kadar kök de değişir. İçerideki
 * `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter`, `SheetClose` iki kökte de çalışır (Drawer'ın
 * başlık/açıklama/kapatma parçaları Base UI Dialog parçalarıdır). Açıkken konum değişirse (ekran döner) içerik
 * yeniden kurulur.
 */

import * as React from "react"

import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { Sheet, SheetContent } from "@/components/ui/sheet"

const BottomContext = React.createContext(false)

/** Panel alttan mı (içerikte konuma göre sınıf seçmek için). */
function useResponsiveSheetBottom() {
  return React.useContext(BottomContext)
}

function ResponsiveSheet({
  bottom,
  ...props
}: {
  bottom: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <BottomContext.Provider value={bottom}>
      {bottom ? <Drawer {...props} /> : <Sheet {...props} />}
    </BottomContext.Provider>
  )
}

function ResponsiveSheetContent({
  className,
  ...props
}: Pick<
  React.ComponentProps<typeof DrawerContent>,
  "children" | "initialFocus" | "finalFocus" | "showCloseButton" | "ref"
> & { className?: string }) {
  const bottom = useResponsiveSheetBottom()
  return bottom ? (
    <DrawerContent className={className} {...props} />
  ) : (
    <SheetContent side="right" className={className} {...props} />
  )
}

export { ResponsiveSheet, ResponsiveSheetContent, useResponsiveSheetBottom }
