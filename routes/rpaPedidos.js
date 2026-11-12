var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var sequelize = require("../models/sequelizeConnection");
var sequelizeFin700 = require("../models/sequelizeFin700");
const showLog = require("../middleware/showLog");
const rpaPedidos = require("../models/rpaPedidos");
const { chromium } = require('playwright');
require("dotenv").config({ path: "variables.env" });

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI, Type } = require('@google/genai');
const readXlsxFile = require('read-excel-file/node');
const { ok } = require("assert");



const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


const urlfin700 = process.env.urlfin700;
const uidfin700 = process.env.uidfin700;
const pwdfin700 = process.env.pwdfin700;
const timeZone = process.env.TIMEZONE;


const permisos = {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

router.options("*", async function (req, res) {
    showLog(req, res);
    res.set("Access-Control-Allow-Origin", permisos.origin);
    res.set("Access-Control-Allow-Methods", permisos.methods);
    res.set("Access-Control-Allow-Headers", permisos.allowedHeaders);
    res.send();
});

let browser = null;
let page = null;

router.get("/pedidos/:nroPedido", cors(), async function (req, res) {
    showLog(req, res);
    const { nroPedido } = req.params;
    try {
        await procesaData(nroPedido);
        res.status(200).json({ message: "Pedido procesado" });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


router.post("/agendaCron", cors(), async function (req, res) {
    showLog(req, res);
    const { nroPedido } = req.body;

    let diaCron = "";
    if (req.body.data.dia == 0) {
        diaCron = "0-6";
    } else {
        diaCron = (Number(req.body.data.dia) - 1).toString();
    }

    let taskdata = {
        dia: diaCron,
        hora: req.body.data.hora,
        minuto: req.body.data.minuto,
        sessionID: req.sessionID,
        nroPedido: req.body.data.nroPedido
    }


    try {
        let cronTime = req.body.data.minuto + ' ' + req.body.data.hora + ' * * ' + diaCron
        var job = cron.schedule(cronTime, async function () {
            console.log('Inicio Ejecución Programada RPA Pedidos' + req.body.data.hora + ':' + req.body.data.minuto + '/' + diaCron);
            await procesaData(taskdata.nroPedido);
        }, {
            scheduled: true,
            timezone: timeZone
        });
        var item = {
            aplicacion: 'APIPedidos', username: req.session.username,
            hora: req.body.data.hora, minuto: req.body.data.minuto,
            taskdata: JSON.stringify(taskdata), res: ''
        }
        task.create(item)
            .then(datanew => {
                global.tjobs.push({ id: datanew.idTask, job: job });
                console.log('tarea guardada');
            })
            .catch(err => {
                console.log(err);
            });
        res.status(200).json({ message: "Task scheduled successfully" });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

var reprograma = function (taskdata, idTask) {
    var job = cron.schedule(
        taskdata.minuto + " " + taskdata.hora + " * * " + taskdata.dia,
        function () {
            console.log(
                "Inicio Ejecución Programada RPA " +
                taskdata.hora +
                ":" +
                taskdata.minuto +
                " / " +
                taskdata.dia
            );
            procesaData(taskdata.nroPedido);
        },
        {
            scheduled: true,
            timezone: timeZone,
        }
    );
    global.tjobs.push({ id: idTask, job: job });
};

async function getPedidos(nroPedido) {
    const query = `
    SELECT PedCab.pEmpId EmpId, PedCab.PedidoMaterialId AS NumPedido, PedCab.pListaPreCabId as ListaPrecios 
    FROM Adqt_ProcesoCompraCab Cab 
    INNER JOIN AdqT_ProcesoCompraDet ProDet ON Cab.ProCompraCabId = ProDet.pProCompraCabId 
    INNER JOIN LogT_PedidoMaterialDet PedDet ON ProDet.pPedidoMaterialDetId = PedDet.PedidoMaterialDetId 
    INNER JOIN LogT_PedidoMaterialCab PedCab ON PedDet.pPedidoMaterialId = PedCab.PedidoMaterialId 
    INNER JOIN Usu_Usuarios Usu ON PedCab.UsuarioProceso = Usu.ID_USUARIO 
    WHERE Cab.ConEstCod = 1 
      AND Cab.UsuarioProceso = 'RPAADQ'
      and (PedCab.PedidoMaterialId = ${nroPedido} or ${nroPedido} = 0)
    GROUP BY PedCab.pEmpId, PedCab.PedidoMaterialId, PedCab.pListaPreCabId`.replace(/[\r\n]+/g, " ");


    let data = await sequelizeFin700.query(query);
    return data[0];
}


const procesaData = async (nroPedido) => {
    //nroPedido = 1644900;
    let NroDePedidos = await getPedidos(nroPedido);
    browser = await chromium.launch({ headless: false });
    page = await browser.newPage();

    await page.goto(urlfin700);

    try {
        await loginFin700();
        console.log("Login successful");

        await navegaMenus();
        for (let pedido of NroDePedidos) {
            await procesaPedido(pedido.EmpId, pedido.NumPedido, pedido.ListaPrecios);
        }
        console.log("Finished processing all pedidos.");
        await browser.close();

    } catch (error) {
        console.log(error.message);
        //res.status(500).json({ error: "Internal Server Error" });
        console.log("Error during scheduled task: " + error.message);
        await browser.close();
    }

}

//npx playwright codegen https://ejemplo.com
async function loginFin700() {
    // Implement the login logic here

    const uidInput = page.locator('#ctl02_TxtIdPersona');
    await uidInput.fill(uidfin700);
    const pwdInput = page.locator('#ctl02_TxtClave');
    await pwdInput.fill(pwdfin700);

    const botonSubmit = page.locator('#func0');
    await botonSubmit.click();

}

async function navegaMenus() {
    // Implement the navigation logic here
    await page.getByText('Transacciones').click();
    await page.getByText('Adquisiciones').click();
    await page.getByText('Preparación de Compras').click();
    await page.getByRole('link', { name: 'Pedidos por Compra' }).click();

    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();
    await frame.getByRole('button', { name: 'Buscar' }).click();
}

async function procesaPedido(empId, nroPedido, listaPrecios) {
    // Implement the logic to process a single pedido here

    const frame = await page.locator('iframe[name="iframe_body"]').contentFrame();


    // selecciona Folio
    console.log(`Selecciona tipo de selección de pedido`);
    await frame.locator('#ctl11_Filtrofolio').selectOption('0');
    await page.waitForTimeout(1000);

    console.log(`Llenando el campo Folio con: ${nroPedido}`);
    await frame.locator('#ctl11_PedidoMaterialIdDesde').fill(nroPedido.toString());
    await frame.locator('#ctl11_PedidoMaterialIdDesde').press('Tab');

    // selecciona Empresa
    console.log(`Selecciona Empresa con ID: ${empId}`);
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').click();
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').fill(empId.toString());
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('Tab');



    // pausa de 1 segundo
    await page.waitForTimeout(1000);
    console.log(`Haciendo clic en el botón Buscar`);
    await frame.getByRole('button', { name: 'Buscar' }).click();


    // espera a que los resultados se carguen

    console.log(`Haciendo clic en el enlace del pedido ${nroPedido}`);
    await frame.getByRole('link', { name: nroPedido.toString() }).click();

    await page.waitForTimeout(1000);
    console.log(`Esperando a que se cargue el pedido ${nroPedido}`);
    await page.waitForTimeout(1000);



    console.log(`Verificando si el documento está en uso`);

    const locatorDocEnUso = page.locator('body > div.k-widget.k-window > div.k-window-titlebar.k-hstack > div > a > span');
    if (await locatorDocEnUso.count() > 0 && await locatorDocEnUso.isVisible()) {
        await locatorDocEnUso.click();
        console.log('Se hizo clic en el elemento.');
    } else {
        console.log('Pedido Libre');
    }
    console.log(`Continuando con el procesamiento del pedido ${nroPedido}`);

    const totalPedido = await frame.locator('//*[@id="ctl11_TotalPedidoCompra"]').inputValue();
    const totalPedidoFloat = parseFloat(totalPedido);
    const monedaPedido = await frame.locator('//*[@id="ctl11_Label20"]').textContent();


    console.log(`Accediendo a la sección de Documentos Fisicos`);
    await frame.getByRole('link', { name: 'Ver Documentos Fisicos' }).click();
    await page.waitForTimeout(2000);

    const frameBorder = await page.locator('xpath=/html/body/div[6]/div[2]/iframe').contentFrame();
    const cantidadTr = await frameBorder.locator('#ctl11_TabDocumentosAsociados > tbody > tr').count();


    if (cantidadTr > 2) {
        for (let i = 2; i <= cantidadTr - 1; i++) {
            await procesaLineaDocumentos(empId, nroPedido, i, totalPedidoFloat, monedaPedido);
        }
        console.log(`Se procesaron ${cantidadTr - 2} líneas de documentos físicos.`);
        await page.waitForTimeout(1000);
    } else {
        console.log(`No hay líneas de documentos físicos para procesar.`);

        let porValidar = true;
        let okParaOC = false;
        if (listaPrecios != 0) {
            porValidar = false;
            okParaOC = true;
        }

        await rpaPedidos.create({
            empId: empId,
            nroPedido: nroPedido,
            archivo: '',
            iaRut: '',
            iaTotal: 0,
            iaMoneda: '',
            porValidar: porValidar,
            okRut: false,
            okTotal: false,
            okMoneda: false,
            okParaOC: okParaOC,
            NroOc: 0,
            totalPedido: totalPedidoFloat,
            monedaPedido: monedaPedido
        });
    }

    await page.click('body > div.k-widget.k-window > div.k-window-titlebar.k-hstack > div > a');

    console.log(`Proceso de pedido ${nroPedido} finalizado.`);

    await page.waitForTimeout(1000);
    await frame.locator('xpath=//*[@id="ctl11_btnVolver"]').click();

}

const procesaLineaDocumentos = async (empId, nroPedido, linea, totalPedidoFloat, monedaPedido) => {
    const frameBorder = await page.locator('xpath=/html/body/div[6]/div[2]/iframe').contentFrame();
    console.log(`frameBorder ${await frameBorder.locator('body').count()}`);
    const enlaceImagen = await frameBorder.locator(`xpath=//*[@id="ctl11_TabDocumentosAsociados"]/tbody/tr[${linea}]/td[2]/a/p/img`);
    console.log(`Buscando enlace de imagen en Documentos Fisicos`);
    if (await enlaceImagen.count() > 0) {
        console.log(`Enlace de imagen encontrado, haciendo clic...`);
        await enlaceImagen.click();
        console.log('Se hizo clic con éxito.');
    } else {
        console.log('Elemento no encontrado');
    }
    await page.waitForTimeout(2000);


    const downloadFolder = path.join(__dirname, '../downloads');
    if (!fs.existsSync(downloadFolder)) {
        fs.mkdirSync(downloadFolder, { recursive: true });
    }

    const iframeBorder2 = page.frameLocator('iframe.k-content-frame[src*="ucExiDocumentoFisicoMostrar"]');
    try {
        console.log("Extrayendo la URL del documento desde el atributo onclick...");

        // 1. Obtenemos el valor del atributo onclick de la imagen o del enlace contenedor
        //const linkElement = iframeBorder2.locator('img[src*="d1.gif"]').locator('xpath=ancestor::a');
        const linkElement = iframeBorder2.locator(`xpath=//*[@id="ctl11_TabDocumentosAsociados"]/tbody/tr[${linea}]/td[2]/a/p/img`).locator('xpath=ancestor::a');
        const onclickAttr = await linkElement.getAttribute('onclick');

        //console.log("Atributo onclick capturado:", onclickAttr);
        console.log("Atributo onclick capturado:");

        // 2. Extraemos la URL que está dentro de sntWindowOpen('...') usando una expresión regular
        const match = onclickAttr.match(/sntWindowOpen\(['"]([^'"]+)['"]/);

        if (!match || !match[1]) {
            throw new Error("No se pudo extraer la URL del visor en el atributo onclick.");
        }

        const relativeUrl = match[1];

        // 3. Construimos la URL absoluta basada en la URL actual de la página
        const baseCurrentUrl = page.url();
        const baseUrl = baseCurrentUrl.substring(0, baseCurrentUrl.lastIndexOf('/') + 1);
        const pdfUrl = baseUrl + relativeUrl;

        //console.log("URL absoluta del documento:", pdfUrl);
        console.log("URL absoluta del documento:");

        // 4. Descargamos el archivo usando las cookies de sesión actuales de Playwright
        const cookies = await page.context().cookies();
        const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        const response = await axios.get(pdfUrl, {
            headers: { Cookie: cookieHeader },
            responseType: 'arraybuffer'
        });

        const appFileName = await iframeBorder2.locator(`xpath=//*[@id="ctl11_TabDocumentosAsociados"]/tbody/tr[${linea}]/td[1]`).innerText();
        const extensionFileName = appFileName.split('.').pop().trim();
        const baseFileName = appFileName.replace(`.${extensionFileName}`, '').trim();

        // 5. Definimos un nombre y guardamos el archivo físicamente
        const fileName = `${baseFileName}_${Date.now()}.${extensionFileName}`;
        const savePath = path.join(downloadFolder, fileName);

        fs.writeFileSync(savePath, response.data);
        console.log(`¡Archivo guardado exitosamente en: ${savePath}`);

        await rpaPedidos.create({
            empId: empId,
            nroPedido: nroPedido,
            archivo: fileName,
            iaRut: '',
            iaTotal: 0,
            iaMoneda: '',
            porValidar: true,
            okRut: false,
            okTotal: false,
            okMoneda: false,
            okParaOC: false,
            NroOc: 0,
            totalPedido: totalPedidoFloat,
            monedaPedido: monedaPedido
        });
        console.log("Registro almacenado en Sequelize correctamente.");
    } catch (e) {
        console.log("El modal probablemente se cerró tras el clic:", e.message);
    }

    await page.waitForTimeout(1000);
    await page.click('body > div:nth-child(9) > div.k-window-titlebar.k-hstack > div > a');

}

// Validador de pedidos
const INTERVALO_SEGUNDOS = 15;
setInterval(async () => {
    await ValidarPedidos();
}, INTERVALO_SEGUNDOS * 1000);

let validandoPedidos = false;

const ValidarPedidos = async () => {
    try {
        // Aquí iría la lógica para validar los pedidos pendientes
        const sql = `SELECT top 1 * FROM rpaPedidos WHERE porValidar = 1`;
        const pendientes = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        for (const pedido of pendientes) {
            console.log(`Validando pedido ID: ${pedido.id}`);
            await encolaValidacion(pedido);
        }
        // Ejemplo: podrías consultar la base de datos y procesar los pedidos que necesiten validación
    } catch (e) {
        console.log("Error al validar pedidos:", e.message);
    }

}

const encolaValidacion = async (pedido) => {
    // Aquí iría la lógica para encolar la validación del pedido
    console.log(`Encolando validación para pedido ID: ${pedido.id}`);
    if (validandoPedidos) {
        return;
    }
    validandoPedidos = true;
    try {
        // Aquí iría la lógica para procesar la validación del pedido
        let listaPrecios = await getDataFin700(pedido);

        console.log(`Validando pedido ID: ${pedido.id}`);
        // Simulación de procesamiento
        const extension = pedido.archivo.split('.').pop();
        if (extension === 'pdf') {
            await iaParaPdf(pedido, listaPrecios);
        } else if (extension === 'jpg' || extension === 'jpeg' || extension === 'png') {
            await iaParaImagen(pedido, listaPrecios);
        } else if (extension === 'xlsx' || extension === 'xls') {
            await iaParaExcel(pedido, listaPrecios);
        } else {
            await iaSinArchivoValido(pedido, listaPrecios);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`Pedido ID: ${pedido.id} validado correctamente.`);
    } catch (e) {
        console.log(`Error al validar pedido ID: ${pedido.id}:`, e.message);
    } finally {
        validandoPedidos = false;
    }
}

const getDataFin700 = async (pedido) => {
    // Lógica para obtener datos de Fin700
    console.log(`Obteniendo datos de Fin700 para pedido ID: ${pedido.id}`);
    const sql = `
        SELECT 
            PedCab.pEmpId EmpId, 
            PedCab.PedidoMaterialId AS NumPedido, 
            isNull(Ent.EntRut, '') AS EntRut, 
            PedDet.pMonedaId, 
            RTRIM(Mon.MonSimbolo) AS MonSimbolo,
            PedCab.pListaPreCabId AS ListaPrecios,
            sum(PedDet.ValorUniOpeMoneda * PedDet.Cantidad) TotalPedido 
        FROM Adqt_ProcesoCompraCab Cab 
        INNER JOIN AdqT_ProcesoCompraDet ProDet ON Cab.ProCompraCabId = ProDet.pProCompraCabId 
        INNER JOIN LogT_PedidoMaterialDet PedDet ON ProDet.pPedidoMaterialDetId = PedDet.PedidoMaterialDetId 
        INNER JOIN LogT_PedidoMaterialCab PedCab ON PedDet.pPedidoMaterialId = PedCab.PedidoMaterialId 
        INNER JOIN Usu_Usuarios Usu ON PedCab.UsuarioProceso = Usu.ID_USUARIO 
        LEFT JOIN GlbT_Entidad Ent ON Ent.EntId = PedDet.pEntId
        INNER JOIN GlbT_Monedas Mon ON Mon.MonedaId = PedDet.pMonedaId
        WHERE --Cab.ConEstCod = 1 
        --AND 
        Cab.UsuarioProceso = 'RPAADQ'
        AND PedCab.pEmpId = ${pedido.empId}
        AND PedCab.PedidoMaterialId = ${pedido.nroPedido}
        GROUP BY 
            PedCab.pEmpId, 
            PedCab.PedidoMaterialId, 
            Ent.EntRut, 
            PedDet.pMonedaId, 
            Mon.MonSimbolo,
            PedCab.pListaPreCabId;
`;
    const result = await sequelizeFin700.query(sql, { type: sequelize.QueryTypes.SELECT });
    const data = result[0];
    await rpaPedidos.update(
        { rutPedido: limpiaRut(data.EntRut), totalPedido: data.TotalPedido, monedaPedido: data.MonSimbolo },
        { where: { empid: pedido.empId, nroPedido: pedido.nroPedido } }
    );
    return data.ListaPrecios;

}

const limpiaRut = (rut) => {
    //return rut;
    if (rut === null || rut === undefined) return rut;

    rut = rut.replace(/\./g, '');

    const rutTexto = String(rut).trim();
    if (rutTexto === "") return rutTexto;

    const [cuerpoOriginal, dv] = rutTexto.split("-");
    const cuerpo = cuerpoOriginal.replace(/^0+/, "") || "0";

    return dv !== undefined ? `${cuerpo}-${dv}` : cuerpo;
};


const iaParaExcel = async (pedido, listaPrecios) => {
    // Lógica para procesar Excel
    console.log(`Procesando Excel para pedido ID: ${pedido.id}`);
    const carpetaExcel = 'downloads';
    const archivoExcel = `${carpetaExcel}/${pedido.archivo}`;
    const rutaCsvTemporal = await convertirExcelACsvTemporal(archivoExcel);
    const fileBuffer = fs.readFileSync(rutaCsvTemporal);
    const filePart = {
        inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: 'text/csv' // 'application/pdf', 'image/jpeg', etc.
        },
    };
    await AIGoogle(filePart, pedido, listaPrecios);
}

async function convertirExcelACsvTemporal(rutaExcel) {
    const contenido = await readXlsxFile(rutaExcel, { sheet: 1 });
    const rows = Array.isArray(contenido[0])
        ? contenido
        : Array.isArray(contenido[0]?.data)
            ? contenido[0].data
            : [];

    if (rows.length === 0) {
        throw new Error('No se pudo leer contenido tabular del archivo Excel.');
    }

    const rutaCsvTemporal = rutaExcel.replace(/\.(xlsx|xls)$/i, '.tmp.csv');
    const csv = rows
        .map((row) => row.map((valor) => formatearValorCsv(valor)).join(','))
        .join('\n');

    fs.writeFileSync(rutaCsvTemporal, csv, 'utf8');
    return rutaCsvTemporal;
}

function formatearValorCsv(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    const texto = String(valor);

    if (/[",\n\r]/.test(texto)) {
        return `"${texto.replace(/"/g, '""')}"`;
    }

    return texto;
}


const iaParaImagen = async (pedido, listaPrecios) => {
    // Lógica para procesar imagen
    const carpetaPdf = 'downloads';
    const archivoExcel = `${carpetaPdf}/${pedido.archivo}`;
    const fileBuffer = fs.readFileSync(archivoExcel);
    const filePart = {
        inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: 'image/jpeg' // 'application/pdf', 'image/jpeg', etc.
        },
    };
    await AIGoogle(filePart, pedido, listaPrecios);

}

const iaSinArchivoValido = async (pedido, listaPrecios) => {
    // Lógica para manejar archivos no válidos
    if (listaPrecios != 0) {
        okParaOC = true;
    } else {
        okParaOC = false;
    }
    const [rowsUpdated] = await rpaPedidos.update(
        {
            iaRut: '',
            iaTotal: 0,
            iaMoneda: '',
            porValidar: false,
            okParaOC: okParaOC
        },
        {
            where: {
                id: pedido.id // Condición: actualiza solo el registro con id 15
            }
        }
    );
    console.log(`Archivo no válido para pedido ID: ${pedido.id}`);
}

const iaParaPdf = async (pedido, listaPrecios) => {
    // Lógica para procesar Excel
    console.log(`Procesando Excel para pedido ID: ${pedido.id}`);
    const carpetaPdf = 'downloads';
    const archivoExcel = `${carpetaPdf}/${pedido.archivo}`;
    const fileBuffer = fs.readFileSync(archivoExcel);
    const filePart = {
        inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: 'application/pdf' // 'application/pdf', 'image/jpeg', etc.
        },
    };
    await AIGoogle(filePart, pedido, listaPrecios);

}

const AIGoogle = async (filePart, pedido, listaPrecios) => {
    //const prompt = "Analiza este documento y extrae el RUT de la empresa emisora, el monto total y el tipo de moneda. Para pesos devuelve $, para dolar devuelve US$, para UF devueve UF. Devuelve la información en formato JSON.";
    const EXTRACTION_PROMPT = `
Analiza el documento adjunto y extrae los siguientes datos: 
el RUT de la empresa emisora, el monto total y el tipo de moneda.
indicador si o no si el documento tiene una firma electrónica avanzada legalmente válida.
indicador si o no si el documento tiene una firma manuscrita.
email del contacto de la empresa emisora, si no hay disponible devuelve una cadena vacía ("").

Aplica las siguientes reglas de normalización:
- Para tipo de moneda CLP, $, PESOS (o variaciones similares): devuelve "$".
- Para tipo de moneda US$, USD, dólar, dls: devuelve "US$".
- Para tipo de moneda UF: devuelve "UF".

Excepciones:
- Si no viene el RUT en el documento, devuelve una cadena vacía ("") en ese campo.

Para el campo "total", si no viene en el documento, devuelve 0.
Para el campo "total", si viene un valor neto usarlo en lugar del total.


Devuelve estrictamente un objeto JSON válido con la siguiente estructura exacta (sin texto adicional ni bloques markdown fuera del JSON si vas a parsearlo automáticamente):
{
  "rut": "...",
  "total": 0,
  "moneda": "...",
  "firmaElectronica": "si/no",
  "firmaManuscrita": "si/no",
  "email": "..."
}
`;


    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', // Rápido, económico y excelente con imágenes/PDFs
        contents: [filePart, EXTRACTION_PROMPT],
        config: {
            // Forzamos la respuesta a un JSON con la estructura exacta
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    rut: { type: Type.STRING, description: "RUT chileno o identificador fiscal" },
                    total: { type: Type.NUMBER, description: "Monto total de la transacción" },
                    moneda: { type: Type.STRING, description: "Código de moneda, ej: $, US$ o UF" },
                    firmaElectronica: { type: Type.STRING, description: "si/no" },
                    firmaManuscrita: { type: Type.STRING, description: "si/no" },
                    email: { type: Type.STRING, description: "Email del contacto de la empresa emisora" },
                },
                required: ["rut", "total", "moneda", "firmaElectronica", "firmaManuscrita", "email"],
            },
        },
    });
    console.log(`Respuesta IA para pedido ID: ${pedido.id}:`, response.text);
    let dataIa;
    try {
        dataIa = JSON.parse(response.text);
        const [rowsUpdated] = await rpaPedidos.update(
            {
                iaRut: limpiaRut(dataIa.rut),
                iaTotal: dataIa.total,
                iaMoneda: dataIa.moneda,
                iaFirmaElectronica: dataIa.firmaElectronica,
                iaFirmaManuscrita: dataIa.firmaManuscrita,
                iaEmail: dataIa.email
            },
            {
                where: {
                    id: pedido.id // Condición: actualiza solo el registro con id 15
                }
            }
        );
    } catch (e) {
        console.log(`Error al parsear la respuesta IA para pedido ID: ${pedido.id}:`, e.message);
    }

    const dataPedido = await rpaPedidos.findOne({
        where: {
            id: pedido.id
        }
    });

    if (dataPedido) {
        const okContacto = await validaEmail(dataPedido); // Suponiendo que existe una función validaEmail que retorna true si el email es válido

        const cantidadContactos = await getCantidadContactos(dataPedido);
        const okRut = dataPedido.rutPedido == dataPedido.iaRut && dataPedido.rutPedido !== null && dataPedido.rutPedido !== "";
        const okTotal = dataPedido.totalPedido == dataPedido.iaTotal;
        const okMoneda = dataPedido.monedaPedido == dataPedido.iaMoneda;

        let okParaOC = okRut && okTotal && okMoneda && okContacto;
        if (listaPrecios != 0) {
            okParaOC = true;
        }

        await rpaPedidos.update(
            {
                okRut,
                okTotal,
                okMoneda,
                okParaOC: okParaOC,
                okContacto: okContacto,
                porValidar: false,
                cantidadContactos: cantidadContactos
            },
            {
                where: {
                    id: dataPedido.id
                }
            }
        );
    }

}

async function validaEmail(dataPedido) {
    if (dataPedido.rutPedido === null || dataPedido.rutPedido === "") return false;

    //formatear el RUT con 10 digitos para el numero agregando ceros a la izquierda mas un guion y su digito verificador
    const rutSinDigito = dataPedido.rutPedido.split('-')[0];
    const digitoVerificador = dataPedido.rutPedido.split('-')[1];
    let rutPedido = rutSinDigito.padStart(10, '0') + '-' + digitoVerificador;

    const sql = `select ec.EntConMail from
                glbt_entidad en join 
                glbt_entidadsucursal es on en.entid = es.pentid and es.EntSucNumero >= 1 join
                GlbT_EntidadSucursalContacto esc on esc.pEntSucId = es.EntSucId join
                GlbT_EntidadContacto ec on ec.pEntId = en.entid and ec.EntConId = esc.pEntConId
                where en.entrut = '${rutPedido}'`;

    const result = await sequelizeFin700.query(sql, { type: sequelize.QueryTypes.SELECT });
    // Si no hay resultados, el contacto no es válido
    if (result.length === 0) return false;

    // Si hay un solo contacto en fin700 es suficiente para considerar el email válido
    if (result.length === 1) return true;

    // Si hay más de un contacto, se valida que el email de dataPedido esté entre ellos
    if (result.length > 1) {

        if (!dataPedido.iaEmail) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValidEmail = emailRegex.test(dataPedido.iaEmail);


        // buscar si está dataPedido.iaEmail en los resultados
        if (isValidEmail) {
            const emailExists = result.some(row => row.EntConEmail === dataPedido.iaEmail);
            if (emailExists) return true;
        }
        return false;
    }
    return false;
}


async function getCantidadContactos(dataPedido) {
    if (dataPedido.rutPedido === null || dataPedido.rutPedido === "") return 0;

    const rutSinDigito = dataPedido.rutPedido.split('-')[0];
    const digitoVerificador = dataPedido.rutPedido.split('-')[1];
    let rutPedido = rutSinDigito.padStart(10, '0') + '-' + digitoVerificador;

    const sql = `select ec.EntConMail from
                glbt_entidad en join 
                glbt_entidadsucursal es on en.entid = es.pentid and es.EntSucNumero >= 1 join
                GlbT_EntidadSucursalContacto esc on esc.pEntSucId = es.EntSucId join
                GlbT_EntidadContacto ec on ec.pEntId = en.entid and ec.EntConId = esc.pEntConId
                where en.entrut = '${rutPedido}'`;

    const result = await sequelizeFin700.query(sql, { type: sequelize.QueryTypes.SELECT });
    return result.length;
}


exports.RpaPedidoRoutes = router;
exports.reprogramaRpaPedidos = reprograma;
