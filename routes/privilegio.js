var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/aplicacion");
var sequelize = require("../models/sequelizeConnection");
const showLog = require("../middleware/showLog");
const privilegio = require("../models/privilegio");
require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;

const permisos = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

router.options("*", async function (req, res) {
  showLog(req, res);
  res.set("Access-Control-Allow-Origin", permisos.origin);
  res.set("Access-Control-Allow-Methods", permisos.methods);
  res.set("Access-Control-Allow-Headers", permisos.allowedHeaders);
  res.send();
});

router.get("/listPrivilegios/:idUsuario", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";

  sql += "SELECT a.descripcion,  ";
  sql += "a.ruta,  ";
  sql += "	   case isnull(b.idPrivilegio, 0) ";
  sql += "when 0 then 0 ";
  sql += "		  else 1  ";
  sql += "end permitido, ";
  sql += "	   a.idAplicacion, ";
  sql += "isnull(c.idUsuario, 0) idUsuario ";
  sql += "from aplicacions a left join    ";
  sql += "privilegios b on a.idAplicacion = b.idAplicacion  ";
  sql += "and b.idUsuario = " + req.params.idUsuario + " left join    ";
  sql += "usuarios c on b.idUsuario = c.idUsuario  ";

  try {
    if (req.params.idUsuario != 0) {
      let data = await sequelize.query(sql);
      data = data[0];
      //res.status(200).json({data})
      res.send(data);
    } else {
      res.send([]);
    }
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/getRutasPermitidas/:idUsuario", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";

  sql += "SELECT a.ruta  ";
  sql += "from aplicacions a left join    ";
  sql += "privilegios b on a.idAplicacion = b.idAplicacion  ";
  sql += "and b.idUsuario = " + req.params.idUsuario + " join    ";
  sql += "usuarios c on b.idUsuario = c.idUsuario  ";

  try {
    if (req.params.idUsuario != 0) {
      let data = await sequelize.query(sql);
      data = data[0];
      //res.status(200).json({data})
      res.send(data);
    } else {
      res.send([]);
    }
  } catch (error) {
    console.log(error.message);
  }
});

router.post("/newPrivilegio", cors(), async function (req, res) {
  showLog(req, res);
  let datos = {
    descripcion: req.sanitize(req.body.descripcion),
    ruta: req.sanitize(req.body.ruta),
  };
  try {
    let result = await privilegio.create(datos);
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/updatePrivilegio", cors(), async function (req, res) {
  showLog(req, res);
  let idUsuario = req.sanitize(req.body.idUsuario);
  let aplicaciones = req.body.aplicaciones;
  console.log(aplicaciones);
  try {
    let result = await privilegio.destroy({
      where: { idUsuario: idUsuario },
    });
    for (let i = 0; i < aplicaciones.length; i++) {
      let datos = {
        idUsuario: idUsuario,
        idAplicacion: aplicaciones[i],
      };
      await privilegio.create(datos);
    }
    res.send({ error: false });
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/deletePrivilegio", cors(), async function (req, res) {
  showLog(req, res);
  let id = req.sanitize(req.body.idPrivilegio);
  try {
    let result = await privilegio.destroy({
      where: { idPrivilegio: id },
    });
    result["error"] = false;
    res.send({ result });
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

module.exports = router;
