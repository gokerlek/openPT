import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { conditionLabel, parseCondition } from '@/lib/conditions';
import {
  axialLoadLabels,
  contractionTypeLabels,
  jointWindowLabels,
  kineticChainLabels,
  loadVectorLabels,
  resistanceProfileLabels,
  shearLevelLabels,
  spinalAlignmentLabels,
} from '@/lib/exercise-filter';
import type { Exercise } from '@/lib/schemas/exercise';
import { getLocale } from '@/i18n/server';
import { ptLibraryMessages } from '@/i18n/messages/pt-library';

/**
 * Medikal etiketler — yalnız gösterir; değiştirmek için "Düzenle".
 *
 * Etiket yoksa kart bunu açıkça söyler: süzgeç etiketsiz hareketi değerlendiremez,
 * sessizce "uygun" saymaz.
 */
export async function MedicalCard({ exercise }: { exercise: Exercise }) {
  const locale = await getLocale();
  const t = ptLibraryMessages(locale).medicalCard;
  const rows: [string, string][] = [
    ...(exercise.kineticChain ? ([[t.rowChain, kineticChainLabels(locale)[exercise.kineticChain]]] as [string, string][]) : []),
    ...(exercise.axialLoading ? ([[t.rowAxial, axialLoadLabels(locale)[exercise.axialLoading]]] as [string, string][]) : []),
    ...(exercise.shearForce ? ([[t.rowShear, shearLevelLabels(locale)[exercise.shearForce]]] as [string, string][]) : []),
    ...(exercise.spinalAlignment ? ([[t.rowAlignment, spinalAlignmentLabels(locale)[exercise.spinalAlignment]]] as [string, string][]) : []),
    ...(exercise.loadVector ? ([[t.rowVector, loadVectorLabels(locale)[exercise.loadVector]]] as [string, string][]) : []),
    ...(exercise.contractionType ? ([[t.rowContraction, contractionTypeLabels(locale)[exercise.contractionType]]] as [string, string][]) : []),
    ...(exercise.resistanceProfile ? ([[t.rowResistance, resistanceProfileLabels(locale)[exercise.resistanceProfile]]] as [string, string][]) : []),
    ...(exercise.internalRotationUnderLoad ? ([[t.rowRotation, t.present]] as [string, string][]) : []),
  ];

  const windows = exercise.jointWindows ?? [];
  const avoid = exercise.contraindications ?? [];
  const safe = exercise.safeFor ?? [];
  const empty = rows.length === 0 && windows.length === 0 && avoid.length === 0 && safe.length === 0;

  const names = (list: readonly string[]) =>
    list.map((value) => {
      const parsed = parseCondition(value);
      return { key: value, label: parsed ? conditionLabel(parsed, locale) : value };
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>
          {empty
            ? t.untagged
            : t.tagged}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {empty ? (
          <p className="text-muted-foreground">
            {t.emptyNote.lead}
            <Link href={`/dashboard/exercises/${exercise.id}/edit`} className="underline underline-offset-4">
              {t.emptyNote.link}
            </Link>
            {t.emptyNote.tail}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <Table>
            <TableBody>
              {rows.map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="w-44 text-muted-foreground">{label}</TableCell>
                  <TableCell className="whitespace-normal">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {windows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">{t.windowsLabel}</span>
            <div className="flex flex-wrap gap-1.5">
              {windows.map((window) => (
                <Badge key={window} variant="secondary">
                  {jointWindowLabels(locale)[window]}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {avoid.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">{t.avoidLabel}</span>
            <div className="flex flex-wrap gap-1.5">
              {names(avoid).map((item) => (
                <Badge key={item.key} variant="destructive">
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {safe.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground">{t.safeLabel}</span>
            <div className="flex flex-wrap gap-1.5">
              {names(safe).map((item) => (
                <Badge key={item.key} variant="secondary">
                  {item.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
