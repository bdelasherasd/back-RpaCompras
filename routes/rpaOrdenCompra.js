var express = require("express");
const router = express.Router();
const { chromium } = require('playwright'); // Assuming Playwright is used for browser automation
// var cors = require("cors");
var sequelize = require("../models/sequelizeConnection");
var sequelizeFin700 = require("../models/sequelizeFin700");
const { get } = require("selenium-webdriver/http");
// const showLog = require("../middleware/showLog");
const rpaPedidos = require("../models/rpaPedidos");
const rpaCombustibles = require("../models/rpaCombustibles");
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

let browser = null;
let page = null;


// Validador de pedidos
const INTERVALO_SEGUNDOS = 3600;
setInterval(async () => {
    await GenerarOrdenCompra();
    await aprobarOrdenCompra();
    await GenerarOrdenCompraCombustibles();
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


const aprobarOrdenCompra = async () => {
    if (generandoOrdenCompra) return;
    generandoOrdenCompra = true;
    try {
        let NumSolicitud;
        const sql = `select top 1 rtrim(NumSolicitud) as NumSolicitud, 
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
        generandoOrdenCompra = false;
    }
}

const GenerarOrdenCompraCombustibles = async () => {
    if (generandoOrdenCompra) return;
    generandoOrdenCompra = true;
    try {
        const sql = `
            SELECT top 1
                 factura
                ,gd
                ,empresa
                ,n_empresa
                ,fecha_proceso
                ,rut_proveedor
                ,contacto
                ,n_solicitud_id_forms
                ,solicitante
                ,aprobador
                ,forma_pago
                ,tipo_proyecto
                ,n_proyecto
                ,tipo_documento
                ,numero_documento
                ,codigo_ie
                ,ie_real
            FROM rpaCombustibles
            WHERE nroOc=0
            group by 
                factura
                ,gd
                ,empresa
                ,n_empresa
                ,fecha_proceso
                ,rut_proveedor
                ,contacto
                ,n_solicitud_id_forms
                ,solicitante
                ,aprobador
                ,forma_pago
                ,tipo_proyecto
                ,n_proyecto
                ,tipo_documento
                ,numero_documento
                ,codigo_ie
                ,ie_real
        `;
        const pendientes = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        for (const pedido of pendientes) {
            console.log(`Iniciando generación de orden de compra para pedido ID: ${pedido.n_solicitud_id_forms}`);
            await encolaProcesoOrdenCombustibles(pedido);
        }

    } catch (error) {
        console.error("Error generando orden de compra:", error);
    } finally {
        generandoOrdenCompra = false;
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
        await logoutFin700();
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
        await logoutFin700();
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

const encolaProcesoOrdenCombustibles = async (pedido) => {
    const urlfin700 = process.env.urlfin700;
    try {
        browser = await chromium.launch({ headless: false });
        page = await browser.newPage();

        await page.goto(urlfin700, { timeout: 20000 });

        await loginFin700();
        console.log("Login successful");
        await generarOrdenCompraCombustibles(pedido);
        await logoutFin700();
    } catch (error) {
        console.error(`Error procesando orden de compra para pedido ID: ${pedido.n_solicitud_id_forms}`, error);
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

const logoutFin700 = async () => {
    try {
        const btnLogoutSelector = '#info > div > a:nth-child(4) > span.header_text';
        const btnLogout = await page.$(btnLogoutSelector);
        if (btnLogout) {
            await btnLogout.click();
            await page.waitForLoadState('load');

            const frameOut = page.frameLocator('iframe[name="iframe_body"]');
            const btnTerminar = frameOut.locator('#ctl11_Btnterminar');

            if (await btnTerminar.count() > 0) {
                await btnTerminar.click();
                await page.waitForLoadState('load');
            }
        }
    } catch (error) {
        console.error("Error during logout:", error);
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

    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForLoadState('load');
    await page.frameLocator('#iframe_body').getByRole('button', { name: 'Volver' }).click();
    await page.getByRole('link', { name: 'Salir' }).click();
    await page.frameLocator('#iframe_body').locator('#ctl11_Btnterminar').click();
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





    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

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

    await eligeVisador();


    await page.waitForTimeout(1000);
    await page.frameLocator('#iframe_body').locator('#ctl11_BtnVolver').click();
    await page.getByRole('link', { name: 'Salir' }).click();
    await page.frameLocator('#iframe_body').locator('#ctl11_Btnterminar').click();



}

const eligeVisador = async () => {
    await page.waitForTimeout(500);
    const visador = process.env.visador;

    const framePopup = page.frameLocator('iframe.k-content-frame');

    await framePopup.locator('#ctl11_txtNombre').click();
    await framePopup.locator('#ctl11_txtNombre').press('ControlOrMeta+a');
    await framePopup.locator('#ctl11_txtNombre').fill(visador);
    await framePopup.locator('#ctl11_txtNombre').press('Tab');

    await framePopup.locator('#ctl11_BtnBuscar').click();
    await page.waitForLoadState('load');

    await page.waitForTimeout(1000);
    await framePopup.locator('#ctl11_TablaPaginada1_rbl_0').click();
    await page.waitForLoadState('load');

    await page.waitForTimeout(1000);
    await framePopup.locator('#ctl11_btnSeleccionar').click();
    await page.waitForLoadState('load');

    await page.waitForTimeout(1000);
    const msgboxFrame = page.frameLocator('iframe[src*="msgbox.htm"]');
    await msgboxFrame.locator('#btn1').click();
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

const generarOrdenCompraCombustibles = async (pedido) => {

    // prrocesa cabecera de la orden de compra de combustibles
    await procesarCabeceraCombustible(pedido); // Llama a una función que procese la cabecera de la orden de compra de combustibles

    const sql = `select *
        from rpaCombustibles
        where n_solicitud_id_forms = '${pedido.n_solicitud_id_forms}'`;
    let pedidoDetalles = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
    for (let detalle of pedidoDetalles) {
        // Aquí puedes procesar cada detalle de la orden de compra de combustibles
        await procesarDetalleCombustible(detalle); // Llama a una función que procese cada detalle
        console.log(detalle);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await menuAprobar(); // Llama a la función que aprueba la orden de compra
    await eligeVisador(); // Llama a la función que selecciona el visador

    await page.waitForTimeout(1000); // Espera un momento después de seleccionar el visador


    console.log('Orden de compra de combustibles generada para el pedido:', pedido.n_solicitud_id_forms);

}

const procesarCabeceraCombustible = async (pedido) => {
    await modificaImpuestoEspecifico(pedido);


    await page.getByText('Transacciones').click({ timeout: 20000 });
    await page.locator('//*[@id="k_panelbar"]/li[2]/ul/li[2]/span/span[1]').click();
    await page.getByText('Administración de Compra').click({ timeout: 5000 });

    await page.locator('//*[@id="k_panelbar"]/li[2]/ul/li[2]/ul/li[3]/ul/li[1]/a').click();

    await page.waitForLoadState('load');

    // #iframe_body
    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();

    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').click();
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('ControlOrMeta+a');
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').fill(`${pedido.n_empresa}`);
    await frame.locator('#ctl11_EntRazonSocial_EntRazonSocial_texto').press('Tab');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    await frame.locator('#ctl11_btnNuevo').click();
    await page.waitForLoadState('load');

    const frame2 = page.frameLocator('#iframe_body');

    await frame2.locator('//*[@id="ctl11_OptCargoDirecto_1"]').click();
    await page.waitForLoadState('load');

    await frame2.locator('//*[@id="ctl11_TipoOpeDes_TipoOpeDes_texto"]').click();
    await frame2.locator('//*[@id="ctl11_TipoOpeDes_TipoOpeDes_texto"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_TipoOpeDes_TipoOpeDes_texto"]').fill(`47`);
    await frame2.locator('//*[@id="ctl11_TipoOpeDes_TipoOpeDes_texto"]').press('Tab');
    await page.waitForLoadState('load');


    if (pedido.fecha_proceso != '') {
        await frame2.locator('//*[@id="ctl11_FechaProceso"]').click();
        await frame2.locator('//*[@id="ctl11_FechaProceso"]').press('ControlOrMeta+a');
        await frame2.locator('//*[@id="ctl11_FechaProceso"]').fill(`${pedido.fecha_proceso}`);
        await frame2.locator('//*[@id="ctl11_FechaProceso"]').press('Tab');
        await page.waitForLoadState('load');
    }

    await frame2.locator('//*[@id="ctl11_EntRut"]').click();
    await frame2.locator('//*[@id="ctl11_EntRut"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_EntRut"]').fill(`${pedido.rut_proveedor}`);
    await frame2.locator('//*[@id="ctl11_EntRut"]').press('Tab');
    await page.waitForLoadState('load');

    await frame2.locator('//*[@id="ctl11_hylContactos"]/img').click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000);

    const nombrecontacto = pedido.contacto;

    // Apuntar al iframe del popup de contactos
    const popupFrame = page.frameLocator('iframe[src*="ucAdqComprasContactos"]');

    // Hacer clic en el texto que coincida con la variable (sin importar mayúsculas/minúsculas o espacios extra)
    //await popupFrame.getByText(nombrecontacto, { exact: false }).first().click();

    const fila = popupFrame
        .locator('tr.DataGridItem, tr.DataGridAlternatingItem')
        .filter({ hasText: new RegExp(nombrecontacto, 'i') })
        .first();

    await fila.waitFor({ state: 'visible' });

    // Hacer clic en el selector (enlace con img seleccion.gif) de esa fila
    const selectorLink = fila.locator('a.HyperLink').first();
    await selectorLink.click();



    //*[@id="ctl11_TabContactos"]
    //const enlaceContacto = popupFrame.locator(`//*[@id="ctl11_TabContactos"]/tbody/tr[.//*[contains(text(), "${nombrecontacto}")]]/td[1]/a`);
    //await enlaceContacto.click();


    await page.waitForLoadState('load');
    await page.waitForTimeout(1000);


    const centroConsumo = await getPrimerCentroConsumo(pedido);
    await frame2.locator('//*[@id="ctl11_CConsumoCod"]').click();
    await frame2.locator('//*[@id="ctl11_CConsumoCod"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_CConsumoCod"]').fill(`${centroConsumo}`);
    await frame2.locator('//*[@id="ctl11_CConsumoCod"]').press('Tab');
    await page.waitForLoadState('load');

    if (pedido.ie_real < 0) {
        //*[@id="ctl11_ChkHonorarios"]
        await frame2.locator('//*[@id="ctl11_ChkHonorarios"]').check();
        await page.waitForLoadState('load');
    }

    const allGlosas = await getGlosas(pedido);

    //*[@id="ctl11_AdqGlosa"]
    await frame2.locator('//*[@id="ctl11_AdqGlosa"]').click();
    await frame2.locator('//*[@id="ctl11_AdqGlosa"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_AdqGlosa"]').fill(`${allGlosas}`);
    await frame2.locator('//*[@id="ctl11_AdqGlosa"]').press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_NumSolicitud"]
    await frame2.locator('//*[@id="ctl11_NumSolicitud"]').click();
    await frame2.locator('//*[@id="ctl11_NumSolicitud"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_NumSolicitud"]').fill(`${pedido.n_solicitud_id_forms}`);
    await frame2.locator('//*[@id="ctl11_NumSolicitud"]').press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_NombreSolicitante"]
    await frame2.locator('//*[@id="ctl11_NombreSolicitante"]').click();
    await frame2.locator('//*[@id="ctl11_NombreSolicitante"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_NombreSolicitante"]').fill(`${pedido.solicitante}`);
    await frame2.locator('//*[@id="ctl11_NombreSolicitante"]').press('Tab');
    await page.waitForLoadState('load');


    //*[@id="ctl11_Encargado"]
    await frame2.locator('//*[@id="ctl11_Encargado"]').click();
    await frame2.locator('//*[@id="ctl11_Encargado"]').press('ControlOrMeta+a');
    await frame2.locator('//*[@id="ctl11_Encargado"]').fill(`${pedido.aprobador}`);
    await frame2.locator('//*[@id="ctl11_Encargado"]').press('Tab');
    await page.waitForLoadState('load');

    await frame2.locator('//*[@id="ctl11_btnGuardar"]').click();
    await page.waitForLoadState('load');

    const modalFrame = page.frameLocator('.k-window .k-content-frame').first();

    // 2. Localizar el input dentro de ese frame
    const formaPagoInput = modalFrame.locator('#ctl11_FormaPagoGlosa_FormaPagoGlosa_texto');
    await formaPagoInput.waitFor({ state: 'visible' });
    await formaPagoInput.click();
    await formaPagoInput.press('ControlOrMeta+a');
    await formaPagoInput.fill(`${pedido.forma_pago}`);
    await formaPagoInput.press('Tab');
    await page.waitForLoadState('load');

    const monedaCompra = modalFrame.locator('//*[@id="ctl11_MonGlosa_MonGlosa_texto"]');
    await monedaCompra.waitFor({ state: 'visible' });
    await monedaCompra.click();
    await monedaCompra.press('ControlOrMeta+a');
    await monedaCompra.fill('1');
    await monedaCompra.press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_BtnGuardar"]
    const btnGuardar = modalFrame.locator('//*[@id="ctl11_BtnGuardar"]');
    await btnGuardar.waitFor({ state: 'visible' });
    await btnGuardar.click();
    await page.waitForLoadState('load');

    const closeButton = page.locator('.k-window .k-window-action[aria-label="Close"]').first();
    await closeButton.waitFor({ state: 'visible' });
    await closeButton.click();
    await page.waitForLoadState('load');

    const ocCabIdInput = frame.locator('//*[@id="ctl11_OcCabId"]');
    await ocCabIdInput.waitFor({ state: 'attached' });
    const numeroOc = await ocCabIdInput.inputValue();

    await rpaCombustibles.update({ nOC: numeroOc }, { where: { n_solicitud_id_forms: pedido.n_solicitud_id_forms } });


    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await menuOtros();
    await page.waitForTimeout(3000);

    const otrosFrame = page.frameLocator('iframe.k-content-frame[src*="ucAdqComprasOtros"]');

    const pTprIdInput = otrosFrame.locator('//*[@id="ctl11_pTprId"]');
    await pTprIdInput.waitFor({ state: 'visible' });
    await pTprIdInput.click();
    await pTprIdInput.press('ControlOrMeta+a');
    await pTprIdInput.fill(`${pedido.tipo_proyecto}`);
    await pTprIdInput.press('Tab');
    await page.waitForLoadState('load');

    const pryectoNumeroInput = otrosFrame.locator('//*[@id="ctl11_PryNumero"]');
    await pryectoNumeroInput.waitFor({ state: 'visible' });
    await pryectoNumeroInput.click();
    await pryectoNumeroInput.press('ControlOrMeta+a');
    await pryectoNumeroInput.fill(`${pedido.n_proyecto}`);
    await pryectoNumeroInput.press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_TdoGlosa_TdoGlosa_texto"]
    const tdoGlosaInput = otrosFrame.locator('//*[@id="ctl11_TdoGlosa_TdoGlosa_texto"]');
    await tdoGlosaInput.waitFor({ state: 'visible' });
    await tdoGlosaInput.click();
    await tdoGlosaInput.press('ControlOrMeta+a');
    await tdoGlosaInput.fill(`${pedido.tipo_documento}`);
    await tdoGlosaInput.press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_NumeroDocumento"]
    const numeroDocumentoInput = otrosFrame.locator('//*[@id="ctl11_NumeroDocumento"]');
    await numeroDocumentoInput.waitFor({ state: 'visible' });
    await numeroDocumentoInput.click();
    await numeroDocumentoInput.press('ControlOrMeta+a');
    await numeroDocumentoInput.fill(`${pedido.numero_documento}`);
    await numeroDocumentoInput.press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_FechaDocumento"]
    const fechafragmentada = pedido.fecha_proceso.split('-');
    const fechaDocumento = `${fechafragmentada[2]}/${fechafragmentada[1]}/${fechafragmentada[0]}`;

    const fechaDocumentoInput = otrosFrame.locator('//*[@id="ctl11_FechaDocumento"]');
    await fechaDocumentoInput.waitFor({ state: 'visible' });
    await fechaDocumentoInput.click();
    await fechaDocumentoInput.press('ControlOrMeta+a');
    await fechaDocumentoInput.fill(`${fechaDocumento}`);
    await fechaDocumentoInput.press('Tab');
    await page.waitForLoadState('load');

    //*[@id="ctl11_btnGuardar"]
    const btnGuardar2 = otrosFrame.locator('//*[@id="ctl11_btnGuardar"]');
    await btnGuardar2.waitFor({ state: 'visible' });
    await btnGuardar2.click();
    await page.waitForLoadState('load');

    //*[@id="ctl11_btnVolver"]
    const btnVolver = otrosFrame.locator('//*[@id="ctl11_btnVolver"]');
    await btnVolver.waitFor({ state: 'visible' });
    await btnVolver.click();
    await page.waitForLoadState('load');

    // esperar 2 segundos antes de continuar
    await page.waitForTimeout(2000);

    console.log('Cabecera de combustible para pedido:', pedido.n_solicitud_id_forms);


}

const getGlosas = async (pedido) => {

    const detPedido = await rpaCombustibles.findAll({
        where: {
            n_solicitud_id_forms: pedido.n_solicitud_id_forms
        }
    });

    let glosas = '';
    if (detPedido && detPedido.length > 0) {
        glosas = detPedido.map(item => item.glosa).join('\n\r');
    }
    return glosas;

}

const getPrimerCentroConsumo = async (pedido) => {
    const detPedido = await rpaCombustibles.findOne({
        where: {
            n_solicitud_id_forms: pedido.n_solicitud_id_forms
        }
    });
    return detPedido ? detPedido.centroConsumo : '';
}

const modificaImpuestoEspecifico = async (pedido) => {
    await page.getByText('Configuración Fin700').click({ timeout: 20000 });
    await page.getByText('Parámetros de Adquisiciones').click({ timeout: 20000 });
    await page.click('a[href*="FUN=ADQADMIMPUESTO"]');


    const frame = page.frameLocator('#iframe_body');
    await frame.locator('#ctl11_xImpuestoId').click();
    await frame.locator('#ctl11_xImpuestoId').press('ControlOrMeta+a');
    await frame.locator('#ctl11_xImpuestoId').fill(`${pedido.codigo_ie}`);
    await frame.locator('#ctl11_xImpuestoId').press('Tab');

    await frame.locator('#ctl11_btnBuscar').click();
    await page.waitForTimeout(2000);

    await frame.locator('#ctl11_tblImpuestos > tbody > tr.DataGridItem > td:nth-child(1) > a').click();
    await page.waitForTimeout(2000);

    await frame.locator('#ctl11_ImpuestoPorc').click();
    await frame.locator('#ctl11_ImpuestoPorc').press('ControlOrMeta+a');

    if (pedido.ie_real > 0) {
        await frame.locator('#ctl11_ImpuestoPorc').fill(`${pedido.ie_real}`);
    } else {
        await frame.locator('#ctl11_ImpuestoPorc').fill('0,0001');
    }
    await frame.locator('#ctl11_ImpuestoPorc').press('Tab');
    await frame.locator('#ctl11_btnGrabar').click();


}

const menuOtros = async () => {
    // Determina si #lnk10 está en el iframe_body o en page (top)
    const iframeBody = page.frameLocator('iframe#iframe_body');
    const scope = (await iframeBody.locator('div#lnk10').count()) > 0 ? iframeBody : page;

    // 1. Ubicar el botón "Opciones" (#lnk10)
    const menuDiv = scope.locator('div#lnk10');
    await menuDiv.waitFor({ state: 'visible', timeout: 10000 });

    // 2. Hacer hover para que Milonic posicione y muestre el submenú (#menu0)
    await menuDiv.hover();
    await page.waitForTimeout(600);

    // 3. Ubicar específicamente la opción "Otros Conceptos Contables" (#lnk5 / índice 5)
    const otrosConceptosLink = scope.locator('a#lnk5').or(
        scope.locator('a[name="mM1"]').filter({ hasText: /Otros Conceptos Contables/i })
    ).first();
    // esperar 1 segundo antes de continuar
    await page.waitForTimeout(1000);
    await otrosConceptosLink.waitFor({ state: 'attached', timeout: 5000 });

    // 4. Forzar el evento y ejecutar $K(5) (o el _itemRef del enlace flotante)
    await otrosConceptosLink.evaluate((el) => {
        const mouseOverEvent = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window,
        });
        el.dispatchEvent(mouseOverEvent);

        const mmlink = document.querySelector('a[id^="mmlink"]');
        if (mmlink && typeof mmlink.onmouseover === 'function') {
            mmlink.onmouseover(mouseOverEvent);
        }

        // En el DOM de "Otros Conceptos Contables", el enlace tiene onclick="return $K(5)"
        if (typeof window.$K === 'function') {
            const itemRef = (mmlink && mmlink._itemRef !== undefined) ? mmlink._itemRef : 5;
            window.$K(itemRef);
        } else {
            el.click();
        }
    });

    console.log('¡Opción "Otros Conceptos Contables" ejecutada con éxito!');
};


const menuAprobar = async () => {
    // Determina si #lnk10 está en el iframe_body o en page (top)
    // scroll to top of the page
    // esperar 1 segundo antes de continuar
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));


    const iframeBody = page.frameLocator('iframe#iframe_body');
    const scope = (await iframeBody.locator('div#lnk10').count()) > 0 ? iframeBody : page;

    // 1. Ubicar el botón "Opciones" (#lnk10)
    const menuDiv = scope.locator('div#lnk10');
    await menuDiv.waitFor({ state: 'visible', timeout: 10000 });

    // 2. Hacer hover para que Milonic posicione y muestre el submenú (#menu0)
    await menuDiv.hover();
    await page.waitForTimeout(600);

    // 3. Ubicar específicamente la opción "Otros Conceptos Contables" (#lnk5 / índice 5)
    const otrosConceptosLink = scope.locator('a#lnk0').or(
        scope.locator('a[name="mM1"]').filter({ hasText: /Aprobar/i })
    ).first();
    // esperar 1 segundo antes de continuar
    await page.waitForTimeout(1000);
    await otrosConceptosLink.waitFor({ state: 'attached', timeout: 5000 });

    // 4. Forzar el evento y ejecutar $K(5) (o el _itemRef del enlace flotante)
    await otrosConceptosLink.evaluate((el) => {
        const mouseOverEvent = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window,
        });
        el.dispatchEvent(mouseOverEvent);

        const mmlink = document.querySelector('a[id^="mmlink"]');
        if (mmlink && typeof mmlink.onmouseover === 'function') {
            mmlink.onmouseover(mouseOverEvent);
        }

        // En el DOM de "Otros Conceptos Contables", el enlace tiene onclick="return $K(5)"
        if (typeof window.$K === 'function') {
            const itemRef = (mmlink && mmlink._itemRef !== undefined) ? mmlink._itemRef : 5;
            window.$K(itemRef);
        } else {
            el.click();
        }
    });

    console.log('¡Opción "Aprobar" ejecutada con éxito!');
};



