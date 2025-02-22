require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const pgp = require("pg-promise")();
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const moment = require("moment-timezone");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Koneksi ke Database PostgreSQL
const db = pgp({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  ssl: { rejectUnauthorized: false }, // Tambahkan ini agar bisa konek ke Railway
});

// Endpoint: Menambahkan deadline baru
app.post("/api/deadlines", async (req, res) => {
  try {
    const { nama_kegiatan, deadline, email_tujuan, subject, body } = req.body;

    // Konversi tanggal ke format YYYY-MM-DD dengan timezone Asia/Bangkok
    const formattedDeadline = moment(deadline).tz("Asia/Bangkok").format("YYYY-MM-DD");
    console.log(`📝 Menyimpan deadline: ${formattedDeadline}`);

    await db.none(
      "INSERT INTO deadlines (nama_kegiatan, deadline, email_tujuan, subject, body) VALUES ($1, $2, $3, $4, $5)",
      [nama_kegiatan, formattedDeadline, JSON.stringify(email_tujuan), subject, body]
    );

    res.json({ success: true, message: "Deadline berhasil ditambahkan!" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Endpoint: Mendapatkan semua deadline
app.get("/api/deadlines", async (req, res) => {
  try {
    const deadlines = await db.any("SELECT * FROM deadlines");
    res.json({ success: true, data: deadlines });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fungsi untuk mengirim email
const sendEmail = async (emailList, namaKegiatan, deadline, subject, body) => {
  let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
      },
      debug: true,
      logger: true,
  });

  let mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailList,
      subject: subject, // Gunakan subject dari aplikasi
      text: body
  };

  try {
      let info = await transporter.sendMail(mailOptions);
      console.log(`📩 Email terkirim ke: ${emailList}`);
      console.log(`✉️ Response: ${info.response}`);
  } catch (error) {
      console.error("❌ Gagal mengirim email:", error);
  }
};

  


cron.schedule("* * * * *", async () => {
  try {
    const today = moment().tz("Asia/Bangkok").format("YYYY-MM-DD");
    console.log(`🔍 Mengecek deadline untuk tanggal: ${today}`);

    const dueTasks = await db.any(
      "SELECT nama_kegiatan, deadline, email_tujuan, subject FROM deadlines WHERE deadline = $1",
      [today]
    );

    if (dueTasks.length === 0) {
      console.log("📭 Tidak ada email yang dikirim hari ini.");
      return;
    }

    for (let task of dueTasks) {
      await sendEmail(task.email_tujuan, task.nama_kegiatan, task.deadline, task.subject, task.body);
    }

    console.log(`📩 ${dueTasks.length} email peringatan telah dikirim!`);
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error.message);
  }
});


// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di port ${PORT}`);
});
