var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
const multer = require("multer");
const path = require("path");
var rpaCombustibles = require("../models/rpaCombustibles");
const showLog = require("../middleware/showLog");
const XLSX = require("xlsx");
const fs = require("fs");
const { ok } = require("assert");
const sequelizeFin700 = require("../models/sequelizeFin700");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;
var timeZone = process.env.TIMEZONE;

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

const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (_, file, cb) =>
        cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

router.post(
    "/upload",
    cors(),
    upload.single("file"),
    async function (req, res) {
        showLog(req, res);
        try {
            await processExcel(req.file.path);
            res
                .status(200)
                .send({ message: "Archivo procesado correctamente", ok: true });
        } catch (error) {
            res.status(500).send({ error: error.message, ok: false });
        }
    }
);

async function processExcel(filePath) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    //const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    //const jsonData2 = XLSX.utils.sheet_to_json(worksheet);
    const jsonData2 = XLSX.utils.sheet_to_json(worksheet, {
        range: 1,       // Ajusta esto según dónde esté tu cabecera (0, 1, 2...)
        defval: ""      // Hace que las celdas vacías se devuelvan como "" en lugar de ser ignoradas
    });
    if (jsonData2.length === 0) {
        throw new Error("El archivo Excel está vacío");
    }
    await validaData(jsonData2);
    await cargaData(jsonData2);

}

const validaData = async (jsonData2) => {
    let errores = [];
    let rowCount = 1;
    // Guardar los datos en la base de datos
    for (const row of jsonData2) {
        rowCount++;

        let erroresEncabezado = "";
        if (rowCount === 2) {
            erroresEncabezado = await validaEncabezados(row);
            if (erroresEncabezado !== "") {
                console.error("Error en los encabezados:", erroresEncabezado);
                throw new Error(`Error en los encabezados: ${erroresEncabezado}`);
            }
            continue;
        }


        try {
            const rpaCombustiblesData = {
                fechaIngreso: excelDateToString(row['Fecha ingreso']),
                factura: row['Factura'],
                gd: row['GD'],
                empresa: row['Empresa'],
                nEmpresa: row['N° Empresa'],
                fechaProceso: excelDateToString(row['Fecha proceso']),
                centroConsumo: row['Centro consumo'],
                rutProveedor: row['RUT proveedor'],
                contacto: row['Contacto'],
                glosa: row['Glosa'],
                nSolicitudIdForms: row['N° solicitud (ID Forms)'].toString(),
                solicitante: row['Solicitante'],
                aprobador: row['Aprobador'],
                formaPago: row['Forma pago'],
                tipoDocumento: row['Tipo documento'],
                codigoProyecto: row['Código proyecto'],
                nProyecto: row['N° Proyecto'],
                tipoProducto: row['Tipo producto'],
                cantidadComprar: row['Cantidad comprar'],
                bodega: row['Bodega'],
                precioUnitarioNeto: row['Precio unitario neto'],
                codigoIE: row['Código IE'],
                ieReal: row['IE real'],
                nOC: parseInt(row['N° OC']) || 0
            };

            await validaEmpresa(row['Empresa']);
            await validaCentroConsumo(row['Centro consumo']);
            await validaRutProveedor(row['RUT proveedor']);
            await validaCodigoIE(row['Código IE']);
            await validaFechaProceso(row['Fecha proceso']);
            await validaNroSolicitud(row['N° solicitud (ID Forms)']);
            await validaSolicitante(row['Solicitante']);
            await validaFormaPago(row['Forma pago']);
            await validaTipoProyecto(row['Tipo proyecto']);
            await validaNumeroProyecto(row['Tipo proyecto'], row['N° Proyecto']);
            await validaTipoDocumento(row['Tipo documento']);
            await validaProducto(row['Código producto']);
            await validaCantidadComprar(row['Cantidad comprar']);
            await validaBodega(row['Bodega']);
            await validaPrecio(row['Precio unitario neto']);



            const existe = await rpaCombustibles.findOne({
                where: {
                    nSolicitudIdForms: row['N° solicitud (ID Forms)'].toString(),
                },
            });
            if (existe) {
                errores.push(`La solicitud ID Forms ${row['N° solicitud (ID Forms)'].toString()} ya existe`);
            }
        } catch (error) {
            console.error("Error al guardar los datos en la base de datos:", error);
            throw error; // Lanza el error para que sea capturado por el bloque catch
        }
    }

    if (errores.length > 0) {
        console.error("Errores encontrados:", errores);
        throw new Error(`Errores encontrados: ${errores.join(", ")}`);
    }
    console.log("Datos validados correctamente");
}

