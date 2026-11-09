var express = require("express");
const router = express.Router();
const { chromium } = require('playwright'); // Assuming Playwright is used for browser automation
// var cors = require("cors");
var sequelize = require("../models/sequelizeConnection");
var sequelizeFin700 = require("../models/sequelizeFin700");
const { get } = require("selenium-webdriver/http");
// const showLog = require("../middleware/showLog");
// const rpaPedidos = require("../models/rpaPedidos");
// const { chromium } = require('playwright');
// require("dotenv").config({ path: "variables.env" });

// const cron = require('node-cron');
// const fs = require('fs');
// const path = require('path');

// const timeZone = process.env.TIMEZONE;


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

//let browser = null;
//let page = null;


// Validador de pedidos
const INTERVALO_SEGUNDOS = 15;
setInterval(async () => {
    await GenerarOrdenCompra();
}, INTERVALO_SEGUNDOS * 1000);

let generandoOrdenCompra = false;

const GenerarOrdenCompra = async () => {
    if (generandoOrdenCompra) return;
    generandoOrdenCompra = true;
    try {
        const sql = `SELECT top 1 * FROM rpaPedidos WHERE NroOc = 0 and okParaOc = 1 and porValidar = 0`;
        const pendientes = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        for (const pedido of pendientes) {
            console.log(`Iniciando generación de orden de compra para pedido ID: ${pedido.id}`);
            await encolaProcesoOrden(pedido);
        }

    } catch (error) {
        console.error("Error generando orden de compra:", error);
    } finally {
        generandoOrdenCompra = false;
    }
}

const encolaProcesoOrden = async (pedido) => {
    const urlfin700 = process.env.urlfin700;
    try {
        browser = await chromium.launch({ headless: false });
        page = await browser.newPage();

        await page.goto(urlfin700, { timeout: 5000 });

        await loginFin700();
        console.log("Login successful");
        await navegaMenus(pedido);
        await generarOrdenCompra(pedido);
        await apruebaOrdenCompra(pedido);
    } catch (error) {
        console.error(`Error procesando orden de compra para pedido ID: ${pedido.id}`, error);
    } finally {
        if (browser) {
            await browser.close();
        }
        browser = null;
        page = null;
    }
}

async function loginFin700() {
    // Implement the login logic here
    try {
        const uidfin700 = process.env.uidfin700;
        const pwdfin700 = process.env.pwdfin700;

        const uidInput = page.locator('#ctl02_TxtIdPersona');
        await uidInput.fill(uidfin700);
        const pwdInput = page.locator('#ctl02_TxtClave');
        await pwdInput.fill(pwdfin700);

        const botonSubmit = page.locator('#func0');
        await botonSubmit.click();
    } catch (error) {
        console.error("Error during login:", error);
        throw error;
    }
}

async function navegaMenus(pedido) {
    try {
        // Implement the navigation logic here
        await page.getByText('Transacciones').click({ timeout: 5000 });
        await page.getByText('Adquisiciones').click({ timeout: 5000 });
        await page.getByText('Preparación de Compras').click({ timeout: 5000 });
        await page.getByRole('link', { name: 'Proceso de Compras' }).click();

        await page.waitForLoadState('load');

        let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();

        await frame.locator('#ctl11_EmpRazonSocial_EmpRazonSocial_texto').click();
        await frame.locator('#ctl11_EmpRazonSocial_EmpRazonSocial_texto').press('ControlOrMeta+a');
        await frame.locator('#ctl11_EmpRazonSocial_EmpRazonSocial_texto').fill(pedido.empId.toString());
        await frame.locator('#ctl11_EmpRazonSocial_EmpRazonSocial_texto').press('Tab');

        await frame.getByRole('button', { name: 'Nuevo' }).click({ timeout: 2000 });
        // esperar a que cargue la página y este lista
        await page.waitForLoadState('load');
    } catch (error) {
        console.error(`Error navegando menús para pedido ID: ${pedido.id}`, error);
        throw error;
    }
}

