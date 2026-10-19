"""Prueba de punta a punta: prueba.html + conexion.js en Chromium contra Mosquitto y el Gateway simulado."""
import json, os, sys, time
from playwright.sync_api import sync_playwright

E = os.path.dirname(os.path.abspath(__file__))
MQTT_LOCAL = os.path.join(E, "node_modules/mqtt/dist/mqtt.min.js")   # npm install mqtt@5.15.2 en esta carpeta
URL = "http://127.0.0.1:8000/organics/prueba.html"
REG = os.path.join(E, "ordenes.jsonl")
fallas, total = [], 0


def check(cond, msg):
    global total
    total += 1
    if not cond:
        fallas.append(msg); print("FALLA:", msg)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errores = []
    pg.on("pageerror", lambda e: errores.append(str(e)))
    pg.route("https://unpkg.com/mqtt@5.15.2/dist/mqtt.min.js",
             lambda r: r.fulfill(path=MQTT_LOCAL, content_type="application/javascript"))
    pg.goto(URL)

    # validaciones locales, sin conexión
    r = pg.evaluate("""async () => {
      const out = {};
      try { await OrganicsOne.regar(1, 60); } catch (e) { out.sinConexion = e.message; }
      try { await OrganicsOne.conectar({servidor:'mqtt://x', invernadero:'a'}); } catch (e) { out.mqttScheme = e.message; }
      try { await OrganicsOne.conectar({servidor:'x', invernadero:'mi invernadero'}); } catch (e) { out.espacio = e.message; }
      return out; }""")
    check("Sin conexión" in r.get("sinConexion", ""), "orden sin conexión debe rechazarse")
    check("wss://" in r.get("mqttScheme", ""), "mqtt:// debe pedir wss://")
    check("espacios" in r.get("espacio", ""), "invernadero con espacio debe rechazarse")

    # clave mala
    pg.fill("#servidor", "ws://127.0.0.1:9001"); pg.fill("#usuario", "app"); pg.fill("#clave", "mala")
    pg.click("#btnConectar")
    pg.wait_for_function("document.getElementById('errConexion').textContent.length > 0", timeout=25000)
    check("incorrectos" in pg.text_content("#errConexion"), "clave mala: " + pg.text_content("#errConexion"))

    # conexión correcta
    pg.fill("#clave", "clave-app"); pg.click("#btnConectar")
    pg.wait_for_selector("text=Tarjeta en línea", timeout=15000)
    pg.wait_for_selector("text=Firmware 1.03", timeout=5000)
    time.sleep(0.6)
    check("23.4 °C" in pg.text_content("#ambiente"), "temperatura en tarjeta de ambiente")
    check("612 ppm" in pg.text_content("#ambiente"), "CO2 en ambiente")
    z = pg.text_content("#zonas")
    check("Zona 1" in z and "Zona 2" in z and "Zona 3" not in z, "solo 2 zonas según gateway/info")
    check("32.3 %" in z, "promedio de suelo zona 1 (31.5 y 33.1): " + z[:120])
    check("48.0 %" in z, "zona 2 con un solo sensor")
    info = pg.evaluate("OrganicsOne.info()")
    check(info["compatible"] is True and info["invernadero"] == "invernadero1", "info de conexión")
    check(pg.evaluate("localStorage.getItem('organics.conexion.v1') !== null"), "configuración recordada")

    # órdenes
    pg.click("button[data-z='1'][data-s='60']")
    pg.wait_for_selector("text=Regando, quedan 1 min", timeout=5000)
    pg.click("button[data-v='2'][data-a='open']")
    pg.wait_for_selector("text=Ventana 2: 100 %", timeout=5000)
    pg.click("button[data-o='fan']")
    pg.wait_for_selector("text=Ventilador: encendido", timeout=5000)
    pg.click("#btnRearmar")
    time.sleep(0.5)

    # reglas: error de la tarjeta y luego ok
    pg.fill("#reglas", '{"vent":{"open_c":20,"close_c":24}}'); pg.click("#btnEnviarReglas")
    pg.wait_for_function("document.getElementById('errReglas').textContent.includes('close_c')", timeout=12000)
    pg.fill("#reglas", '{"vent":{"on":1,"open_c":29,"close_c":26}}'); pg.click("#btnEnviarReglas")
    pg.wait_for_function("document.getElementById('reglas').value.includes('\"open_c\": 29')", timeout=12000)
    check(pg.text_content("#errReglas") == "", "reglas válidas sin error")
    pg.fill("#reglas", "no es json"); pg.click("#btnEnviarReglas")
    check("JSON" in pg.text_content("#errReglas"), "JSON inválido detectado en la app")

    # audio opcional
    check(pg.is_visible("#secAudio"), "panel de audio visible con módulo en línea")
    pg.click("#btnAudioPlay")
    pg.wait_for_selector("text=sonando", timeout=12000)

    # eventos no retenidos
    pg.wait_for_function("document.getElementById('registro').textContent.includes('auto/event')", timeout=8000)

    # validaciones de argumentos con conexión
    r = pg.evaluate("""async () => { const o = {};
      try { await OrganicsOne.ventana(1, 'abrir'); } catch (e) { o.v = e.message; }
      try { await OrganicsOne.regar(1, 99999); } catch (e) { o.r = e.message; }
      try { await OrganicsOne.salida('bomba', true); } catch (e) { o.s = e.message; }
      return o; }""")
    check("open, close" in r.get("v", ""), "ventana con acción inválida")
    check("segundos" in r.get("r", ""), "riego fuera de rango")
    check("desconocida" in r.get("s", ""), "salida inexistente")

    reg = pg.text_content("#registro")
    check(reg.count("auto/event") == 1, "un evento por orden de riego: " + str(reg.count("auto/event")))
    todos = pg.text_content("#todos")
    check("irrigation/set" not in todos and "pump/reset" not in todos, "las órdenes propias no se guardan como estado")
    check(not errores, "errores de JavaScript: " + "; ".join(errores))
        b.close()

# lo que recibió el Gateway simulado
ordenes = [json.loads(l) for l in open(REG)]
subs = [o["sub"] for o in ordenes]
check("zone/1/irrigation/set" in subs and "window/2/set" in subs and "output/fan/set" in subs and "pump/reset" in subs, "órdenes recibidas: " + str(subs))
check(all(not o["retain"] for o in ordenes), "ninguna orden retenida")
check(all(o["qos"] == 1 for o in ordenes), "todas las órdenes con QoS 1")
check(any(o["sub"] == "zone/1/irrigation/set" and o["v"] == "60" for o in ordenes), "riego de 60 s")
print(f"{total} verificaciones, {len(fallas)} fallas")
sys.exit(1 if fallas else 0)
