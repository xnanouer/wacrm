import { describe, expect, it } from 'vitest';

import {
  createCatalogImportTemplateCsv,
  parseCatalogImportCsv,
} from './import';

describe('catalog CSV import', () => {
  it('parses a semicolon-delimited Excel-compatible row', () => {
    const csv = [
      'codigo_interno;patente;mostrar_patente;marca;modelo;version;año;color;combustible;transmision;traccion;kilometraje;precio_lista;precio_oferta;pie_minimo;descripcion;ubicacion',
      'SAL-001;AB-CD-12;Sí;Hyundai;Atos;1.0;2020;Blanco;Bencina;Mecánica;4x2;107.220;$6.190.000;5.990.000;1.000.000;"Impecable, único dueño";Puerto Montt',
    ].join('\r\n');

    const result = parseCatalogImportCsv(csv);

    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].input).toMatchObject({
      internalCode: 'SAL-001',
      licensePlate: 'AB-CD-12',
      licensePlateVisible: true,
      year: 2020,
      mileage: 107220,
      listPrice: 6190000,
      offerPrice: 5990000,
      description: 'Impecable, único dueño',
    });
  });

  it('reports missing required columns', () => {
    const result = parseCatalogImportCsv('marca;modelo\nToyota;Yaris');
    expect(result.rows).toEqual([]);
    expect(result.issues[0].message).toContain('codigo_interno');
    expect(result.issues[0].message).toContain('precio_lista');
  });

  it('rejects repeated codes before upload', () => {
    const csv = [
      'codigo_interno;marca;modelo;año;precio_lista',
      'A-1;Toyota;Yaris;2022;12000000',
      'a-1;Toyota;Corolla;2021;13000000',
    ].join('\n');
    const result = parseCatalogImportCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ rowNumber: 3 });
    expect(result.issues[0].message).toContain('se repite');
  });

  it('reports invalid catalog option labels instead of changing them silently', () => {
    const csv = [
      'codigo_interno;marca;modelo;año;precio_lista;combustible',
      'A-1;Toyota;Yaris;2022;12000000;Vapor',
    ].join('\n');
    const result = parseCatalogImportCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.issues[0]).toMatchObject({ rowNumber: 2 });
    expect(result.issues[0].message).toContain('Combustible inválido');
  });

  it('creates a blank UTF-8 template with the required headers', () => {
    const template = createCatalogImportTemplateCsv();
    expect(template.startsWith('\uFEFFcodigo_interno;')).toBe(true);
    expect(template).toContain(';marca;modelo;');
    expect(template).toContain(';precio_lista;');
    expect(template.endsWith('\r\n')).toBe(true);
  });
});