const validaTipoProyecto = async (tipoProyecto) => {
    if (!tipoProyecto || tipoProyecto.trim() === '') {
        errores.push(`Tipo de proyecto inválido: '${tipoProyecto}'\r\n`);
        return;
    }

    const sql = `SELECT tprid
                 FROM GlbT_TiposProyectos
                 WHERE tprid = ${tipoProyecto}`;

    const tipoProyectoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!tipoProyectoResult || tipoProyectoResult.length === 0) {
        errores.push(`No se encontró el tipo de proyecto '${tipoProyecto}'\r\n`);
    }
}

const validaCantidadComprar = async (cantidad) => {
    if (!cantidad || isNaN(cantidad) || cantidad <= 0) {
        errores.push(`Cantidad a comprar inválida: '${cantidad}'\r\n`);
    }
}

const validaBodega = async (bodega) => {
    if (!bodega || bodega.trim() === '') {
        errores.push(`Bodega inválida: '${bodega}'\r\n`);
        return;
    }

    const sql = `select BodegaId from ExiT_Bodegas 
                  where BodegaCod='${bodega}'`;

    const bodegaResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!bodegaResult || bodegaResult.length === 0) {
        errores.push(`No se encontró la bodega con código '${bodega}'\r\n`);
    }
}

const validaPrecio = (precio) => {
    if (!precio || isNaN(precio) || precio <= 0) {
        errores.push(`Precio inválido: '${precio}'\r\n`);
    }
}

const validaEmpresa = async (empresa) => {
    // Lógica de validación de la empresa

    if (!empresa || empresa.trim() === '') {
        errores.push(`Empresa inválida: '${empresa}'\r\n`);
        return;
    }
    sql = `SELECT empId 
            FROM GlbT_Empresas 
            WHERE empid = '${empresa}'`;

    const empresaResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!empresaResult || empresaResult.length === 0) {
        errores.push(`No se encontró la empresa '${empresa}'\r\n`);
    }
}

const validaSolicitante = async (solicitante) => {
    if (!solicitante || solicitante.trim() === '') {
        errores.push(`Solicitante inválido: '${solicitante}'\r\n`);
    }
}

const validaFormaPago = async (formaPago) => {
    if (!formaPago || formaPago.trim() === '') {
        errores.push(`Forma de pago inválida: '${formaPago}'\r\n`);
        return;
    }
    const sql = `SELECT FormaPagoId
                 FROM Glbt_FormaPago
                 WHERE FormaPagoId = '${formaPago}'`;

    const formaPagoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!formaPagoResult || formaPagoResult.length === 0) {
        errores.push(`No se encontró la forma de pago '${formaPago}'\r\n`);
    }
}

const validaCentroConsumo = async (centroConsumo) => {
    if (!centroConsumo || centroConsumo.trim() === '') {
        errores.push(`Centro de consumo inválido: '${centroConsumo}'\r\n`);
        return;
    }

    sql = `SELECT CConsumoCod,
                  CConsumoDes
            FROM ExiT_CentroConsumo
            WHERE CConsumoCod = '${centroConsumo}'`;

    const centroConsumoExiTResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!centroConsumoExiTResult || centroConsumoExiTResult.length === 0) {
        errores.push(`No se encontró el centro de consumo '${centroConsumo}'\r\n`);
    }
}


const validaRutProveedor = async (rutProveedor) => {
    //formatear rutProveedor eliminando puntos y dejando 10 para el numero, 
    // rellenando con ceros a la izquierda si es necesario,
    // el formato de entrada es 99.999.999-9, el de salida es 9999999999-C
    // no eliminar el guion y el digito final del RUT

    if (!rutProveedor || rutProveedor.trim() === '') {
        errores.push(`RUT de proveedor inválido: '${rutProveedor}'\r\n`);
        return;
    }

    let parteNumero = rutProveedor.split('-')[0];
    const digitoVerificador = rutProveedor.split('-')[1];

    parteNumero = parteNumero.replace(/\./g, '');
    while (parteNumero.length < 10) {
        parteNumero = '0' + parteNumero;
    }
    rutProveedor = `${parteNumero}-${digitoVerificador}`;


    sql = `SELECT EntId 
            FROM GlbT_Entidad
            WHERE EntRut = '${rutProveedor}'`;

    const proveedorResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!proveedorResult || proveedorResult.length === 0) {
        errores.push(`No se encontró el proveedor con RUT '${rutProveedor}'\r\n`);
    }
}


