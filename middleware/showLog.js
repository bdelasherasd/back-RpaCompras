require("dotenv").config({ path: "variables.env" });

var timezone = process.env.TIMEZONE;

const showLog = (req, res) => {

  let ip =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.connection.socket.remoteAddress;
  let session = req.session.id;
  console.log(
    " ip: " +
    ip +
    " a las " +
    new Date().toLocaleString("es-ES", { timeZone: timezone }) +
    " " +
    Date.now()
  );
};

module.exports = showLog;
