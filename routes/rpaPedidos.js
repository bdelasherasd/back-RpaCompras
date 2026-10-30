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
    SELECT PedCab.pEmpId EmpId, PedCab.PedidoMaterialId AS NumPedido 
    FROM Adqt_ProcesoCompraCab Cab 
    INNER JOIN AdqT_ProcesoCompraDet ProDet ON Cab.ProCompraCabId = ProDet.pProCompraCabId 
    INNER JOIN LogT_PedidoMaterialDet PedDet ON ProDet.pPedidoMaterialDetId = PedDet.PedidoMaterialDetId 
    INNER JOIN LogT_PedidoMaterialCab PedCab ON PedDet.pPedidoMaterialId = PedCab.PedidoMaterialId 
    INNER JOIN Usu_Usuarios Usu ON PedCab.UsuarioProceso = Usu.ID_USUARIO 
    WHERE Cab.ConEstCod = 1 
      AND Cab.UsuarioProceso = 'RPAADQ'
      and (PedCab.PedidoMaterialId = ${nroPedido} or ${nroPedido} = 0)
    GROUP BY PedCab.pEmpId, PedCab.PedidoMaterialId`.replace(/[\r\n]+/g, " ");


    let data = await sequelizeFin700.query(query);
    return data[0];
}


const procesaData = async (nroPedido) => {
    nroPedido = 1644900;
    let NroDePedidos = await getPedidos(nroPedido);
    browser = await chromium.launch({ headless: false });
    page = await browser.newPage();

    await page.goto(urlfin700);

    try {
        await loginFin700();
        console.log("Login successful");

        await navegaMenus();
        for (let pedido of NroDePedidos) {
            await procesaPedido(pedido.EmpId, pedido.NumPedido);
        }

    } catch (error) {
        console.log(error.message);
        //res.status(500).json({ error: "Internal Server Error" });
        console.log("Error during scheduled task: " + error.message);
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

async function procesaPedido(empId, nroPedido) {
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


    console.log(`Accediendo a la sección de Documentos Fisicos`);
    await frame.getByRole('link', { name: 'Ver Documentos Fisicos' }).click();
    await page.waitForTimeout(2000);

    const frameBorder = await page.locator('xpath=/html/body/div[6]/div[2]/iframe').contentFrame();
    const cantidadTr = await frameBorder.locator('#ctl11_TabDocumentosAsociados > tbody > tr').count();
    for (let i = 2; i <= cantidadTr - 1; i++) {
        await procesaLineaDocumentos(empId, nroPedido, i);
    }
    console.log(`Se procesaron ${cantidadTr - 2} líneas de documentos físicos.`);
    await page.waitForTimeout(1000);
    await page.click('body > div.k-widget.k-window > div.k-window-titlebar.k-hstack > div > a');

    console.log(`Proceso de pedido ${nroPedido} finalizado.`);

}

const procesaLineaDocumentos = async (empId, nroPedido, linea) => {
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
            iaTotal: 0
        });
        console.log("Registro almacenado en Sequelize correctamente.");
    } catch (e) {
        console.log("El modal probablemente se cerró tras el clic:", e.message);
    }

    await page.waitForTimeout(1000);
    await page.click('body > div:nth-child(9) > div.k-window-titlebar.k-hstack > div > a');

}

exports.RpaPedidoRoutes = router;
exports.reprogramaRpaPedidos = reprograma;
