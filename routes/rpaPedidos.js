var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var sequelize = require("../models/sequelizeConnection");
var sequelizeFin700 = require("../models/sequelizeFin700");
const showLog = require("../middleware/showLog");
const { chromium } = require('playwright');
require("dotenv").config({ path: "variables.env" });

const cron = require('node-cron');


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
    await frame.locator('#ctl11_Filtrofolio').selectOption('0');
    await page.waitForTimeout(1000);

    await frame.locator('#ctl11_PedidoMaterialIdDesde').fill(nroPedido.toString());
    await frame.locator('#ctl11_PedidoMaterialIdDesde').press('Tab');

    // selecciona Empresa
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').click();
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').fill(empId.toString());
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('Tab');



    // pausa de 1 segundo
    await page.waitForTimeout(1000);
    await frame.getByRole('button', { name: 'Buscar' }).click();


    // espera a que los resultados se carguen

    await frame.getByRole('link', { name: nroPedido.toString() }).click();

    await page.waitForTimeout(1000);

    const locator = page.locator('body > div.k-widget.k-window > div.k-window-titlebar.k-hstack > div > a > span');

    // locator.count() es inmediato
    if (await locator.count() > 0 && await locator.isVisible()) {
        await locator.click();
        console.log('Se hizo clic en el elemento.');
    } else {
        console.log('Pedido Libre');
    }


    await frame.getByRole('link', { name: 'Ver Documentos Fisicos' }).click();
    const frameBorder = await page.locator('#sntPopupWindow1793216257977 > iframe').contentFrame();

    // Busca cualquier elemento cuyo ID *termine* en TabDocumentosAsociados
    const enlace = frameBorder.locator('[id$="TabDocumentosAsociados"] tr.DataGridItem td:nth-child(2) a');

    if (await enlace.count() > 0) {
        await enlace.click();
        console.log('Se hizo clic con éxito.');
    } else {
        console.log('Elemento no encontrado');
    }
    console.log('Proceso de pedido finalizado.');

}

exports.RpaPedidoRoutes = router;
exports.reprogramaRpaPedidos = reprograma;
