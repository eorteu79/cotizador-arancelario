# Plan — Base de datos oficial de aranceles (fase crítica)

Objetivo: que **DIE, tasa estadística, IVA y las alícuotas que alimentan las percepciones**
salgan de una base de datos, no de lo que "cree" Gemini. Gemini queda a cargo de **sugerir
la posición** (código + descripción + alternativas + preguntas de aclaración); la app cruza
ese código contra la base y trae los números reales.

## Enfoque en dos sub-fases (para no bloquearnos con el dataset)

### 3a — Mecanismo de cruce (con muestra chica y verificable)
Primero construimos la "cañería" con una tabla semilla de pocas posiciones reales:
1. Definir el esquema de la tabla (abajo).
2. Cargar una semilla de ~15-25 posiciones NCM reales (variadas: general 21%, reducida 10,5%,
   bien de capital, etc.).
3. Cambiar el flujo: Gemini sugiere la posición → la app busca ese código en la base →
   reemplaza los números por los oficiales.
4. En la UI, marcar claramente la **fuente** de cada número:
   - "Base oficial" (verde) si el código se encontró en la base.
   - "Estimado por IA — verificar" (ámbar) si no se encontró, usando el valor de Gemini como
     provisorio.
5. Manejar el caso "código no encontrado": no romper, mostrar el aviso ámbar.

Cuando esto funcione (Gemini sugiere, la base manda los números, la UI muestra la fuente),
recién ahí cargamos el dataset grande.

### 3b — Dataset completo
- **Bootstrap:** dataset NCM (8 dígitos) con AEC/DIE + IVA + tasa. Fuente candidata: dataset
  NCM en Kaggle (requiere cuenta gratis para descargar el CSV) o el NCM+AEC oficial de Mercosur.
- **Sólido (después):** Arancel Integrado de ARCA para llegar al SIM de 12 dígitos y regímenes
  especiales.
- Reemplazar la tabla semilla por el dataset completo, manteniendo el mismo esquema y el mismo
  mecanismo de cruce.

## Esquema de la tabla (CSV versionado en el repo, ej. backend/data/aranceles.csv)

| campo | descripción |
|---|---|
| `ncm` | código NCM 8 dígitos, normalizado sin puntos (ej. 96170000) |
| `descripcion` | texto oficial de la posición |
| `die_aec` | Derecho de Importación extrazona (AEC) en % |
| `tasa_estadistica` | % (generalmente 3; algunos exentos → 0) |
| `iva` | 21 o 10.5 |
| `iva_reducido` | true/false (define percepción 10% vs 20%) |
| `bk_bit` | marca bien de capital (BK) / informática-telecom (BIT), opcional |
| `nota` | observaciones / régimen especial, opcional |

Carga: leer el CSV al iniciar el backend a un diccionario en memoria (o SQLite). ~10-14k filas
es liviano.

## Lógica de cruce
1. Gemini devuelve el/los código(s) NCM sugeridos (normalizados a 8 dígitos, sin puntos).
2. La app busca coincidencia exacta de 8 dígitos en la base.
3. Si la encuentra: usa `die_aec`, `tasa_estadistica`, `iva`, `iva_reducido` de la base para
   todo el cálculo (incluidas las percepciones de la fase anterior).
4. Si no la encuentra: deja el valor estimado por Gemini, marcado como "verificar".
5. La descripción y las alternativas las sigue dando Gemini; los **números** manda la base.

## Cómo se conecta con las percepciones (ya implementadas)
- `iva` y `iva_reducido` de la base definen la percepción de IVA (20% general / 10% reducida)
  para bien de cambio.
- Bien de uso sigue exento de percepción de IVA y Ganancias, como ya quedó.

## Qué NO hacer todavía
- No scrapear ARCA en esta fase (viene en 3b/después).
- No perseguir el SIM de 12 dígitos hasta tener el mecanismo andando con 8 dígitos.

## Disclaimer
Los valores son orientativos y deben validarse con un despachante. La base es una ayuda, no
reemplaza la clasificación oficial.
