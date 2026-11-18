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
                nOC: row['N° OC']
            };
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
                nOC: row['N° OC']
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
