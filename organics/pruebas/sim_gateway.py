"""Gateway Organics One simulado (contrato v1.0) para probar organics/conexion.js.
Registra cada orden recibida (topic, payload, retain) en ordenes.jsonl."""
import json, sys, threading, time
import paho.mqtt.client as mqtt

P = "greenhouse/invernadero1/"
REG = sys.argv[1] if len(sys.argv) > 1 else "ordenes.jsonl"
estado = {}
reglas = {"active": 1, "zones": [{"zone": 1, "soil": {"on": 0, "min": 35, "duration_s": 600, "wait_min": 60, "max_day": 6, "from_h": 0, "to_h": 0}, "schedule": []},
                                 {"zone": 2, "soil": {"on": 0, "min": 35, "duration_s": 600, "wait_min": 60, "max_day": 6, "from_h": 0, "to_h": 0}, "schedule": []}],
          "vent": {"on": 0, "open_c": 28, "close_c": 25, "open_pct": 100, "open_rh": 0}, "fan": {"on": 0, "on_c": 30, "off_c": 28},
          "light": {"on": 0, "from": "06:00", "to": "22:00"}, "manual_pause_min": 60, "tz": "<-04>4<-03>,M9.1.6/24,M4.1.6/24"}

c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="gateway-sim")
c.username_pw_set("gateway-inv1", "clave-gw")
c.will_set(P + "gateway/status", "offline", qos=1, retain=True)


def pub(sub, v, ret=True):
    estado[sub] = str(v)
    c.publish(P + sub, str(v), qos=1, retain=ret)


def publicar_todo():
    pub("gateway/status", "online")
    pub("gateway/info", json.dumps({"fw": "1.03", "ip": "192.168.1.40", "network": "ethernet", "uptime_s": 120, "free_heap": 120000, "zones": 2, "time": "2026-10-19 16:40", "auto": 1}))
    for z, (s1, s2) in {1: ("31.5", "33.1"), 2: ("48.0", "null")}.items():
        pub(f"zone/{z}/online", "1"); pub(f"zone/{z}/soil1", s1); pub(f"zone/{z}/soil2", s2)
        pub(f"zone/{z}/valve", estado.get(f"zone/{z}/valve", "0")); pub(f"zone/{z}/flags", "0")
        pub(f"zone/{z}/flow", "0.00"); pub(f"zone/{z}/volume", "12.5")
        pub(f"zone/{z}/irrigation", estado.get(f"zone/{z}/irrigation", '{"state":"closed","remaining_s":0}'))
    for k, v in {"temperature": "23.4", "humidity": "71.0", "vpd": "0.84", "co2": "612", "light": "15400", "leaf_wetness": "12"}.items():
        pub("ambient/" + k, v)
    pub("tank/level", "80"); pub("tank/float", "ok"); pub("pump/state", "off"); pub("flow/main", "0.00"); pub("flow/main_volume", "40.2")
    for n in range(1, 6):
        pub(f"window/{n}/position", estado.get(f"window/{n}/position", "0")); pub(f"window/{n}/state", "stopped"); pub(f"window/{n}/alarm", "none")
    for o in ["extractor", "fan", "grow_light", "work_light", "spare"]:
        pub(f"output/{o}/state", estado.get(f"output/{o}/state", "off"))
    for a in ["pod_offline", "tank_low", "pump_dry_run", "zone1_offline", "zone2_offline"]:
        pub("alarm/" + a, "0")
    pub("gateway/auto", json.dumps(reglas))
    pub("audio/status", "online"); pub("audio/state", "stopped"); pub("audio/enabled", "1"); pub("audio/volume", "60")
    pub("audio/info", json.dumps({"fw": "1.00", "scenes": ["selva", "lluvia"], "tracks": 4}))


def al_conectar(cl, ud, fl, rc, props=None):
    cl.subscribe(P + "#", qos=1)
    publicar_todo()


def al_mensaje(cl, ud, m):
    sub = m.topic[len(P):]
    v = m.payload.decode()
    es_orden = sub.endswith("/set") or sub in ("pump/reset", "gateway/refresh", "audio/play", "audio/stop")
    if not es_orden:
        return
    with open(REG, "a") as f:
        f.write(json.dumps({"sub": sub, "v": v, "retain": bool(m.retain), "qos": m.qos}) + "\n")
    if sub.startswith("zone/") and sub.endswith("/irrigation/set"):
        z = sub.split("/")[1]; s = int(v) if v.isdigit() else 0
        pub(f"zone/{z}/valve", "1" if s else "0")
        pub(f"zone/{z}/irrigation", json.dumps({"state": "open" if s else "closed", "remaining_s": s}))
        pub("auto/event", json.dumps({"zone": int(z), "action": "irrigate", "reason": "soil", "soil": 31.5, "duration_s": 600, "state": "open"}), False)
    elif sub.startswith("window/"):
        n = sub.split("/")[1]; pos = {"open": 100, "close": 0}.get(v, int(v) if v.isdigit() else None)
        if pos is not None: pub(f"window/{n}/position", pos)
    elif sub.startswith("output/"):
        pub(sub.replace("/set", "/state"), v)
    elif sub == "gateway/auto/set":
        try:
            j = json.loads(v)
            vent = j.get("vent", {})
            if "open_c" in vent and "close_c" in vent and vent["close_c"] > vent["open_c"] - 1:
                raise ValueError("vent: close_c debe ser al menos 1 C menor que open_c")
            for k in ("vent", "fan", "light"):
                if k in j: reglas[k].update(j[k])
            if "active" in j: reglas["active"] = j["active"]
            pub("gateway/auto", json.dumps(reglas)); pub("gateway/auto/result", "ok", False)
        except Exception as e:
            pub("gateway/auto/result", "error: " + str(e), False)
    elif sub == "gateway/refresh":
        publicar_todo()
    elif sub.startswith("audio/"):
        if sub == "audio/play": pub("audio/state", "playing")
        if sub == "audio/stop": pub("audio/state", "stopped")
        if sub == "audio/enabled/set": pub("audio/enabled", "1" if v == "on" else "0")
        pub("audio/result", "ok", False)


def eventos():
    time.sleep(3)
    pub("auto/event", json.dumps({"zone": 1, "action": "irrigate", "reason": "soil", "soil": 31.5, "duration_s": 600, "state": "open"}), False)


c.on_connect = al_conectar
c.on_message = al_mensaje
c.connect("127.0.0.1", 1883, 30)
threading.Thread(target=eventos, daemon=True).start()
c.loop_forever()
