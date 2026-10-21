# Pedido de la app al contrato (propuesta para v1.2)

**Estado:** borrador para revisión del proyecto de hardware. No es parte del contrato hasta que entre como pull request a `CONTRATO.md` y Nano lo apruebe (regla 2 del contrato).
**Fecha:** 2026-10-20. **Base:** contrato v1.1 (Gateway v1.04).

Los nombres de topics y formatos son sugerencias de la app. El proyecto de hardware decide la forma final según el firmware real.

## Resumen por prioridad

| # | Pedido | Para qué en la app | Prioridad |
|---|---|---|---|
| 1 | Tiempo encendido por salida y bomba en el día | Consumo eléctrico estimado del día completo, aunque la app haya estado cerrada | Alta |
| 2 | Humidificador / nebulizador como salida con regla automática | Controlar la humedad del aire y bajar temperatura | Alta |
| 3 | Medidor de energía (consumo real) | Mostrar kWh reales en Estadísticas | Media |
| 4 | Acceso local sin internet | Ver y controlar la tarjeta en el invernadero sin señal | Media |
| 5 | Sensores opcionales de pH y conductividad (EC) | Hidroponía | Media |
| 6 | Volumen regado por zona en el día | Litros reales por zona en la vista de riego | Media |
| 7 | Servidor operado por Aidex y configuración de fábrica (QR o código por tarjeta) | Conectar y listo para el cliente, y alertas al teléfono del plan de pago | Alta |

## 1. Tiempo encendido por salida en el día

Hoy la app solo puede medir el tiempo encendido mientras está abierta.

Sugerencia de estado (retenido, se publica al cambiar y cada 5 minutos):

| Topic | Valor | Notas |
|---|---|---|
| `output/{nombre}/on_today_s` | entero, segundos | Segundos encendido desde las 00:00 hora local. Se reinicia a medianoche (`tz` de las reglas) |
| `pump/on_today_s` | entero, segundos | Igual para la bomba |

## 2. Humidificador / nebulizador

Aumenta la humedad del aire y puede bajar la temperatura varios grados en días secos y calurosos.

- **Salida:** `output/humidifier/state` (`on` / `off`) y orden `output/humidifier/set`. Si no hay una salida física libre, se puede definir que `spare` actúe como humidificador por configuración de instalación.
- **Regla automática** dentro de `gateway/auto/set`:

```json
{"humidifier":{"on":1,"on_rh":55,"off_rh":70,"max_c":0,"from":"08:00","to":"20:00","max_min":30}}
```

| Clave | Rango sugerido | Significado |
|---|---|---|
| `on_rh` / `off_rh` | 20 a 95 %, `off_rh` mayor que `on_rh` | Enciende bajo `on_rh`, apaga al llegar a `off_rh` |
| `max_c` | 0 o 15 a 45 °C | Enciende también por temperatura alta (0 = no) |
| `from` / `to` | `HH:MM` | Franja permitida (evitar humedad de noche por hongos) |
| `max_min` | 1 a 240 | Tiempo máximo continuo por seguridad |

- **Seguridad sugerida:** no encender con `tank/float` = `low` si el humidificador usa el tanque, y no encender si `ambient/leaf_wetness` está sobre un umbral.

## 3. Medidor de energía

Medidor de energía con Wi-Fi o Modbus en el tablero eléctrico, leído por el Gateway.

| Topic | Valor |
|---|---|
| `power/watts` | W instantáneos |
| `power/kwh_today` | kWh desde las 00:00 |
| `power/kwh_total` | kWh acumulados |
| `power/available` | `1` / `0` |

## 4. Acceso local sin internet

La tarjeta ya funciona sola sin internet. Lo que falta es que la app la vea y la controle en el mismo lugar cuando no hay internet.

Opciones a evaluar por el proyecto de hardware:
- **Broker MQTT local en el Gateway** por WebSocket en la red Wi-Fi del invernadero, con el mismo contrato de topics. La app intentaría primero la nube y, si no responde, la dirección local.
- **Punto de acceso Wi-Fi propio** del Gateway cuando no hay red.
- **Bluetooth Low Energy** solo para lectura y órdenes básicas.

Consideración para la app publicada en https: los navegadores bloquean `ws://` sin cifrar desde una página https, así que la opción local necesita cifrado (`wss://` con certificado) o resolverse dentro de la app de Android.

## 5. pH y conductividad (EC)

| Topic | Valor |
|---|---|
| `water/ph` | pH (`6.2`) o `null` |
| `water/ec` | mS/cm (`1.8`) o `null` |
| `water/ph_available`, `water/ec_available` | `1` / `0` |

Alarmas sugeridas: `ph_out_of_range`, `ec_out_of_range`, con rangos configurables en las reglas.

## 6. Volumen regado por zona en el día

| Topic | Valor |
|---|---|
| `zone/{n}/volume_today` | L desde las 00:00 |

Con esto la vista de riego muestra litros reales en lugar de estimados.

## 7. Servidor operado por Aidex y configuración de fábrica

**Decisión de negocio (2026-10-20):** por defecto el servidor MQTT lo opera Aidex. Queda la opción de "servidor propio" para empresas. Las alertas al teléfono del plan de pago necesitan que los datos pasen por un servidor de Aidex.

Pedido a evaluar por el proyecto de hardware:
- **Un servidor central** (EMQX administrado) con **credenciales separadas por tarjeta** y permisos por invernadero, de modo que cada tarjeta y cada app solo vean sus propios topics.
- **Configuración de fábrica:** cada tarjeta sale con su identificador y credenciales, y una **etiqueta con QR o código corto**. La app lee el QR (o se escribe el código) y queda conectada sin escribir servidor, usuario ni clave.
- **Revocar y cambiar** las credenciales de una tarjeta (venta, robo, cambio de dueño) sin reprogramarla en terreno.
- **Servidor propio:** mantener la forma actual de `conectar({ servidor, usuario, clave })` para clientes empresa.
- **Base para alertas:** un servicio del lado del servidor que lea las alarmas y lecturas, y que pueda enviar avisos (push, WhatsApp o SMS). Lo define el proyecto, la app solo necesita saber si la tarjeta tiene alertas activas.

Sugerencia de formato del QR, a definir por el proyecto:

```
organics://conectar?t=<id_tarjeta>&c=<codigo_de_activacion>
```

El código de activación se canjea una vez por credenciales propias de esa app, así la clave real no queda impresa en la etiqueta.

## Ya disponible en el contrato y que la app usará

- `ambient/leaf_wetness` y `ambient/humidity`: para el aviso de **riesgo de hongos** (horas con humedad alta y hoja mojada), calculado en la app.
- `zone/{n}/soil1`, `soil2`: para la recomendación de riego por cultivo.
