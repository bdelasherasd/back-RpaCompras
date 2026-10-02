require("dotenv").config({ path: "variables.env" });

var timezone = process.env.TIMEZONE;

const origen = (req, res) => {
  const origin = req.get("Origin");
};

module.exports = origen;
