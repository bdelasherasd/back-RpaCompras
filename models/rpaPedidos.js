var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var rpaPedidos = sequelize.define("rpaPedidos", {
  id: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  empId: type.INTEGER,
  nroPedido: type.INTEGER,
  archivo: type.STRING,
  iaRut: type.STRING,
  iaTotal: type.FLOAT,
  iaMoneda: type.STRING,
  porValidar: type.BOOLEAN,
  okRut: type.BOOLEAN,
  okTotal: type.BOOLEAN,
  okMoneda: type.BOOLEAN,
  okContacto: type.BOOLEAN,
  okParaOC: type.BOOLEAN,
  NroOc: type.INTEGER,
  totalPedido: type.FLOAT,
  monedaPedido: type.STRING,
  rutPedido: type.STRING,
  iaFirmaElectronica: type.STRING,
  iaFirmaManuscrita: type.STRING,
  iaEmail: type.STRING,
  cantidadContactos: type.INTEGER
});
//sequelize.sync({ alter: true });

try {
  sequelize.sync({ alter: true });
} catch (error) {
  console.error('Unable to connect to the database:', error);
}


module.exports = rpaPedidos;
