import { forwardRef } from 'react';
import type { Icon, IconProps, IconWeight } from '@phosphor-icons/react';
import {
  ChartLineUpIcon,
  CheckIcon,
  ChecksIcon,
  CircleDashedIcon,
  DotsNineIcon,
  DotsSixIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  DotsThreeVerticalIcon,
  EqualsIcon,
  HashIcon,
  LinkBreakIcon,
  LinkSimpleIcon,
  ListChecksIcon,
  ListIcon,
  MinusIcon,
  PlusIcon,
  PlusMinusIcon,
  SpinnerIcon,
  WaveSineIcon,
  XIcon,
} from '@phosphor-icons/react/dist/ssr';

/**
 * Çizgi ikonları. Uygulamada ikonlar dolu (fill) çizilir (`providers.tsx`), ama yalnız çizgiden oluşan
 * gliflerin Phosphor'daki dolu sürümü bir kutudur: glif, yuvarlak köşeli dolu bir karenin (Spinner'da
 * dolu bir dairenin) içine oyulur. Kapat düğmesi ⊠, tutamaç dolu bir dikdörtgen olur. Bu glifler
 * Phosphor'dan değil buradan alınır (`eslint.config.mjs` → `no-restricted-imports`; listeyi
 * değiştirince orayı da güncelle).
 *
 * - Kalınlık `bold`: 256'lık ızgarada çizgi 24 birim; 16px'te ~1,5px. `regular` (16 birim, ~1px) dolu
 *   ikonların yanında silik kalır.
 * - `weight` verilebilir; `fill` verilirse (ör. her türe `fill` veren ortak bir yer) çizgiye döner,
 *   çünkü bu gliflerin dolusu kutudur.
 * - Sunucu ve istemcide aynı çalışır: `dist/ssr` ikonları bağlam okumaz, hook kullanmaz. Bu yüzden
 *   `IconContext` bunlara ulaşmaz; bağlam bugün yalnız `weight` taşıyor ve onu burada zaten veriyoruz.
 *   (Fark: boyut verilmezse `1em` çizilir; istemci ikonları bağlamda boyut yokken hiç boyut yazmaz.
 *   Uygulamada boyut her yerde CSS'ten gelir.)
 */
const LINE_WEIGHT: IconWeight = 'bold';

function line(Glyph: Icon, name: string): Icon {
  const LineIcon = forwardRef<SVGSVGElement, IconProps>(function LineIcon({ weight, ...props }, ref) {
    // `fill` ve `duotone` bu gliflerde kutu (duotone'da %20 saydam kutu): çizgiye döner.
    return <Glyph ref={ref} {...props} weight={weight && weight !== 'fill' && weight !== 'duotone' ? weight : LINE_WEIGHT} />;
  });
  LineIcon.displayName = name;
  return LineIcon;
}

export const ChartLineUp = line(ChartLineUpIcon, 'ChartLineUp');
export const Check = line(CheckIcon, 'Check');
export const Checks = line(ChecksIcon, 'Checks');
export const CircleDashed = line(CircleDashedIcon, 'CircleDashed');
export const DotsNine = line(DotsNineIcon, 'DotsNine');
export const DotsSix = line(DotsSixIcon, 'DotsSix');
export const DotsSixVertical = line(DotsSixVerticalIcon, 'DotsSixVertical');
export const DotsThree = line(DotsThreeIcon, 'DotsThree');
export const DotsThreeVertical = line(DotsThreeVerticalIcon, 'DotsThreeVertical');
export const Equals = line(EqualsIcon, 'Equals');
export const Hash = line(HashIcon, 'Hash');
export const LinkBreak = line(LinkBreakIcon, 'LinkBreak');
export const LinkSimple = line(LinkSimpleIcon, 'LinkSimple');
export const List = line(ListIcon, 'List');
export const ListChecks = line(ListChecksIcon, 'ListChecks');
export const Minus = line(MinusIcon, 'Minus');
export const Plus = line(PlusIcon, 'Plus');
export const PlusMinus = line(PlusMinusIcon, 'PlusMinus');
export const Spinner = line(SpinnerIcon, 'Spinner');
export const WaveSine = line(WaveSineIcon, 'WaveSine');
export const X = line(XIcon, 'X');
