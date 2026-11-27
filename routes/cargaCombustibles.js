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
            res.status(500).send({ error: error.message, errores, ok: false });
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
let errores = [];
const validaData = async (jsonData2) => {
    errores = [];
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

            await validaEmpresa(row['N° Empresa'], rowCount, 'N° Empresa');
            await validaCentroConsumo(row['Centro consumo'], rowCount, 'Centro consumo');
            await validaRutProveedor(row['RUT proveedor'], rowCount, 'RUT proveedor');
            await validaCodigoIE(row['Código IE'], rowCount, 'Código IE');
            await validaFechaProceso(row['N° Empresa'], row['Fecha proceso'], rowCount, 'Fecha proceso');
            await validaNroSolicitud(row['N° solicitud (ID Forms)'], rowCount, 'N° solicitud (ID Forms)');
            await validaSolicitante(row['Solicitante'], rowCount, 'Solicitante');
            await validaFormaPago(row['Forma Pago\r\n(Numero de cod)'], rowCount, 'Forma Pago\r\n(Numero de cod)');
            await validaTipoProyecto(row['Tipo proyecto'], rowCount, 'Tipo proyecto');
            await validaNumeroProyecto(row['Tipo proyecto'], row['N° proyecto'], rowCount, 'N° proyecto');
            await validaTipoDocumento(row['Tipo documento'], rowCount, 'Tipo documento');
            await validaProducto(row['Código producto'], rowCount, 'Código producto');
            await validaCantidadComprar(row['Cantidad Comprar'], rowCount, 'Cantidad Comprar');
            await validaBodega(row['Bodega'], rowCount, 'Bodega');
            await validaPrecio(row['Precio unitario neto ($/L)'], rowCount);



        } catch (error) {
            console.error("Error al guardar los datos en la base de datos:", error);
            throw error; // Lanza el error para que sea capturado por el bloque catch
        }
    }

    if (errores.length > 0) {
        console.error("Errores encontrados:", errores);
        throw new Error(`Errores encontrados: ${errores.map(e => `Fila ${e.row}: ${e.message}`).join(", ")}`);
    }
    console.log("Datos validados correctamente");
}

const validaTipoProyecto = async (tipoProyecto, rowCount, fieldName) => {
    if (!tipoProyecto || isNaN(tipoProyecto) || tipoProyecto <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Tipo de proyecto inválido: '${tipoProyecto}'\r\n` });
        return;
    }

    const sql = `SELECT tprid
                 FROM GlbT_TiposProyectos
                 WHERE tprid = ${tipoProyecto}`;

    const tipoProyectoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!tipoProyectoResult || tipoProyectoResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró el tipo de proyecto '${tipoProyecto}'\r\n` });
    }
}

const validaCantidadComprar = async (cantidad, rowCount, fieldName) => {
    if (!cantidad || isNaN(cantidad) || cantidad <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Cantidad a comprar inválida: '${cantidad}'\r\n` });
    }
}

const validaBodega = async (bodega, rowCount, fieldName) => {
    if (!bodega || isNaN(bodega) || bodega <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Bodega inválida: '${bodega}'\r\n` });
        return;
    }

    const sql = `select BodegaId from ExiT_Bodegas 
                  where BodegaCod=${bodega}`;

    const bodegaResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!bodegaResult || bodegaResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró la bodega con código '${bodega}'\r\n` });
    }
}

const validaPrecio = (precio, rowCount, fieldName) => {
    if (!precio || isNaN(precio) || precio <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Precio inválido: '${precio}'\r\n` });
    }
}
const validaEmpresa = async (empresa, rowCount, fieldName) => {
    // Lógica de validación de la empresa

    if (!empresa || isNaN(empresa) || empresa <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Empresa inválida: '${empresa}'\r\n` });
        return;
    }
    const sql = `SELECT empId 
            FROM GlbT_Empresas 
            WHERE empid = ${empresa}`;

    const empresaResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!empresaResult || empresaResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró la empresa '${empresa}'\r\n` });
    }
}

const validaSolicitante = async (solicitante, rowCount, fieldName) => {
    if (!solicitante || solicitante.trim() === '') {
        errores.push({ row: rowCount, field: fieldName, message: `Solicitante inválido: '${solicitante}'\r\n` });
    }
}

const validaFormaPago = async (formaPago, rowCount, fieldName) => {
    if (!formaPago || isNaN(formaPago) || formaPago <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Forma de pago inválida: '${formaPago}'\r\n` });
        return;
    }
    const sql = `SELECT FormaPagoId
                 FROM Glbt_FormaPago
                 WHERE FormaPagoId = ${formaPago}`;

    const formaPagoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!formaPagoResult || formaPagoResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró la forma de pago '${formaPago}'\r\n` });
    }
}