const menuRaro = async (opcion, etiquetaOpcional = '') => {
    const idx = Number(opcion);

    // Determina si #lnk10 está en el iframe_body o en page (top)
    const iframeBody = page.frameLocator('iframe#iframe_body');
    const enIframe = (await iframeBody.locator('div#lnk10').count()) > 0;
    const scope = enIframe ? iframeBody : page;

    // 1. Ubicar el botón "Opciones" (#lnk10)
    const menuDiv = scope.locator('div#lnk10');
    await menuDiv.waitFor({ state: 'visible', timeout: 10000 });

    // 2. Hacer hover para que Milonic posicione y muestre el submenú (#menu0)
    await menuDiv.hover();
    await page.waitForTimeout(600);

    // 3. Ubicar la opción por id a#lnk{idx} (y opcionalmente por texto si se entrega)
    let targetLink = scope.locator(`a#lnk${idx}`);
    if (etiquetaOpcional) {
        targetLink = targetLink.or(
            scope.locator('a[name="mM1"]').filter({ hasText: new RegExp(etiquetaOpcional, 'i') })
        );
    }
    const optionLink = targetLink.first();

    await optionLink.waitFor({ state: 'attached', timeout: 5000 });

    // 4. Forzar el evento y ejecutar $K(idx) (o el _itemRef del enlace flotante si corresponde)
    await optionLink.evaluate((el, itemIdx) => {
        const mouseOverEvent = new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window,
        });
        el.dispatchEvent(mouseOverEvent);

        const mmlink = document.querySelector('a[id^="mmlink"]');
        if (mmlink && typeof mmlink.onmouseover === 'function') {
            mmlink.onmouseover(mouseOverEvent);
        }

        if (typeof window.$K === 'function') {
            const itemRef =
                mmlink && mmlink._itemRef !== undefined && mmlink._itemRef !== null
                    ? mmlink._itemRef
                    : itemIdx;
            window.$K(itemRef);
        } else {
            el.click();
        }
    }, idx);

    console.log(`¡Opción del menú (${etiquetaOpcional || `lnk${idx}`}) ejecutada con éxito!`);
};




