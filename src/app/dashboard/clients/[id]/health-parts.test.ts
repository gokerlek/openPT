import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activeHealthPart, HEALTH_PARTS } from './health-parts.ts';

const base = '/dashboard/clients/c_zmrbywaz';
const label = (path: string) => activeHealthPart(`${base}/${path}`, base)?.label ?? null;

describe('Sağlık şeridinin etkin parçası', () => {
  test('üç parça, onay parçalarıyla bire bir', () => {
    assert.deepEqual(
      HEALTH_PARTS.map((part) => [part.field, part.path, part.label]),
      [
        ['conditions', 'constraints', 'Kısıtlar'],
        ['measurements', 'measurements', 'Ölçümler'],
        ['screening', 'screening', 'Hareket'],
      ],
    );
  });

  test('kısıtların alt sayfaları Kısıtlar', () => {
    assert.equal(label('constraints'), 'Kısıtlar');
    assert.equal(label('constraints/new'), 'Kısıtlar');
    assert.equal(label('constraints/k_abc123/edit'), 'Kısıtlar');
  });

  test('elle girilen ölçümler Ölçümler', () => {
    assert.equal(label('measurements'), 'Ölçümler');
    assert.equal(label('measurements/new'), 'Ölçümler');
    assert.equal(label('measurements/2026-09-27/edit'), 'Ölçümler');
  });

  test('kamera sihirbazı ölçümlerin adresinde ama Hareket', () => {
    assert.equal(label('measurements/camera'), 'Hareket');
    assert.equal(label('measurements/camera/'), 'Hareket');
  });

  test('hareket testinin sayfaları Hareket', () => {
    assert.equal(label('screening'), 'Hareket');
    assert.equal(label('screening/new'), 'Hareket');
    assert.equal(label('screening/2026-09-27/edit'), 'Hareket');
  });

  test('sağlık dışı ve benzer adlı adresler hiçbir parça değil', () => {
    assert.equal(activeHealthPart(base, base), null);
    assert.equal(label('program'), null);
    assert.equal(label('measurements-old'), null);
    assert.equal(label('screenings'), null);
    assert.equal(activeHealthPart('/dashboard/clients/c_other/screening', base), null);
  });
});
