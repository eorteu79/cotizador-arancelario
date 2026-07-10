from .schemas import CifInputs, Rates, CostBreakdown


def compute_cost(cif: CifInputs, rates: Rates) -> CostBreakdown:
    """Calcula la cascada de impuestos de importación argentina sobre el valor CIF.

    Cascada:
        DI  = CIF * di_pct
        TE  = CIF * te_pct
        base_iva = CIF + DI + TE
        IVA, IVA_adic, Ganancias, IIBB se aplican sobre base_iva
    """
    cv = cif.cif_value

    di = cv * rates.derecho_importacion_pct / 100.0
    te = cv * rates.tasa_estadistica_pct / 100.0
    base_iva = cv + di + te

    iva = base_iva * rates.iva_pct / 100.0
    iva_adic = base_iva * rates.iva_adicional_pct / 100.0
    ganancias = base_iva * rates.ganancias_pct / 100.0
    iibb = base_iva * rates.iibb_pct / 100.0

    costo_mercaderia = cv + di + te  # No recuperables, "costo real" para responsable inscripto
    desembolso_sin_perc = costo_mercaderia + iva
    desembolso_total = desembolso_sin_perc + iva_adic + ganancias + iibb

    notas = []
    if cif.importer_type == "responsable_inscripto":
        # IVA y percepciones son crédito fiscal recuperable
        if cif.include_percepciones:
            landed = desembolso_total
            notas.append(
                "Como Responsable Inscripto, el IVA y las percepciones son crédito fiscal recuperable. "
                "Este total incluye el desembolso completo en aduana; tu costo de mercadería 'real' es CIF + DI + Tasa."
            )
        else:
            landed = costo_mercaderia
            notas.append(
                "Como Responsable Inscripto, IVA y percepciones son recuperables. "
                "Mostramos el costo 'real' de la mercadería (CIF + DI + Tasa)."
            )
    else:
        # Consumidor final: IVA no se recupera; percepciones no aplican o no recupera
        landed = desembolso_sin_perc
        notas.append(
            "Como Consumidor Final, el IVA no se recupera y forma parte del costo. "
            "Las percepciones generalmente no aplican o se ven en otra vía."
        )

    notas.append(
        "Estimación orientativa. La clasificación NCM y las alícuotas deben confirmarse con un despachante."
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
        landed_cost=round(landed, 2),
        notas=notas,
    )
