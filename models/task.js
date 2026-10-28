var type = require("sequelize");
var sequelize = require("./sequelizeConnection");

var task = sequelize.define("task", {
  idTask: {
    type: type.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  aplicacion: type.STRING,
  username: type.STRING,
  hora: type.INTEGER,
  minuto: type.INTEGER,
  taskdata: "NVARCHAR(MAX)",
  res: "NVARCHAR(MAX)",
});
//sequelize.sync({ alter: true });

try {
  sequelize.sync();
} catch (error) {
  console.error('Unable to connect to the database:', error);
}


module.exports = task;
