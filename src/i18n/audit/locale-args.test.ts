import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * Dil parametresi unutulmaz (tümleştirme, plan §7 I.1): tür denetçisiyle `src/app/**`, `src/components/**` ve `src/lib/**`
 * (testler hariç), tek TypeScript programıyla. Çağrılan yardımcı (tanımı `src/` içinde) dili şu yollardan birinden alıyor
 * ve çağrı vermiyorsa bulunur:
 * - konumlu parametre: adı `locale` ya da türü `Locale` (`listExercises(custom?, locale?)`, `muscleLabels(l)`),
 * - nesne bağımsız değişkeni: bağlam türünde `locale` alanı var, yazılan nesnede yok (`careInputOf(r, { today, painConsent })`),
 * - JSX: bileşenin `locale` özelliği var, verilmemiş (`<DayPlan … />`).
 * Yayılım (`...x`) dili taşıyabilir, sayılmaz. Unutulmuş sayılır: kapsamda `locale` adlı bir değişken varken (her dosyada) ya
 * da arayüz dosyasında (`src/app/**`, `src/components/**`) her zaman. `src/lib`'de kapsamda dil yoksa varsayılan (Türkçe)
 * bilerek kullanılmıştır (Türkçe takma adlar, dilsiz veri, `unstable_cache` içi). `src/app/api/dev/**` taranmaz: deneme
 * verisi araçları bilerek Türkçe (plan §8.4).
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return path === 'src/app/api/dev' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = ['src/app', 'src/components', 'src/lib'].flatMap(sourceFiles).sort();
const isUi = (file: string) => file.startsWith('src/app/') || file.startsWith('src/components/');

/**
 * Bilerek dilsiz çağrılar: dosya ve çağrılan adla (JSX'te `<Ad>`), her birinin nedeni yanında. Kullanılmayan kayıt testi
 * düşürür (eskiyen izin kalmasın).
 */
const ALLOWED: readonly { file: string; call: string; reason: string }[] = [
  // Görsel uçları yalnız kaydın `image` yolunu okur (baytları verir); metin yanıta girmez.
  { file: 'src/app/api/attachments/[id]/image/route.ts', call: 'getAttachment', reason: 'yalnız görsel yolu (veri)' },
  { file: 'src/app/api/devices/[id]/image/route.ts', call: 'getDevice', reason: 'yalnız görsel yolu (veri)' },
  // HAM: düzenlenen kayıt dil verilmeden okunur, form çevrilmiş metinle dolarsa kaydedince PT'nin içeriği olurdu
  // (`t1-review.test.ts`). Gösterilen ad aynı dosyada dille okunur.
  { file: 'src/app/dashboard/attachments/[id]/edit/page.tsx', call: 'getAttachment', reason: 'düzenleme formu HAM kayıtla dolar' },
  { file: 'src/app/dashboard/attachments/[id]/edit/page.tsx', call: 'listAttachments', reason: 'düzenleme formu HAM kayıtla dolar' },
  { file: 'src/app/dashboard/devices/[id]/edit/page.tsx', call: 'getDevice', reason: 'düzenleme formu HAM kayıtla dolar' },
  { file: 'src/app/dashboard/devices/[id]/edit/page.tsx', call: 'listDevices', reason: 'düzenleme formu HAM kayıtla dolar' },
  { file: 'src/app/dashboard/exercises/[id]/edit/page.tsx', call: 'getExercise', reason: 'düzenleme formu HAM kayıtla dolar' },
  { file: 'src/app/dashboard/exercises/[id]/edit/page.tsx', call: 'listExercises', reason: 'düzenleme formu HAM kayıtla dolar' },
  // Yalnız sayı: gerekçe metinleri sonuca girmez (dil hesap bağımlılığı olsaydı önizleme dil değişince boşuna yenilenirdi).
  { file: 'src/app/dashboard/clients/[id]/constraints/constraint-form.tsx', call: 'careCounts', reason: 'yalnız grup sayıları' },
  { file: 'src/app/dashboard/clients/[id]/measurements/measurement-form.tsx', call: 'groupSummary', reason: 'yalnız `.count` okunur' },
  // Ölçüm adları (`Metric.label`) gösterilmez; dil algılayıcının bağımlılığı olsaydı çekim ortasında yeniden başlardı.
  { file: 'src/components/measurements/use-pose-detection.ts', call: 'analyzePose', reason: 'etiketler gösterilmez' },
  // Dil dönen girdiye yazılır (`{ ...careInputOf(…), locale }`); boş girdi de aynı dili taşır.
  { file: 'src/lib/workout-routes.ts', call: 'careInputOf', reason: 'dil dönen girdiye eklenir' },
];

