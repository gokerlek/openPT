/**
 * Ekrandan kalkacak bir kartın ardından odağı mantıklı yere taşır: kartın yerine gelen sonraki öğeye, yoksa
 * sayfanın ana içeriğine (`main`). Kart kalkınca odak `body`'ye düşüp klavye ve ekran okuyucu kullanıcısını
 * sayfanın başına atmasın. Hedef kart kalkmadan bulunur (sonra kardeşi kalmaz), odak bir kare sonra taşınır.
 * Hedef kendiliğinden odaklanamıyorsa yalnız betikle odaklanabilir olur (`tabindex="-1"`, Tab sırasına girmez).
 */
export function focusAfterRemoval(element: Element | null): void {
  const target = (element?.nextElementSibling ?? element?.closest('main') ?? null) as HTMLElement | null;
  if (!target) return;
  if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => {
    if (target.isConnected) target.focus();
  });
}