const validaCodigoIE = async (codigoIE) => {
    if (!codigoIE || codigoIE.trim() === '') {
        errores.push(`Código IE inválido: '${codigoIE}'\r\n`);
        return;
    }

    sql = `SELECT ImpuestoPorc 
            FROM LogT_Impuestos 
            WHERE ImpuestoId = ${row['Código IE']}
              AND FechaVigencia >= getdate()`;

    const impuestoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!impuestoResult || impuestoResult.length === 0) {
        errores.push(`No se encontró impuesto solicitud '${row['N° solicitud (ID Forms)'].toString()}' vigente para Código IE ${row['Código IE']}\r\n`);
    }
}

const validaFechaProceso = async (fechaProceso) => {
    if (!fechaProceso || isNaN(Date.parse(fechaProceso))) {
        errores.push(`Fecha de proceso inválida: '${fechaProceso}'\r\n`);
    }
}

const validaNroSolicitud = async (nSolicitudIdForms) => {
    if (!nSolicitudIdForms || nSolicitudIdForms.trim() === '') {
        errores.push(`Número de solicitud inválido: '${nSolicitudIdForms}'\r\n`);
    }
}

const validaNumeroProyecto = async (tipoProyecto, numeroProyecto) => {
    if (!numeroProyecto || numeroProyecto.trim() === '') {
        errores.push(`Número de proyecto inválido: '${numeroProyecto}'\r\n`);
        return;
    }

    const sql = `SELECT PryId
                 FROM GlbT_Proyectos
                 WHERE pTprId = ${tipoProyecto}
                   AND PryNumero = ${numeroProyecto}`;


    const numeroProyectoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!numeroProyectoResult || numeroProyectoResult.length === 0) {
        errores.push(`No se encontró el número de proyecto '${numeroProyecto}' para el tipo de proyecto '${tipoProyecto}'\r\n`);
    }
}

const validaTipoDocumento = async (tipoDocumento) => {
    if (!tipoDocumento || tipoDocumento.trim() === '') {
        errores.push(`Tipo de documento inválido: '${tipoDocumento}'\r\n`);
        return;
    }

    const sql = `SELECT TdoId
                 FROM GlbT_Documentos
                 WHERE TdoId = ${tipoDocumento}`;

    const tipoDocumentoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!tipoDocumentoResult || tipoDocumentoResult.length === 0) {
        errores.push(`No se encontró el tipo de documento '${tipoDocumento}'\r\n`);
    }
}

const validaProducto = async (codigo) => {
    if (!codigo || codigo.trim() === '') {
        errores.push(`Código de producto inválido: '${codigo}'\r\n`);
        return;
    }

    const sql = `select productoid from ExiT_Productos
                  where productocod = '${codigo}'`;

    const productoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!productoResult || productoResult.length === 0) {
        errores.push(`No se encontró el producto con código '${codigo}'\r\n`);
    }
}

const cargaData = async (jsonData2) => {
    let rowCount = 1;
    // Guardar los datos en la base de datos
    for (const row of jsonData2) {
        rowCount++;

        try {
            const rpaCombustiblesData = {
                fechaIngreso: excelDateToString(row['Fecha ingreso']),
                factura: row['Factura'],
                gd: row['GD'],
                empresa: row['Empresa'],
                nEmpresa: row['N° Empresa'],
                fechaProceso: excelDateToString(row['Fecha proceso']),
                centroConsumo: row['Centro consumo'],
                rutProveedor: row['RUT proveedor'],
                contacto: row['Contacto'],
                glosa: row['Glosa'],
                nSolicitudIdForms: row['N° solicitud (ID Forms)'].toString(),
                solicitante: row['Solicitante'],
                aprobador: row['Aprobador'],
                formaPago: row['Forma Pago\r\n(Numero de cod)'],
                tipoProyecto: row['Tipo proyecto'],
                nProyecto: row['N° proyecto'],
                tipoDocumento: row['Tipo documento'],
                numeroDocumento: row['Número documento'],
                codigoProducto: row['Código producto'],
                cantidadComprar: row['Cantidad Comprar'],
                bodega: row['Bodega'],
                precioUnitarioNeto: row['Precio unitario neto ($/L)'],
                codigoIE: row['Código IE'],
                ieReal: row['% IE real'],
                nOC: parseInt(row['N° OC']) || 0
            };
            await rpaCombustibles.create(rpaCombustiblesData);

        } catch (error) {
            console.error("Error al guardar los datos en la base de datos:", error);
            throw error; // Lanza el error para que sea capturado por el bloque catch
        }
    }
};

