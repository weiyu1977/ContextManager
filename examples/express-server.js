const express = require("express");
const { createContextManager, createContextManagerHandlers } = require("../src");

const app = express();
const manager = createContextManager();

app.use(express.json());
createContextManagerHandlers(manager, {
  getUserId: (req) => req.header("x-demo-user") || "demo-user"
}).mount(app);

app.listen(3000, () => {
  console.log("Context Manager demo listening on http://127.0.0.1:3000");
});
