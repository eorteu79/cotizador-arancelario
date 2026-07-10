# Prompt para Claude Code — Cotizador Fase 3a (mecanismo de cruce de aranceles)

> Pegá esto en Claude Code, dentro del repo `cotizador-arancelario`.
> Objetivo: los números fiscales (DIE, tasa estadística, IVA, iva_reducido) salen de una
> base de datos, NO de Gemini. Gemini sólo sugiere la posición NCM.

---

## Contexto

Estamos en la fase 3a del plan `Plan_Base_Aranceles.md`. Vamos a construir la "cañería" del
cruce con una **tabla semilla chica y verificada** antes de cargar el dataset completo (fase 3b).

Ya existe la CSV semilla (18 posiciones NCM reales, columnas:
`ncm, descripcion, die_aec, tasa_estadistica, iva, iva_reducido, bk_bit, nota`).
El archivo está en la carpeta de referencia del repo como `aranceles.csv`.

**Tarea 0 — ubicar el CSV:** copiá `aranceles.csv` a `backend/data/aranceles.csv`
(creá la carpeta `backend/data/` si no existe). Ese será el path canónico.

## Qué construir

### 1) Backend — carga del CSV en memoria
- Al iniciar FastAPI, leer `backend/data/aranceles.csv` a un diccionario indexado por `ncm`
  (clave = string de 8 dígitos, sin puntos).
- Normalizar la clave: sacar puntos/espacios, quedarse con los primeros 8 dígitos.
- Parsear tipos: `die_aec`, `tasa_estadistica`, `iva` como float; `iva_reducido` como bool
  (`"true"`→True); `bk_bit` y `nota` como string opcional.
- Loguear cuántas filas se cargaron al arrancar.
- Poner la carga en un módulo, p. ej. `backend/services/aranceles.py`, con una función
  `buscar(ncm: str) -> dict | None` que normaliza y devuelve la fila o `None`.

### 2) Backend — cambiar el flujo de cotización
El flujo pasa a ser:
1. Gemini sugiere la(s) posición(es) NCM + descripción + alternativas + preguntas de aclaración
   (esto queda como está).
2. Tomar el NCM sugerido, normalizarlo a 8 dígitos y buscarlo con `buscar(ncm)`.
3. **Si se encuentra:** usar `die_aec`, `tasa_estadistica`, `iva`, `iva_reducido` de la base
   para TODO el cálculo (incluidas las percepciones ya implementadas). Marcar la fuente como
   `"base_oficial"`.
4. **Si NO se encuentra:** usar los valores estimados por Gemini como provisorios y marcar la
   fuente como `"estimado_ia"`. No romper.
5. La descripción y las alternativas las sigue dando Gemini; los **números** los manda la base
   cuando existe.

En la respuesta del endpoint, agregar por cada número (o a nivel del resultado) un campo de
procedencia, por ejemplo:
```json
{
  "ncm": "84713019",
  "fuente": "base_oficial",        // o "estimado_ia"
  "die_aec": 16,
  "tasa_estadistica": 3,
  "iva": 21,
  "iva_reducido": false,
  "nota_base": "Informática/telecom (BIT). DI verificado 07/2026."
}
```

### 3) Enganche con percepciones (ya implementadas)
- `iva` e `iva_reducido` de la base definen la percepción de IVA: **20% general** si
  `iva_reducido=false`, **10% reducida** si `iva_reducido=true` — sólo para bien de cambio.
- Bien de uso sigue exento de percepción de IVA y de Ganancias (no tocar esa lógica).
- Importante: si `fuente="estimado_ia"`, las percepciones se calculan igual pero heredan el
  cartel ámbar de "verificar".

### 4) Frontend — indicador de fuente
Junto a los números fiscales mostrar un badge:
- **Verde "Base oficial"** cuando `fuente="base_oficial"`. Puede mostrar la `nota_base` en tooltip.
- **Ámbar "Estimado por IA — verificar"** cuando `fuente="estimado_ia"`.
- Aplicar la marca de estilo Tailwind (paleta navy del design system ya cargado).
- El disclaimer general ("valores orientativos, validar con despachante") se mantiene siempre.

### 5) Manejo de casos borde
- NCM no encontrado → rama ámbar, sin romper.
- CSV ausente o vacío → arrancar igual, loguear warning, todo cae a `estimado_ia`.
- NCM que llega con puntos (ej. `8471.30.19`) → normalizar antes de buscar.
- `iva=0` en la base (ej. libros) → tratar como exento; la percepción de IVA no aplica.

## Cómo probar (dejá esto andando y mostrame los resultados)
- **Base oficial:** cotizar algo que caiga en `84713019` (notebook) → badge verde, DI 16 / IVA 21.
- **IVA reducido:** cotizar algo que caiga en `87019590` (tractor) → `iva_reducido=true`,
  percepción IVA 10% en bien de cambio.
- **No encontrado:** forzar un NCM inexistente (ej. `99999999`) → badge ámbar, usa valor de Gemini.
- **Normalización:** mandar `8471.30.19` con puntos → debe encontrarlo igual.

## Qué NO hacer todavía (viene en 3b)
- No cargar el dataset completo ni scrapear ARCA.
- No perseguir el SIM de 12 dígitos: el cruce es por 8 dígitos.
- Mantener exactamente el mismo esquema de columnas para que 3b sea sólo cambiar el archivo.

## Al terminar
- Commit con mensaje claro (p. ej. `feat(aranceles): cruce fase 3a con CSV semilla + indicador de fuente`).
- Recordá: correr en Sonnet; pasar a Opus sólo si te trabás.
