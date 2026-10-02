var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var privilegio = sequelize.define("privilegio", {
  idPrivilegio: { type: type.INTEGER, primaryKey: true, autoIncrement: true },
  idUsuario: { type: type.INTEGER, unique: "privilegioIndex1" },
  idAplicacion: { type: type.INTEGER, unique: "privilegioIndex1" },
});
sequelize.sync();

module.exports = privilegio;