const procesarDetalleCombustible = async (detPedido) => {
    //*[@id="HylDetalle"]
    let frame = await page.locator('iframe[name="iframe_body"]').contentFrame();

    await frame.locator('//*[@id="HylDetalle"]').click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    frame = page.frameLocator('iframe.k-content-frame[src*="ucAdqComprasDetalle"]');

    console.log(`Procesando detalle de combustible para el producto: ${JSON.stringify(detPedido.codigo_producto)}`);
    await frame.locator('//*[@id="ctl11_CodigoAlternativo"]').click();
    await frame.locator('//*[@id="ctl11_CodigoAlternativo"]').press('ControlOrMeta+a');
    await frame.locator('//*[@id="ctl11_CodigoAlternativo"]').fill(`${detPedido.codigo_producto}`);
    await frame.locator('//*[@id="ctl11_CodigoAlternativo"]').press('Tab');
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);

    await frame.locator('//*[@id="ctl11_CConsumoCod"]').click();
    await frame.locator('//*[@id="ctl11_CConsumoCod"]').press('ControlOrMeta+a');
    await frame.locator('//*[@id="ctl11_CConsumoCod"]').fill(`${detPedido.centro_consumo}`);
    await frame.locator('//*[@id="ctl11_CConsumoCod"]').press('Tab');
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);

    await frame.locator('//*[@id="ctl11_BodegaCod"]').click();
    await frame.locator('//*[@id="ctl11_BodegaCod"]').press('ControlOrMeta+a');
    await frame.locator('//*[@id="ctl11_BodegaCod"]').fill(`${detPedido.bodega}`);
    await frame.locator('//*[@id="ctl11_BodegaCod"]').press('Tab');
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);

    //convertir a string y cambiar punto decimal a coma si es necesario
    let cantidadComprar = detPedido.cantidad_comprar;
    if (typeof cantidadComprar === 'number') {
        cantidadComprar = cantidadComprar.toString().replace('.', ',');
    } else if (typeof cantidadComprar === 'string') {
        cantidadComprar = cantidadComprar.replace('.', ',');
    }
    await frame.locator('//*[@id="ctl11_CantidadCompra"]').click();
    await frame.locator('//*[@id="ctl11_CantidadCompra"]').press('ControlOrMeta+a');
    await frame.locator('//*[@id="ctl11_CantidadCompra"]').fill(`${cantidadComprar}`);
    await frame.locator('//*[@id="ctl11_CantidadCompra"]').press('Tab');
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);

    //convertir a string y cambiar punto decimal a coma si es necesario
    let precioUnitario = detPedido.precio_unitario_neto;
    if (typeof precioUnitario === 'number') {
        precioUnitario = precioUnitario.toString().replace('.', ',');
    } else if (typeof precioUnitario === 'string') {
        precioUnitario = precioUnitario.replace('.', ',');
    }
    await frame.locator('//*[@id="ctl11_PrecioUni"]').click();
    await frame.locator('//*[@id="ctl11_PrecioUni"]').press('ControlOrMeta+a');
    await frame.locator('//*[@id="ctl11_PrecioUni"]').fill(`${precioUnitario}`);
    await frame.locator('//*[@id="ctl11_PrecioUni"]').press('Tab');
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);


    await frame.locator('//*[@id="ctl11_BtnGuardar"]').click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);

    //*[@id="ctl11_BtnVolver"]
    await frame.locator('//*[@id="ctl11_BtnVolver"]').click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);


}






module.exports = router;