function excelDateToString(serial) {
    // SheetJS parsea el número serie a un objeto { y, m, d, H, M, S }
    const parsedDate = XLSX.SSF.parse_date_code(serial);

    if (!parsedDate) return null;

    const year = parsedDate.y;
    const month = String(parsedDate.m).padStart(2, '0');
    const day = String(parsedDate.d).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

async function validaEncabezados(row) {
    let errores = [];
    if (!row['Fecha ingreso'] && row['Fecha ingreso'].trim() != "") {
        errores.push("Falta el encabezado Fecha ingreso");
    }
    if (!row['Factura'] && row['Factura'].trim() != "") {
        errores.push("Falta el encabezado Factura");
    }
    if (!row['GD'] && row['GD'].trim() != "") {
        errores.push("Falta el encabezado GD");
    }
    if (!row['Empresa'] && row['Empresa'].trim() != "") {
        errores.push("Falta el encabezado Empresa");
    }
    if (!row['N° Empresa'] && row['N° Empresa'].trim() != "") {
        errores.push("Falta el encabezado N° Empresa");
    }
    if (!row['Fecha proceso'] && row['Fecha proceso'].trim() != "") {
        errores.push("Falta el encabezado Fecha proceso");
    }
    if (!row['Centro consumo'] && row['Centro consumo'].trim() != "") {
        errores.push("Falta el encabezado Centro consumo");
    }
    if (!row['RUT proveedor'] && row['RUT proveedor'].trim() != "") {
        errores.push("Falta el encabezado RUT proveedor");
    }
    if (!row['Contacto'] && row['Contacto'].trim() != "") {
        errores.push("Falta el encabezado Contacto");
    }
    if (!row['Glosa'] && row['Glosa'].trim() != "") {
        errores.push("Falta el encabezado Glosa");
    }
    if (!row['N° solicitud (ID Forms)'] && row['N° solicitud (ID Forms)'].trim() != "") {
        errores.push("Falta el encabezado N° solicitud (ID Forms)");
    }
    if (!row['Solicitante'] && row['Solicitante'].trim() != "") {
        errores.push("Falta el encabezado Solicitante");
    }
    if (!row['Aprobador'] && row['Aprobador'].trim() != "") {
        errores.push("Falta el encabezado Aprobador");
    }
    if (!row['Forma Pago\r\n(Numero de cod)'] && row['Forma Pago\r\n(Numero de cod)'].trim() != "") {
        errores.push("Falta el encabezado Forma Pago (Numero de cod)");
    }
    if (!row['Tipo proyecto'] && row['Tipo proyecto'].trim() != "") {
        errores.push("Falta el encabezado Tipo proyecto");
    }
    if (!row['N° proyecto'] && row['N° proyecto'].trim() != "") {
        errores.push("Falta el encabezado N° proyecto");
    }
    if (!row['Tipo documento'] && row['Tipo documento'].trim() != "") {
        errores.push("Falta el encabezado Tipo documento");
    }
    if (!row['Número documento'] && row['Número documento'].trim() != "") {
        errores.push("Falta el encabezado Número documento");
    }
    if (!row['Código producto'] && row['Código producto'].trim() != "") {
        errores.push("Falta el encabezado Código producto");
    }
    if (!row['Cantidad Comprar'] && row['Cantidad Comprar'].trim() != "") {
        errores.push("Falta el encabezado Cantidad Comprar");
    }
    if (!row['Bodega'] && row['Bodega'].trim() != "") {
        errores.push("Falta el encabezado Bodega");
    }
    if (!row['Precio unitario neto ($/L)'] && row['Precio unitario neto ($/L)'].trim() != "") {
        errores.push("Falta el encabezado Precio unitario neto ($/L)");
    }
    if (!row['Código IE'] && row['Código IE'].trim() != "") {
        errores.push("Falta el encabezado Código IE");
    }
    if (!row['% IE real'] && row['% IE real'].trim() != "") {
        errores.push("Falta el encabezado % IE real");
    }
    if (!row['N° OC'] && row['N° OC'].trim() != "") {
        errores.push("Falta el encabezado N° OC");
    }
    return errores.join(", ");
}

module.exports = router;
