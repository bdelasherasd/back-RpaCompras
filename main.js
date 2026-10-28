var express = require("express");
const path = require("path");

require("dotenv").config({ path: "variables.env" });
var expressSanitizer = require("express-sanitizer");
var passport = require("passport");

var app = express();
app.set("trust proxy", 1); // trust first proxy
app.use(
  require("express-session")({
    secret: "zp7777",
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(expressSanitizer());
app.use(express.json({ limit: "100mb" }));

const compression = require('compression');
app.use(compression());

app.use(express.static('build', {
  maxAge: '1y',
  etag: true
}));



var sequelize = require("./models/sequelizeConnection");
var sequelizeFin700 = require("./models/sequelizeFin700");




var task = require("./models/task");

var usuarioRoutes = require("./routes/usuario");
app.use("/usuario", usuarioRoutes);

var aplicacionRoutes = require("./routes/aplicacion");
app.use("/aplicacion", aplicacionRoutes);

var privilegioRoutes = require("./routes/privilegio");
app.use("/privilegio", privilegioRoutes);


var { RpaPedidoRoutes, reprogramaRpaPedidos } = require("./routes/rpaPedidos");
app.use("/rpaPedidos", RpaPedidoRoutes);


app.use(express.static(path.join(__dirname, "../front/dist")));

app.use("/pdfs", express.static(path.join(__dirname, "./pdf")));

// Para cualquier otra ruta que no sea /api, devolver index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../front/dist", "index.html"));
});

var Port = process.env.PORT || "9999";
var Ip = process.env.HOST || "0.0.0.0";

app.listen(Port, Ip, async function () {
  console.log("Servidor ha Iniciado...");
  console.log("Port..." + Port);
  console.log("IP..." + Ip);

  global.tjobs = [];

  procesaTareas()
    .then((d) => {
      console.log("Tareas cargadas:", d.length);
    })
    .catch((err) => {
      console.error("Error cargando tareas:", err);
    });
});

var procesaTareas = async function () {
  console.log("Cargando tareas programadas...");

  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("task.findAll no respondió después de 30 segundos"));
    }, 30000);
  });

  try {
    const data = await Promise.race([
      task.findAll({
        order: [["idTask", "asc"]],
      }),
      timeout,
    ]);

    clearTimeout(timeoutId);
    //console.log("Tareas cargadas:", data.length);

    data.forEach((e) => {
      if (e.aplicacion === "RpaPedidos") {
        reprogramaRpaPedidos(JSON.parse(e.taskdata), e.idTask);
      }
    });

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("task.findAll falló:", error);
    throw error;
  }
};
