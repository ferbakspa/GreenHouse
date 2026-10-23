# Contrato tarjeta y app (Organics One + Greenhouse Planner)

**Versión 1.3, 2026-10-23.** Corresponde a: firmware del Gateway v1.06, firmware del nodo v1.01, módulo de audio v1.00.

Este documento es la única fuente de verdad de cómo conversan la tarjeta y la app. Lo mantiene el proyecto de hardware (Organics One), a partir del firmware real.

## Reglas de trabajo

1. **Nadie cambia la conexión sin cambiar antes este contrato.** Si el hardware agrega un dato, actualiza el contrato. Si la app necesita algo nuevo, lo pide aquí y el firmware lo implementa.
2. Todo cambio al contrato entra como pull request y lo aprueba Nano.
3. La app no inventa topics ni formatos: si algo no está aquí, no existe en la tarjeta.
4. La compatibilidad se verifica con el campo `fw` de `gateway/info`.

## Conexión

| Dato | Valor |
|---|---|
| Protocolo | MQTT 3.1.1 sobre WebSocket cifrado |
| Servidor | EMQX Serverless (nube). Dirección: `wss://<host>:8084/mqtt` |
| Usuario de la app | `app` (propio, distinto del de la tarjeta) |
| Client ID | Único por teléfono, por ejemplo `app-` + 8 caracteres al azar |
| Sesión | Limpia (`clean: true`). Una sesión persistente consume cuota sin uso |
| Keepalive | 30 a 60 s |
| Suscripción | `greenhouse/{id}/#` con QoS 1 |
| Prefijo | `greenhouse/{id}/`, con `{id}` = nombre del invernadero, por defecto `invernadero1` |
| Librería sugerida | MQTT.js (navegador y React Native) |

El usuario, la clave y la dirección los ingresa la persona en la app y quedan solo en el teléfono. Nunca van en el código ni en el repositorio.

## Formato general

- Todo payload es texto UTF-8. Los números van como texto con punto decimal (`23.4`).
- Un dato sin lectura llega como `null` (texto).
- **Estados:** la tarjeta los publica retenidos y con QoS 1. Al conectarse, la app recibe de inmediato el último valor de cada uno.
- **Órdenes:** la app las publica con QoS 1 y **nunca retenidas**. Una orden retenida se volvería a ejecutar en cada reconexión de la tarjeta (por ejemplo, un riego repetido).
- **Frecuencia:** los estados y alarmas se publican apenas cambian. Los valores medidos se publican si cambian lo suficiente y como máximo cada 10 s; un cambio menor se publica igual a los 60 s. Todo se refresca completo cada 5 minutos.
- La app nunca supone que una orden se cumplió. Confirma leyendo el estado correspondiente, porque la tarjeta puede rechazarla por seguridad (paro de riego, tanque bajo, máximo de válvulas, etc.).

## Gateway: estados que publica

Todos bajo `greenhouse/{id}/`. `{n}` = número de zona (1, 2...) o de ventana (1 a 5).

