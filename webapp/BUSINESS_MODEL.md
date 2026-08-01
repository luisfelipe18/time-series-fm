# Modelo de negocio — Meridian

Documento interno. Define qué se vende, cómo se cobra y por qué el servicio se
entrega **únicamente por API**. Las tarifas aquí descritas son las mismas que
publica la sección IV del sitio (`frontend/i18n.js`, claves `pr.*`); si cambia
una, debe cambiar la otra.

---

## 1. Qué se vende

Se vende **la proyección, no el motor**.

El cliente envía una serie histórica y recibe una cifra proyectada con su
intervalo de confianza. No recibe pesos, ni contenedores, ni una licencia de
uso del modelo.

| Se vende | No se vende |
| -------- | ----------- |
| Acceso a la API de proyección | El modelo o sus pesos |
| Calibración sobre la historia del cliente | Instalación en infraestructura del cliente |
| Vigilancia y avisos sobre sus métricas | Código fuente del motor |
| Criterio: qué proyectar y cómo leerlo | Licencia perpetua o redistribuible |

**No hay self-hosted.** No es una omisión del catálogo: es la decisión
estructural del negocio (§6).

---

## 2. Unidad de cobro: la proyección

> **Una proyección = una serie devuelta en una respuesta de la API.**

Una llamada que envía 300 series consume 300 proyecciones, con independencia
del horizonte solicitado. Es la unidad correcta porque:

- **Es la que el cliente entiende.** "Proyecté 300 SKU este mes" es una frase
  que un gerente puede auditar contra su propia operación.
- **Escala con el valor recibido**, no con el costo de cómputo. Un cliente con
  10.000 SKU obtiene diez veces más valor que uno con 1.000, y paga en esa
  proporción.
- **No penaliza el horizonte.** Proyectar 12 meses cuesta lo mismo que
  proyectar 3. Así el cliente pide el horizonte que su negocio necesita, no el
  que le resulta barato — y horizontes largos hacen el producto más pegajoso.
- **Es verificable por ambas partes.** Se cuenta en la respuesta, no en el
  reloj ni en tokens opacos.

Las llamadas rechazadas por validación (400) no se cobran. Las de validación
histórica (*backtest*) sí: consumen el mismo cómputo.

---

## 3. Planes

| | Evaluación | Cartera | Institucional | A medida |
| --- | --- | --- | --- | --- |
| **Precio** | Sin costo, 14 días | US$ 250/mes | US$ 1.000/mes | Desde US$ 4.000/mes |
| **Proyecciones** | 500 en total | 5.000/mes | 50.000/mes | Por contrato |
| **Excedente** | — | US$ 0,04 c/u | US$ 0,02 c/u | Negociado |
| **Claves de API** | 1 | 3 | Ilimitadas | Ilimitadas |
| **Contexto / horizonte** | 512 / 30 | 2.048 / 128 | 16.384 / 512 | Sin límite práctico |
| **Variables explicativas** | — | — | Sí | Sí |
| **Vigilancia y webhooks** | — | — | Sí | Sí |
| **Calibración dedicada** | — | — | — | Sí |
| **Disponibilidad** | — | Best effort | 99,5% | 99,9% con penalización |
| **Atención** | Documentación | Correo, 2 días hábiles | 8 horas hábiles | Analista designado |

Contratación anual: se abonan **diez meses de doce**. Mejora la caja y baja la
rotación, que es el problema real de un servicio por suscripción.

### Por qué estos números

- **US$ 250** es el umbral por debajo del cual el cliente no asigna un
  responsable interno al proyecto. Un precio menor no gana clientes: gana
  curiosos que nunca integran y luego se dan de baja.
- **El salto de 4× a Institucional** se paga con una sola función:
  variables explicativas. Un minorista que puede introducir sus promociones
  en el modelo obtiene una mejora de precisión que justifica el escalón sin
  discusión.
- **El excedente se abarata al subir de plan** (0,04 → 0,02). Premia el
  compromiso y hace que el propio consumo empuje al cliente hacia el plan
  superior: al pasar de ~30.000 proyecciones, Institucional sale más barato
  que Cartera con excedentes.
- **"Desde US$ 4.000"** filtra. Quien pregunta por A medida ya decidió que
  esto es infraestructura, no un experimento.

---

## 4. Economía unitaria

El costo marginal de una proyección es **cercano a cero**; el negocio se define
por costos fijos, no por consumo.

Orden de magnitud, con cifras que deben medirse en la infraestructura real
antes de comprometerse contractualmente:

- Un motor de 200M parámetros procesa lotes con holgura. Tomando un supuesto
  deliberadamente conservador de **100 series por segundo**, una hora de
  cómputo cubre ~360.000 proyecciones.
- A una instancia con GPU de gama media (~US$ 0,40–0,60 la hora), el costo por
  proyección queda en el orden de **US$ 0,000002**. El modelo también corre en
  CPU, con lo que el piso baja todavía más.
- Frente a un precio de excedente de US$ 0,02–0,04, el margen bruto por
  proyección es, en la práctica, del ~100%.

**Consecuencia para la fijación de precios:** el costo no es el ancla. Se debe
cobrar por el valor de la decisión que la proyección habilita — un pedido de
reposición, una compra de energía, un cierre de caja — no por el ciclo de GPU
consumido. Los planes de arriba están construidos sobre esa base.

