var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/usuario");

var sequelize = require("../models/sequelizeConnection");
const showLog = require("../middleware/showLog");
const bcrypt = require("bcrypt");
var nodemailer = require("nodemailer");
const CryptoJS = require("crypto-js");
const { error } = require("selenium-webdriver");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;

var timezone = process.env.TIMEZONE;

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

//lee todos los usuarios
router.get("/listUsers", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";
  sql += "select * from usuarios";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/getUser/:id", cors(), async function (req, res) {
  showLog(req, res);
  let id = req.params.id;
  let sql = "";
  sql += "select * from usuarios where idUsuario=" + id;
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      data = data[0];
    } else {
      data = { error: "Usuario no encontrado" };
    }
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/getUserByMail/:email", cors(), async function (req, res) {
  showLog(req, res);
  let email = req.params.email;
  let sql = "";
  sql += "select * from usuarios where email='" + email + "'";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      data = data[0];
    } else {
      data = { error: "Usuario no encontrado" };
    }
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});


router.get("/getidFirstUser", cors(), async function (req, res) {
  showLog(req, res);
  let id = req.params.id;
  let sql = "";
  sql += "select min(idUsuario) idUsuario from usuarios";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      data = data[0];
    } else {
      data = { error: "Usuario no encontrado" };
    }
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.post("/newUser", cors(), async function (req, res) {
  showLog(req, res);
  let datos = {
    nombre: req.sanitize(req.body.nombre),
    username: req.sanitize(req.body.username),
    password: req.sanitize(req.body.password),
    email: req.sanitize(req.body.email),
    idbuk: req.sanitize(req.body.idbuk),
  };
  datos.password = bcrypt.hashSync(datos.password, 10);
  try {
    let result = await usuario.create(datos);
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/updateUser", cors(), async function (req, res) {
  showLog(req, res);
  let datos = {};
  if (req.body.password.length > 0) {
    datos = {
      nombre: req.sanitize(req.body.nombre),
      username: req.sanitize(req.body.username),
      password: req.sanitize(req.body.password),
      email: req.sanitize(req.body.email),
      idbuk: req.sanitize(req.body.idbuk),
    };
    datos.password = bcrypt.hashSync(datos.password, 10);
  } else {
    datos = {
      nombre: req.sanitize(req.body.nombre),
      username: req.sanitize(req.body.username),
      email: req.sanitize(req.body.email),
      idbuk: req.sanitize(req.body.idbuk),
    };
  }

  try {
    let result = await usuario.update(datos, {
      where: { idUsuario: req.sanitize(req.body.idUsuario) },
    });
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

const existeUsuario = async (email) => {
  let sql = "";
  sql += "select * from usuarios where email='" + email + "'";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    console.log(error.message);
  }
};

router.post("/login", cors(), async function (req, res) {
  const bytes = CryptoJS.AES.decrypt(req.body.data, "ZP7777");
  const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

  let email = req.sanitize(decryptedData.email);
  let password = req.sanitize(decryptedData.password);
  let sql = "";
  sql += "select u.*, isnull(r.tipousuario,'general') tipousuario from usuarios u " +
    " left join responsables r on r.mail = u.email " +
    "   where u.email='" + email + "'";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      data = data[0];
      bcrypt.compare(password, data.password, function (err, result) {
        if (result) {
          console.log(
            "Logeado: ",
            email,
            new Date().toLocaleString("es-ES", { timeZone: timezone }),
          );
          data["error"] = false;
          res.send(data);
        } else {
          res.send({
            username: false,
            error: "Usuario o contraseña incorrectos",
          });
        }
      });
    } else {
      res.send({ username: false, error: "Usuario o contraseña incorrectos" });
    }
  } catch (error) {
    console.log(error.message);
  }
});

router.post("/logout", cors(), async function (req, res) {
  showLog(req, res);
  res.send({ username: false, email: false, error: false });
});

router.post("/register", cors(), async function (req, res) {
  showLog(req, res);
  const saltRounds = 10;
  bcrypt.hash(
    req.sanitize(req.body.password),
    saltRounds,
    async function (err, hash) {
      let datos = {
        nombre: req.sanitize(req.body.nombre),
        username: req.sanitize(req.body.username),
        password: hash,
        email: req.sanitize(req.body.email),
        idbuk: req.sanitize(req.body.idbuk),
      };
      try {
        let result = await usuario.create(datos);
        result["error"] = false;
        res.send(result);
      } catch (error) {
        res.send({
          username: false,
          error: "Usuario ya existe, revise email o username",
        });
      }
    },
  );
});

router.get("/recoverGetCodigo/:email", cors(), async function (req, res) {
  let datos = {
    email: req.sanitize(req.params.email),
  };

  if (await existeUsuario(datos.email)) {
    let codigo = Math.floor(Math.random() * 900000) + 100000;
    await enviaCorreo(
      datos.email,
      "Recuperar contraseña",
      "<h1>Codigo de verificacion</h1><p>Codigo: " +
      codigo +
      "</p><p>Este codigo es valido por 10 minutos</p>",
    );
    res.send({ error: false, codigo: codigo });
  } else {
    res.send({ error: true, mensaje: "No hay usuario asociado a este correo" });
  }
});

var mailServer = process.env.MAIL_SERVER;
var mailUsu = process.env.MAIL_USUARIO;
var mailPwd = process.env.MAIL_CONTRASENA;
var mailPort = process.env.MAIL_SMTPPORT;

var enviaCorreo = function (destinatarios, asunto, texto) {
  return new Promise(function (resolve, reject) {
    const transporter = nodemailer.createTransport({
      host: mailServer,
      port: mailPort,
      ignoreTLS: false,
      secure: process.env.MAIL_SMTSECURE,
      auth: {
        user: mailUsu,
        pass: mailPwd,
      },
    });

    var mailOptions = {
      from: mailUsu,
      to: destinatarios,
      subject: asunto,
      html: texto,
      // attachments: [{
      //     filename: 'Afijo.csv',
      //     path: nombreArchivo,
      //     contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      // }]
    };

    transporter.sendMail(mailOptions, function (err, info) {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        console.log("correo enviado");
        resolve("correo enviado");
      }
    });
  });
};

router.post("/recoverUpdatePassword", cors(), async function (req, res) {
  let datos = {
    email: req.sanitize(req.body.email),
    password: req.sanitize(req.body.password),
  };
  datos.password = bcrypt.hashSync(datos.password, 10);
  let sql = "";
  sql += "update usuarios set password='" + datos.password + "'";
  sql += " where email='" + datos.email + "'";
  try {
    let result = await sequelize.query(sql);
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/getUsuarioFuncion/:idfuncion", cors(), async function (req, res) {
  let datos = {
    idfuncion: req.sanitize(req.params.idfuncion),
  };

  let sql = "";
  sql += "select u.idUsuario, u.email from usuarios u ";
  sql += "inner join satsdt_usuarioFunciones uf on uf.idUsuario=u.idUsuario ";
  sql += "where uf.idfuncion=" + datos.idfuncion;
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.post("/addUsuarioFuncion", cors(), async function (req, res) {
  let datos = {
    idUsuario: req.sanitize(req.body.idUsuario),
    idFuncion: req.sanitize(req.body.idFuncion),
  };
  try {
    // Verificar si ya existe la relación
    const existente = await satsdt_usuarioFunciones.findOne({
      where: {
        idUsuario: datos.idUsuario,
        idfuncion: datos.idFuncion,
      },
    });

    if (existente) {
      res.send({ error: true, mensaje: "La relación ya existe" });
      return;
    }

    let result = await satsdt_usuarioFunciones.create({
      idUsuario: datos.idUsuario,
      idfuncion: datos.idFuncion,
    });
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log(error.message);
    res.send({ error: true, mensaje: error.message });
  }
});

router.post("/deleteUsuarioFuncion", cors(), async function (req, res) {
  let datos = {
    idUsuario: req.sanitize(req.body.idUsuario),
    idFuncion: req.sanitize(req.body.idFuncion),
  };
  try {
    let result = await satsdt_usuarioFunciones.destroy({
      where: {
        idUsuario: datos.idUsuario,
        idfuncion: datos.idFuncion,
      },
    });
    result["error"] = false;
    res
      .status(200)
      .send({ error: false, mensaje: "Relación eliminada correctamente" });
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ error: true, mensaje: error.message });
  }
});

router.get("/getUsuarios", cors(), async function (req, res) {
  let datos = {
    idfuncion: req.sanitize(req.params.idfuncion),
  };

  let sql = "";
  sql += "select u.idUsuario, u.email from usuarios u ";
  // sql +=
  //   "where u.idUsuario not in (select idUsuario from satsdt_usuarioFunciones)";
  sql += " order by u.email";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

module.exports = router;