const validaCentroConsumo = async (centroConsumo, rowCount, fieldName) => {
    if (!centroConsumo || isNaN(centroConsumo) || centroConsumo <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Centro de consumo inválido: '${centroConsumo}'\r\n` });
        return;
    }

    const sql = `SELECT CConsumoCod,
                  CConsumoDes
            FROM ExiT_CentroConsumo
            WHERE CConsumoCod = '${centroConsumo}'`;

    const centroConsumoExiTResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!centroConsumoExiTResult || centroConsumoExiTResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró el centro de consumo '${centroConsumo}'\r\n` });
    }
}


const validaRutProveedor = async (rutProveedor, rowCount, fieldName) => {
    //formatear rutProveedor eliminando puntos y dejando 10 para el numero, 
    // rellenando con ceros a la izquierda si es necesario,
    // el formato de entrada es 99.999.999-9, el de salida es 9999999999-C
    // no eliminar el guion y el digito final del RUT

    if (!rutProveedor || rutProveedor.trim() === '') {
        errores.push({ row: rowCount, field: fieldName, message: `RUT de proveedor inválido: '${rutProveedor}'\r\n` });
        return;
    }

    let parteNumero = rutProveedor.split('-')[0];
    const digitoVerificador = rutProveedor.split('-')[1];

    parteNumero = parteNumero.replace(/\./g, '');
    while (parteNumero.length < 10) {
        parteNumero = '0' + parteNumero;
    }
    rutProveedor = `${parteNumero}-${digitoVerificador}`;


    const sql = `SELECT EntId 
            FROM GlbT_Entidad
            WHERE EntRut = '${rutProveedor}'`;

    const proveedorResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!proveedorResult || proveedorResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró el proveedor con RUT '${rutProveedor}'\r\n` });
    }
}


const validaCodigoIE = async (codigoIE, rowCount, fieldName) => {
    if (!codigoIE || isNaN(codigoIE) || codigoIE <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Código IE inválido: '${codigoIE}'\r\n` });
        return;
    }

    const sql = `SELECT ImpuestoPorc 
            FROM LogT_Impuestos 
            WHERE ImpuestoId = ${codigoIE}
              AND FechaVigencia >= getdate()`;

    const impuestoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!impuestoResult || impuestoResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró impuesto vigente para Código IE ${codigoIE}\r\n` });
    }
}

const validaFechaProceso = async (empresa, fechaProceso, rowCount, fieldName) => {
    if (!fechaProceso || isNaN(Date.parse(fechaProceso))) {
        errores.push({ row: rowCount, field: fieldName, message: `Fecha de proceso inválida: '${fechaProceso}'\r\n` });
        return;
    }
    fechaProceso = excelDateToString(fechaProceso);
    const sql = `SELECT TOP 1 Perid
                 FROM GlbT_Periodos
                 WHERE PerFecInicio <= '${fechaProceso}'
                   AND PerFecTermino >= '${fechaProceso}'
                   AND pEmpid = ${empresa}`;
    const periodo = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!periodo || periodo.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró un período válido para la fecha de proceso '${fechaProceso}'\r\n` });
        return;
    }
    const perid = periodo[0].Perid;

    const sql2 = `
            SELECT [CorrLogtId]
            ,[pEmpId]
            ,[DivCodigo]
            ,[PerId]
            ,[pTipoOpeId]
            ,[Id_Funcionalidad]
            ,[CorrLogtNum]
            ,[Fec_Ing_Reg]
            ,[Id_Usuario_Ing_Reg]
            ,[Fec_Ult_Modif_Reg]
            ,[Id_Usuario_Ult_Modif_Reg]
        FROM [fin700].[dbo].[LogT_Correlativos] 
        WHERE pempid = ${empresa}
        AND Id_Funcionalidad='ADQOPEOCOMPRA'
        AND PERID = ${perid}`;
    const correlativos = await sequelizeFin700.query(sql2, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!correlativos || correlativos.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontraron correlativos válidos para la empresa '${empresa}' y el período '${perid}'\r\n` });
    }

}

const validaNroSolicitud = async (nSolicitudIdForms, rowCount, fieldName) => {
    if (!nSolicitudIdForms || nSolicitudIdForms.toString().trim() === '') {
        errores.push({ row: rowCount, field: fieldName, message: `Número de solicitud inválido: '${nSolicitudIdForms}'\r\n` });
    }
}

const validaNumeroProyecto = async (tipoProyecto, numeroProyecto, rowCount, fieldName) => {
    if (!numeroProyecto || isNaN(numeroProyecto) || numeroProyecto <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Número de proyecto inválido: '${numeroProyecto}'\r\n` });
        return;
    }

    const sql = `SELECT PryId
                 FROM GlbT_Proyectos
                 WHERE pTprId = ${tipoProyecto}
                   AND PryNumero = ${numeroProyecto}`;


    const numeroProyectoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!numeroProyectoResult || numeroProyectoResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró el número de proyecto '${numeroProyecto}' para el tipo de proyecto '${tipoProyecto}'\r\n` });
    }
}

const validaTipoDocumento = async (tipoDocumento, rowCount, fieldName) => {
    if (!tipoDocumento || isNaN(tipoDocumento) || tipoDocumento <= 0) {
        errores.push({ row: rowCount, field: fieldName, message: `Tipo de documento inválido: '${tipoDocumento}'\r\n` });
        return;
    }

    const sql = `SELECT TdoId
                 FROM GlbT_Documentos
                 WHERE TdoId = ${tipoDocumento}`;

    const tipoDocumentoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!tipoDocumentoResult || tipoDocumentoResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró el tipo de documento '${tipoDocumento}'\r\n` });
    }
}

