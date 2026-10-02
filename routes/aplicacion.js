var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/aplicacion");
var sequelize = require("../models/sequelizeConnection");
const showLog = require("../middleware/showLog");
const aplicacion = require("../models/aplicacion");
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

router.get("/listAplicaciones", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";
  sql += "select * from aplicacions";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/getAplicacion/:id", cors(), async function (req, res) {
  showLog(req, res);
  let id = req.params.id;
  let sql = "";
  sql += "select * from aplicacions where idAplicacion=" + id;
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      data = data[0];
    } else {
      data = { error: "Aplicacion no encontrada" };
    }
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.post("/newAplicacion", cors(), async function (req, res) {
  showLog(req, res);
  let datos = {
    descripcion: req.sanitize(req.body.descripcion),
    ruta: req.sanitize(req.body.ruta),
  };
  try {
    let result = await aplicacion.create(datos);
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/updateAplicacion", cors(), async function (req, res) {
  showLog(req, res);
  let datos = {
    descripcion: req.sanitize(req.body.descripcion),
    ruta: req.sanitize(req.body.ruta),
  };

  try {
    let result = await aplicacion.update(datos, {
      where: { idAplicacion: req.sanitize(req.body.idAplicacion) },
    });
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/deleteAplicacion", cors(), async function (req, res) {
  showLog(req, res);
  let id = req.sanitize(req.body.idAplicacion);
  try {
    let result = await aplicacion.destroy({
      where: { idAplicacion: id },
    });
    result["error"] = false;
    res.send({ result });
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

module.exports = router;
