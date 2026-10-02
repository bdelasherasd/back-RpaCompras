var Sequelize = require("sequelize");
require("dotenv").config({ path: "variables.env" });

var host = process.env.SQLLOCAL;
var user = process.env.SQLFIN700LOCALUSR;
var pwd = process.env.SQLFIN700LOCALPWD;
var database = process.env.DATABASELOCAL;

const sequelize = new Sequelize(database, user, pwd, {
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

module.exports = sequelize;