| Topic | Valor | Notas |
|---|---|---|
| `gateway/status` | `online` / `offline` | `offline` lo publica el servidor si la tarjeta se desconecta (en menos de 1 min) |
| `gateway/info` | JSON | Cada 60 s. Ver más abajo |
| `zone/{n}/online` | `1` / `0` | El nodo de esa zona responde |
| `zone/{n}/soil1` | % (`46.7`) o `null` | Humedad de suelo, sensor 1 |
| `zone/{n}/soil2` | % o `null` | Sensor 2 (`null` si no está instalado) |
| `zone/{n}/valve` | `1` / `0` | Válvula realmente abierta, confirmada por el nodo |
| `zone/{n}/irrigation` | JSON | `{"state":"open","remaining_s":540}`. `state`: `open`, `queued` o `closed` |
| `zone/{n}/flow` | L/min | Caudal de la zona |
| `zone/{n}/volume` | L | Litros acumulados desde que encendió la tarjeta |
| `zone/{n}/flags` | entero | Bits del nodo: 0 falla sensor 1, 1 falla sensor 2, 2 reinicio reciente, 3 cierre de seguridad, 4 cierre por tiempo máximo, 5 dirección sin configurar |
| `ambient/temperature` | °C | Del pod ambiental (dentro del invernadero) |
| `ambient/humidity` | % HR | |
| `ambient/vpd` | kPa | Déficit de presión de vapor, calculado |
| `ambient/co2` | ppm | Solo si hay sensor de CO2 |
| `ambient/light` | lux | Solo si hay sensor de luz |
| `ambient/leaf_wetness` | % | Hoja mojada (0 seca, 100 mojada) |
| `ambient/leaf_wetness_mv` | mV | Valor crudo, para calibrar |
| `water/source` | `mains` / `tank` | Fuente de agua. `mains`: red (tubería), sin bomba. `tank`: tanque (agua lluvia) con bomba |
| `water/ph` | pH | **Opcional.** Solo si hay sonda de pH en el tanque |
| `water/ec` | mS/cm | **Opcional.** Conductividad: cantidad total de nutrientes disueltos. Solo si hay sonda de EC |
| `water/temperature` | °C | **Opcional.** Temperatura del agua del tanque (la entrega la sonda de EC o la de pH) |
| `tank/level` | % | Nivel de tanque |
| `tank/level_mv` | mV | Valor crudo, para calibrar |
| `tank/float` | `ok` / `low` | Flotador de nivel crítico |
| `pump/state` | `on` / `off` | |
| `pump/current` | A | Solo si hay transformador de corriente |
| `flow/main` | L/min | Caudalímetro principal |
| `flow/main_volume` | L | Acumulado desde que encendió la tarjeta |
| `flow/main_available` | `1` / `0` | |
| `window/{n}/position` | % (0 cerrada, 100 abierta) | |
| `window/{n}/state` | `stopped` / `opening` / `closing` | |
| `window/{n}/alarm` | `none` / `no_limit_switch` / `both_limit_switches` | |
| `output/{nombre}/state` | `on` / `off` | Nombres: `extractor`, `fan`, `grow_light`, `work_light`. `spare` solo existe si la tarjeta no usa J25 como luz de conexión (desde v1.05 la usa por defecto) |
| `input/irrigation_stop` | `on` / `off` | Pulsador físico de paro de riego |
| `rodent/{n}/count` | entero | Detecciones de ratones desde el encendido |
| `rodent/{n}/event` | `detected` | **No retenido.** Una vez por detección |
| `alarm/{nombre}` | `1` / `0` | Ver lista de alarmas |
| `gateway/auto` | JSON | Reglas automáticas vigentes. Mismo formato que `gateway/auto/set` |
| `auto/event` | JSON | **No retenido.** Cada acción automática. Ver más abajo |

**`gateway/info`:** `{"fw":"1.04","ip":"192.168.1.40","network":"ethernet","uptime_s":86400,"free_heap":120000,"zones":2,"time":"2026-10-19 15:30","auto":1,"water":"tank"}`. `time` queda vacío si la tarjeta aún no tiene hora de internet. `water` repite la fuente de agua.

**Alarmas (`alarm/{nombre}`):**

| Nombre | Significa |
|---|---|
| `zone{n}_offline` | El nodo de esa zona no responde |
| `zone{n}_auto_limit` | El riego automático por humedad llegó a su tope diario (posible sensor dañado) |
| `pod_offline` | El pod ambiental no responde |
| `adc` | Falla del conversor de las entradas analógicas |
| `pump_dry_run` | Bomba en seco. Queda bloqueada hasta `pump/reset` |
| `pump_overcurrent` | Sobrecorriente de bomba. Queda bloqueada hasta `pump/reset` |
| `tank_low` | Tanque bajo. Se rearma sola cuando vuelve el agua. Con fuente `mains` queda siempre en `0` |
| `water_ph_probe` / `water_ec_probe` | La sonda de pH o de EC no responde (solo si está configurada) |
| `water_ph` | pH fuera del rango configurado en la tarjeta |
| `water_ec_high` | EC sobre el máximo configurado en la tarjeta |
| `irrigation_stop` | Paro de riego físico activado |
| `tamper` | Puerta del gabinete abierta |
| `io_outputs` / `io_inputs` | Falla de salidas o entradas de la tarjeta |
| `clock` | Hay horarios configurados y la tarjeta aún no tiene hora de internet |

**`auto/event`**, ejemplos:

```json
{"zone":1,"action":"irrigate","reason":"soil","soil":31.2,"duration_s":600,"state":"open"}
{"zone":2,"action":"irrigate","reason":"schedule","duration_s":600,"state":"queued"}
{"action":"windows","position":100,"temperature":28.4,"humidity":71.0}
{"action":"fan","state":"on","temperature":30.1}
{"action":"grow_light","state":"off"}
```

