var express = require("express");
const router = express.Router();
const { chromium } = require('playwright'); // Assuming Playwright is used for browser automation
// var cors = require("cors");
var sequelize = require("../models/sequelizeConnection");
var sequelizeFin700 = require("../models/sequelizeFin700");
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

    // 1. Esperar a que la tabla sea visible en la página
    // const tablaPedidos = page.locator('#ctl11_TabPedidos');
    // await tablaPedidos.waitFor({ state: 'visible' });

    // // 2. Esperar específicamente a que aparezcan las filas de datos (tr con clase DataGridItem o DataGridAlternatingItem)
    // await page.locator('#ctl11_TabPedidos tr.DataGridItem, #ctl11_TabPedidos tr.DataGridAlternatingItem').first().waitFor({ state: 'visible' });

    // console.log('¡La tabla de pedidos tiene datos cargados!');



    await frame.locator('#ctl11_FiltroPedido').selectOption('0');

    // seleccionar el pedido desde
    await frame.locator('#ctl11_PedidoDesde').fill(pedido.nroPedido.toString());
    await frame.locator('#ctl11_PedidoDesde').press('Tab');

    await frame.locator('#ctl11_BtnBuscar').click();

    await frame.locator('#ctl11_ChkTodos').check();

    await page.waitForTimeout(1000);

    const botonGuardar = frame.locator('#ctl11_BtnGuardar');
    await botonGuardar.waitFor({ state: 'visible' });
    await botonGuardar.click();

    const botonAdjudicar = frame.locator('#ctl11_BtnAdjudicar');
    await botonAdjudicar.waitFor({ state: 'visible' });
    await botonAdjudicar.click();

    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').click();
    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').fill('1');
    await frame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto').press('Tab');

    const botonGeneraOC = frame.locator('#ctl11_btnGeneraOC');
    await botonGeneraOC.waitFor({ state: 'visible' });
    await botonGeneraOC.click();


}

module.exports = router;
