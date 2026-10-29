import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Phosphor'da dolu (fill) sürümü kutu olan çizgi glifleri: glif, dolu bir karenin içine oyulur. Uygulama
 * ikonları dolu çizdiği için bunlar `@/components/line-icons`'tan gelir. `src/components/line-icons.tsx`
 * ile aynı liste; birine ekleyince ötekine de ekle. Phosphor her ikonu `X` ve `XIcon` adıyla verir.
 */
const LINE_GLYPHS = [
  'ChartLineUp',
  'Check',
  'Checks',
  'DotsNine',
  'DotsSix',
  'DotsSixVertical',
  'DotsThree',
  'DotsThreeVertical',
  'Equals',
  'Hash',
  'LinkBreak',
  'LinkSimple',
  'List',
  'ListChecks',
  'Minus',
  'Plus',
  'PlusMinus',
  'Spinner',
  'WaveSine',
  'X',
];
const LINE_GLYPH_IMPORTS = LINE_GLYPHS.flatMap((name) => [name, `${name}Icon`]);
const LINE_GLYPH_MESSAGE =
  "Bu glifin Phosphor'daki dolu (fill) sürümü kutu. '@/components/line-icons'tan al (çizgi kalınlığında gelir).";

/**
 * ESLint (düz yapılandırma). Next 16'da `next lint` kalktı; `npm run lint` doğrudan `eslint .` çalıştırır
 * (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md`). Kurallar Next'in önerdiği
 * takımlar: Core Web Vitals ve TypeScript.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Kullanılmayan değişken: yapı bozmayla atılan alanlar (`{ skip: _skip, ...rest }`) alt çizgiyle başlar.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Çizgi glifleri Phosphor'dan doğrudan alınmaz: dolu sürümleri kutu (`LINE_GLYPHS`).
      'no-restricted-imports': [
        'error',
        {
          paths: ['@phosphor-icons/react', '@phosphor-icons/react/dist/ssr', '@phosphor-icons/react/ssr'].map((name) => ({
            name,
            importNames: LINE_GLYPH_IMPORTS,
            message: LINE_GLYPH_MESSAGE,
          })),
        },
      ],
    },
  },
  {
    // Çizgi glifleri tek bu modülde Phosphor'dan alınır ve çizgi kalınlığıyla sarılır.
    files: ['src/components/line-icons.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // shadcn kaydından gelen bileşenler (`npx shadcn add`) olduğu gibi kalır; yeniden eklenince üzerine yazılır.
    files: ['src/components/ui/**'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    // eslint-config-next'in varsayılanları:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Bağımlılıklar, yerel çalışma kopyaları ve araç durumu:
    'node_modules/**',
    '.claude/**',
    '.omc/**',
    'public/**',
  ]),
]);
