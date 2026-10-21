# Modelo de ingresos (borrador, no implementado)

Fecha: 2026-10-20. Precio de referencia del plan de pago: **US$1 al mes, en revisión**. Al decidir que Aidex opera el servidor de la tarjeta (costo y responsabilidad), Nano evalúa subirlo a **US$2 o US$3 al mes**.

## Tres tipos de usuario

| Función | Gratis | Pago (mensual) | Compró Organics One |
|---|---|---|---|
| Planificador, entorno, estadísticas en pantalla | Sí | Sí | Sí |
| Avisos dentro de la app | Sí | Sí | Sí |
| Tarjeta de promoción "Organics One · Sin conexión" | Siempre visible (publicidad Aidex) | Visible, con opción de ocultarla para siempre si no la quiere | No aplica: su tarjeta ya está configurada y ve sus datos en vivo |
| Notificaciones al teléfono bloqueado (push, WhatsApp o SMS) | No, debe abrir la app para revisar | Sí, todas las alertas | Sí |
| Exportar datos (WhatsApp, correo, Excel) | No, solo ver | Sí | Sí |
| Funciones avanzadas | No | Sí | Sí |
| Publicidad | Solo al iniciar o recargar la app: 2 cortas seguidas (o 1 larga). Nunca entre acciones | Sin publicidad | Sin publicidad |

**Compró Organics One:** todas las funciones de pago gratis por un período **en revisión**. Opciones: 1 año (preferida por ahora), 3 años, 5 años o de por vida. Al terminar, sigue con la versión estándar gratis con publicidad, o paga el plan mensual.

**Tarjeta de promoción:** su objetivo es que quien no tiene la tarjeta sepa que existe y pueda comprarla. No se oculta sola al pagar. Es una opción para quien paga, no compró la tarjeta y ya no le interesa verla.

## Servidor de la tarjeta (MQTT / EMQX): modelo mixto (decidido 2026-10-20)
- **Por defecto lo opera Aidex:** un servidor central con credenciales por tarjeta (cada tarjeta solo ve lo suyo). Configuración de fábrica con QR o código por tarjeta (pedido al contrato v1.2, punto 7).
- **Cobro por cuenta administrada:** US$1, 2 o 3 al mes por tarjeta o usuario. Una empresa con 100 tarjetas paga 100 cuentas. El cliente se evita la responsabilidad de operar el servidor y Aidex gana margen.
- **Servidor propio: 100% opcional para cualquier cliente** (no solo empresas), sin el servicio administrado ni las alertas de Aidex.
- Por verificar: si el cobro del servicio administrado debe hacerse con Google Play Billing (contenido digital dentro de la app) o puede cobrarse fuera (por ejemplo, junto con la tarjeta o por contrato a empresas).
- Razón: las notificaciones al teléfono del plan de pago necesitan que los datos pasen por un servidor de Aidex.
- Si el servidor se cae, la tarjeta sigue funcionando sola con sus reglas; solo se pierde la vista remota.
- Ya hecho: política de privacidad con la sección "Tarjeta Organics One (opcional)" y guía de Google Play declarando las lecturas de sensores.

## Venta de la tarjeta
- Canales a evaluar: Mercado Libre, Amazon u otros marketplaces, además de aidex.cl/invernaderos.
- Cuando existan, el enlace de la promoción en la app puede llevar directo a la compra.

## Notas
- Notificaciones: elegir el canal más económico (o sin costo). Evaluar si el usuario elige el canal.
- El usuario gratis abre la app más seguido porque no recibe alertas, ve más la publicidad de inicio, y eso incentiva el pago.
- Exportación a mejorar: no solo datos, también gráficos y un resumen visual rápido con exterior vs interior, peaks y puntos de riesgo por temperatura alta o baja. Por definir.
- Hoy la exportación está disponible para todos. Se restringirá cuando exista el plan de pago.
- Posible límite futuro a la vista de datos en el plan gratis: poco probable.
- Dueño de tarjeta con la tarjeta caída: el aviso "Tu tarjeta está sin conexión" es un aviso de estado útil, no publicidad. No se oculta y debe verse distinto a la promoción.

## Pendiente de definir
- Precio mensual final por cuenta administrada (US$1, 2 o 3).
- Duración del período gratis al comprar la tarjeta.
- Cómo se activa (código en la caja o activación al conectar la tarjeta por primera vez).
- Servicio de notificaciones y canal.
- Sistema de cobro (Google Play Billing) y proveedor de publicidad.
- Canales de venta de la tarjeta.
- Costo del servidor central EMQX de Aidex.
