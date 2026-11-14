var express = require("express");
const router = express.Router();
const { chromium } = require('playwright'); // Assuming Playwright is used for browser automation
// var cors = require("cors");
var sequelize = require("../models/sequelizeConnection");
var sequelizeFin700 = require("../models/sequelizeFin700");
const { get } = require("selenium-webdriver/http");
// const showLog = require("../middleware/showLog");
const rpaPedidos = require("../models/rpaPedidos");
const rpaOC = require("../models/rpaOC");
const { Op } = require("sequelize");
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
const INTERVALO_SEGUNDOS = 10;
setInterval(async () => {
    //    await GenerarOrdenCompra();
    await aprobarOrdenCompra();
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

let aprobandoOrdenCompra = false;

const aprobarOrdenCompra = async () => {
    if (aprobandoOrdenCompra) return;
    aprobandoOrdenCompra = true;
    try {
        let NumSolicitud;
        const sql = `select rtrim(NumSolicitud) as NumSolicitud, 
                            OcCabId, 
                            isnull(rtrim(AdqOwner), '') as AdqOwner 
                       from adqt_occab 
                      where usuarioProceso = '${process.env.uidfin700}' 
                        and ConEstCod=1
                      order by OcCabId`;
        const result = await sequelizeFin700.query(sql, { type: sequelize.QueryTypes.SELECT });
        if (result.length > 0) {
            const adqOwner = result[0].AdqOwner;
            NumSolicitud = result[0].NumSolicitud;
            const OcCabId = result[0].OcCabId;

            await controlaAdqOwner(NumSolicitud, OcCabId, adqOwner);
            if (adqOwner === '') {
                NumSolicitud = result[0].NumSolicitud;
                const sql = `SELECT top 1 * FROM rpaPedidos 
                          WHERE NroPedido = ${NumSolicitud}`;
                const pendientes = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
                for (const pedido of pendientes) {
                    console.log(`Iniciando aprobación de orden de compra para pedido ID: ${pedido.id}`);
                    await encolaAprobacionOrden(pedido);
                }
            }
        }
    } catch (error) {
        console.error("Error aprobando orden de compra:", error);
    } finally {
        aprobandoOrdenCompra = false;
    }
}

const controlaAdqOwner = async (NumSolicitud, OcCabId, adqOwner) => {
    if (adqOwner === '') {
        await rpaOC.destroy({
            where: { NroOc: OcCabId, mensaje: { [Op.like]: '%Error Rpa #1%' } }
        });
    } else {
        // si no existe que cree el error en rpaOC
        // antes del create, se podría verificar si ya existe un error similar
        const existingError = await rpaOC.findOne({
            where: { NroOc: OcCabId, mensaje: { [Op.like]: '%Error Rpa #1%' } }
        });
        if (existingError) return;
        await rpaOC.create({
            NroOc: OcCabId,
            mensaje: `Documento ${OcCabId} está siendo usado por otro usuario (Error Rpa #1)`
        });
    }
}

const encolaProcesoOrden = async (pedido) => {
    const urlfin700 = process.env.urlfin700;
    try {
        browser = await chromium.launch({ headless: false });
        page = await browser.newPage();

        await page.goto(urlfin700, { timeout: 20000 });

        await loginFin700();
        console.log("Login successful");
        await navegaMenus(pedido);
        if (await pedidoSinOc(pedido)) {
            await generarOrdenCompra(pedido);
        }
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

const encolaAprobacionOrden = async (pedido) => {
    // Implement the logic for enqueuing order approval
    const urlfin700 = process.env.urlfin700;
    try {
        browser = await chromium.launch({ headless: false });
        page = await browser.newPage();

        await page.goto(urlfin700, { timeout: 20000 });

        await loginFin700();
        console.log("Login successful");
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

const pedidoSinOc = async (pedido) => {
    sql = `select * from adqt_occab where pempid = ${pedido.empId} and NumSolicitud='${pedido.nroPedido}'`;
    const result = await sequelizeFin700.query(sql, { type: sequelize.QueryTypes.SELECT });
    if (result.length > 0) {
        pedido.NroOc = result[0].OcCabId;
        await rpaPedidos.update(
            { NroOc: pedido.NroOc },
            { where: { id: pedido.id } }
        );
    }
    return pedido.NroOc === 0;
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
        await page.waitForLoadState('load');

        // controla limite de invocaciones
        const btnClosePopupSelector = '#btnClosePopup';
        const btnClosePopup = await page.$(btnClosePopupSelector);
        if (btnClosePopup) {
            await btnClosePopup.click();
            console.log("limite de invocaciones alcanzado, esperando 30 segundos antes de continuar");
            await page.waitForTimeout(30000); // esperar 3 segundos
            throw new Error("Popup cerrado limite de invocaciones alcanzado");
        }

        // controla ventana emergente tareas workflow
        await page.waitForTimeout(3000); // esperar 3 segundos
        //*[@id="iframe_emergente_contenedor"]/span
        const btnCerrarSelector = '#iframe_emergente_contenedor > span';
        const emergente = await page.$(btnCerrarSelector);
        if (emergente) {
            await emergente.click();
        }

    } catch (error) {
        console.error("Error during login:", error);
        throw error;
    }
}

async function navegaMenus(pedido) {
    try {
        // Implement the navigation logic here
        await page.getByText('Transacciones').click({ timeout: 20000 });
        await page.getByText('Adquisiciones').click({ timeout: 20000 });
        await page.getByText('Preparación de Compras').click({ timeout: 20000 });
        await page.getByRole('link', { name: 'Proceso de Compras' }).click({ timeout: 20000 });

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

    console.log(`Orden de compra generada para pedido ID: ${pedido.id}`);
}

const apruebaOrdenCompra = async (pedido) => {
    await page.getByText('Transacciones').click({ timeout: 20000 });
    await page.getByText('Adquisiciones').click({ timeout: 20000 });
    await page.getByText('Administración de Compra').click({ timeout: 5000 });

    await page.locator('//*[@id="k_panelbar"]/li[2]/ul/li[2]/ul/li[3]/ul/li[1]/a').click();

    await page.waitForLoadState('load');

    // #iframe_body
    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();


    await frame.locator('#ctl11_FiltroFolio').selectOption('0');

    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').click();
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').fill(pedido.empId.toString());
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('Tab');


    let nroOc = await getNroOc(pedido);

    // seleccionar el pedido desde
    await frame.locator('#ctl11_OcCabIdDesde').click();
    await frame.locator('#ctl11_OcCabIdDesde').press('ControlOrMeta+a');
    await frame.locator('#ctl11_OcCabIdDesde').fill(nroOc.toString());
    await frame.locator('#ctl11_OcCabIdDesde').press('Tab');

    // Click the search button to find the order
    await frame.locator('#ctl11_BtnBuscar').click();
    await page.waitForLoadState('load');

    await frame.locator('#ctl11_TabOC_div > table > tbody > tr.DataGridItem > td:nth-child(5) > a').click();
    await page.waitForLoadState('load');

    await page.waitForTimeout(3000);
    const btnCerrarSelector = 'div.k-window div.k-window-actions a.k-window-action[aria-label="Close"]';

    // Verificamos si el popup / botón existe antes de hacer clic para evitar errores
    const popupCerrar = await page.$(btnCerrarSelector);
    if (popupCerrar) {
        console.log(`Documento ${nroOc} está siendo usado por otro usuario`);
        const existingError = await rpaOC.findOne({
            where: { NroOc: nroOc, mensaje: { [Op.like]: '%Error Rpa #1%' } }
        });
        if (!existingError) {
            await rpaOC.create({
                NroOc: nroOc,
                mensaje: `Documento ${nroOc} está siendo usado por otro usuario (Error Rpa #1)`
            });
        }
        await popupCerrar.click();
        return; // Salir de la función para evitar continuar con el flujo normal
    } else {
        await rpaOC.destroy({
            where: { NroOc: nroOc, mensaje: { [Op.like]: '%Error Rpa #1%' } }
        });
    }



    await frame.locator('#ctl11_hylContactos').click();
    await page.waitForLoadState('load');

    await page.waitForTimeout(3000);
    // 1. Acceder al contexto del iframe emergente
    const iframeLocator = page.frameLocator('iframe.k-content-frame');

    const correos = await leerTodosLosCorreosConPaginacion(page);

    const numCorreos = pedido.cantidadContactos || 0;

    if (numCorreos <= 1) {
        // 2. Seleccionar y hacer clic exclusivamente en el primer enlace de selección disponible
        await iframeLocator.locator('a.HyperLink[href*="TabContactos"]').first().click();
        await page.waitForLoadState('load');
    } else {
        const iaEmail = pedido.iaEmail || '';
        // Seleccionar el enlace de contacto que coincida con el correo de IA
        const enlaceContacto = await iframeLocator.locator(`a.HyperLink[href*="TabContactos"]`).filter({ hasText: iaEmail }).first();
        if (await enlaceContacto.count() > 0) {
            await enlaceContacto.click();
            await page.waitForLoadState('load');
        } else {
            // Si no se encuentra el enlace con el correo de IA, hacer clic en el primer enlace disponible
            await iframeLocator.locator('a.HyperLink[href*="TabContactos"]').first().click();
            await page.waitForLoadState('load');
        }
    }






    //--------------------------------------------------------------------------
    // 1. Apuntar directamente al iframe donde opera tu formulario
    const iframeBody = page.frameLocator('iframe#iframe_body');

    // 2. Ubicar el botón "Opciones" que está DENTRO del iframe
    const menuDiv = iframeBody.locator('div#lnk10');

    // Asegurarnos de que el botón de opciones esté visible en el formulario
    await menuDiv.waitFor({ state: 'visible', timeout: 10000 });

    // 3. Hacer hover o simular el foco directamente sobre "Opciones"
    await menuDiv.hover();
    await page.waitForTimeout(600); // Pausa para que el ERP pinte el submenú flotante

    // 4. Buscar el enlace de la opción que se despliega (usando un selector flexible por si cambia de número)
    const optionLink = iframeBody.locator('a[name="mM1"], a[id^="mmlink"]');

    // Esperar a que el enlace aparezca en el DOM del iframe
    await optionLink.first().waitFor({ state: 'attached', timeout: 5000 });

    // 5. Ejecutar la acción mediante evaluate para forzar el _itemRef y el clic de Sonda
    await optionLink.first().evaluate((el) => {
        // Disparar el evento mouseover para que la función _p1(this) asigne el _itemRef
        const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
        el.dispatchEvent(mouseOverEvent);

        // Si la función global $K existe y tiene referencia, la llamamos; si no, hacemos click nativo
        if (typeof window.$K === 'function' && el._itemRef) {
            window.$K(el._itemRef);
        } else {
            el.click();
        }
    });

    console.log('¡Opción del menú ejecutada con éxito en el formulario!');
    //--------------------------------------








    await page.waitForTimeout(1500);

    const modalFrame = page.frameLocator('iframe.k-content-frame');


    const radioBtn = modalFrame.locator('//*[@id="ctl11_GridObservaciones_rbl_0"]');
    await radioBtn.waitFor({ state: 'visible', timeout: 10000 });
    await radioBtn.click();
    await page.waitForLoadState('load');


    // const btnGuardar = modalFrame.locator('//*[@id="ctl11_btnGuardar"]');
    // await btnGuardar.waitFor({ state: 'visible', timeout: 10000 });
    // await btnGuardar.click();
    // await page.waitForLoadState('load');

    // 2. Ubicar el botón "Volver" dentro de ese iframe
    const btnVolver = modalFrame.locator('#ctl11_btnVolver');

    // 3. Asegurar que esté visible y hacer clic
    await btnVolver.waitFor({ state: 'visible', timeout: 10000 });
    await btnVolver.click();
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

    console.log('¡Visador seleccionado con éxito!');



}

async function leerTodosLosCorreosConPaginacion(page) {
    const iframeLocator = page.frameLocator('iframe.k-content-frame');
    let todosLosCorreos = [];
    let haySiguientePagina = true;

    while (haySiguientePagina) {
        // 1. Esperar a que carguen los elementos de la tabla en la página actual
        // Ajusta este selector según las celdas o elementos que contengan los correos en tu tabla
        await iframeLocator.locator('table tr').first().waitFor();

        // 2. Extraer el texto de todas las celdas o filas de la página actual
        const celdas = await iframeLocator.locator('td').allTextContents();


        // Filtrar los textos que tengan formato de correo (que incluyan '@' y '.')
        const correosPagina = celdas.filter(texto => texto.includes('@') && texto.includes('.'));
        todosLosCorreos.push(...correosPagina);

        // 3. Buscar el botón de "Siguiente página" en el paginador
        // (Nota: Ajusta el selector 'a.siguiente', 'a.k-pager-nav', o el icono que use tu paginador)
        const botonSiguiente = iframeLocator.locator('a.k-pager-nav:not(.k-state-disabled) [class*="i-arrow-end-right"], a:has-text(">");');

        // Comprobar si el botón "Siguiente" existe y está habilitado
        // O una forma más genérica buscando el elemento de paginación activo/siguiente:
        const siguienteHabilitado = await iframeLocator.locator('.k-pager-wrap .k-i-arrow-end-right, .k-pager-wrap a[title="Go to the next page"]').isVisible().catch(() => false);

        if (siguienteHabilitado) {
            // Hacer clic en siguiente
            await iframeLocator.locator('.k-pager-wrap .k-i-arrow-end-right, .k-pager-wrap a[title="Go to the next page"]').click();
            // Esperar un momento a que cargue la nueva página de la tabla (puedes ajustar el tiempo o esperar una respuesta de red)
            await page.waitForTimeout(1000);
        } else {
            // Si ya no hay botón siguiente o está deshabilitado, terminamos
            haySiguientePagina = false;
        }
    }

    // Expresión regular estándar para detectar correos electrónicos
    const regexEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    // 1. Extraer todos los correos que coincidan en el array
    const todosLosCorreosLimpios = todosLosCorreos.flatMap(item => item.match(regexEmail) || []);

    // 2. Eliminar duplicados usando Set y convertir de nuevo a array
    const correosUnicos = [...new Set(todosLosCorreosLimpios)];

    return correosUnicos;
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
