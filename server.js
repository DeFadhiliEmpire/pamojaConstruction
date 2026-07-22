require("dotenv").config();
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const PORT = process.env.PORT || 5000;

const app = express();

const { router: quoteRouter } = require("./Quote");
const { router: contactRouter } = require("./contact");
const { router: projectsRouter } = requite("./projects");

const options = {
  key: fs.readFileSync("./localhost+1-key.pem"),
  cert: fs.readFileSync("./localhost+1.pem"),
};

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://192.168.100.7:5173",
      "https://pamojaconstruction-pjsp.onrender.com",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
app.use(quoteRouter);
app.use(contactRouter);
app.use(projectsRouter);

app.get("/home", (req, res) => {
  res.send("server is on");
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MogoDB Connected"))
  .then(() => {
    http.createServer(options, app).listen(PORT, "0.0.0.0", () => {
      console.log(`HTTPS Server running at "http://192.168.100.7:${PORT}"`);
    });
  })

  .catch(console.error);
