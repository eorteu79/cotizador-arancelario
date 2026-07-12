from .schemas import CifInputs, Rates, CostBreakdown


def compute_cost(cif: CifInputs, rates: Rates) -> CostBreakdown:
    """Calcula la cascada de impuestos de importación argentina sobre el valor CIF.

    Cascada:
        DI  = CIF * di_pct
        TE  = CIF * te_pct
        base_iva = CIF + DI + TE
        IVA se aplica siempre sobre base_iva.
        IVA adicional y Ganancias (percepciones RG 2937) solo aplican si el destino
        declarado es "bien_cambio" (mercadería para reventa); la RG 2937 exceptúa a los
        bienes de uso (consumo propio, vida útil >= 2 años) de ambas percepciones.
        IIBB es configurable por el usuario (varía por provincia) y se aplica igual en
        ambos destinos, salvo que el usuario la deje en 0.
    """
    cv = cif.cif_value
    es_bien_cambio = cif.destino == "bien_cambio"

    di = cv * rates.derecho_importacion_pct / 100.0
    te = cv * rates.tasa_estadistica_pct / 100.0
    base_iva = cv + di + te

    iva = base_iva * rates.iva_pct / 100.0
    iva_adic = base_iva * rates.iva_adicional_pct / 100.0 if es_bien_cambio else 0.0
    ganancias = base_iva * rates.ganancias_pct / 100.0 if es_bien_cambio else 0.0
    iibb = base_iva * cif.iibb_pct / 100.0

    costo_mercaderia = cv + di + te
    desembolso_sin_perc = costo_mercaderia + iva
    desembolso_total = desembolso_sin_perc + iva_adic + ganancias + iibb

    notas = []
    if es_bien_cambio:
        notas.append(
            "Destino 'bien de cambio' (mercadería para reventa): corresponden las "
            "percepciones de IVA adicional y Ganancias, según RG 2937 (AFIP)."
        )
    else:
        notas.append(
            "Destino 'bien de uso' (consumo propio, vida útil ≥ 2 años): por la excepción "
            "de la RG 2937 (AFIP) no corresponden las percepciones de IVA adicional ni de "
            "Ganancias. La percepción de IIBB depende de la jurisdicción y normalmente "
            "tampoco aplica a bienes de uso."
        )
    notas.append(
        "Los certificados de exclusión de percepción (RG 5655/2025, AFIP) pueden reducir "
        "o eliminar estas percepciones incluso para bienes de cambio; no están "
        "contemplados en este cálculo automático — es un caso avanzado a evaluar con tu "
        "despachante."
    )
    notas.append(
        "Estimación orientativa. La clasificación NCM, las alícuotas y la percepción de "
        "IIBB aplicable deben confirmarse con un despachante de aduana."
    )

    return CostBreakdown(
        cif_value=round(cv, 2),
        currency=cif.currency,
        derecho_importacion=round(di, 2),
        tasa_estadistica=round(te, 2),
        base_iva=round(base_iva, 2),
        iva=round(iva, 2),
        iva_adicional=round(iva_adic, 2),
        ganancias=round(ganancias, 2),
        iibb=round(iibb, 2),
        costo_mercaderia=round(costo_mercaderia, 2),
        desembolso_aduana_sin_percepciones=round(desembolso_sin_perc, 2),
        desembolso_aduana_total=round(desembolso_total, 2),
        landed_cost=round(desembolso_total, 2),
        notas=notas,
    )
