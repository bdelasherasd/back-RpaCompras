var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var aplicacion = sequelize.define("aplicacion", {
  idAplicacion: { type: type.INTEGER, primaryKey: true, autoIncrement: true },
  descripcion: type.STRING,
  ruta: { type: type.STRING, unique: "aplicacionIndex1" },
});
sequelize.sync();

module.exports = aplicacion;
