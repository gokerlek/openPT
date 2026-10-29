'use client';

import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchJson } from '@/lib/query/errors';
import type { WorkoutResponse } from '@/lib/workout-routes';

export function WorkoutSwitchSheet({ open, onOpenChange, onSwitch }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitch: (program: string, day: string) => void;
}) {
  return <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-2xl">
      <DrawerHeader>
        <DrawerTitle>Antrenmanı değiştir</DrawerTitle>
        <DrawerDescription>Yaptığın setler mevcut antrenmanın kaydı olarak korunur. Seçtiğin program/gün ayrı bir antrenman olarak başlar; kayıtlar birbirine karışmaz.</DrawerDescription>
      </DrawerHeader>
      {open ? <WorkoutChoice onSwitch={onSwitch} onCancel={() => onOpenChange(false)} /> : null}
    </DrawerContent>
  </Drawer>;
}

function WorkoutChoice({ onSwitch, onCancel }: { onSwitch: (program: string, day: string) => void; onCancel: () => void }) {
  const [selectedProgram, setProgram] = useState<string | null>(null);
  const [selectedDay, setDay] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ['workout-switch', 'choices'], queryFn: () => fetchJson<WorkoutResponse>('/api/me/workout'), staleTime: 0 });
  const program = selectedProgram ?? overview.data?.program?.id ?? 'pt';
  const preview = useQuery({
    queryKey: ['workout-switch', 'preview', program],
    queryFn: () => fetchJson<WorkoutResponse>(`/api/me/workout?preview=1&program=${encodeURIComponent(program)}`),
    enabled: !!overview.data,
    staleTime: 0,
  });
  const day = selectedDay ?? preview.data?.day?.dayId ?? '';
  const choices = overview.data?.selection?.choices ?? (overview.data?.program ? [{ id: overview.data.program.id ?? null, name: overview.data.program.name ?? 'PT programı' }] : []);
  const error = overview.error || preview.error ? 'Programlar açılamadı. Bağlantını kontrol edip yeniden aç.' : preview.data && !preview.data.day ? preview.data.problem ?? 'Bu programda uygulanabilecek gün yok.' : null;
  const id = useId();
  const programItems = choices.map(choice => ({ value: choice.id ?? 'pt', label: choice.name }));
  const dayItems = (preview.data?.program?.days ?? []).map(item => ({ value: item.id, label: item.name }));
  // Listede olmayan değer (yüklenirken) ham kimlik olarak görünmesin: boş bırakılır.
  const shown = (items: { value: string }[], value: string) => (items.some(item => item.value === value) ? value : null);
  return <>
    <div className="flex flex-col gap-4 px-4">
      <Field>
        <FieldLabel htmlFor={`${id}-program`}>Program</FieldLabel>
        <Select items={programItems} value={shown(programItems, program)} disabled={!overview.data} onValueChange={next => { if (next === null) return; setProgram(next); setDay(null); }}>
          <SelectTrigger id={`${id}-program`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{programItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-day`}>Antrenman günü</FieldLabel>
        <Select items={dayItems} value={shown(dayItems, day)} disabled={!preview.data?.day} onValueChange={next => { if (next !== null) setDay(next); }}>
          <SelectTrigger id={`${id}-day`} className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{dayItems.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {preview.isFetching ? <p role="status" className="text-sm text-muted-foreground">Program açılıyor…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
    <DrawerFooter>
      <Button disabled={preview.isFetching || !preview.data?.day || !day || !!error} onClick={() => onSwitch(program, day)}>Setleri koru ve bu antrenmana geç</Button>
      <Button variant="ghost" onClick={onCancel}>Vazgeç</Button>
    </DrawerFooter>
  </>;
}
