type Props = Readonly<{
  label: string;
  text: string;
}>;

/** Definición breve de una métrica o concepto, visible al pasar o tocar la i. */
export function InfoTooltip({ label, text }: Props) {
  const tooltipId = `metric-info-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;

  return (
    <span className="metric-info" tabIndex={0} aria-describedby={tooltipId}>
      <span aria-hidden="true">i</span>
      <span id={tooltipId} role="tooltip">{text}</span>
    </span>
  );
}
