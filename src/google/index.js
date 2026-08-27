const auth = require("./auth");
const calendar = require("./calendar");
const tasks = require("./tasks");
const gmail = require("./gmail");
const drive = require("./drive");

module.exports = {
  ...auth,
  calendar,
  tasks,
  gmail,
  drive,
};
