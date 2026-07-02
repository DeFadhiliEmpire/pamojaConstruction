const mongoose = require("mongoose");
const express = require("express");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const router = express.Router();

const QUOTE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
};

const quoteSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  email: { type: String, required: true },
  projectType: { type: String, required: true, trim: true },
  projectAdress: { type: String, required: true, trim: true },
  estimatedBudget: { type: String, required: true, trim: true },
  startDate: { type: String, required: true, trim: true },
  contactMethod: { type: String, required: true },
  moreAbout: {
    type: String,
    required: true,
    trim: true,
    maxlength: [500, "Playing style description cannot exceed 500 characters"],
  },
  status: {
    type: String,
    enum: Object.values(QUOTE_STATUS),
    default: QUOTE_STATUS.PENDING,
  },
});

const Quote = mongoose.model("Quote", quoteSchema);

router.post("/Quote/submit", async (req, res) => {
  try {
    const {
      fullName,
      phone,
      email,
      projectType,
      address,
      budget,
      timeline,
      contactMethod,
      description,
    } = req.body;

    const quote = new Quote({
      fullName,
      phoneNumber: phone,
      email,
      projectType,
      projectAdress: address,
      estimatedBudget: budget,
      startDate: timeline,
      contactMethod,
      moreAbout: description,
    });

    try {
      await quote.save();
      console.log("Quote saved successfully");
    } catch (err) {
      console.error("Save failed:", err);
    }

    try {
      await resend.emails.send({
        from: "pamoja Construction <onboarding@resend.dev>",
        to: process.env.OWNER_EMAIL,
        subject: `New Quote Request from ${fullName}`,
        html: `
      <h2>New Quote Request Received</h2>

        <p><strong>Name:</strong> ${fullName}</p>
       <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Project Type:</strong> ${projectType}</p>
      <p><strong>Project Address:</strong> ${address}</p>
      <p><strong>Budget:</strong> ${budget}</p>
      <p><strong>Start Date:</strong> ${timeline}</p>
      <p><strong>Preferred Contact:</strong> ${contactMethod}</p>

      <h3>Project Details</h3>

      <p>${description}</p>
      `,
      });

      await resend.emails.send({
        from: "Pamoja Construction <onboarding@resend.dev>",
        to: email,
        subject: "Quote Request Received",
        html: `
      <h2>Thank You For Contacting Pamoja Construction</h2>

      <p>Hello ${fullName},</p>

      <p>
      We have successfully received your quote request.
      </p>

      <p>
      A member of our team will review your project
      and contact you within 48 hours.
      </p>

      <h3>Your Submission</h3>

      <ul>
      <li>Project Type: ${projectType}</li>
      <li>Budget: ${budget}</li>
      <li>Preferred Start Date: ${timeline}</li>
      </ul>

      <p>
      Thank you for choosing Pamoja Construction.
      </p>
       `,
      });
    } catch (emailError) {
      console.error("Email failed:", emailError);
    }

    res
      .status(201)
      .json({ message: "Quote Submitted. We will contact you soon." });
  } catch (err) {
    console.error("Quote apply error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = { router, Quote, QUOTE_STATUS, resend };