async function generarOrdenCompra(pedido) {
    // Implement the logic to generate the purchase order here
    console.log(`Generando orden de compra para pedido ID: ${pedido.id}`);

    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();
    await page.waitForTimeout(3000);



    await frame.locator('#ctl11_FiltroPedido').selectOption('0');

    // seleccionar el pedido desde
    await frame.locator('#ctl11_PedidoDesde').fill(pedido.nroPedido.toString());
    await frame.locator('#ctl11_PedidoDesde').press('Tab');

    await frame.locator('#ctl11_BtnBuscar').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_ChkTodos').check();

    await page.waitForTimeout(1000);

    const botonGuardar = frame.locator('#ctl11_BtnGuardar');
    await botonGuardar.waitFor({ state: 'visible' });
    await botonGuardar.click();
    await page.waitForLoadState('load');

    const botonAdjudicar = frame.locator('#ctl11_BtnAdjudicar');
    await botonAdjudicar.waitFor({ state: 'visible' });
    await botonAdjudicar.click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').click();
    await page.waitForLoadState('load');
    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').fill('1');
    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').press('Tab');

    const botonGeneraOC = frame.locator('#ctl11_btnGeneraOC');
    await botonGeneraOC.waitFor({ state: 'visible' });
    await botonGeneraOC.click();
    await page.waitForLoadState('load');


    await frame.locator('body > div.k-widget.k-window > div.k-window-titlebar.k-hstack > div > a').click();
    await page.waitForLoadState('load');

    console.log(`Orden de compra generada para pedido ID: ${pedido.id}`);
}

const apruebaOrdenCompra = async (pedido) => {

    await page.getByText('Administración de Compras').click({ timeout: 5000 });
    await page.getByRole('link', { name: 'Orden de Compra' }).click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').click();
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').fill(pedido.entId.toString());
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('Tab');

    await frame.locator('#ctl11_FiltroFolio').selectOption('0');

    let nroOc = await getNroOc(pedido);

    // seleccionar el pedido desde
    await frame.locator('#ctl11_OcCabIdDesde').fill(nroOc.toString());
    await frame.locator('#ctl11_OcCabIdDesde').press('Tab');

    // Click the search button to find the order
    await frame.locator('#ctl11_BtnBuscar').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_TabOC_div > table > tbody > tr.DataGridItem > td:nth-child(5) > a').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_hylContactos').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_TabContactos > tbody > tr.DataGridItem > td:nth-child(1) > a').click();
    await page.waitForLoadState('load');

    await frame.locator('#lnk10').click();
    await page.waitForLoadState('load');

    await frame.locator('#mmlink0').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_btnVolver').click();
    await page.waitForLoadState('load');

    const visador = process.env.visador;

    await frame.locator('#ctl11_txtNombre').click();
    await frame.locator('#ctl11_txtNombre').press('ControlOrMeta+a');
    await frame.locator('#ctl11_txtNombre').fill(visador);
    await frame.locator('#ctl11_txtNombre').press('Tab');

    await frame.locator('#ctl11_BtnBuscar').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_TablaPaginada1_rbl_0').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_btnSeleccionar').click();
    await page.waitForLoadState('load');

    await frame.locator('#btn1').click();
    await page.waitForLoadState('load');



}

const getNroOc = async (pedido) => {
    // Implement the logic to get the order number based on the pedido object
    // This is a placeholder implementation and should be replaced with actual logic

    const sql =
        `SELECT ocCabId FROM adqt_occab 
      WHERE pempid = ${pedido.empId}
        AND usuarioProceso = '${process.env.uidfin700}'
        AND numSolicitud = ${pedido.nroPedido}`;

    let result = await sequelizeFin700.query(sql, { type: sequelize.QueryTypes.SELECT });
    if (result.length > 0) {
        return result[0].ocCabId;
    }

    return null; // Return null if no order number is found 
}

module.exports = router;
