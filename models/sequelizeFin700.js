var Sequelize = require("sequelize");
require("dotenv").config({ path: "variables.env" });

var host = process.env.SQLFIN700;
var user = process.env.SQLFIN700USR;
var pwd = process.env.SQLFIN700PWD;
var database = process.env.DATABASEFIN700;

const sequelizeFin700 = new Sequelize(database, user, pwd, {
  host: host,
  dialect: "mssql",
  dialectOptions: {
    useUTC: false,
    dateStrings: true, // devuelve fechas como string
    typeCast: true,
    encrypt: true,
    options: {
      validateBulkLoadParameters: true,
      requestTimeout: 3600000,
    },
  },
  logging: false,
  port: 1433,
});

module.exports = sequelizeFin700;
