const mongoose = require("mongoose");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const express = require("express");

const router = express.Router();

const CONTACT_STATUS = {
  PENDING: "pending",
  RESOLVED: "Resolved",
  REJECTED: "rejected",
};

const contactSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  projectType: { type: String, required: true, trim: true },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: [500, "Message cannot exceed 500 characters"],
  },
  status: {
    type: String,
    enum: Object.values(CONTACT_STATUS),
    default: CONTACT_STATUS.PENDING,
  },
});

const Contact = mongoose.model("Contact", contactSchema);

router.get("/contacts", async (req, res) => {
  try {
    const contacts = await Contact.find();
    res.status(200).json({ contacts });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contacts", error });
  }
});

router.post("/contact/submit", async (req, res) => {
  try {
    const { fullName, email, phone, projectType, message } = req.body;
    const contact = new Contact({
      fullName,
      email,
      phoneNumber: phone,
      projectType,
      message,
    });

    await contact.save();

    try {
      await resend.emails.send({
        from: "pamoja Construction  <onboarding@resend.dev>",
        to: process.env.OWNER_EMAIL,
        subject: `New Contact Request from ${fullName}`,
        html: `
            <h2>New Contact Request Received</h2>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Project Type:</strong> ${projectType}</p>
            <p><strong>Message:</strong> ${message}</p>
            `,
      });

      await resend.emails.send({
        from: "Pamoja Construction <onboarding@resend.dev>",
        to: email,
        subject: "Thank you for contacting Pamoja Construction",
        html: `
            <h2>Thank you for contacting Pamoja Construction</h2>
            <p>Dear ${fullName},</p>
            <p>Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.</p>
            <p>Best regards,<br>The Pamoja Construction Team</p>
            `,
      });
    } catch (emailError) {
      console.error("Error sending email:", emailError);
    }
    return res.status(200).json({
      message: "Contact request submitted successfully and email sent",
    });
  } catch (error) {
    console.error("Error processing contact request:", error);
    return res.status(500).json({
      message: "An error occurred while processing your  contact request",
      error: error.message,
    });
  }
});

router.patch("/contacts/:id/resolve", async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: "Contact Not Found" });
    if (contact.status !== "pending")
      return res
        .status(400)
        .json({ error: "A contact must be pending to be verified." });

    //update the status to resolved
    contact.status = "Resolved";
    await contact.save();

    res.json({ message: "Contact succesfully Resolved." });
  } catch (err) {
    console.error("Resolve contact error", err);
    res.status(500).json({ error: "Internal server Error 123" });
  }
});

router.delete("/contacts/:id", async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact)
      return res
        .status(400)
        .json({ message: "Cannot delete unexisting contact" });
    res.status(200).json({ message: "Contact Deleted" });
  } catch (err) {
    console.error("Delete contact error", err);
    res.status(500).json({ error: "Internal server Error" });
  }
});

module.exports = { router, Contact, CONTACT_STATUS, resend };
