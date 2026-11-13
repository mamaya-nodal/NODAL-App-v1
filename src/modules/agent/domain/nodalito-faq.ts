export type NodalitoGuide = Readonly<{
  actionLabel: string;
  href: string;
  id: string;
  question: string;
  summary: string;
  steps: readonly string[];
}>;

export const NODALITO_GUIDES: readonly NodalitoGuide[] = [
  {
    actionLabel: "Ir a Contabilidad",
    href: "/app#contabilidad",
    id: "wallets-location",
    question: "¿Dónde veo las billeteras?",
    summary: "Las billeteras y cuentas bancarias están en Contabilidad, dentro de “Billeteras o cuentas bancarias”.",
    steps: [
      "Abrí Contabilidad en el menú lateral.",
      "Desplegá “Billeteras o cuentas bancarias” para ver el saldo de cada una.",
      "Desde esa misma sección podés crear, revisar o eliminar una billetera cuando no tenga movimientos vinculados.",
    ],
  },
  {
    actionLabel: "Cargar movimiento",
    href: "/app#contabilidad",
    id: "wallet-movement",
    question: "¿Cómo cargo un movimiento de saldo de una billetera?",
    summary: "El movimiento se carga en Contabilidad, dentro de “Movimientos de fondos”.",
    steps: [
      "Elegí la billetera o cuenta bancaria.",
      "Indicá la fecha, el tipo de movimiento y el importe en USD.",
      "Agregá una observación si necesitás dejar trazabilidad.",
      "Presioná “Guardar movimiento” y verificá que aparezca en el historial.",
    ],
  },
  {
    actionLabel: "Registrar payout",
    href: "/app#payouts",
    id: "payout-registration",
    question: "¿Cómo registro un payout?",
    summary: "Los payouts se registran desde Contabilidad, en la tarjeta “Payouts”.",
    steps: [
      "Abrí Contabilidad y desplegá “Payouts”.",
      "Seleccioná la cuenta Funded viva que generó el payout.",
      "Cargá el importe aprobado y la fecha de aprobación.",
      "Presioná “Registrar payout”. Cuando el dinero se acredite, usá “Confirmar pago acreditado” y elegí la billetera de destino.",
    ],
  },
  {
    actionLabel: "Ir a Inicio",
    href: "/app#inicio",
    id: "starting-point",
    question: "¿Cómo confirmo o corrijo mi punto de partida?",
    summary: "El punto de partida se confirma desde Inicio y fija la base contable desde la que NODAL medirá los cambios.",
    steps: [
      "Verificá que el conector esté transmitiendo el saldo broker correcto.",
      "Revisá las cuentas broker incluidas y descartá las que no te correspondan.",
      "Cargá únicamente el dinero disponible fuera del broker.",
      "Confirmá la vista previa. Si ya quedó guardado y necesitás corregirlo, solicitá la edición desde el resumen del punto de partida.",
    ],
  },
  {
    actionLabel: "Ir a Configuración",
    href: "/app#configuracion",
    id: "connector-update",
    question: "¿Cómo actualizo el conector de NinjaTrader?",
    summary: "La actualización del conector personal se descarga desde Configuración.",
    steps: [
      "Abrí Configuración y buscá NinjaTrader.",
      "Presioná “Actualizar conector” o enviá la actualización al correo indicado.",
      "Cerrá NinjaTrader, ejecutá el instalador y volvé a abrirlo.",
      "Esperá la nueva transmisión; no hace falta desvincular el conector existente.",
    ],
  },
  {
    actionLabel: "Revisar Configuración",
    href: "/app#configuracion",
    id: "connector-no-signal",
    question: "¿Qué hago si dice “Conector sin señal”?",
    summary: "“Sin señal” significa que NODAL conserva los últimos datos, pero no recibe una transmisión reciente del conector.",
    steps: [
      "Comprobá que NinjaTrader esté abierto y conectado a la cuenta broker.",
      "Verificá que el complemento NODAL esté instalado y actualizado.",
      "Si operás mediante una identidad, revisá el conector de esa tarjeta.",
      "Usá “Volver a vincular” solamente si el conector no retoma la señal.",
    ],
  },
  {
    actionLabel: "Ir a Cuentas",
    href: "/app#cuentas",
    id: "register-account",
    question: "¿Cómo registro una cuenta de fondeo?",
    summary: "Las cuentas se registran desde Cuentas y deben quedar vinculadas a la cuenta broker correcta.",
    steps: [
      "Abrí Cuentas y elegí la empresa de fondeo.",
      "Cargá identificador, estado operativo, precio y fecha de compra.",
      "Indicá la vuelta y el día reales si la cuenta ya venía operándose.",
      "Vinculá la cuenta broker detectada que corresponda; no confirmes subcuentas ajenas.",
    ],
  },
  {
    actionLabel: "Revisar Cuentas",
    href: "/app#cuentas",
    id: "account-progress",
    question: "¿Dónde veo la vuelta, el día y el flotante de una cuenta?",
    summary: "La etapa actual, los días operados y el resultado acumulado se ven en la tarjeta de cada cuenta.",
    steps: [
      "Abrí Cuentas y buscá la cuenta por empresa o identificador.",
      "En la tarjeta resumida verás la vuelta y el día actuales.",
      "Desplegala para revisar operaciones, inversión, cash value y resultado contable.",
      "Si la etapa no coincide con lo operado, no la cierres: reportá la diferencia a Nodalito.",
    ],
  },
  {
    actionLabel: "Ir a Identidades",
    href: "/app#identidades",
    id: "create-identity",
    question: "¿Cómo registro una identidad?",
    summary: "Una identidad se crea desde Identidades y mantiene separados su conector, cuentas y complementos.",
    steps: [
      "Abrí Identidades y elegí agregar una identidad.",
      "Cargá sus datos y el correo al que recibirá los instaladores.",
      "Desde su propia tarjeta enviá el conector o MIMICAL.",
      "Vinculá únicamente las cuentas broker que operará esa identidad.",
    ],
  },
  {
    actionLabel: "Abrir Identidades",
    href: "/app#identidades",
    id: "identity-installer",
    question: "¿Cómo envío el conector o MIMICAL a una identidad?",
    summary: "Los instaladores de una identidad se administran exclusivamente desde su tarjeta.",
    steps: [
      "Abrí Identidades y desplegá la tarjeta correcta.",
      "En Complementos, elegí Configuración.",
      "Enviá la instalación o actualización al correo de la identidad.",
      "Generá el código de vinculación desde esa misma tarjeta; el código personal del titular no sirve para otra identidad.",
    ],
  },
  {
    actionLabel: "Ir a Configuración",
    href: "/app#configuracion",
    id: "mimical-update",
    question: "¿Cómo actualizo MIMICAL?",
    summary: "MIMICAL personal se actualiza desde Configuración; el de una identidad, desde su tarjeta.",
    steps: [
      "Descargá el ZIP indicado para el titular o la identidad correcta.",
      "Importalo desde NinjaTrader sin descomprimirlo.",
      "Reiniciá NinjaTrader y verificá la versión completa mostrada por MIMICAL.",
      "El aviso de actualización desaparecerá cuando NODAL detecte la nueva versión.",
    ],
  },
  {
    actionLabel: "Ver Operaciones",
    href: "/app#operaciones",
    id: "live-operations",
    question: "¿Dónde veo qué cuenta está operando ahora?",
    summary: "Operaciones muestra el saldo broker, las posiciones abiertas y cada cuenta detectada en vivo.",
    steps: [
      "Abrí Operaciones.",
      "Revisá la cuenta principal mostrada en la tarjeta de saldo broker.",
      "En “Otras cuentas” verás subcuentas con posición o actividad.",
      "Si aparece una cuenta ajena, no debería contabilizarse: reportala para revisar su asignación.",
    ],
  },
  {
    actionLabel: "Ir a Contabilidad",
    href: "/app#contabilidad",
    id: "reconcile-transfer",
    question: "¿Cómo concilio una transferencia entre broker y billetera?",
    summary: "Las transferencias detectadas se concilian en Contabilidad asignándoles la billetera y el importe neto correctos.",
    steps: [
      "Abrí Contabilidad y buscá “Movimientos de fondos”.",
      "Elegí la billetera o cuenta bancaria relacionada.",
      "Confirmá la fecha y el importe realmente acreditado.",
      "Cargá la comisión por separado si el envío tuvo fee y presioná “Conciliar movimiento”.",
    ],
  },
  {
    actionLabel: "Revisar Contabilidad",
    href: "/app#contabilidad",
    id: "conciliation-error",
    question: "¿Qué hago si una operación o transferencia no concilia?",
    summary: "No conviene inventar movimientos para forzar una conciliación; primero hay que identificar qué dato no coincide.",
    steps: [
      "Revisá cuenta broker, billetera, fecha, importe y comisión.",
      "Una diferencia de saldo puede ser una transferencia, una operación sin cobertura o una operación cuya información falta. No la clasifiques por el importe ni por el signo.",
      "Para una operación de identidad, investigá tanto los eventos de esa identidad como los del broker de su titular. La señal de conexión no demuestra que se hayan guardado ejecuciones.",
      "Si se recuperan eventos antiguos, comprobá primero si ya fueron registrados mediante una reparación. Debe quedar una sola operación económica.",
      "Si faltan ejecuciones, Nodalito debe contrastar los inventarios originales de broker y cuentas con el P&L realizado. Si faltan cuentas registradas o precios de compra, debe pedir esos datos antes de asignar importes.",
      "Confirmá que la cuenta tenga empresa, etapa, vuelta y día correctamente registrados.",
      "Verificá que la operación pertenezca al titular o a la identidad seleccionada.",
      "Consultá a Nodalito para que enumere la alerta y su evidencia antes de modificar datos.",
    ],
  },
  {
    actionLabel: "Ir a Billeteras",
    href: "/app#contabilidad",
    id: "create-wallet",
    question: "¿Cómo creo una billetera o cuenta bancaria?",
    summary: "Las billeteras se crean dentro de Contabilidad y representan dinero real fuera del broker.",
    steps: [
      "Abrí “Billeteras o cuentas bancarias”.",
      "Indicá un nombre reconocible y el saldo real actual.",
      "Guardala antes de cargar movimientos o cobrar payouts.",
      "No uses un saldo ficticio para conciliar: registrá luego cada movimiento con su concepto correcto.",
    ],
  },
  {
    actionLabel: "Revisar Billeteras",
    href: "/app#contabilidad",
    id: "delete-wallet",
    question: "¿Por qué no puedo eliminar una billetera?",
    summary: "Una billetera con movimientos, payouts o conciliaciones vinculadas no se elimina para preservar la trazabilidad.",
    steps: [
      "Revisá su historial de movimientos.",
      "Comprobá si recibió un payout o participó en una transferencia.",
      "Corregí o anulá el registro de origen cuando corresponda; llevar el saldo a cero no elimina los vínculos.",
      "Si el vínculo es erróneo y no puede corregirse desde la app, reportalo a Nodalito.",
    ],
  },
  {
    actionLabel: "Ir a Inicio",
    href: "/app#inicio",
    id: "stale-data",
    question: "¿Por qué veo datos viejos o no aparece la última operación?",
    summary: "La app muestra el último dato guardado cuando el conector no transmitió o la operación todavía no terminó de procesarse.",
    steps: [
      "Revisá el estado del conector en Inicio.",
      "Confirmá que la cuenta operada esté vinculada al titular o identidad correcta.",
      "Esperá a que la operación cierre y el lote termine de asentarse.",
      "Si ya cerró y no aparece, consultá la auditoría de Nodalito: debe figurar como operación sin conciliación o falla de señal.",
    ],
  },
];

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function findNodalitoGuide(question: string): NodalitoGuide | null {
  const value = normalized(question);
  const guide = (id: string) => NODALITO_GUIDES.find((item) => item.id === id) ?? null;
  if (/punto de partida|reconstruccion|apertura/.test(value)) return guide("starting-point");
  if (/identidad/.test(value) && /envi|instal|conector|codigo|vincul/.test(value)) return guide("identity-installer");
  if (/identidad/.test(value) && /creo|crear|crea |nueva|registr|agregar|alta/.test(value)) return guide("create-identity");
  if (/mimical/.test(value)) return guide("mimical-update");
  if (/conector/.test(value) && /actualiz|instal|version/.test(value)) return guide("connector-update");
  if (/sin senal|no conecta|desconect/.test(value)) return guide("connector-no-signal");
  if ((/payout/.test(value) || value.includes("retiro de fondeo")) && /como|donde|registr|cargar|confirm/.test(value)) {
    return guide("payout-registration");
  }
  if (/no puedo eliminar|borrar.*billetera|eliminar.*billetera/.test(value)) return guide("delete-wallet");
  if (/creo|crear|crea |nueva|registr|agregar|alta/.test(value) && /billetera|cuenta bancaria/.test(value)) return guide("create-wallet");
  if (/transferencia|conciliar.*movimiento|movimiento.*broker/.test(value)) return guide("reconcile-transfer");
  if (/no concilia|conciliacion|conciliar/.test(value)) return guide("conciliation-error");
  if ((value.includes("movimiento") || value.includes("saldo")) && (value.includes("billetera") || value.includes("wallet"))) {
    return guide("wallet-movement");
  }
  if (value.includes("billetera") || value.includes("wallet") || value.includes("cuenta bancaria")) return guide("wallets-location");
  if (/vuelta|flotante|que dia|etapa/.test(value) && /cuenta/.test(value)) return guide("account-progress");
  if (/registro|registr|creo|crear|crea |nueva|agregar|compr/.test(value) && /cuenta|fondeo/.test(value)) return guide("register-account");
  if (/operando ahora|posicion abierta|cuenta.*operando/.test(value)) return guide("live-operations");
  if (/datos viejos|ultima operacion|no aparece|desactualizad/.test(value)) return guide("stale-data");
  return null;
}
