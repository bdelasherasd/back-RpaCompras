var sequelize = require("../models/sequelizeConnection");
var imp_sku = require("../models/imp_sku");

const valCodigo = async (codigo) => {
  let existe = await imp_sku.findOne({
    where: { sku: codigo },
  });
  if (!existe) {
    return true;
  } else {
    return false;
  }
};

const valCantidad = async (cantidad) => {
  if (isNaN(cantidad) || cantidad <= 0) {
    return true;
  } else {
    if (cantidad.includes(",")) {
      return true;
    } else {
      return false;
    }
  }
};

const valValor = async (valor) => {
  if (isNaN(valor) || valor <= 0) {
    return true;
  } else {
    if (valor.includes(",")) {
      return true;
    } else {
      return false;
    }
  }
};

const valFecha = async (fecha) => {
  const regex = /^\d{4}\/\d{2}\/\d{2}$/;
  if (!regex.test(fecha)) return true;

  const [year, month, day] = fecha.split("/").map(Number);
  const date = new Date(year, month - 1, day);

  return !(
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

module.exports = {
  valCodigo,
  valCantidad,
  valValor,
  valFecha,
};
