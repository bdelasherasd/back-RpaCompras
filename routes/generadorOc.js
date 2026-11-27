var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
const multer = require("multer");
const path = require("path");
var rpaHorario = require("../models/rpaHorario");
const showLog = require("../middleware/showLog");
const XLSX = require("xlsx");
const fs = require("fs");
const { ok } = require("assert");
const sequelizeFin700 = require("../models/sequelizeFin700");
const sequelize = require("../models/sequelizeConnection");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;
var timeZone = process.env.TIMEZONE;

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

const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (_, file, cb) =>
        cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

router.get("/cola", cors(), async function (req, res) {
    showLog(req, res);
    try {
        sql = `exec pRpaGetPedidosCola ''`
        const cola = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        res.status(200).send({ data: cola });
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);

router.get("/listVisadores", cors(), async function (req, res) {
    showLog(req, res);
    try {
        sql = `select * from rpaVisadores`
        const visadores = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        res.status(200).send(visadores);
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);

router.get("/combustibles/planilla", cors(), async function (req, res) {
    showLog(req, res);
    try {
        sql = `select top 3000 * from rpaCombustibles order by id desc`
        const combustibles = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        res.status(200).send(combustibles);
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);


router.get("/historial", cors(), async function (req, res) {
    showLog(req, res);
    try {
        sql = `exec pRpaGetPedidosHistorial ''`
        const historial = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        res.status(200).send(historial);
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);

router.get("/ocsHoy", cors(), async function (req, res) {
    showLog(req, res);
    try {
        sql = `exec pRpaGetPedidosOcsHoy ''`
        const historial = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        res.status(200).send(historial);
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);

router.get("/ScPorId/:id", cors(), async function (req, res) {
    showLog(req, res);
    try {
        const { id } = req.params;
        sql = `execute pRpaGetPedido ${id.split("-")[0]}, ''`
        const pedido = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        pedido[0].contactos = []
        if (pedido && pedido.length > 0 && pedido[0].rutErp) {
            let rut = pedido[0].rutErp;
            // agregar ceros a la izquierda hasta que rut sea largo 12
            while (rut.length < 12) {
                rut = '0' + rut;
            }
            SQL = `select c.entconid idContacto, rtrim(ltrim(rtrim(c.EntConNombres) + ' ' + rtrim(c.EntConApePaterno) + ' ' + rtrim(c.EntConApeMaterno))) as nombre , '' cargo
                 from GlbT_Entidad e
                 join GlbT_EntidadContacto c on e.entid = c.pentid
                where e.entrut = '${rut}'`;
            const contactos = await sequelize.query(SQL, { type: sequelize.QueryTypes.SELECT });
            pedido[0].contactos = contactos;
        }
        res.status(200).send({ data: pedido[0] });
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);

router.get("/horario", cors(), async function (req, res) {
    showLog(req, res);
    try {
        sql = `select * from rpaHorario`
        const horario = await sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
        res.status(200).send({ data: horario });
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
}
);


router.post("/actualizarVisador", cors(), async function (req, res) {
    showLog(req, res);
    try {
        const { idVisador } = req.body;
        const sql = `
        begin transaction;
        update rpaVisadores set visador = 0;
        update rpaVisadores set visador = 1 where idVisador = ${idVisador};
        commit;`;
        await sequelize.query(sql, { type: sequelize.QueryTypes.UPDATE });
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
});

router.post("/eliminarRechazada", cors(), async function (req, res) {
    showLog(req, res);
    try {
        const { idSc } = req.body;
        const id = idSc.split('-')[0]
        const sql = `UPDATE rpaPedidos SET eliminado = 1 WHERE id = ${id};`;
        await sequelize.query(sql, { type: sequelize.QueryTypes.UPDATE });
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
});

router.post("/reinsertar", cors(), async function (req, res) {
    showLog(req, res);
    try {
        const { idSc, idContacto } = req.body;
        const id = idSc.split('-')[0]
        const sql = `UPDATE rpaPedidos SET EntConId = ${idContacto} WHERE id = ${id};`;
        await sequelize.query(sql, { type: sequelize.QueryTypes.UPDATE });
        res.status(200).send({ ok: true });
    } catch (error) {
        res.status(500).send({ error: error.message, ok: false });
    }
});


module.exports = router;
