# 17/11/2026 — Mauricio: cierre sin aviso Flat

Síntoma: cobertura real 17/11 18:24:55UTC del broker2211575 y cinco Lucid068–072 no conciliada; prop069 figura abierta pese a posiciones ya cerradas según usuario.

Evidencia: broker sesión4011234 cerrado, resultado-41540c, apertura1195900c/cierre1154360c. Cuatro props cerradas con+150300c. Prop069 sesión4011244 tiene posición Long2, ejecución Buy2@27018.5 (18:24:57.518UTC), Sell2@27056.25 (18:26:36.089UTC), saldo posterior51503=net51503 y unrealized0 (18:26:42.212230UTC), sin posiciónFlat recibida. Todoslosrecibos consultados persistidos. Cinco enlaces contables válidos antesdeoperar; no es falta de registro de una cuenta. Lote5c9da652-f3a0-4804-918a-4af66afa17b3 context_prop_count5, participantes cerrados4; mensaje 'No se pudo vincular1...' confunde estadoabierto con falta de registro.

Causa confirmada de bloqueo: reconstrucción exigía posiciónFlat para iniciar cierre y no aprovechaba las ejecuciones completas con saldo independiente estabilizado. No se demuestra por qué Ninja/conector omitió ese aviso; no atribuirlo a transporte sin loglocal.

Cambio en desarrollo: technical-operation.ts recupera solamente sesión derivada si hay un instrumento, dirección, todas las ejecuciones de entrada y salida completas con precios/cantidades válidos, totaligual al máximo observado, sin reentrada ni posiciónabierta posterior y último cash=net con unrealized0 tras el cierre. Mantiene quietud10s. No agrega ni modifica telemetríaoriginal, no cierra por saldo solo. Tests missing-flat.test.ts reproducen incidente y rechazan entradasfaltantes, cierresparciales, posicionesposteriores, saldo noestable, flotante y quietudinsuficiente.

Nodalito: contrastar cierre técnico antes de pedir otra compra/registro; conservar las cinco cuentas y recuperar loteúnico por circuito normal. No confundir cuentaactiva contablemente con posiciónabierta. Prueba final deberá incluir conciliación, cinco asientos, fase/día, flotante y ausencia de sesiónprop abierta. No borrar fuentes ni duplicar ajustes anteriores.

Estado inicial: 40pruebasdominio aprobadas. Pendiente build/despliegue y reproceso; completar aquí únicamente después de verificarlos. Rollback: revertir commitde código; si se materializó ledger correcto, no borrar su resultado al revertir código.

Driveintegrado falló al leer Estado/Índice por MCPstartup/handshake HTTP decodingresponsebody. NOsincronizado. Evidencia local outputs/mauricio-missing-flat-20261117.json. La tarea de los tres casos anteriores y su cambio NQ/MNQ siguen suspendidos en otro worktree.
