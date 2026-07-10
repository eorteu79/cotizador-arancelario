# Spec — Cotizador de Posición Arancelaria (Tailwind) · v1

> Documento de especificación para construir la app. Pensado para leerse en Claude Code
> y usarse como guía de desarrollo. Escrito para no-programadores + para la IA que construye.

---

## 1. Contexto y objetivo

Tailwind es una trader internacional que envía mercadería desde USA y Europa a LATAM
(principalmente Argentina). El equipo cotiza a clientes que quieren importar bienes.

Una cotización punta a punta contempla: **mercadería + flete + aranceles de importación + IVA
en destino**. Los aranceles + IVA pueden llegar a **más del 60% del valor de la mercadería**,
y el porcentaje lo define la **posición arancelaria** con la que la mercadería entra en aduana.

**Objetivo de la v1:** que el usuario ingrese información de un producto y la app sugiera la
**Posición Arancelaria (SIM/NCM argentina)**, su descripción, y sus costos
(**arancel DIE, tasa estadística, IVA**), con alternativas.

*Fuera de alcance en v1:* cálculo de flete y cotización de mercadería (se siguen haciendo a mano).

---

## 2. Alcance funcional (v1)

### Inputs que acepta el usuario
1. **Link (URL)** de un producto.
2. **PDF** (subido) o **link a un PDF** de ficha técnica.
3. **Nombre + modelo** de un producto.
4. **Texto descriptivo** del producto.

### Output que devuelve la app
- **HS Code sugerido** + descripción.
- **HS Code alternativo 1 y 2** + descripciones.
- **Posición SIM Oficial (sugerida):** código argentino, descripción de la PA, **arancel (DIE),
  tasa estadística, IVA**.
- **Posición SIM Oficial alternativa 1:** código, descripción, arancel, tasa estadística, IVA.

---

## 3. Comportamiento de la IA (Gemini)

La IA procesa el input y genera el output. Reglas comunes a todos los inputs:

1. Extrae del input toda la información técnica del producto (material, uso, capacidad, etc.).
2. Si le falta información para determinar la PA, **consulta primero a internet** (búsqueda web /
   grounding), en particular cuando:
   - Falta alguna especificación necesaria para definir la posición.
   - El link/PDF parece un catálogo viejo y puede haber versiones nuevas.
3. Si en internet la información sigue siendo ambigua, **le pregunta al usuario** para que aclare,
   mostrándole como referencia la info que encontró.
4. Si el input tiene **más de un modelo** que podría corresponder a PAs distintas, le pide al
   usuario que especifique cuál.

### Por tipo de input
- **Link de producto:** lee el contenido del link. (Nota técnica: leer el HTML real requiere
  que el backend haga el fetch de la página, no alcanza con pasarle la URL como texto al modelo.)
- **PDF:** lee el contenido del PDF (Gemini soporta PDF como archivo de entrada).
- **Nombre+modelo / texto:** primero hace research del producto, consigue ficha técnica, y
  **valida con el usuario** que el producto sea el correcto antes de avanzar.

### Confiabilidad de los números (decisión clave)
La IA **sugiere la posición arancelaria**, pero el **arancel, tasa estadística e IVA se toman de
una base de datos oficial**, cruzando por el código de la posición. Los porcentajes NO los
inventa el modelo. Esto evita cotizaciones erróneas (ver sección 5).

---

## 4. Arquitectura técnica

Stack recomendado: **Next.js desplegado en Vercel** (el repo y Vercel ya existen).

- **Frontend:** una sola pantalla, lo más simple posible (ver sección 6).
- **Backend (API routes / funciones serverless en Vercel):**
  - Guarda la **API key de Gemini del lado del servidor** (nunca en el navegador).
    *En la app actual de Gemini la key va vacía y en el cliente — eso hay que corregirlo sí o sí.*
  - Hace el fetch del contenido de URLs y el manejo de PDFs.
  - Llama a Gemini (con búsqueda web activada) para sugerir la posición.
  - Cruza la posición sugerida contra la base de datos oficial y devuelve los % reales.
- **Base de datos de posiciones arancelarias:** ver sección 5.

Flujo resumido:
`Usuario → Frontend → API route → [Gemini + web] → posición sugerida → cruce con base oficial → resultado`

---

## 5. Base de datos de aranceles (lo más importante)

Requisito: los % de arancel/tasa/IVA deben salir de datos reales, no del LLM.

Opciones evaluadas:
- **Tarifar (tarifar.com):** la más completa (SIM, ALADI, 26k+ normativas), pero **paga, con
  licencia y sin API abierta**. NO se puede embeber en la app. Queda como herramienta de
  consulta manual del equipo.
- **Arancel Integrado Aduanero (ARCA/AFIP):** fuente **oficial y gratuita**, con posiciones SIM
  completas + DIE + tasa estadística + IVA + sufijos de valor. La más confiable. Requiere
  extracción/scraping. → **Objetivo de base "sólida".**