const validaProducto = async (codigo, rowCount, fieldName) => {
    if (!codigo || codigo.toString().trim() === '') {
        errores.push({ row: rowCount, field: fieldName, message: `Código de producto inválido: '${codigo}'\r\n` });
        return;
    }

    const sql = `select productoid from ExiT_Productos
                  where productocod = '${codigo}'`;

    const productoResult = await sequelizeFin700.query(sql, { type: sequelizeFin700.QueryTypes.SELECT });
    if (!productoResult || productoResult.length === 0) {
        errores.push({ row: rowCount, field: fieldName, message: `No se encontró el producto con código '${codigo}'\r\n` });
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

            const existe = await rpaCombustibles.findOne({
                where: {
                    nSolicitudIdForms: row['N° solicitud (ID Forms)'].toString(),
                },
            });
            if (!existe) {
                await rpaCombustibles.create(rpaCombustiblesData);
            }

            // await rpaCombustibles.create(rpaCombustiblesData);

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
    if (!Object.hasOwn(row, 'Fecha ingreso')) {
        errores.push("Falta el encabezado Fecha ingreso");
    }
    if (!Object.hasOwn(row, 'Factura')) {
        errores.push("Falta el encabezado Factura");
    }
    if (!Object.hasOwn(row, 'GD')) {
        errores.push("Falta el encabezado GD");
    }
    if (!Object.hasOwn(row, 'Empresa')) {
        errores.push("Falta el encabezado Empresa");
    }
    if (!Object.hasOwn(row, 'N° Empresa')) {
        errores.push("Falta el encabezado N° Empresa");
    }
    if (!Object.hasOwn(row, 'Fecha proceso')) {
        errores.push("Falta el encabezado Fecha proceso");
    }
    if (!Object.hasOwn(row, 'Centro consumo')) {
        errores.push("Falta el encabezado Centro consumo");
    }
    if (!Object.hasOwn(row, 'RUT proveedor')) {
        errores.push("Falta el encabezado RUT proveedor");
    }
    if (!Object.hasOwn(row, 'Contacto')) {
        errores.push("Falta el encabezado Contacto");
    }
    if (!Object.hasOwn(row, 'Glosa')) {
        errores.push("Falta el encabezado Glosa");
    }
    if (!Object.hasOwn(row, 'N° solicitud (ID Forms)')) {
        errores.push("Falta el encabezado N° solicitud (ID Forms)");
    }
    if (!Object.hasOwn(row, 'Solicitante')) {
        errores.push("Falta el encabezado Solicitante");
    }
    if (!Object.hasOwn(row, 'Aprobador')) {
        errores.push("Falta el encabezado Aprobador");
    }
    if (!Object.hasOwn(row, 'Forma Pago\r\n(Numero de cod)')) {
        errores.push("Falta el encabezado Forma Pago (Numero de cod)");
    }
    if (!Object.hasOwn(row, 'Tipo proyecto')) {
        errores.push("Falta el encabezado Tipo proyecto");
    }
    if (!Object.hasOwn(row, 'N° proyecto')) {
        errores.push("Falta el encabezado N° proyecto");
    }
    if (!Object.hasOwn(row, 'Tipo documento')) {
        errores.push("Falta el encabezado Tipo documento");
    }
    if (!Object.hasOwn(row, 'Número documento')) {
        errores.push("Falta el encabezado Número documento");
    }
    if (!Object.hasOwn(row, 'Código producto')) {
        errores.push("Falta el encabezado Código producto");
    }
    if (!Object.hasOwn(row, 'Cantidad Comprar')) {
        errores.push("Falta el encabezado Cantidad Comprar");
    }
    if (!Object.hasOwn(row, 'Bodega')) {
        errores.push("Falta el encabezado Bodega");
    }
    if (!Object.hasOwn(row, 'Precio unitario neto ($/L)')) {
        errores.push("Falta el encabezado Precio unitario neto ($/L)");
    }
    if (!Object.hasOwn(row, 'Código IE')) {
        errores.push("Falta el encabezado Código IE");
    }
    if (!Object.hasOwn(row, '% IE real')) {
        errores.push("Falta el encabezado % IE real");
    }
    if (!Object.hasOwn(row, 'N° OC')) {
        errores.push("Falta el encabezado N° OC");
    } return errores.join(", ");
}

module.exports = router;
