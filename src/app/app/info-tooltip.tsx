type Props = Readonly<{
  label: string;
  text: string;
}>;

/** Definición breve de una métrica o concepto, visible al pasar o tocar la i. */
export function InfoTooltip({ label, text }: Props) {
  return (
    <details className="metric-info">
      <summary aria-label={`Qué significa ${label}`}>i</summary>
      <span role="tooltip">{text}</span>
    </details>
  );
}
