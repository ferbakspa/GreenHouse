# Guía de formularios de Play Console · My GreenHouse Planner

Respuestas sugeridas para **Panel → Configurar tu app** (en Play Console aparece como "Contenido de la app"). Revisa cada una antes de enviar, porque las declaraciones son responsabilidad del desarrollador.

## 1. Crear la app
| Campo | Respuesta |
|---|---|
| Nombre | My GreenHouse Planner |
| Idioma predeterminado | Español (Latinoamérica) (es-419) |
| ¿App o juego? | App |
| ¿Gratis o de pago? | Gratis (la app gratuita no se puede cambiar después a de pago; las compras dentro de la app sí se pueden agregar más adelante) |
| Declaraciones | Las aceptas tú (Políticas del programa para desarrolladores y leyes de exportación de EE. UU.) |

## 2. Política de privacidad
https://ferbakspa.github.io/GreenHouse/privacy.html

## 3. Acceso a la app
**Toda la funcionalidad está disponible sin restricciones especiales.** La app no tiene inicio de sesión.
Nota opcional para el revisor: "Las funciones de sensores y control requieren la tarjeta física Organics One, que es opcional. El resto de la app funciona sin ella."

## 4. Anuncios
**No, mi app no contiene anuncios.** (Cambiar a "Sí" cuando se agregue la publicidad del plan gratuito.)

## 5. Clasificación del contenido
- Categoría: **Utilidad, productividad, comunicación u otra**.
- Todas las preguntas de violencia, contenido sexual, lenguaje, drogas, apuestas: **No**.
- ¿Los usuarios pueden interactuar o intercambiar contenido entre ellos? **No** (compartir por WhatsApp o correo lo hace el sistema del teléfono, no hay contenido entre usuarios dentro de la app).
- ¿Comparte la ubicación del usuario con otros usuarios? **No**.
- ¿Permite compras digitales? **No** (por ahora).
- Resultado esperado: apta para todo público (PEGI 3 / Everyone).

## 6. Público objetivo
- Edades: **18 años o más**. Evita que la app quede bajo la política de Familias, que tiene requisitos extra.
- ¿Puede atraer a niños sin querer? **No**.

## 7. Seguridad de los datos
Google cuenta como "recopilado" todo dato que sale del teléfono, aunque nosotros no lo guardemos.

| Pregunta | Respuesta |
|---|---|
| ¿La app recopila o comparte datos de usuario? | **Sí** |
| ¿Datos cifrados en tránsito? | **Sí** (todo va por https o wss) |
| ¿Los usuarios pueden pedir que se borren sus datos? | Indicar que los datos se guardan en el dispositivo y se borran al limpiar los datos de la app o desinstalarla |

**Tipos de datos a declarar:**

| Tipo | Recopilado | Compartido | Para qué | ¿Opcional? |
|---|---|---|---|---|
| Ubicación aproximada | Sí | No | Funcionalidad de la app (clima) | Sí, se puede escribir la ciudad a mano |
| Ubicación precisa (GPS) | Sí | No | Funcionalidad de la app (clima) | Sí, el permiso se puede rechazar |

- "Compartido" va en **No** porque Open-Meteo e ipwho.is solo prestan el servicio de clima y ubicación (Google los considera proveedores de servicio, no se cuenta como compartir).
- No hay cuentas, ni analítica, ni publicidad, ni datos de contacto, ni archivos, ni salud, ni pagos.

**Pendiente de confirmar por Nano:** el servidor MQTT de la tarjeta Organics One (EMQX), ¿lo opera Aidex o cada cliente el suyo? Si lo opera Aidex, hay que declarar también **"Otros datos de la app"** (lecturas de sensores y órdenes de riego), recopilados para funcionalidad, y agregar un párrafo en la política de privacidad.

## 8. Otras declaraciones
| Formulario | Respuesta |
|---|---|
| App gubernamental | No |
| Funciones financieras | Mi app no ofrece funciones financieras |
| Salud | Mi app no tiene funciones de salud |
| App de noticias | No |
| ID de publicidad | No usa el ID de publicidad |

## 9. Ficha de la tienda
Textos en `store/ficha-google-play.md`.
- Icono: `icons/play-store-512.png` (512 × 512)
- Imagen destacada: `store/feature-graphic-es.png` y `store/feature-graphic-en.png` (1024 × 500)
- Capturas de teléfono: `store/screenshots/es/` y `store/screenshots/en/` (6 de 1080 × 1920)

## 10. Publicación
1. Esperar la aprobación de la cuenta de organización y las 72 horas.
2. Cambiar el nombre visible del desarrollador a **Aidex Technologies**.
3. Prueba → **Prueba interna**: subir el `.aab` del ZIP de PWABuilder (versión 2, 1.0.1), agregarte como probador e instalar desde el enlace.
4. Si todo está bien, **Producción → Crear versión** con el mismo `.aab` y enviar a revisión. La primera revisión suele tardar unos días.
5. Después de publicar, revisar que la app abra sin barra de dirección (eso confirma que el archivo assetlinks.json coincide con la llave de firma).