`state` del riego puede ser `open`, `queued` o `rejected` (por ejemplo, con paro de riego activo).

## Gateway: órdenes que acepta

QoS 1, **no retenidas**, bajo `greenhouse/{id}/`.

| Topic | Valor | Efecto |
|---|---|---|
| `zone/{n}/irrigation/set` | segundos (`600`), o `0` / `stop` para cerrar | Riega la zona. Por defecto, máximo 2 válvulas a la vez (las demás quedan `queued`) y tope de 1800 s por orden |
| `window/{n}/set` | `open`, `close`, `stop` o `0` a `100` | Mueve una ventana |
| `output/{nombre}/set` | `on` / `off` | Enciende o apaga una salida |
| `pump/reset` | (cualquiera) | Rearma la bomba después de una alarma |
| `gateway/refresh` | (cualquiera) | La tarjeta republica todos sus estados |
| `gateway/auto/set` | JSON parcial | Cambia reglas automáticas. Responde en `gateway/auto/result` (`ok` o `error: motivo`) |
| `water/source/set` | `mains` / `tank` | Cambia la fuente de agua. Se aplica al instante y queda guardada. Se rechaza si hay un riego abierto o en cola. Responde en `water/source/result` (`ok` o `error: motivo`) |

**Lo manual manda:** una orden manual (riego, ventana, ventilador o luz de cultivo) pausa por 60 minutos la regla automática de ese equipo.

Órdenes de instalación, que la app de uso diario no debe ofrecer: `gateway/config/set` (JSON, la tarjeta se reinicia; respuesta en `gateway/config/result`) y `gateway/restart`.

## Calidad de agua del tanque (opcional)

Accesorio opcional: sondas de pH y EC dentro del tanque, conectadas al bus RS-485. Si no están instaladas, sus topics no existen y la app no muestra la sección. Rangos de referencia para mostrar en la app (la persona decide si los usa):

| Dato | Referencia general para hortalizas |
|---|---|
| pH | 5,5 a 6,8 |
| EC | 0,8 a 2,5 mS/cm según cultivo y etapa (agua de lluvia sola: cerca de 0) |
| Temperatura del agua | 18 a 24 °C |

## Fuente de agua

El invernadero puede regar desde la red (tubería de la casa) o desde un tanque de agua lluvia con bomba. Se elige una a la vez con `water/source/set`; es la persona quien la elige, porque depende de cómo está conectada el agua.

| Fuente | La tarjeta | La app muestra |
|---|---|---|
| `mains` (red) | No usa la bomba. `tank_low` queda en `0` | Caudal y litros. Oculta tanque, flotador y bomba |
| `tank` (tanque) | Usa la bomba y bloquea el riego con tanque bajo, bomba en seco o sobrecorriente | Nivel del tanque, flotador, bomba, caudal y litros |

Antes de cambiar a `tank`, la app debe advertir que se necesita la bomba instalada. Si `water/source` no llega (firmware anterior a 1.04), la app asume `tank` y muestra todo.

## Reglas automáticas (`gateway/auto/set`)

Cada clave es opcional: solo cambia lo que viene. `schedule`, si viene, reemplaza todos los horarios de esa zona (`[]` los borra).

```json
{"active":1,
 "zones":[{"zone":1,
           "soil":{"on":1,"min":35,"duration_s":600,"wait_min":60,"max_day":6,"from_h":6,"to_h":20},
           "schedule":[{"time":"07:00","duration_s":600}]}],
 "vent":{"on":1,"open_c":28,"close_c":25,"open_pct":100,"open_rh":85},
 "fan":{"on":1,"on_c":30,"off_c":28},
 "light":{"on":1,"from":"06:00","to":"22:00"},
 "manual_pause_min":60,
 "tz":"<-04>4<-03>,M9.1.6/24,M4.1.6/24"}
```

