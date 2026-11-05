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
        const sql = `SELECT top 1 * FROM rpaPedidos WHERE NroOc = 0 and okParaOc = 1`;
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

        await page.goto(urlfin700);

        await loginFin700();
        console.log("Login successful");
        await navegaMenus();
        await generarOrdenCompra(pedido);
    } catch (error) {
        console.error(`Error procesando orden de compra para pedido ID: ${pedido.id}`, error);
    }
}

async function loginFin700() {
    // Implement the login logic here
    const uidfin700 = process.env.uidfin700;
    const pwdfin700 = process.env.pwdfin700;

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
    await page.getByRole('link', { name: 'Proceso de Compras' }).click();

    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();
    await frame.getByRole('button', { name: 'Nuevo' }).click();
}

async function generarOrdenCompra(pedido) {
    // Implement the logic to generate the purchase order here
    console.log(`Generando orden de compra para pedido ID: ${pedido.id}`);

    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();
    await frame.locator('#ctl11_FiltroPedido').selectOption('0');
    await page.waitForTimeout(1000);

    await frame.locator('#ctl11_PedidoDesde').fill(pedido.NroPedido.toString());
    await frame.locator('#ctl11_PedidoDesde').press('Tab');


}

module.exports = router;
