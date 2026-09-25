import {
  RUBROS_CAFETERIA_POR_DEFECTO,
  areaDeRubro,
  nombreRubro,
  normalizarRubrosCafeteria,
  ordenarRubros,
  rubrosDelLocal,
  veRubroEnStock,
} from '../lib/rubros';

// Pruebas de QA: rubros configurables por el local, con TCG y servicios fijos del sistema.

describe('normalizarRubrosCafeteria', () => {
  it('sin datos usa los de siempre', () => {
    expect(normalizarRubrosCafeteria(undefined)).toEqual(RUBROS_CAFETERIA_POR_DEFECTO);
    expect(normalizarRubrosCafeteria([])).toEqual(RUBROS_CAFETERIA_POR_DEFECTO);
  });

  it('limpia vacíos, repetidos y los nombres del sistema', () => {
    expect(normalizarRubrosCafeteria(['Café', ' café ', '', 'TCG', 'mesa', 'Servicios', 'Panadería', 7, 'Bebidas  frías'])).toEqual([
      'Café',
      'Panadería',
      'Bebidas frías',
    ]);
  });
});

describe('rubros del local', () => {
  it('cafetería primero, después TCG y servicios', () => {
    expect(rubrosDelLocal(['Café', 'Panadería'])).toEqual(['Café', 'Panadería', 'TCG', 'Mesa']);
  });

  it('un rubro quitado de la config no esconde sus productos', () => {
    expect(ordenarRubros(['Mesa', 'TCG', 'Tortas', 'Café'], ['Café', 'Panadería'])).toEqual(['Café', 'Tortas', 'TCG', 'Mesa']);
  });

  it('cada rubro tiene su área y su nombre visible', () => {
    expect(areaDeRubro('Panadería')).toBe('cafeteria');
    expect(areaDeRubro('TCG')).toBe('tcg');
    expect(areaDeRubro('Mesa')).toBe('servicio');
    expect(nombreRubro('Mesa')).toBe('Servicios');
    expect(nombreRubro('Panadería')).toBe('Panadería');
  });

  it('cada rol ve en Stock solo lo que puede resolver', () => {
    expect(veRubroEnStock('mozo', 'Panadería')).toBe(true);
    expect(veRubroEnStock('mozo', 'TCG')).toBe(false);
    expect(veRubroEnStock('mozo', 'Mesa')).toBe(false);
    expect(veRubroEnStock('juez', 'TCG')).toBe(true);
    expect(veRubroEnStock('juez', 'Café')).toBe(false);
    expect(veRubroEnStock('admin', 'Mesa')).toBe(true);
    expect(veRubroEnStock('jugador', 'Café')).toBe(false);
  });
});
