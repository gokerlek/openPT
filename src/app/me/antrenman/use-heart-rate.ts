'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { fakeHeartRate, HEART_ALERT_IDLE, heartAlertStep, parseHeartRateMeasurement } from '@/lib/heart-rate';

/**
 * Nabız bandı (Paket C) — tarayıcıya bağlı. Göğüs bandı ya da nabız yayınlayan saat Web Bluetooth'la (`heart_rate`
 * servisi, ölçüm karakteristiğinin bildirimleri) bağlanır: Android Chrome ve yüklü uygulama; iPhone Safari'de yok.
 * Bağlantı modül düzeyinde tutulur: antrenman ekranından çıkıp dönünce (aynı sekmede) yeniden eşleştirmek gerekmez.
 * Durumlar: desteklenmiyor · bağlı değil · bağlanıyor · bağlı · koptu (kendiliğinden yeniden dener, "Kes"e kadar).
 * Kararlar (`heart-rate.ts`) saf; burada yalnız bağlantı ve okumalar. Nabız kayda yazılmaz.
 *
 * Yerel geliştirmede (`NODE_ENV !== 'production'`) bant yerine "Deneme nabzı": sette yükselen, dinlenmede inen yapay
 * eğri; bağlantı panelinden açılır, ±15 ve "Kopmayı dene" ile denenir. Üretim paketinde bu yol yok.
 */

/* --- Web Bluetooth: TypeScript'in DOM tiplerinde yok; yalnız kullanılan parçalar --- */

type BluetoothCharacteristic = EventTarget & {
  value?: DataView;
  startNotifications(): Promise<BluetoothCharacteristic>;
};
type BluetoothService = { getCharacteristic(name: 'heart_rate_measurement'): Promise<BluetoothCharacteristic> };
type BluetoothServer = { connected: boolean; connect(): Promise<BluetoothServer>; disconnect(): void; getPrimaryService(name: 'heart_rate'): Promise<BluetoothService> };
type BluetoothDevice = EventTarget & { name?: string; gatt?: BluetoothServer };
type Bluetooth = { requestDevice(options: { filters: { services: string[] }[] }): Promise<BluetoothDevice> };

function bluetooth(): Bluetooth | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth ?? null;
}

/** Yapay nabız yalnız yerel geliştirmede: üretim paketinde `false` olur, yol düşer. */
export const FAKE_HEART_RATE = process.env.NODE_ENV !== 'production';

/** Bu kadar süre ölçüm gelmezse nabız yok sayılır (band çıkarıldı, ölçmüyor). */
const READING_STALE_MS = 5000;
/** Kopunca yeniden deneme: 1, 2, 4, 8 sn, sonra 10 sn'de bir. */
const RETRY_MAX_MS = 10_000;
const FAKE_START_BPM = 95;
const FAKE_TICK_MS = 1000;
/** "Kopmayı dene": bu kadar sonra kendiliğinden yeniden bağlanır. */
const FAKE_DROP_MS = 4000;

export type HeartStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'lost';

export type HeartRateState = {
  status: HeartStatus;
  /** Son ölçüm; yoksa ya da bayatsa null. */
  bpm: number | null;
  /** Bağlı cihazın adı (deneme nabzında "Deneme nabzı"). */
  device: string | null;
  fake: boolean;
  /** Bağlanılamadıysa danışana dönük metin. */
  problem: string | null;
};

const IDLE: HeartRateState = { status: 'idle', bpm: null, device: null, fake: false, problem: null };

let state: HeartRateState = IDLE;
const listeners = new Set<() => void>();

