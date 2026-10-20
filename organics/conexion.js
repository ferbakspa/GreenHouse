/*
 * Organics One: capa de conexión de la app con la tarjeta (contrato v1.1, ver CONTRATO.md).
 *
 * La mantiene el proyecto de hardware. El proyecto de la app la USA, no la modifica: si la
 * app necesita algo que no está aquí, se pide en CONTRATO.md.
 *
 * Uso mínimo:
 *   <script src="organics/conexion.js"></script>
 *   await OrganicsOne.conectar({ servidor: 'abc123.ala.us-east-1.emqxsl.com', usuario: 'app', clave: '...' });
 *   OrganicsOne.on('ambient/temperature', v => console.log('temperatura', v));
 *   await OrganicsOne.regar(1, 600);
 *
 * Reglas que esta capa garantiza (contrato):
 *   - órdenes siempre con QoS 1 y SIN retener;
 *   - sesión limpia y client id único por teléfono;
 *   - con la página en https, solo conexiones cifradas (wss://).
 */
(function (global) {
  'use strict';

  var CONTRATO = '1.1';
  var FW_MIN = { gateway: '1.04', audio: '1.00' };
  var MQTT_CDN = 'https://unpkg.com/mqtt@5.15.2/dist/mqtt.min.js';
  var CLAVE_CFG = 'organics.conexion.v1';
  var SALIDAS = ['extractor', 'fan', 'grow_light', 'work_light', 'spare'];
  var MAX_ZONAS = 16;

  /* ------------------------------------------------------------ utilidades */
  function cargarLibreria() {
    if (global.mqtt && global.mqtt.connect) return Promise.resolve(global.mqtt);
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = MQTT_CDN;
      s.onload = function () { global.mqtt ? ok(global.mqtt) : mal(new Error('MQTT.js no cargó')); };
      s.onerror = function () { mal(new Error('No se pudo descargar MQTT.js (¿sin internet?)')); };
      document.head.appendChild(s);
    });
  }

  function leerGuardado() {
    try { return JSON.parse(global.localStorage.getItem(CLAVE_CFG)) || null; } catch (e) { return null; }
  }
  function guardar(cfg) {
    try { global.localStorage.setItem(CLAVE_CFG, JSON.stringify(cfg)); } catch (e) { /* modo privado */ }
  }
  function olvidar() {
    try { global.localStorage.removeItem(CLAVE_CFG); } catch (e) { /* nada */ }
  }

  /* "abc.emqxsl.com" -> "wss://abc.emqxsl.com:8084/mqtt"; una URL completa se respeta */
  function urlServidor(servidor) {
    var s = String(servidor || '').trim();
    if (!s) throw new Error('Falta la dirección del servidor');
    if (/^wss?:\/\//i.test(s)) return s;
    if (/^mqtts?:\/\//i.test(s)) throw new Error('Desde el navegador se usa wss://, no mqtt:// (puerto 8084)');
    return 'wss://' + s.replace(/\/+$/, '') + ':8084/mqtt';
  }

  function versionMayorIgual(v, min) {
    var a = String(v || '').split('.').map(Number), b = String(min).split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var x = a[i] || 0, y = b[i] || 0;
      if (isNaN(x)) return false;
      if (x !== y) return x > y;
    }
    return true;
  }

  /* patrón MQTT relativo al prefijo: '+' un nivel, '#' el resto, '*' todo */
  function coincide(patron, sub) {
    if (patron === '*' || patron === '#') return true;
    var p = patron.split('/'), t = sub.split('/');
    for (var i = 0; i < p.length; i++) {
      if (p[i] === '#') return true;
      if (i >= t.length) return false;
      if (p[i] !== '+' && p[i] !== t[i]) return false;
    }
    return p.length === t.length;
  }

  function aNumero(v) {
    if (v === undefined || v === null || v === '' || v === 'null') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function aJson(v) {
    if (!v) return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ estado interno */
  var cliente = null, prefijo = '', cfgActual = null;
  var valores = {};          // sub -> { v: texto, t: ms }
  var oyentes = [];          // { patron, fn }
  var oyentesConexion = [];
  var esperas = [];          // { sub, ok, timer }
  var conectado = false, ultimoError = null, ultimaActualizacion = 0;

  function infoConexion() {
    var gi = aJson(valor('gateway/info')) || {};
    var ai = aJson(valor('audio/info')) || {};
    return {
      conectado: conectado,
      tarjetaEnLinea: valor('gateway/status') === 'online',
      audioEnLinea: valor('audio/status') === 'online',
      fwGateway: gi.fw || null,
      fwAudio: ai.fw || null,
      compatible: gi.fw ? versionMayorIgual(gi.fw, FW_MIN.gateway) : null,
      contrato: CONTRATO,
      invernadero: cfgActual ? cfgActual.invernadero : null,
      ultimaActualizacion: ultimaActualizacion || null,
      error: ultimoError
    };
  }

  function avisarConexion() {
    var st = infoConexion();
    oyentesConexion.slice().forEach(function (fn) { try { fn(st); } catch (e) { console.error(e); } });
  }

  /* órdenes que la propia app publica: el servidor las devuelve (suscripción a #) y no son estado */
  function esOrden(sub) {
    return /\/set$/.test(sub) || ['pump/reset', 'gateway/refresh', 'gateway/restart', 'audio/play', 'audio/stop',
      'audio/rescan', 'audio/refresh', 'audio/restart'].indexOf(sub) >= 0;
  }

  function alLlegar(topic, payload, paquete) {
    if (topic.indexOf(prefijo) !== 0) return;
    var sub = topic.slice(prefijo.length);
    if (esOrden(sub)) return;
    var v = payload.toString();
    var ahora = Date.now();
    valores[sub] = { v: v, t: ahora };
    ultimaActualizacion = ahora;
    var info = { retenido: !!(paquete && paquete.retain), hora: ahora };
    oyentes.slice().forEach(function (o) {
      if (coincide(o.patron, sub)) { try { o.fn(v, sub, info); } catch (e) { console.error(e); } }
    });
    esperas = esperas.filter(function (w) {
      if (w.sub !== sub) return true;
      clearTimeout(w.timer); w.ok(v); return false;
    });
    if (sub === 'gateway/status' || sub === 'gateway/info' || sub === 'audio/status' || sub === 'audio/info') avisarConexion();
  }

  function valor(sub) { return valores[sub] ? valores[sub].v : undefined; }

  /* ------------------------------------------------------------ publicar órdenes */
  function publicar(sub, payload) {
    if (!cliente || !conectado) return Promise.reject(new Error('Sin conexión con el servidor'));
    return new Promise(function (ok, mal) {
      cliente.publish(prefijo + sub, String(payload), { qos: 1, retain: false }, function (err) {
        err ? mal(err) : ok();
      });
    });
  }

  function esperarRespuesta(sub, ms) {
    return new Promise(function (ok, mal) {
      var w = { sub: sub, ok: ok };
      w.timer = setTimeout(function () {
        esperas = esperas.filter(function (x) { return x !== w; });
        mal(new Error('La tarjeta no respondió (¿está en línea?)'));
      }, ms);
      esperas.push(w);
    });
  }

  function ordenConRespuesta(sub, payload, subRespuesta) {
    var espera = esperarRespuesta(subRespuesta, 10000);
    return publicar(sub, payload).then(function () { return espera; }).then(function (r) {
      if (/^ok/i.test(r)) return r;
      throw new Error(r.replace(/^error:\s*/i, '') || 'rechazado');
    });
  }

  function entero(x, min, max, nombre) {
    var n = Number(x);
    if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) throw new Error(nombre + ' debe ser un entero entre ' + min + ' y ' + max);
    return n;
  }
  function rechazo(fn) {
    try { return fn(); } catch (e) { return Promise.reject(e); }
  }

  /* ------------------------------------------------------------ API pública */
  var API = {
    CONTRATO: CONTRATO,

    /* cfg: { servidor, usuario, clave, invernadero='invernadero1', recordar=true }.
       Sin cfg usa la configuración guardada. Resuelve al conectar; rechaza con el motivo. */
    conectar: function (cfg) {
      cfg = cfg || leerGuardado();
      if (!cfg) return Promise.reject(new Error('Falta configurar la conexión'));
      var c = {
        servidor: cfg.servidor, usuario: cfg.usuario || '', clave: cfg.clave || '',
        invernadero: (cfg.invernadero || 'invernadero1').trim(), recordar: cfg.recordar !== false
      };
      return rechazo(function () {
        if (/[\/+#\s]/.test(c.invernadero)) throw new Error('El nombre del invernadero no puede tener espacios ni / + #');
        var url = urlServidor(c.servidor);
        if (global.location && global.location.protocol === 'https:' && /^ws:\/\//i.test(url))
          throw new Error('La app está en https: el servidor debe ser wss:// (cifrado)');
        API.desconectar();
        cfgActual = c;
        prefijo = 'greenhouse/' + c.invernadero + '/';
        valores = {};
        ultimoError = null;
        return cargarLibreria().then(function (mqtt) {
          return new Promise(function (ok, mal) {
            var primera = true;
            cliente = mqtt.connect(url, {
              username: c.usuario || undefined, password: c.clave || undefined,
              clientId: 'app-' + Math.random().toString(16).slice(2, 10),
              clean: true, keepalive: 60, protocolVersion: 4,
              reconnectPeriod: 5000, connectTimeout: 15000
            });
            cliente.on('connect', function () {
              conectado = true; ultimoError = null;
              cliente.subscribe(prefijo + '#', { qos: 1 });
              if (c.recordar) guardar(c);
              avisarConexion();
              if (primera) { primera = false; ok(infoConexion()); }
            });
            cliente.on('message', alLlegar);
            cliente.on('close', function () { if (conectado) { conectado = false; avisarConexion(); } });
            cliente.on('error', function (e) {
              ultimoError = (e && e.message) || String(e);
              if (/not authorized|bad user/i.test(ultimoError)) ultimoError = 'Usuario o clave incorrectos';
              avisarConexion();
              if (primera) { primera = false; API.desconectar(); mal(new Error(ultimoError)); }
            });
            setTimeout(function () {
              if (primera) { primera = false; API.desconectar(); mal(new Error('No se pudo conectar al servidor (revisa la dirección)')); }
            }, 20000);
          });
        });
      });
    },

    desconectar: function () {
      if (cliente) { try { cliente.end(true); } catch (e) { /* nada */ } }
      cliente = null;
      if (conectado) { conectado = false; avisarConexion(); }
    },

    configuracionGuardada: function () {
      var c = leerGuardado();
      return c ? { servidor: c.servidor, usuario: c.usuario, invernadero: c.invernadero, recordar: c.recordar } : null;
    },
    olvidarConfiguracion: olvidar,

    info: infoConexion,
    onConexion: function (fn) {
      oyentesConexion.push(fn);
      return function () { oyentesConexion = oyentesConexion.filter(function (f) { return f !== fn; }); };
    },

    /* fn(valor, sub, {retenido, hora}). patrón relativo: 'ambient/temperature', 'zone/+/soil1', 'alarm/#', '*' */
    on: function (patron, fn) {
      var o = { patron: patron, fn: fn };
      oyentes.push(o);
      Object.keys(valores).forEach(function (sub) {           // entrega lo que ya se sabe
        if (coincide(patron, sub)) { try { fn(valores[sub].v, sub, { retenido: true, hora: valores[sub].t }); } catch (e) { console.error(e); } }
      });
      return function () { oyentes = oyentes.filter(function (x) { return x !== o; }); };
    },

    valor: valor,
    numero: function (sub) { return aNumero(valor(sub)); },
    json: function (sub) { return aJson(valor(sub)); },
    todos: function () {
      var r = {};
      Object.keys(valores).sort().forEach(function (k) { r[k] = { valor: valores[k].v, hora: valores[k].t }; });
      return r;
    },

    /* ---- vistas armadas a partir del contrato ---- */
    ambiente: function () {
      return {
        temperatura: aNumero(valor('ambient/temperature')), humedad: aNumero(valor('ambient/humidity')),
        vpd: aNumero(valor('ambient/vpd')), co2: aNumero(valor('ambient/co2')), luz: aNumero(valor('ambient/light')),
        hojaMojada: aNumero(valor('ambient/leaf_wetness'))
      };
    },
    zonas: function () {
      var n = (aJson(valor('gateway/info')) || {}).zones;
      var lista = [];
      for (var i = 1; i <= MAX_ZONAS; i++) {
        var p = 'zone/' + i + '/';
        if ((n && i > n) || (!n && valor(p + 'online') === undefined)) continue;
        var s1 = aNumero(valor(p + 'soil1')), s2 = aNumero(valor(p + 'soil2'));
        var validos = [s1, s2].filter(function (x) { return x !== null; });
        var riego = aJson(valor(p + 'irrigation')) || { state: 'closed', remaining_s: 0 };
        lista.push({
          zona: i, enLinea: valor(p + 'online') === '1',
          suelo1: s1, suelo2: s2,
          suelo: validos.length ? Math.round(validos.reduce(function (a, b) { return a + b; }, 0) / validos.length * 10) / 10 : null,
          valvulaAbierta: valor(p + 'valve') === '1', riego: riego,
          caudal: aNumero(valor(p + 'flow')), volumen: aNumero(valor(p + 'volume')),
          banderas: aNumero(valor(p + 'flags')) || 0,
          topeAutomatico: valor('alarm/zone' + i + '_auto_limit') === '1'
        });
      }
      return lista;
    },
    ventanas: function () {
      var lista = [];
      for (var i = 1; i <= 5; i++) {
        var p = 'window/' + i + '/';
        if (valor(p + 'position') === undefined) continue;
        lista.push({ ventana: i, posicion: aNumero(valor(p + 'position')), estado: valor(p + 'state'), alarma: valor(p + 'alarm') });
      }
      return lista;
    },
    salidas: function () {
      var r = {};
      SALIDAS.forEach(function (s) { var v = valor('output/' + s + '/state'); if (v !== undefined) r[s] = v === 'on'; });
      return r;
    },
    /* fuente: 'mains' (red, sin bomba) o 'tank' (tanque con bomba). Sin dato (firmware < 1.04) asume 'tank'.
       Con 'mains', la app oculta tanque, flotador y bomba. */
    agua: function () {
      var fuente = valor('water/source') || (aJson(valor('gateway/info')) || {}).water || 'tank';
      return {
        fuente: fuente, conTanque: fuente !== 'mains',
        tanque: aNumero(valor('tank/level')), flotador: valor('tank/float') || null,
        bomba: valor('pump/state') || null, corrienteBomba: aNumero(valor('pump/current')),
        caudal: aNumero(valor('flow/main')), volumen: aNumero(valor('flow/main_volume'))
      };
    },
    alarmasActivas: function () {
      return Object.keys(valores).filter(function (k) { return k.indexOf('alarm/') === 0 && valores[k].v === '1'; })
        .map(function (k) { return k.slice(6); }).sort();
    },
    reglasAutomaticas: function () { return aJson(valor('gateway/auto')); },

    /* ---- órdenes al Gateway (QoS 1, nunca retenidas) ---- */
    regar: function (zona, segundos) {
      return rechazo(function () {
        return publicar('zone/' + entero(zona, 1, MAX_ZONAS, 'La zona') + '/irrigation/set', entero(segundos, 0, 7200, 'Los segundos'));
      });
    },
    detenerRiego: function (zona) { return API.regar(zona, 0); },
    ventana: function (n, accion) {
      return rechazo(function () {
        var v = accion;
        if (typeof v === 'number') v = entero(v, 0, 100, 'La apertura');
        else if (['open', 'close', 'stop'].indexOf(v) < 0) throw new Error('La ventana acepta open, close, stop o 0 a 100');
        return publicar('window/' + entero(n, 1, 5, 'La ventana') + '/set', v);
      });
    },
    salida: function (nombre, encendida) {
      return rechazo(function () {
        if (SALIDAS.indexOf(nombre) < 0) throw new Error('Salida desconocida: ' + nombre);
        return publicar('output/' + nombre + '/set', encendida ? 'on' : 'off');
      });
    },
    /* cambia la fuente de agua; la tarjeta la rechaza si hay un riego abierto o en cola */
    fuenteAgua: function (fuente) {
      return rechazo(function () {
        if (fuente !== 'mains' && fuente !== 'tank') throw new Error('La fuente de agua es mains (red) o tank (tanque)');
        return ordenConRespuesta('water/source/set', fuente, 'water/source/result').catch(function (e) {
          if (/riego en curso/i.test(e.message)) throw new Error('Hay un riego en curso. Deténgalo y vuelva a intentar');
          throw e;
        });
      });
    },
    rearmarBomba: function () { return publicar('pump/reset', '1'); },
    refrescar: function () { return publicar('gateway/refresh', '1'); },
    /* cambios parciales de reglas; resuelve con "ok" o rechaza con el motivo que da la tarjeta */
    cambiarReglas: function (cambios) {
      return rechazo(function () {
        if (!cambios || typeof cambios !== 'object') throw new Error('Las reglas van como objeto');
        return ordenConRespuesta('gateway/auto/set', JSON.stringify(cambios), 'gateway/auto/result');
      });
    },

    /* ---- módulo de audio (opcional) ---- */
    audio: {
      estado: function () {
        return {
          enLinea: valor('audio/status') === 'online', sonando: valor('audio/state') === 'playing',
          habilitado: valor('audio/enabled') === '1', volumen: aNumero(valor('audio/volume')),
          escena: valor('audio/scene') || null, pista: valor('audio/track') || '',
          error: valor('audio/error') || '', config: aJson(valor('audio/config')),
          escenas: ((aJson(valor('audio/info')) || {}).scenes) || []
        };
      },
      habilitar: function (si) { return ordenConRespuesta('audio/enabled/set', si ? 'on' : 'off', 'audio/result'); },
      reproducir: function (escena) { return ordenConRespuesta('audio/play', escena || '', 'audio/result'); },
      detener: function () { return ordenConRespuesta('audio/stop', '1', 'audio/result'); },
      volumen: function (n) { return rechazo(function () { return ordenConRespuesta('audio/volume/set', entero(n, 0, 100, 'El volumen'), 'audio/result'); }); },
      escena: function (e) { return ordenConRespuesta('audio/scene/set', String(e), 'audio/result'); },
      configurar: function (cambios) { return ordenConRespuesta('audio/config/set', JSON.stringify(cambios || {}), 'audio/result'); }
    }
  };

  global.OrganicsOne = API;
})(typeof window !== 'undefined' ? window : this);