| Clave | Rango | Significado |
|---|---|---|
| `active` | 0 / 1 | Interruptor general del modo automático |
| `soil.min` | 5 a 95 % | Riega si el promedio de los sensores baja de este valor |
| `soil.duration_s` | 10 al tope por orden (1800 por defecto) | Duración de cada riego automático |
| `soil.wait_min` | 5 a 1440 | Espera mínima entre riegos automáticos de la zona |
| `soil.max_day` | 1 a 48 | Tope de riegos automáticos al día |
| `soil.from_h` / `to_h` | 0 a 23 | Franja permitida. Iguales = todo el día |
| `schedule` | hasta 4 por zona | Horarios diarios `HH:MM` con su duración |
| `vent.open_c` / `close_c` | °C, cierre al menos 1 °C menor | Abre ventanas al llegar a `open_c`, cierra al bajar a `close_c` |
| `vent.open_pct` | 10 a 100 | Apertura cuando ventila |
| `vent.open_rh` | 0 o 50 a 100 | Abre también con humedad alta (0 = no), salvo con frío |
| `fan.on_c` / `off_c` | °C, apagado menor que encendido | Ventilador por temperatura |
| `light.from` / `to` | `HH:MM` | Luz de cultivo encendida en esa franja (puede cruzar medianoche) |
| `manual_pause_min` | 0 a 1440 | Pausa de la regla tras una orden manual |
| `tz` | zona horaria POSIX | Por defecto Chile continental |

De fábrica todas las reglas vienen apagadas. Si algo no cumple los rangos, no se cambia nada y la respuesta explica el motivo.

**Sugerencia para la app:** proponer `vent.open_c` y `close_c` a partir de los rangos de temperatura (`tMin` / `tMax`) de los cultivos plantados, y que la persona confirme antes de enviar.

## Módulo de audio ambiental (opcional)

Prefijo `greenhouse/{id}/audio/`. Puede no existir: la app muestra su panel solo si llega `audio/status` = `online`.

| Topic | Tipo | Valor |
|---|---|---|
| `status` | estado | `online` / `offline` |
| `state` | estado | `playing` / `stopped` |
| `enabled` | estado | `1` / `0` |
| `volume` | estado | 0 a 100 |
| `scene` | estado | carpeta de sonidos o `mix` |
| `track` | estado | pista sonando, por ejemplo `selva/amanecer.mp3` |
| `motion/count` | estado | detecciones de personas desde el encendido |
| `error` | estado | vacío, `no_sd` o `no_tracks` |
| `config` | estado | `{"run_min":10,"quiet":{"on":1,"from":"22:00","to":"07:00"},"fade_in_s":3.0,"fade_out_s":5.0,"tz":"..."}` |
| `info` | estado | `{"fw":"1.00","ip":"...","rssi":-60,"sd":1,"tracks":12,"scenes":["aves","selva"],"time":"...","uptime_s":...}` |
| `motion/event` | evento | `started`, `extended`, `ignored_quiet`, `ignored_disabled` |
| `enabled/set` | orden | `on` / `off` |
| `play` | orden | vacío o nombre de escena |
| `stop` | orden | (cualquiera) |
| `volume/set` | orden | 0 a 100 |
| `scene/set` | orden | escena o `mix` |
| `config/set` | orden | JSON parcial, mismo formato que `config` |
| `result` | respuesta | `ok` o `error: motivo` |

## Lo que la tarjeta no ofrece (todavía)

- **Historial:** la tarjeta publica solo el último valor. Gráficos e historial requieren guardar los datos en una base (etapa siguiente).
- **Notificaciones con la app cerrada:** requieren un servicio aparte. Por ahora las alarmas se ven con la app abierta.

## Ejemplo mínimo (MQTT.js)

```js
const c = mqtt.connect('wss://<host>:8084/mqtt', {
  username: 'app', password: '<clave>', clean: true, keepalive: 60,
  clientId: 'app-' + Math.random().toString(16).slice(2, 10),
});
const P = 'greenhouse/invernadero1/';
c.on('connect', () => c.subscribe(P + '#', { qos: 1 }));
c.on('message', (topic, payload) => {
  const sub = topic.slice(P.length), v = payload.toString();
  // ejemplo: sub === 'ambient/temperature' -> v === '23.4'
});
// regar la zona 1 por 10 minutos (QoS 1, NO retenido)
c.publish(P + 'zone/1/irrigation/set', '600', { qos: 1, retain: false });
```

## Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-10-19 | Primera versión: Gateway v1.03, nodo v1.01, audio v1.00 |
| 1.3 | 2026-10-23 | Gateway v1.06: calidad de agua del tanque, opcional (`water/ph`, `water/ec`, `water/temperature` y sus alarmas) |
| 1.2 | 2026-10-21 | Gateway v1.05: J25 es la luz de conexión de la carcasa; `spare` deja de publicarse por defecto |
| 1.1 | 2026-10-20 | Fuente de agua seleccionable (`water/source`, `water/source/set`), Gateway v1.04 |
