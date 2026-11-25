var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var rpaHorario = sequelize.define("rpaHorario", {
  id: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  frecuencia: type.STRING,
  horario: type.STRING
}, {
  tableName: "rpaHorario"
});
//sequelize.sync({ alter: true });

try {
  sequelize.sync();
} catch (error) {
  console.error('Unable to connect to the database:', error);
}


module.exports = rpaHorario;
