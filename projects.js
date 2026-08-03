const mongoose = require("mongoose");
const express = require("express");
const multer = require("multer");

const router = express.Router();

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_MB = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only JPEG, PNG and WebP images are allowed`));
    }
  },
});

const projectSchema = new mongoose.Schema(
  {
    projectTitle: { type: String, required: true },
    category: { type: String, required: true },
    projectAddress: { type: String, required: true },
    completionDate: { type: Date, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["completed", "terminated"],
    },
    image: {
      data: { type: Buffer },
      contentType: { type: String },
      filename: { type: String },
      size: { type: Number },
    },
  },
  { timestamps: true },
);

const Project = mongoose.model("Project", projectSchema);

router.post("/project/add", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "A project picture is required" });
    const {
      projectTitle,
      category,
      projectAddress,
      completionDate,
      description,
    } = req.body;

    const project = new Project({
      projectTitle,
      category,
      projectAddress,
      completionDate,
      description,
      image: {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        filename: req.file.originalname,
        size: req.file.size,
      },
    });

    await project.save();
    res.status(201).json({
      message: "New Project created successfully ",
      projectId: project._id,
    });
  } catch (err) {
    if (err instanceof multer.MulterError || err.message?.includes("image"))
      return res.status(400).json({ error: err.message });
    console.error("Project Creation Error:", err);
    res.status(500).json({ error: "Internall server Error" });
  }
});

router.patch("/projects/:id/status", async (req, res) => {
  try {
    const decision = req.body.decision?.toLowerCase();
    if (!decision || !["completed", "terminated"].includes(decision)) {
      return res
        .status(400)
        .json({ error: 'decision must be "completed" or "terminated"' });
    }
    const project = await Project.findById(req.params.id);

    if (!project) return res.status(404).json({ error: "Project not Found" });

    project.status = decision === "completed" ? "completed" : "terminated";
    if (decision === "completed") {
      project.completionDate = new Date();
    }

    await project.save();
    res.json({ message: `Project ${decision}`, project });
  } catch (err) {
    console.error("Project Status Update Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = { router, Project };