**Costos fijos mensuales estimados** (una región, sin redundancia):

| Concepto | Estimado |
| -------- | -------- |
| Cómputo de inferencia (1 instancia siempre activa) | US$ 300–450 |
| Almacenamiento, red, respaldos | US$ 30–60 |
| Observabilidad y alertas | US$ 40–80 |
| **Total** | **≈ US$ 400–600** |

**Punto de equilibrio: dos clientes Cartera, o uno Institucional.** Todo lo que
entra después es margen, hasta que el volumen obligue a una segunda instancia
—lo que ocurre muy por encima del punto en que la facturación ya la financia.

El costo que sí escala con los clientes no es el cómputo: es **la atención**.
Por eso los tiempos de respuesta están escalonados por plan y el analista
designado aparece solo en A medida.

---

## 5. Cómo entra y crece un cliente

```
Demostración pública  →  Evaluación  →  Cartera  →  Institucional  →  A medida
   (sin registro)        (14 días)      US$250      US$1.000        US$4.000+
```

1. **Demostración.** El visitante proyecta *sus propios datos* y, sobre todo,
   corre el modo Validación: ve el error medido contra su historia real. Es la
   prueba, no la promesa. El límite de 2.000 períodos y 40 cálculos por hora
   existe para que la demostración convenza sin sustituir al producto.
2. **Evaluación.** 500 proyecciones bastan para integrar y contrastar contra
   el método actual del cliente. Sin tarjeta: el objetivo es que integre, y
   pedir datos de pago antes de eso solo reduce la conversión.
3. **Cartera.** El primer contrato. Aquí el cliente automatiza un proceso que
   antes hacía en hoja de cálculo.
4. **Expansión.** Las palancas, en orden de efectividad observable:
   - **Volumen**: más SKU, más tiendas, más sensores. Ocurre solo.
   - **Variables explicativas**: la razón número uno para subir a Institucional.
   - **Vigilancia**: convierte un consumo por lotes en dependencia diaria.
   - **Calibración dedicada**: el argumento de A medida y la mayor barrera de
     salida que existe, porque el modelo ajustado a su historia no se lo lleva.

---

## 6. Por qué solo API

Cuatro razones, en orden de peso:

1. **Si se entrega el motor, se acaba el negocio.** Un modelo instalado en casa
   del cliente se paga una vez. Una API se paga cada mes, y su costo de cambio
   crece con cada integración que el cliente construye encima.
2. **Control de versión.** Una mejora del motor alcanza a todos los clientes el
   mismo día. Con instalaciones locales se terminan manteniendo cinco versiones
   distintas y el soporte se vuelve el negocio.
3. **Telemetría.** Se sabe qué series se proyectan, con qué horizontes y dónde
   el error es alto. Esa información dirige la hoja de ruta y es la materia
   prima de la calibración dedicada. Un binario instalado no informa nada.
4. **Protección de la implementación.** La arquitectura del motor no sale de la
   infraestructura propia. No hay artefacto que inspeccionar, comparar ni
   revender.

**Objeción previsible — "nuestros datos no pueden salir".** Es legítima y
frecuente en banca y salud. La respuesta no es ceder el motor, sino:

- señalar que se transmiten **series numéricas, no registros personales**: una
  columna de cantidades semanales no identifica a nadie;
- ofrecer que el cliente envíe identificadores anónimos en lugar de nombres de
  producto o de cliente;
- en A medida, ofrecer **residencia de datos** en la región que exija su
  regulador, y firmar los anexos que correspondan.

Si aun así el cliente exige el modelo dentro de su perímetro, no es cliente de
este negocio. Conviene decirlo temprano y no construir una excepción que
después haya que sostener.

---

## 7. Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Aparece una API equivalente más barata | Competir por calibración, variables explicativas y asesoría — no por precio de inferencia, donde el piso es cero para todos |
| Un cliente concentra la facturación | Límite informal: ningún cliente por encima del 25% de los ingresos antes de contratar personal fijo |
| Licencia de los pesos del modelo base | **Revisar la licencia en Hugging Face antes de facturar.** La licencia del código y la de los pesos son instrumentos distintos; esto se verifica una vez y se documenta |
| El cliente pide una precisión que el motor no da en su serie | El modo Validación se corre **antes** de firmar. Si el error medido no sirve para su caso, no se vende |
| Caída del servicio en cierre de mes | 99,5% es alcanzable con una instancia; 99,9% con penalización exige redundancia y solo se ofrece en A medida, donde el precio la financia |

---

## 8. Qué falta construir para cobrar

La demostración está terminada; el producto comercial todavía no. Lo mínimo:

- [ ] Emisión y validación de claves de API, con cuota por clave
- [ ] Medición de proyecciones por cliente y por período de facturación
- [ ] Pasarela de cobro y facturación recurrente (con excedentes)
- [ ] Endpoint de lotes para carteras grandes, asíncrono
- [ ] Webhooks de vigilancia (el motor ya calcula los intervalos que los disparan)
- [ ] Portal de cliente: consumo, claves, facturas
- [ ] Acuerdo de nivel de servicio redactado, con la definición de disponibilidad

Los tres primeros son los que separan la demostración de la primera factura.