- **Dataset NCM en Kaggle (base ~2023):** CSV gratis con NCM 8 dígitos + AEC + IVA + TE. Bueno
  para **arrancar rápido** y validar el concepto; desactualizado y sin llegar al SIM de 12 dígitos.
- **NCM oficial Mercosur (POLCOM):** nomenclatura base vigente, oficial y gratuita.

**Plan de datos recomendado:**
1. **v1 rápida:** bootstrap con el dataset de Kaggle (NCM 8 dígitos + IVA/AEC/TE) para tener algo
   funcionando.
2. **v1 sólida:** construir la base desde el Arancel Integrado de ARCA para llegar al SIM completo
   y a números confiables.
3. Tarifar se usa por fuera de la app, para verificación manual del equipo.

*Pendiente a resolver antes/durante el build:* obtener y limpiar la base de ARCA (es el mayor
esfuerzo del proyecto).

---

## 6. UI (v1, lo más simple posible)

- Una pantalla principal con un **campo de entrada único** que acepta texto, URL o PDF
  (drag & drop o botón de subir archivo).
- Botón **"Analizar producto"**.
- Zona de **preguntas de aclaración** cuando la IA necesita más info (mostrando la referencia
  que encontró).
- **Resultado** con: posición SIM sugerida destacada (código + descripción), tarjeta con
  **DIE / Tasa Estadística / IVA**, HS code internacional, y las alternativas.
- **Historial** de últimas búsquedas (la app actual ya lo tiene en localStorage; se puede mantener).
- Bilingüe **ES/EN** (ya presente en la versión actual).
- Estética según el **brand guideline** de Claude Design:
  https://claude.ai/design/p/7ee7d76f-df14-428d-860f-25bd675d3a31?file=Design+System+Guide.html&present=1

*Nota:* el disclaimer legal ("información orientativa, consultar despachante") debe mantenerse.

---

## 7. Qué mejorar respecto de la versión actual de Gemini

La versión HTML actual es un buen prototipo visual, pero:
1. **API key vacía y en el cliente** → mover a backend (obligatorio).
2. **No lee realmente URLs ni PDFs** → implementar fetch de URL y carga de PDF.
3. **No hace research/grounding web** → activar búsqueda web en Gemini.
4. **Falta el IVA** en el output (hoy solo muestra DIE + Tasa Estadística, con tasa hardcodeada al 3%).
5. **Faltan el 2º HS alternativo y el SIM alternativo.**
6. **Números inventados por el LLM** → cruzar contra base oficial.

---

## 7bis. Prompt de Gemini editable (configuración)

Requisito: el equipo debe poder **editar el prompt que se le envía a Gemini sin tocar código**,
para iterar la calidad de la clasificación con el tiempo.

Opciones:
1. **Archivo de prompt en el repo** (`prompts/clasificacion.md`): se edita en GitHub → commit →
   Vercel redeploya. Ordenado y con historial, pero requiere entrar a GitHub y esperar redeploy.
2. **Vercel Edge Config / variable de entorno:** el prompt vive en el panel de Vercel; con Edge
   Config el cambio impacta sin redeploy. Contra: incómodo editar prompts largos ahí.
3. **Página de administración dentro de la app (recomendada):** pantalla protegida con contraseña
   con el prompt en un textarea editable. Se guarda en una base (Vercel KV / Edge Config) y queda
   activo al instante. No requiere tocar GitHub ni Vercel. Más trabajo inicial, mucho más cómoda
   en el uso diario.

**Recomendación:** opción 3, con la opción 1 como respaldo durante el desarrollo. Guardar además
un **historial de versiones del prompt** para poder revertir si un cambio empeora los resultados.

El prompt editable debería incluir, como mínimo: instrucciones de clasificación, formato JSON de
salida esperado, y reglas sobre cuándo repreguntar al usuario.

---

## 8. Roadmap sugerido

- **Fase 0 — Datos:** conseguir/limpiar la base de posiciones (Kaggle para arrancar; ARCA para sólida).
- **Fase 1 — Esqueleto:** Next.js en Vercel, backend con key protegida, input de texto → Gemini →
  cruce con base → resultado.
- **Fase 2 — Inputs ricos:** URL (fetch real), PDF, research por nombre/modelo, preguntas de aclaración.
- **Fase 3 — UI/branding:** aplicar el design system, historial, bilingüe, pulido.
- **Fase 3b — Admin de prompt:** página protegida para editar el prompt de Gemini + historial de versiones.
- **Futuro (v2+):** flete, cotización completa punta a punta.

---

## 9. Cómo construir (para no-programadores)

Construir en **Claude Code**, apuntándolo al repo de GitHub existente. Se le pide en español;
él escribe los archivos, hace commits, sube al repo y Vercel deploya automáticamente. Este spec
es el documento que se le da como punto de partida.

**Antes de empezar el build, tener a mano:**
- API key de Gemini (Google AI Studio).
- Acceso al repo de GitHub y al proyecto de Vercel.
- La base de datos de posiciones (aunque sea la de Kaggle para arrancar).
