# Capa de conexión con la tarjeta Organics One

Esta carpeta conecta la app con la tarjeta según [CONTRATO.md](../CONTRATO.md) (v1.3). La mantiene el proyecto de hardware. El proyecto de la app la **usa** y no la modifica: si falta algo, se pide en el contrato.

| Archivo | Para qué |
|---|---|
| `conexion.js` | La capa de conexión. Se incluye con `<script src="organics/conexion.js"></script>` y expone `window.OrganicsOne` |
| `prueba.html` | Pantalla de prueba: conectar, ver en vivo todo lo que publica la tarjeta y enviarle órdenes. Sirve en el banco de pruebas desde el celular |
| `pruebas/` | Prueba automática con una tarjeta simulada (para el proyecto de hardware) |

Abrir la pantalla de prueba, una vez publicada la app en GitHub Pages: `https://<usuario>.github.io/<repositorio>/organics/prueba.html`.

## Uso desde la app

```js
// conectar (la primera vez con los datos que ingresa la persona; después sin argumentos usa los guardados)
await OrganicsOne.conectar({ servidor: 'abc123.ala.us-east-1.emqxsl.com', usuario: 'app', clave: '...', invernadero: 'invernadero1' });

// estado de la conexión: conectado, tarjetaEnLinea, fwGateway, compatible, ultimaActualizacion, error
OrganicsOne.onConexion(st => pintarEstado(st));

// datos en vivo: patrón relativo al invernadero, con + y #; '*' = todo
OrganicsOne.on('ambient/temperature', v => temperatura = Number(v));
OrganicsOne.on('alarm/#', () => pintarAlarmas(OrganicsOne.alarmasActivas()));
```

**Vistas ya armadas** (devuelven `null` donde no hay dato):

| Función | Devuelve |
|---|---|
| `ambiente()` | `{temperatura, humedad, vpd, co2, luz, hojaMojada}` |
| `zonas()` | `[{zona, enLinea, suelo1, suelo2, suelo (promedio), valvulaAbierta, riego:{state, remaining_s}, caudal, volumen, banderas, topeAutomatico}]` |
| `ventanas()` | `[{ventana, posicion, estado, alarma}]` |
| `salidas()` | `{extractor, fan, grow_light, work_light, spare}` en `true` / `false` |
| `agua()` | `{fuente, conTanque, tanque, flotador, bomba, corrienteBomba, caudal, volumen}`. `fuente`: `mains` (red) o `tank` (tanque). Con `conTanque` en `false`, la app oculta tanque, flotador y bomba |
| `calidadAgua()` | `{ph, ec, temperatura, sondaPhOk, sondaEcOk, phFueraDeRango, ecAlta}`, o `null` si el tanque no tiene sondas (accesorio opcional). EC en mS/cm |
| `alarmasActivas()` | nombres de las alarmas en 1 (ver contrato) |
| `reglasAutomaticas()` | las reglas vigentes (JSON del contrato) |
| `audio.estado()` | `{enLinea, sonando, habilitado, volumen, escena, pista, error, config, escenas}` |
| `valor(sub)`, `numero(sub)`, `json(sub)`, `todos()` | acceso directo a cualquier dato |

**Órdenes** (todas devuelven una promesa; rechazan con un mensaje en español si algo no sirve):

| Función | Efecto |
|---|---|
| `regar(zona, segundos)` / `detenerRiego(zona)` | Riego manual de una zona |
| `ventana(n, 'open' \| 'close' \| 'stop' \| 0..100)` | Mueve una ventana |
| `salida(nombre, true \| false)` | Extractor, ventilador, luces, reserva |
| `fuenteAgua('mains' \| 'tank')` | Cambia la fuente de agua. Rechaza si hay un riego en curso. Antes de pasar a tanque, la app advierte que se necesita la bomba |
| `rearmarBomba()` | Después de una alarma de bomba (solo con tanque) |
| `refrescar()` | Pide a la tarjeta que republique todo |
| `cambiarReglas({...})` | Cambios parciales de reglas automáticas. Resuelve con `ok` o rechaza con el motivo que da la tarjeta |
| `audio.reproducir(escena?)`, `audio.detener()`, `audio.habilitar(bool)`, `audio.volumen(n)`, `audio.escena(e)`, `audio.configurar({...})` | Módulo de audio (opcional) |

Una orden aceptada por el servidor no significa que se cumplió: la app confirma con el estado (por ejemplo, `zonas()[0].valvulaAbierta`).

## Lo que esta capa garantiza

- Órdenes con QoS 1 y nunca retenidas.
- Sesión limpia y un identificador distinto por teléfono.
- Con la app en https, solo conexiones cifradas (`wss://`). Si se escribe solo el host de EMQX, completa `wss://<host>:8084/mqtt`.
- La clave queda solo en el teléfono (`localStorage`), nunca en el código. `olvidarConfiguracion()` la borra.
- Reconexión automática cada 5 s si se corta internet.
- Avisa si el firmware de la tarjeta es más antiguo que el que exige el contrato (`info().compatible`).

## Prueba automática (proyecto de hardware)

Con Mosquitto, Python (`paho-mqtt`, `playwright`) y Node:

```
cd organics/pruebas
npm install mqtt@5.15.2
mosquitto_passwd -c -b passwd app clave-app && mosquitto_passwd -b passwd gateway-inv1 clave-gw
mosquitto -c mosquitto.conf &
python3 sim_gateway.py ordenes.jsonl &
(cd ../.. && python3 -m http.server 8000 --bind 127.0.0.1 &)
python3 prueba_e2e.py
```

Abre `prueba.html` en Chromium, se conecta a una tarjeta simulada y verifica 30 puntos: datos en pantalla, órdenes, reglas aceptadas y rechazadas, fuente de agua, audio, eventos, validaciones, y que ninguna orden salga retenida.
