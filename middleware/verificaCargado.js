var sequelize = require("../models/sequelizeConnection");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
var imp_carga = require("../models/imp_carga");
var { valCantidad, valCodigo, valFecha, valValor } = require("./validaciones");

const verificaCargado = async (refCliente, nroDespacho, proveedor) => {
  // Lógica para verificar si ya está cargado
  let dataCarga = await imp_carga.findAll({
    where: {
      factura: refCliente,
      proveedor: proveedor,
    },
  });
  let detalles = [];
  if (dataCarga.length > 0) {
    for (let item of dataCarga) {
      let data = {
        invoiceNumber: item.factura,
        codigo: item.sku,
        cantidad: item.cantidad,
        peso: item.peso,
        valor: item.precio,
        descripcion: "",
        codigoInvalido: await valCodigo(item.sku),
        cantidadInvalida: false,
        valorInvalido: false,
      };
      detalles.push(data);
    }
    imp_importacion_archivo.update(
      { detalles: JSON.stringify(detalles) },
      { where: { nroDespacho: nroDespacho } }
    );
  }
};

module.exports = verificaCargado;
