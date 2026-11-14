var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var rpaOC = sequelize.define("rpaOC", {
  id: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  NroOc: type.INTEGER,
  mensaje: type.STRING
}, {
  tableName: "rpaOC"
});
//sequelize.sync({ alter: true });

try {
  sequelize.sync({ alter: true });
} catch (error) {
  console.error('Unable to connect to the database:', error);
}


module.exports = rpaOC;
