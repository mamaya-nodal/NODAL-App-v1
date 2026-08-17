"use client";

import { useState } from "react";

import { resetDevelopmentPeriod } from "./development-reset-actions";

type Props = Readonly<{
  mode: "real" | "practice";
  period: string;
  periodId: string;
}>;

export function DevelopmentPeriodReset({ mode, period, periodId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="development-reset" aria-labelledby="development-reset-title">
      <div>
        <p className="status">SOLO PRUEBAS LOCALES</p>
        <h3 id="development-reset-title">Reiniciar datos del período</h3>
        <p>Borra compras, controles, registros, billetera y retiros de este período para cargar un caso nuevo.</p>
      </div>
      {!open ? (
        <button className="secondary-action danger-action" onClick={() => setOpen(true)} type="button">
          Reiniciar datos de prueba
        </button>
      ) : (
        <form action={resetDevelopmentPeriod} className="development-reset-form">
          <input name="mode" type="hidden" value={mode} />
          <input name="period" type="hidden" value={period} />
          <input name="period_id" type="hidden" value={periodId} />
          <label htmlFor="development-reset-confirmation">
            Escribí <strong>REINICIAR</strong> para confirmar
          </label>
          <input
            autoComplete="off"
            id="development-reset-confirmation"
            name="confirmation"
            required
            type="text"
          />
          <div>
            <button className="secondary-action" onClick={() => setOpen(false)} type="button">
              Cancelar
            </button>
            <button className="primary-action danger-action" type="submit">
              Borrar datos de este período
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