function update(change: Partial<HeartRateState>): void {
  state = { ...state, ...change };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* --- okumalar --- */

let staleTimer: number | undefined;

function onReading(bpm: number | null): void {
  window.clearTimeout(staleTimer);
  if (bpm !== state.bpm) update({ bpm });
  if (bpm !== null) staleTimer = window.setTimeout(() => update({ bpm: null }), READING_STALE_MS);
}

/* --- bant --- */

let device: BluetoothDevice | null = null;
let characteristic: BluetoothCharacteristic | null = null;
/** Danışan bağlı kalmak istiyor ("Kes"e basmadı): kopunca yeniden denenir. */
let wanted = false;
let retryTimer: number | undefined;
let retries = 0;

function onValue(event: Event): void {
  const value = (event.target as BluetoothCharacteristic | null)?.value;
  onReading(value ? parseHeartRateMeasurement(value) : null);
}

async function attach(target: BluetoothDevice): Promise<void> {
  const server = await target.gatt?.connect();
  if (!server) throw new Error('GATT yok');
  const service = await server.getPrimaryService('heart_rate');
  const next = await service.getCharacteristic('heart_rate_measurement');
  next.addEventListener('characteristicvaluechanged', onValue);
  await next.startNotifications();
  characteristic?.removeEventListener('characteristicvaluechanged', onValue);
  characteristic = next;
  retries = 0;
}

function retry(): void {
  window.clearTimeout(retryTimer);
  const delay = Math.min(RETRY_MAX_MS, 1000 * 2 ** retries);
  retries += 1;
  retryTimer = window.setTimeout(() => {
    const target = device;
    if (!wanted || !target) return;
    attach(target).then(
      () => {
        if (wanted && device === target) update({ status: 'connected', problem: null });
      },
      () => {
        if (wanted && device === target) retry();
      },
    );
  }, delay);
}

function onDisconnected(): void {
  characteristic?.removeEventListener('characteristicvaluechanged', onValue);
  characteristic = null;
  onReading(null);
  if (!wanted) return;
  update({ status: 'lost' });
  retry();
}

function release(): void {
  wanted = false;
  window.clearTimeout(retryTimer);
  characteristic?.removeEventListener('characteristicvaluechanged', onValue);
  characteristic = null;
  if (device) {
    device.removeEventListener('gattserverdisconnected', onDisconnected);
    try {
      if (device.gatt?.connected) device.gatt.disconnect();
    } catch {
      // Zaten kopmuş: bırakmak yeter.
    }
  }
  device = null;
}

/** "Bağlan": tarayıcının cihaz seçicisi açılır (dokunuşun içinde çağrılmalı). Vazgeçilirse sessizce bağlı değil. */
export async function connectHeartRate(): Promise<void> {
  const api = bluetooth();
  if (!api || state.status === 'connecting') return;
  stopFake();
  release();
  update({ ...IDLE, status: 'connecting' });
  try {
    const picked = await api.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    device = picked;
    wanted = true;
    picked.addEventListener('gattserverdisconnected', onDisconnected);
    await attach(picked);
    update({ status: 'connected', device: picked.name?.trim() || 'Nabız bandı', problem: null });
  } catch (error) {
    // Seçici kapatıldı (`NotFoundError`): sorun değil.
    const cancelled = error instanceof DOMException && error.name === 'NotFoundError';
    release();
    update({ ...IDLE, problem: cancelled ? null : 'Bağlanılamadı. Bandın açık ve telefona yakın olsun, sonra yeniden dene.' });
  }
}

/** "Bağlantıyı kes" (bant ya da deneme nabzı). */
export function disconnectHeartRate(): void {
  stopFake();
  release();
  onReading(null);
  update(IDLE);
}

/* --- deneme nabzı (yalnız yerel geliştirmede) --- */

let fakeTimer: number | undefined;
let fakeDropTimer: number | undefined;
let fakeBpm = FAKE_START_BPM;
let fakeAt = 0;
let fakeDropped = false;
/** Ekran söyler (`useHeartRate`): dinlenmede eğri iner, sette yükselir. */
let fakeResting = false;

function setFakeResting(value: boolean): void {
  fakeResting = value;
}

function stopFake(): void {
  window.clearInterval(fakeTimer);
  window.clearTimeout(fakeDropTimer);
  fakeTimer = undefined;
  fakeDropped = false;
}

function fakeTick(): void {
  const now = Date.now();
  fakeBpm = fakeHeartRate(fakeBpm, fakeResting, now - fakeAt);
  fakeAt = now;
  if (!fakeDropped) onReading(Math.round(fakeBpm));
}

export function startFakeHeartRate(): void {
  if (!FAKE_HEART_RATE) return;
  release();
  stopFake();
  fakeBpm = FAKE_START_BPM;
  fakeAt = Date.now();
  fakeTimer = window.setInterval(fakeTick, FAKE_TICK_MS);
  update({ status: 'connected', device: 'Deneme nabzı', fake: true, problem: null });
  onReading(fakeBpm);
}

/** Deneme nabzını elle oynatır (uyarıyı ya da "Nabız hâlâ yüksek"i denemek için). */
export function nudgeFakeHeartRate(delta: number): void {
  if (!FAKE_HEART_RATE || !state.fake) return;
  fakeBpm = fakeHeartRate(fakeBpm + delta, fakeResting, 0);
  if (!fakeDropped) onReading(Math.round(fakeBpm));
}

/** "Kopmayı dene": ölçümler durur, durum "koptu"; biraz sonra kendiliğinden yeniden bağlanır. */
export function dropFakeHeartRate(): void {
  if (!FAKE_HEART_RATE || !state.fake || fakeDropped) return;
  fakeDropped = true;
  onReading(null);
  update({ status: 'lost' });
  fakeDropTimer = window.setTimeout(() => {
    fakeDropped = false;
    update({ status: 'connected' });
    onReading(Math.round(fakeBpm));
  }, FAKE_DROP_MS);
}

/* --- kancalar --- */

const noSubscribe = () => () => undefined;

/**
 * Bandın durumu ve son ölçüm. `resting`: dinlenme açık mı (yalnız deneme nabzının eğrisi için). Tarayıcı Web Bluetooth
 * desteklemiyorsa ve deneme nabzı açık değilse durum "desteklenmiyor".
 */
export function useHeartRate(resting: boolean): HeartRateState {
  const current = useSyncExternalStore(subscribe, () => state, () => IDLE);
  const supported = useSyncExternalStore(noSubscribe, () => bluetooth() !== null, () => true);
  useEffect(() => setFakeResting(resting), [resting]);
  return current.status === 'idle' && !supported ? { ...current, status: 'unsupported' } : current;
}

/**
 * Yüksek nabız uyarısı (`heartAlertStep`): saniyede iki kez bakılır. Uyarı çalınca `onFire(bpm)`; nabız sınırın 5 altına
 * inip uyarı yeniden kurulunca `onCalm()` (şerit kendiliğinden kalkar).
 */
export function useHeartAlert(bpm: number | null, alert: number, onFire: (bpm: number) => void, onCalm: () => void): void {
  const latest = useRef({ bpm, alert, onFire, onCalm });
  useEffect(() => {
    latest.current = { bpm, alert, onFire, onCalm };
  });
  useEffect(() => {
    let alertState = HEART_ALERT_IDLE;
    const id = window.setInterval(() => {
      const current = latest.current;
      const step = heartAlertStep(alertState, current.bpm, current.alert, Date.now());
      const calmed = alertState.fired && !step.state.fired;
      alertState = step.state;
      if (step.fire && current.bpm !== null) current.onFire(current.bpm);
      else if (calmed) current.onCalm();
    }, 500);
    return () => window.clearInterval(id);
  }, []);
}