type Finding = { file: string; line: number; call: string };

function declaredInSrc(declarations: readonly ts.Declaration[] | undefined): boolean {
  return declarations?.some((declaration) => declaration.getSourceFile().fileName.startsWith(`${SRC}/`)) ?? false;
}

/** Bağlam türünde (ya da birleşimin bir üyesinde) `src/` içinde tanımlı `locale` alanı. */
function hasLocaleProperty(type: ts.Type | undefined): boolean {
  if (!type) return false;
  const members = type.isUnion() ? type.types : [type];
  return members.some((member) => declaredInSrc(member.getProperty('locale')?.declarations));
}

function isLocaleParameter(parameter: ts.ParameterDeclaration): boolean {
  if (!ts.isIdentifier(parameter.name)) return false;
  return parameter.name.text === 'locale' || /^Locale(?:\s*\|\s*undefined)?$/.test(parameter.type?.getText() ?? '');
}

function findOmissions(): Finding[] {
  const config = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT).options;
  const program = ts.createProgram(
    FILES.map((file) => join(ROOT, file)),
    { ...options, incremental: false, noEmit: true },
  );
  const checker = program.getTypeChecker();
  const found: Finding[] = [];
  for (const file of FILES) {
    const source = program.getSourceFile(join(ROOT, file));
    if (!source) continue;
    const ui = isUi(file);
    const forgotten = (node: ts.Node) => ui || checker.getSymbolsInScope(node, ts.SymbolFlags.Variable).some((symbol) => symbol.name === 'locale');
    const report = (node: ts.Node, call: string) => found.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, call });
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const args = node.arguments ?? ts.factory.createNodeArray();
        const call = `${ts.isNewExpression(node) ? 'new ' : ''}${node.expression.getText(source)}`;
        const declaration = checker.getResolvedSignature(node)?.getDeclaration();
        if (declaration && declaredInSrc([declaration]) && !args.some(ts.isSpreadElement) && 'parameters' in declaration) {
          const index = (declaration as ts.SignatureDeclaration).parameters.findIndex(isLocaleParameter);
          if (index >= 0 && args.length <= index && forgotten(node)) report(node, call);
        }
        for (const argument of args) {
          if (!ts.isObjectLiteralExpression(argument)) continue;
          if (argument.properties.some((property) => ts.isSpreadAssignment(property) || property.name?.getText(source) === 'locale')) continue;
          if (hasLocaleProperty(checker.getContextualType(argument)) && forgotten(argument)) report(argument, call);
        }
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const attributes = node.attributes.properties;
        const given = attributes.some((attribute) => ts.isJsxSpreadAttribute(attribute) || attribute.name.getText(source) === 'locale');
        if (!given && hasLocaleProperty(checker.getContextualType(node.attributes)) && forgotten(node)) report(node, `<${node.tagName.getText(source)}>`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('dil parametresi unutulmaz', () => {
  test('dosya kümesi: arayüz ve kütüphane, deneme araçları hariç', () => {
    assert.ok(FILES.length > 600, `${FILES.length} dosya`);
    for (const expected of ['src/app/dashboard/page.tsx', 'src/components/coach/coach-panel.tsx', 'src/lib/notices-store.ts']) {
      assert.ok(FILES.includes(expected), expected);
    }
    assert.ok(!FILES.some((file) => file.startsWith('src/app/api/dev/')));
  });

  test('dil alan her yardımcıya (konumlu, nesne alanı, JSX özelliği) dil verilir; izin listesinde eskiyen kayıt yok', () => {
    const used = new Set<number>();
    const missing = findOmissions().filter(({ file, call }) => {
      const index = ALLOWED.findIndex((entry) => entry.file === file && entry.call === call);
      if (index < 0) return true;
      used.add(index);
      return false;
    });
    assert.deepEqual(
      missing.map(({ file, line, call }) => `${file}:${line}: ${call}`),
      [],
    );
    assert.deepEqual(
      ALLOWED.flatMap((entry, index) => (used.has(index) ? [] : [`${entry.file}: ${entry.call}`])),
      [],
      'kullanılmayan izin kayıtları',
    );
  });
});
