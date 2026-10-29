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
  iaTotal: type.FLOAT

});
//sequelize.sync({ alter: true });

try {
  sequelize.sync();
} catch (error) {
  console.error('Unable to connect to the database:', error);
}


module.exports = rpaPedidos;
